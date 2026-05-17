import {
    Address,
    Blockchain,
    BytesWriter,
    Revert,
    SafeMath,
    StoredBooleanArray,
    StoredU128Array,
    StoredU32,
    StoredU64Array,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER,
    BLOCKS_WITH_RESERVATIONS_POINTER,
    PURGE_RESERVATION_INDEX_POINTER,
    RESERVATION_IDS_BY_BLOCK_POINTER,
} from '../constants/StoredPointers';
import {
    EMIT_PURGE_EVENTS,
    RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
} from '../constants/Contract';
import { Reservation } from '../models/Reservation';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ReservationPurgedEvent } from '../events/ReservationPurgedEvent';
import { IReservationManager } from './interfaces/IReservationManager';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { ITickBitmapManager } from './interfaces/ITickBitmapManager';

/**
 * Result of one `purgeBlockIncremental` round.
 */
class PurgedResult {
    constructor(
        public readonly freed: u256,
        public readonly providersPurged: u32,
        public readonly finished: bool,
    ) {}
}

/**
 * Per-block index of active reservations + gas-bounded incremental purge.
 *
 * Storage:
 *   - `blocksWithReservations: StoredU64Array` — blocks that have at least one reservation
 *   - per-block `RESERVATION_IDS_BY_BLOCK_POINTER` — list of reservation IDs created at that block
 *   - per-block `ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER` — flag per slot (active=true, deactivated=false)
 *   - per-block `PURGE_RESERVATION_INDEX_POINTER` — cursor into the per-block list (for incremental purge)
 *
 * Purge cursor preserves gas-bounded behavior: each call processes up to
 * `AT_LEAST_PROVIDERS_TO_PURGE` providers and saves cursor for the next call.
 */
export class ReservationManager implements IReservationManager {
    protected readonly blocksWithReservations: StoredU64Array;
    protected readonly tokenIdUint8Array: Uint8Array;
    protected atLeastProvidersToPurge: u32;
    private readonly token: Address;
    private readonly tickBitmapManager: ITickBitmapManager;
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;

    constructor(
        token: Address,
        tokenIdUint8Array: Uint8Array,
        tickBitmapManager: ITickBitmapManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        atLeastProvidersToPurge: u32,
    ) {
        this.token = token;
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.tickBitmapManager = tickBitmapManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.blocksWithReservations = new StoredU64Array(
            BLOCKS_WITH_RESERVATIONS_POINTER,
            tokenIdUint8Array,
        );
        this.atLeastProvidersToPurge = atLeastProvidersToPurge;
    }

    /**
     * Index a freshly-created reservation under its creation block.
     */
    public addReservation(blockNumber: u64, reservation: Reservation): void {
        const reservationIndex: u32 = this.pushToReservationList(blockNumber, reservation.getId());
        const reservationActiveIndex: u32 = this.pushToActiveList(blockNumber);

        this.ensureReservedIndexMatch(reservationIndex, reservationActiveIndex);
        this.pushBlockIfNotExists(blockNumber);

        reservation.setPurgeIndex(reservationIndex);
        reservation.save();
    }

    public blockWithReservationsLength(): u32 {
        return this.blocksWithReservations.getLength();
    }

    /** Mark a reservation as deactivated (post-swap). */
    public deactivateReservation(reservation: Reservation): void {
        const reservationActiveList = this.getActiveListForBlock(reservation.getCreationBlock());
        reservationActiveList.set(reservation.getPurgeIndex(), false);
        reservationActiveList.save();
    }

    public getReservationIdAtIndex(blockNumber: u64, index: u32): u128 {
        const reservationList: StoredU128Array = this.getReservationListForBlock(blockNumber);
        return reservationList.get(index);
    }

    /** Convenience constructor used by `LiquidityQueue.getReservationWithExpirationChecks`. */
    public getReservationWithExpirationChecks(owner: Address): Reservation {
        const reservation: Reservation = new Reservation(this.token, owner);
        reservation.ensureCanBeConsumed();
        return reservation;
    }

    public isReservationActiveAtIndex(blockNumber: u64, index: u32): boolean {
        const activeReservationList: StoredBooleanArray = this.getActiveListForBlock(blockNumber);
        return !!activeReservationList.get(index);
    }

    /**
     * Incremental purge: iterate `blocksWithReservations` from the head while the block
     * is older than the grace window, processing up to `atLeastProvidersToPurge` per call.
     * For each active expired reservation, restore each provider entry via
     * `tickBitmapManager.purgeAndRestoreProvider(data)`.
     *
     * @param {u64} lastPurgedBlock - prior cursor.
     * @returns {u64}               - new cursor.
     */
    public purgeReservationsAndRestoreProviders(lastPurgedBlock: u64): u64 {
        const currentBlockNumber: u64 = Blockchain.block.number;

        if (currentBlockNumber <= RESERVATION_EXPIRE_AFTER_IN_BLOCKS) {
            return lastPurgedBlock;
        }

        const maxBlockToPurge: u64 = currentBlockNumber - RESERVATION_EXPIRE_AFTER_IN_BLOCKS;
        if (maxBlockToPurge <= lastPurgedBlock) return lastPurgedBlock;
        if (this.blocksWithReservations.getLength() === 0) return maxBlockToPurge;

        let freed: u256 = u256.Zero;
        let providersPurged: u32 = 0;
        let touched: bool = false;
        let shifted: bool = false;

        while (
            this.blocksWithReservations.getLength() > 0 &&
            providersPurged < this.atLeastProvidersToPurge
        ) {
            const blk: u64 = this.blocksWithReservations.get(0);
            if (blk >= maxBlockToPurge) break;

            const budget: u32 = this.atLeastProvidersToPurge - providersPurged;
            const res: PurgedResult = this.purgeBlockIncremental(blk, budget);

            providersPurged += res.providersPurged;
            freed = SafeMath.add(freed, res.freed);
            touched = touched || res.providersPurged > 0;

            if (res.finished) {
                this.blocksWithReservations.shift();
                shifted = true;
                continue;
            }
            if (res.providersPurged === 0) break;
        }

        if (shifted || touched) this.blocksWithReservations.save();

        // Advance cleanup at the cheapest tick (lazy — only touches one tick).
        this.tickBitmapManager.cleanUpQueues();

        if (touched) {
            this.liquidityQueueReserve.subFromTotalReserved(freed);
        }

        let newLastPurgedBlock: u64 = lastPurgedBlock;
        if (shifted) {
            if (this.blocksWithReservations.getLength() === 0) {
                newLastPurgedBlock = maxBlockToPurge;
            } else {
                const head: u64 = this.blocksWithReservations.get(0);
                newLastPurgedBlock = head > 0 ? head - 1 : 0;
            }
        }
        return newLastPurgedBlock;
    }

    // ========================================================================
    // Internal helpers
    // ========================================================================

    protected getActiveListForBlock(blockNumber: u64): StoredBooleanArray {
        const writer: BytesWriter = new BytesWriter(
            U64_BYTE_LENGTH + this.tokenIdUint8Array.length,
        );
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);
        return new StoredBooleanArray(ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER, writer.getBuffer());
    }

    protected getReservationListForBlock(blockNumber: u64): StoredU128Array {
        const writer: BytesWriter = new BytesWriter(
            U64_BYTE_LENGTH + this.tokenIdUint8Array.length,
        );
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);
        return new StoredU128Array(RESERVATION_IDS_BY_BLOCK_POINTER, writer.getBuffer());
    }

    protected pushToActiveList(blockNumber: u64): u32 {
        const list: StoredBooleanArray = this.getActiveListForBlock(blockNumber);
        const index: u32 = list.push(true);
        list.save();
        return index;
    }

    protected pushToReservationList(blockNumber: u64, reservationId: u128): u32 {
        const list: StoredU128Array = this.getReservationListForBlock(blockNumber);
        const index: u32 = list.push(reservationId);
        list.save();
        return index;
    }

    private ensureReservationIsExpired(reservation: Reservation): void {
        if (!reservation.isExpired()) {
            throw new Revert(`Impossible state: Reservation still active during purge.`);
        }
    }

    private ensureReservationPurgeIndexMatch(reservation: Reservation, currentIndex: u32): void {
        const purgeIndex: u32 = reservation.getPurgeIndex();
        if (purgeIndex !== currentIndex) {
            throw new Revert(
                `Impossible state: reservation ${reservation.getId()} purge index mismatch (expected: ${currentIndex}, actual: ${purgeIndex})`,
            );
        }
    }

    private ensureReservedIndexMatch(reservationIndex: u32, reservationActiveIndex: u32): void {
        if (reservationIndex !== reservationActiveIndex) {
            throw new Revert('Impossible state: Reservation index mismatch.');
        }
    }

    private getPurgeIndexStore(blockNumber: u64): StoredU32 {
        const writer = new BytesWriter(U64_BYTE_LENGTH + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);
        return new StoredU32(PURGE_RESERVATION_INDEX_POINTER, writer.getBuffer());
    }

    private purgeBlockIncremental(blockNumber: u64, nbProvidersToPurge: u32): PurgedResult {
        const reservations = this.getReservationListForBlock(blockNumber);
        const actives = this.getActiveListForBlock(blockNumber);
        const reservationsLength: u32 = reservations.getLength();

        let index: u32 = this.readPurgeCursor(blockNumber);
        let totalProvidersPurged: u32 = 0;
        let totalFreed: u256 = u256.Zero;

        while (index < reservationsLength && totalProvidersPurged < nbProvidersToPurge) {
            if (actives.get(index)) {
                const reservationId: u128 = reservations.get(index);
                const reservation = Reservation.load(reservationId);

                this.ensureReservationIsExpired(reservation);
                this.ensureReservationPurgeIndexMatch(reservation, index);

                const providerCount: u32 = reservation.getProviderCount();
                const freed: u256 = this.restoreReservation(reservation, providerCount);
                totalFreed = SafeMath.add(totalFreed, freed);
                totalProvidersPurged += providerCount;

                actives.set(index, false);

                if (EMIT_PURGE_EVENTS) {
                    Blockchain.emit(
                        new ReservationPurgedEvent(
                            reservationId,
                            index,
                            Blockchain.block.number,
                            blockNumber,
                            providerCount,
                            freed,
                        ),
                    );
                }
            }
            index++;
        }

        actives.save();

        const finished: bool = index >= reservationsLength;
        if (finished) {
            this.writePurgeCursor(blockNumber, 0);
        } else {
            this.writePurgeCursor(blockNumber, index);
        }

        return new PurgedResult(totalFreed, totalProvidersPurged, finished);
    }

    private pushBlockIfNotExists(blockNumber: u64): void {
        let addBlock: bool = true;
        const length: u32 = this.blocksWithReservations.getLength();
        if (length > 0) {
            addBlock = this.blocksWithReservations.get(length - 1) !== blockNumber;
        }
        if (addBlock) {
            this.blocksWithReservations.push(blockNumber);
            this.blocksWithReservations.save();
        }
    }

    private readPurgeCursor(blockNumber: u64): u32 {
        return this.getPurgeIndexStore(blockNumber).get(0);
    }

    /**
     * Walk every provider entry in this expired reservation, restore the reserved
     * tokens, and push the provider onto their tick's purged sub-queue (or fulfilled
     * queue for dust). Returns total tokens freed.
     */
    private restoreReservation(reservation: Reservation, providerCount: u32): u256 {
        let restoredLiquidity: u256 = u256.Zero;
        for (let index: u32 = 0; index < providerCount; index++) {
            const data: ReservationProviderData = reservation.getProviderAt(index);
            const freed: u256 = this.tickBitmapManager.purgeAndRestoreProvider(data);
            restoredLiquidity = SafeMath.add(restoredLiquidity, freed);
        }

        reservation.setPurged(true);
        reservation.timeoutUser();
        reservation.save();

        return restoredLiquidity;
    }

    private writePurgeCursor(blockNumber: u64, index: u32): void {
        const store = this.getPurgeIndexStore(blockNumber);
        store.set(0, index);
        store.save();
    }
}
