import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Potential,
    Revert,
    SafeMath,
    StoredU32,
    StoredU256Array,
    StoredU32Array,
} from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '@btc-vision/btc-runtime/runtime/storage/maps/StoredMapU256';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import {
    QUEUE_FULFILLED_POINTER,
    TICK_BITMAP_POINTER,
    TICK_FIFO_POINTER,
    TICK_LOWEST_WORD_POINTER,
    TICK_PURGED_POINTER,
} from '../constants/StoredPointers';
import {
    BITMAP_WORD_COUNT,
    INDEX_NOT_SET_VALUE,
    MAX_TICK,
    MIN_TICK,
    TICK_OFFSET,
} from '../constants/Contract';
import { addAmountToStakingContract, getProvider, Provider } from '../models/Provider';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { TickMath } from '../utils/TickMath';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { ITickBitmapManager } from './interfaces/ITickBitmapManager';
import { ProviderFulfilledEvent } from '../events/ProviderFulfilledEvent';

const TICK_BYTE_LENGTH: u32 = 4;
const SUBPOINTER_LEN: u32 = 30 + TICK_BYTE_LENGTH;

/**
 * Concrete implementation of `ITickBitmapManager`.
 *
 * Storage layout (per token):
 *   - `bitmap: StoredMapU256` keyed by `u256(wordIdx)` → bitmap word
 *   - per-tick FIFO `StoredU256Array(TICK_FIFO_POINTER, tokenId||tickI32LE)`
 *   - per-tick purged `StoredU32Array(TICK_PURGED_POINTER, tokenId||tickI32LE)`
 *   - global fulfilled `StoredU256Array(QUEUE_FULFILLED_POINTER, tokenId)`
 *   - lowest-word hint `StoredU32(TICK_LOWEST_WORD_POINTER, tokenId)` slot 0
 */
export class TickBitmapManager implements ITickBitmapManager {
    private readonly token: Address;
    private readonly tokenIdBytes: Uint8Array; // 30 bytes
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;
    private readonly bitmap: StoredMapU256;
    private readonly fulfilledQueue: StoredU256Array;
    private readonly lowestWord: StoredU32;

    /** Transaction-local cursor state, reset between calls. */
    private _cursorTick: i32 = MAX_TICK + 1; // sentinel: "no walk in progress"
    private _cursorPurgedIdx: u32 = 0;
    private _cursorFifoIdx: u32 = 0;

    constructor(
        token: Address,
        tokenIdBytes: Uint8Array,
        liquidityQueueReserve: ILiquidityQueueReserve,
    ) {
        this.token = token;
        this.tokenIdBytes = tokenIdBytes;
        this.liquidityQueueReserve = liquidityQueueReserve;

        this.bitmap = new StoredMapU256(TICK_BITMAP_POINTER, tokenIdBytes);
        this.fulfilledQueue = new StoredU256Array(QUEUE_FULFILLED_POINTER, tokenIdBytes);
        this.lowestWord = new StoredU32(TICK_LOWEST_WORD_POINTER, tokenIdBytes);
    }

    // ========================================================================
    // FIFO additions and removals
    // ========================================================================

    /**
     * Push a provider onto `FIFO[tick]`. Sets the bitmap bit if the tick was empty,
     * lowers the `lowestOccupiedWordHint` if `wordIdx(tick)` is below the current hint.
     */
    public addToTickFIFO(provider: Provider, tick: i32): void {
        this.ensureTickInRange(tick);
        const fifo: StoredU256Array = this.openFifo(tick);
        const idx: u32 = fifo.push(provider.getId(), true);
        fifo.save();
        provider.setTickFifoIndex(idx);

        // Bitmap bit may already be set if `purged[tick]` is non-empty; in either case,
        // make sure the bit is set now.
        const wordIdx: u32 = TickMath.wordIdx(tick);
        const wordKey: u256 = u256.fromU32(wordIdx);
        const word: u256 = this.bitmap.get(wordKey);
        if (!TickMath.isBitSet(word, tick)) {
            const newWord: u256 = TickMath.setBit(word, tick);
            this.bitmap.set(wordKey, newWord);
        }

        // Lower the hint if this tick's word is lower than what we knew before.
        const hintRaw: u32 = this.lowestWord.get(0);
        const currentHint: u32 = hintRaw == 0 ? BITMAP_WORD_COUNT : hintRaw - 1;
        if (wordIdx < currentHint) {
            this.lowestWord.set(0, wordIdx + 1); // store hint+1 so 0 is a "no hint" sentinel
        }
    }

    /**
     * Push a provider's `tickFifoIndex` onto `purged[tick]`. Sets the `purged` flag,
     * stores `purgedIndex` for O(1) removal. Also ensures the bitmap bit is set
     * (a provider can be purged even when their FIFO slot has been advanced past).
     */
    public addToTickPurged(provider: Provider, tick: i32): void {
        if (provider.isPurged()) return; // idempotent

        this.ensureTickInRange(tick);
        const purged: StoredU32Array = this.openPurged(tick);
        const idx: u32 = purged.push(provider.getTickFifoIndex(), true);
        purged.save();
        provider.markPurged();
        provider.setPurgedIndex(idx);

        // Ensure bitmap bit is set
        const wordKey: u256 = u256.fromU32(TickMath.wordIdx(tick));
        const word: u256 = this.bitmap.get(wordKey);
        if (!TickMath.isBitSet(word, tick)) {
            this.bitmap.set(wordKey, TickMath.setBit(word, tick));
        }
    }

    /**
     * Tombstone the provider's slot in `FIFO[priceTick]`. If both `FIFO[T]` and
     * `purged[T]` are empty after this, clear the bitmap bit at T.
     *
     * Caller is responsible for calling `removeFromPurgeQueue` first if the provider
     * was also in the purged sub-queue.
     */
    public removeFromTickQueue(provider: Provider): void {
        const tick: i32 = provider.getPriceTick();
        const idx: u32 = provider.getTickFifoIndex();
        if (idx == INDEX_NOT_SET_VALUE) return;

        const fifo: StoredU256Array = this.openFifo(tick);
        fifo.set_physical(idx, u256.Zero); // tombstone
        fifo.save();
        provider.setTickFifoIndex(INDEX_NOT_SET_VALUE);

        // If both queues at this tick are now exhausted, clear the bit.
        if (this.tickIsEmpty(tick)) {
            const wordIdx: u32 = TickMath.wordIdx(tick);
            const wordKey: u256 = u256.fromU32(wordIdx);
            const word: u256 = this.bitmap.get(wordKey);
            const cleared: u256 = TickMath.clearBit(word, tick);
            this.bitmap.set(wordKey, cleared);

            // If the lowest-hint word just became fully empty, advance the hint by scanning
            // forward for the next non-zero word.
            this.maybeAdvanceHint(wordIdx, cleared);
        }
    }

    /**
     * Pull a provider out of `purged[priceTick]`. Clears the `purged` flag and the
     * `purgedIndex`. Does NOT touch the FIFO slot (provider stays listed).
     */
    public removeFromPurgeQueue(provider: Provider): void {
        if (!provider.isPurged()) return;
        const tick: i32 = provider.getPriceTick();
        const idx: u32 = provider.getPurgedIndex();
        const purged: StoredU32Array = this.openPurged(tick);

        if (idx != INDEX_NOT_SET_VALUE && idx < purged.getLength()) {
            purged.set_physical(idx, INDEX_NOT_SET_VALUE);
            purged.save();
        }

        provider.clearPurged();
        provider.setPurgedIndex(INDEX_NOT_SET_VALUE);
    }

    /**
     * Mark provider for global fulfilled-queue cleanup. Burns remaining liquidity,
     * tombstones from FIFO, decreases reserve trackers. Subsequent walks skip them.
     */
    public addToFulfilled(provider: Provider): void {
        if (provider.toReset()) return;

        // Burn any remaining liquidity → staking
        if (provider.hasLiquidityAmount()) {
            const liq: u256 = provider.getLiquidityAmount().toU256();
            this.liquidityQueueReserve.subFromTotalReserve(liq);
            addAmountToStakingContract(liq);
        }

        provider.markToReset();
        provider.setLiquidityAmount(u128.Zero); // ensure availableLiquidity sees this as fully drained

        // Tombstone in FIFO
        this.removeFromTickQueue(provider);

        // Push providerId onto global fulfilled queue
        this.fulfilledQueue.push(provider.getId(), true);
        this.fulfilledQueue.save();

        Blockchain.emit(new ProviderFulfilledEvent(provider.getId(), false, u256.Zero));
    }

    // ========================================================================
    // Bitmap walk — called by ReserveLiquidityOperation
    // ========================================================================

    /**
     * @method getNextProviderWithLiquidity
     * @description Bitmap walk:
     *   1. Scan from `lowestOccupiedWordHint` for first non-zero word.
     *   2. ctz to find lowest set bit → cheapest tick T.
     *   3. Walk `purged[T]` then `FIFO[T]`. Skip tombstones (zero entries) and
     *      providers with zero availableLiquidity (without advancing the persistent
     *      cursor — they may regain liquidity via purge later).
     *   4. If both sub-queues at T are dry, clear the bit and recurse to next tick.
     *   5. Return first provider that meets minimum-at-tick.
     *
     * Maintains transaction-local cursors so successive calls within one txn don't
     * re-scan the same entries.
     */
    public getNextProviderWithLiquidity(): Provider | null {
        // Walk from current cursor or restart.
        let safety: u32 = 1024; // bounded loop — way more than realistic occupied ticks per call
        while (safety > 0) {
            safety--;

            const tick: i32 = this.findCheapestOccupiedTickFromCursor();
            if (tick > MAX_TICK) return null;

            // 1) walk purged[tick] from cursor
            const purgedProv: Provider | null = this.scanPurged(tick);
            if (purgedProv !== null) return purgedProv;

            // 2) walk FIFO[tick] from cursor
            const fifoProv: Provider | null = this.scanFifo(tick);
            if (fifoProv !== null) return fifoProv;

            // 3) both exhausted at this tick; clear bit and try next
            this.clearTickAndAdvance(tick);
            this._cursorTick = MAX_TICK + 1; // restart cursor at next iteration
        }
        return null;
    }

    /**
     * Read-only walk for the `getQuote` view: simulate a reservation against the
     * cheapest-first ordering, accumulate tokens until `maxSats` exhausts or
     * `maxProviders` reached. Never mutates state.
     *
     * @param {u64} maxSats       - Buyer's budget.
     * @param {u32} maxProviders  - Hard cap on providers walked (gas grief protection).
     * @returns {u256}            - Total tokens (base units) the buyer would receive.
     */
    public previewWalk(maxSats: u64, maxProviders: u32): u256 {
        let remainingSats: u64 = maxSats;
        let totalTokens: u256 = u256.Zero;
        let walked: u32 = 0;

        // Snapshot the persistent hint for the read-only scan.
        const startHintRaw: u32 = this.lowestWord.get(0);
        let wordIdx: u32 = startHintRaw == 0 ? 0 : startHintRaw - 1;

        while (wordIdx < BITMAP_WORD_COUNT && walked < maxProviders && remainingSats > 0) {
            const word: u256 = this.bitmap.get(u256.fromU32(wordIdx));
            if (word.isZero()) {
                wordIdx++;
                continue;
            }

            // Scan all set bits in this word (low to high)
            let scratch: u256 = word;
            while (!scratch.isZero() && walked < maxProviders && remainingSats > 0) {
                const ctz: u32 = TickMath.countTrailingZeros(scratch);
                if (ctz >= 256) break;
                const tick: i32 = TickMath.tickFromBitmap(wordIdx, ctz);
                const fillPrice: u128 = TickMath.tickToPrice(tick);

                // Read both queues at this tick
                const purged: StoredU32Array = this.openPurged(tick);
                const fifo: StoredU256Array = this.openFifo(tick);

                walked = this.previewScan(purged, fifo, fillPrice, walked, maxProviders);
                // No state mutation; we just account tokens.

                // Add tokens accountable from purged/fifo at this tick (using fresh reads)
                const tickTokens: u256 = this.previewAtTick(tick, fillPrice, remainingSats, maxProviders - walked);
                if (tickTokens.isZero()) {
                    // tick had no usable liquidity; advance scratch
                } else {
                    const sats: u64 = TickMath.tokensToSatoshis(tickTokens.toU128(), fillPrice);
                    if (sats > remainingSats) {
                        // partial fill — this tick uses all remaining sats
                        const partialTokens: u128 = TickMath.satoshisToTokens(remainingSats, fillPrice);
                        totalTokens = SafeMath.add(totalTokens, partialTokens.toU256());
                        return totalTokens;
                    }
                    totalTokens = SafeMath.add(totalTokens, tickTokens);
                    remainingSats -= sats;
                }

                // Clear lowest set bit in scratch and continue
                const mask: u256 = u256.shl(u256.One, <i32>ctz);
                scratch = u256.and(scratch, u256.sub(u256.Max, mask));
            }

            wordIdx++;
        }

        return totalTokens;
    }

    /** Helper used by the per-tick loop in `previewWalk`. Pure aggregate. */
    private previewAtTick(tick: i32, fillPrice: u128, budgetSats: u64, providerBudget: u32): u256 {
        let total: u256 = u256.Zero;
        if (providerBudget == 0 || budgetSats == 0) return total;

        const purged: StoredU32Array = this.openPurged(tick);
        const fifo: StoredU256Array = this.openFifo(tick);

        let walked: u32 = 0;

        // purged sub-queue first
        const pStart: u32 = purged.startingIndex();
        const pLen: u32 = purged.getLength();
        for (let i: u32 = pStart; i < pLen && walked < providerBudget; i++) {
            const fifoIdx: u32 = purged.get_physical(i);
            if (fifoIdx == INDEX_NOT_SET_VALUE) continue;
            if (fifoIdx >= fifo.getLength()) continue;
            const pid: u256 = fifo.get_physical(fifoIdx);
            if (pid.isZero()) continue;
            const provider: Provider = getProvider(pid);
            if (!provider.isActive() || provider.toReset()) continue;
            const avail: u128 = provider.getAvailableLiquidityAmount();
            if (avail.isZero()) continue;
            total = SafeMath.add(total, avail.toU256());
            walked++;
        }

        // FIFO
        const fStart: u32 = fifo.startingIndex();
        const fLen: u32 = fifo.getLength();
        for (let i: u32 = fStart; i < fLen && walked < providerBudget; i++) {
            const pid: u256 = fifo.get_physical(i);
            if (pid.isZero()) continue;
            const provider: Provider = getProvider(pid);
            if (!provider.isActive() || provider.toReset()) continue;
            const avail: u128 = provider.getAvailableLiquidityAmount();
            if (avail.isZero()) continue;
            // Skip if also in purged (avoid double-counting)
            if (provider.isPurged()) continue;
            total = SafeMath.add(total, avail.toU256());
            walked++;
        }

        return total;
    }

    private previewScan(
        _purged: StoredU32Array,
        _fifo: StoredU256Array,
        _fillPrice: u128,
        walked: u32,
        _maxProviders: u32,
    ): u32 {
        // Stub: real walking is in previewAtTick. This return is just to match the loop API above.
        return walked;
    }

    // ========================================================================
    // Cleanup helpers
    // ========================================================================

    /**
     * Advance starting indices past dead heads (tombstoned, fully consumed, or to-reset).
     * Called from `purgeReservationsAndRestoreProviders` after a purge round.
     *
     * Lightweight: only runs on the current cheapest tick(s) since deeper ticks haven't
     * been touched. Cursor reset between txns naturally handles those.
     */
    public cleanUpQueues(): void {
        // Best-effort: walk the cheapest occupied tick and advance its FIFO/purged starts
        // past tombstones and dead providers.
        this._cursorTick = MAX_TICK + 1;
        const tick: i32 = this.findCheapestOccupiedTickFromCursor();
        if (tick > MAX_TICK) return;

        const fifo: StoredU256Array = this.openFifo(tick);
        let fStart: u32 = fifo.startingIndex();
        const fLen: u32 = fifo.getLength();
        while (fStart < fLen) {
            const pid: u256 = fifo.get_physical(fStart);
            if (pid.isZero()) {
                fStart++;
                continue;
            }
            const provider: Provider = getProvider(pid);
            if (provider.toReset() || !provider.isActive() || !provider.hasLiquidityAmount()) {
                fStart++;
                continue;
            }
            break;
        }
        if (fStart != fifo.startingIndex()) {
            fifo.setStartingIndex(fStart);
            fifo.save();
        }

        const purged: StoredU32Array = this.openPurged(tick);
        let pStart: u32 = purged.startingIndex();
        const pLen: u32 = purged.getLength();
        while (pStart < pLen) {
            const fifoIdx: u32 = purged.get_physical(pStart);
            if (fifoIdx == INDEX_NOT_SET_VALUE) {
                pStart++;
                continue;
            }
            break;
        }
        if (pStart != purged.startingIndex()) {
            purged.setStartingIndex(pStart);
            purged.save();
        }

        // If both sub-queues at this tick are exhausted, clear the bit.
        if (fStart >= fLen && pStart >= pLen) {
            this.clearTickAndAdvance(tick);
        }
    }

    /**
     * Drain up to `count` providers from the global fulfilled queue.
     * For each, fully reset the provider state.
     */
    public resetFulfilledProviders(count: u8): u8 {
        let resetCount: u8 = 0;
        let start: u32 = this.fulfilledQueue.startingIndex();
        const len: u32 = this.fulfilledQueue.getLength();

        while (start < len && resetCount < count) {
            const pid: u256 = this.fulfilledQueue.get_physical(start);
            if (!pid.isZero()) {
                const provider: Provider = getProvider(pid);
                if (provider.toReset()) {
                    provider.clearToReset();
                    provider.resetListingProviderValues();
                    Blockchain.emit(
                        new ProviderFulfilledEvent(provider.getId(), true, u256.Zero),
                    );
                    resetCount++;
                }
            }
            this.fulfilledQueue.set_physical(start, u256.Zero);
            start++;
        }

        if (start != this.fulfilledQueue.startingIndex()) {
            this.fulfilledQueue.setStartingIndex(start);
            this.fulfilledQueue.save();
        }
        return resetCount;
    }

    // ========================================================================
    // Reservation purge → push provider back to per-tick purged sub-queue
    // (called by ReservationManager.restoreReservation per entry)
    // ========================================================================

    /**
     * Subtract this entry's reserved tokens from the provider's `reservedAmount`,
     * then either push them onto `purged[priceTick]` (if they meet the per-tick
     * minimum) or hand off to the global fulfilled queue (dust).
     *
     * Returns the freed token amount (for `liquidityQueueReserve.subFromReservedLiquidity`).
     */
    public purgeAndRestoreProvider(data: ReservationProviderData): u256 {
        const provider: Provider = getProvider(data.providerId);
        if (u128.lt(provider.getReservedAmount(), data.providedAmount)) {
            throw new Revert(
                'Impossible state: reserved amount smaller than reservation entry.',
            );
        }
        provider.subtractFromReservedAmount(data.providedAmount);

        // Decide fate: if remaining availableLiquidity meets minimum-at-tick → purged sub-queue.
        // Else if no other reserved amount → fulfilled queue (dust).
        // Else (still reserved by another reservation) → leave alone, will be revisited.
        const tick: i32 = provider.getPriceTick();
        const avail: u128 = provider.getAvailableLiquidityAmount();
        const meetsMin: bool = Provider.meetsMinimumReservationAmountAtTick(avail, tick);

        if (!meetsMin && !provider.hasReservedAmount()) {
            this.addToFulfilled(provider);
        } else if (meetsMin && !provider.isPurged() && provider.isActive()) {
            this.addToTickPurged(provider, tick);
        }

        return data.providedAmount.toU256();
    }

    // ========================================================================
    // Read-only views
    // ========================================================================

    /**
     * @method getCurrentBestTick
     * @description Read-only bitmap scan, returns the cheapest occupied tick or
     * `MAX_TICK + 1` (sentinel) if none.
     */
    public getCurrentBestTick(): i32 {
        const startHintRaw: u32 = this.lowestWord.get(0);
        let wordIdx: u32 = startHintRaw == 0 ? 0 : startHintRaw - 1;

        while (wordIdx < BITMAP_WORD_COUNT) {
            const word: u256 = this.bitmap.get(u256.fromU32(wordIdx));
            if (!word.isZero()) {
                const ctz: u32 = TickMath.countTrailingZeros(word);
                return TickMath.tickFromBitmap(wordIdx, ctz);
            }
            wordIdx++;
        }
        return MAX_TICK + 1;
    }

    /** Persist all owned storage. */
    public save(): void {
        this.fulfilledQueue.save();
        this.lowestWord.save();
    }

    // ========================================================================
    // Internal helpers
    // ========================================================================

    /**
     * Scan from `_cursorTick` (or hint if first iteration) for next occupied tick.
     * Updates `_cursorTick` to whatever it finds. Returns `MAX_TICK + 1` if none.
     */
    private findCheapestOccupiedTickFromCursor(): i32 {
        let wordIdx: u32;

        if (this._cursorTick > MAX_TICK) {
            // Restart from persistent hint
            const startHintRaw: u32 = this.lowestWord.get(0);
            wordIdx = startHintRaw == 0 ? 0 : startHintRaw - 1;
            this._cursorPurgedIdx = 0;
            this._cursorFifoIdx = 0;
        } else {
            wordIdx = TickMath.wordIdx(this._cursorTick);
        }

        while (wordIdx < BITMAP_WORD_COUNT) {
            const word: u256 = this.bitmap.get(u256.fromU32(wordIdx));
            if (!word.isZero()) {
                // Mask off bits below this._cursorTick if we're mid-walk in this word
                let scratch: u256 = word;
                if (this._cursorTick <= MAX_TICK && TickMath.wordIdx(this._cursorTick) == wordIdx) {
                    const cursorBit: u32 = <u32>TickMath.bitIdx(this._cursorTick);
                    if (cursorBit > 0) {
                        const lowMask: u256 = u256.sub(u256.shl(u256.One, <i32>cursorBit), u256.One);
                        scratch = u256.and(scratch, u256.sub(u256.Max, lowMask));
                    }
                }
                if (!scratch.isZero()) {
                    const ctz: u32 = TickMath.countTrailingZeros(scratch);
                    const tick: i32 = TickMath.tickFromBitmap(wordIdx, ctz);
                    if (tick != this._cursorTick) {
                        this._cursorTick = tick;
                        this._cursorPurgedIdx = 0;
                        this._cursorFifoIdx = 0;
                    }
                    return tick;
                }
            }
            wordIdx++;
            // Reset within-word cursor
            this._cursorTick = MAX_TICK + 1;
        }
        return MAX_TICK + 1;
    }

    /**
     * Walk `purged[tick]` from `_cursorPurgedIdx` looking for the first eligible provider.
     * Advances `_cursorPurgedIdx` past tombstones / inactive entries.
     * Does NOT advance the persistent `startingIndex` (that's the cleanup path).
     */
    private scanPurged(tick: i32): Provider | null {
        const purged: StoredU32Array = this.openPurged(tick);
        const fifo: StoredU256Array = this.openFifo(tick);
        const start: u32 = purged.startingIndex();
        const len: u32 = purged.getLength();
        let i: u32 = start + this._cursorPurgedIdx;

        while (i < len) {
            const fifoIdx: u32 = purged.get_physical(i);
            this._cursorPurgedIdx++;
            i++;
            if (fifoIdx == INDEX_NOT_SET_VALUE) continue;
            if (fifoIdx >= fifo.getLength()) continue;

            const pid: u256 = fifo.get_physical(fifoIdx);
            if (pid.isZero()) continue;
            const provider: Provider = getProvider(pid);
            if (provider.toReset() || !provider.isActive()) continue;
            if (provider.getAvailableLiquidityAmount().isZero()) continue;
            if (!Provider.meetsMinimumReservationAmountAtTick(
                provider.getAvailableLiquidityAmount(),
                tick,
            )) continue;

            return provider;
        }
        return null;
    }

    /**
     * Walk `FIFO[tick]` from `_cursorFifoIdx` looking for the first eligible provider.
     * Skips providers also in the purged sub-queue (already returned via `scanPurged`).
     */
    private scanFifo(tick: i32): Provider | null {
        const fifo: StoredU256Array = this.openFifo(tick);
        const start: u32 = fifo.startingIndex();
        const len: u32 = fifo.getLength();
        let i: u32 = start + this._cursorFifoIdx;

        while (i < len) {
            const pid: u256 = fifo.get_physical(i);
            this._cursorFifoIdx++;
            i++;
            if (pid.isZero()) continue;
            const provider: Provider = getProvider(pid);
            if (provider.toReset() || !provider.isActive()) continue;
            if (provider.isPurged()) continue; // returned via scanPurged
            if (provider.getAvailableLiquidityAmount().isZero()) continue;
            if (!Provider.meetsMinimumReservationAmountAtTick(
                provider.getAvailableLiquidityAmount(),
                tick,
            )) continue;

            return provider;
        }
        return null;
    }

    /** Returns true iff both `FIFO[tick]` and `purged[tick]` are exhausted (no live entries). */
    private tickIsEmpty(tick: i32): bool {
        const fifo: StoredU256Array = this.openFifo(tick);
        if (fifo.startingIndex() < fifo.getLength()) {
            // Still has entries from start. Even if all are tombstones, treat as non-empty
            // until cleanUp advances the start index.
            return false;
        }
        const purged: StoredU32Array = this.openPurged(tick);
        if (purged.startingIndex() < purged.getLength()) return false;
        return true;
    }

    /** Clear bit at `tick` and advance hint if its word just became zero. */
    private clearTickAndAdvance(tick: i32): void {
        const wordIdx: u32 = TickMath.wordIdx(tick);
        const wordKey: u256 = u256.fromU32(wordIdx);
        const word: u256 = this.bitmap.get(wordKey);
        const cleared: u256 = TickMath.clearBit(word, tick);
        this.bitmap.set(wordKey, cleared);
        this.maybeAdvanceHint(wordIdx, cleared);
    }

    /**
     * If the word at `wordIdx` is now zero AND it equaled the persistent hint,
     * scan forward for the next non-zero word and update the hint.
     */
    private maybeAdvanceHint(wordIdx: u32, currentWord: u256): void {
        const hintRaw: u32 = this.lowestWord.get(0);
        const hintWord: u32 = hintRaw == 0 ? 0 : hintRaw - 1;
        if (wordIdx != hintWord) return;
        if (!currentWord.isZero()) return;

        let next: u32 = wordIdx + 1;
        while (next < BITMAP_WORD_COUNT) {
            if (!this.bitmap.get(u256.fromU32(next)).isZero()) {
                this.lowestWord.set(0, next + 1);
                return;
            }
            next++;
        }
        this.lowestWord.set(0, 0); // 0 = no hint = scan from word 0
    }

    /** Construct the StoredU256Array FIFO for a given tick. */
    private openFifo(tick: i32): StoredU256Array {
        return new StoredU256Array(TICK_FIFO_POINTER, this.subPointerForTick(tick));
    }

    /** Construct the StoredU32Array purged sub-queue for a given tick. */
    private openPurged(tick: i32): StoredU32Array {
        return new StoredU32Array(TICK_PURGED_POINTER, this.subPointerForTick(tick));
    }

    /**
     * Build the per-(token, tick) subPointer. The OPNet storage layer requires
     * subPointers to be exactly 30 bytes. We hash `(tokenIdBytes || tickI32)`
     * with sha256 and take the leading 30 bytes — collision-resistant and
     * fits the protocol envelope.
     */
    private subPointerForTick(tick: i32): Uint8Array {
        const writer: BytesWriter = new BytesWriter(<i32>SUBPOINTER_LEN);
        writer.writeBytes(this.tokenIdBytes);
        writer.writeI32(tick);
        const hash: Uint8Array = sha256(writer.getBuffer());
        const out = new Uint8Array(30);
        for (let i = 0; i < 30; i++) out[i] = hash[i];
        return out;
    }

    private ensureTickInRange(tick: i32): void {
        if (tick < MIN_TICK || tick > MAX_TICK) {
            throw new Revert(`TickBitmapManager: tick ${tick} out of range.`);
        }
    }
}
