import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Address, Blockchain, StoredU64 } from '@btc-vision/btc-runtime/runtime';
import { LAST_PURGED_BLOCK_POINTER, POOL_REGISTERED_POINTER } from '../constants/StoredPointers';
import { MAX_TICK } from '../constants/Contract';
import { Provider } from '../models/Provider';
import { Reservation } from '../models/Reservation';
import { ILiquidityQueue } from './interfaces/ILiquidityQueue';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { IReservationManager } from './interfaces/IReservationManager';
import { ITickBitmapManager } from './interfaces/ITickBitmapManager';
import { TickMath } from '../utils/TickMath';

/**
 * Thin façade tying together:
 *   - `ILiquidityQueueReserve`  : token-level liquidity counters
 *   - `IReservationManager`     : per-block reservation index + incremental purge
 *   - `ITickBitmapManager`      : tick bitmap, per-tick FIFO + purged sub-queue, global fulfilled queue
 *
 * All AMM-era state (virtual reserves, quote(), peg, dynamic fee, queue impact) is gone.
 * Pricing is now per-tick, frozen at reserve time.
 */
export class LiquidityQueue implements ILiquidityQueue {
    public readonly token: Address;

    protected readonly tickBitmapManager: ITickBitmapManager;
    protected readonly liquidityQueueReserve: ILiquidityQueueReserve;
    protected readonly reservationManager: IReservationManager;
    private readonly _poolRegistered: StoredU64; // 0 = not registered, 1 = registered
    private readonly _lastPurgedBlock: StoredU64;
    private readonly _timeoutEnabled: bool;

    constructor(
        token: Address,
        tokenIdUint8Array: Uint8Array,
        tickBitmapManager: ITickBitmapManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        reservationManager: IReservationManager,
        purgeOldReservations: boolean,
        timeoutEnabled: boolean = false,
    ) {
        this.token = token;
        this.tickBitmapManager = tickBitmapManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.reservationManager = reservationManager;
        this._poolRegistered = new StoredU64(POOL_REGISTERED_POINTER, tokenIdUint8Array);
        this._lastPurgedBlock = new StoredU64(LAST_PURGED_BLOCK_POINTER, tokenIdUint8Array);
        this._timeoutEnabled = timeoutEnabled;

        if (purgeOldReservations && this.isPoolRegistered()) {
            this.purgeReservationsAndRestoreProviders();
        }
    }

    // ============================================================
    // Pool registration
    // ============================================================

    public get availableLiquidity(): u256 {
        return this.liquidityQueueReserve.availableLiquidity;
    }

    public get liquidity(): u256 {
        return this.liquidityQueueReserve.liquidity;
    }

    // ============================================================
    // Reserve / aggregate getters
    // ============================================================

    public get reservedLiquidity(): u256 {
        return this.liquidityQueueReserve.reservedLiquidity;
    }

    public get lastPurgedBlock(): u64 {
        return this._lastPurgedBlock.get(0);
    }

    public set lastPurgedBlock(value: u64) {
        this._lastPurgedBlock.set(0, value);
        this._lastPurgedBlock.save();
    }

    public get timeOutEnabled(): bool {
        return this._timeoutEnabled;
    }

    /** Has `createPool` been called for this token? Required for listLiquidity / reserve. */
    public isPoolRegistered(): bool {
        return this._poolRegistered.get(0) != 0;
    }

    /** Mark the pool as registered. Idempotent setter; createPool checks first to revert duplicates. */
    public registerPool(): void {
        this._poolRegistered.set(0, 1);
        this._poolRegistered.save();
    }

    // ============================================================
    // Reservation manager façade
    // ============================================================

    public addReservation(reservation: Reservation): void {
        this.reservationManager.addReservation(reservation.getCreationBlock(), reservation);
    }

    public blockWithReservationsLength(): u32 {
        return this.reservationManager.blockWithReservationsLength();
    }

    public isReservationActiveAtIndex(blockNumber: u64, index: u32): boolean {
        return this.reservationManager.isReservationActiveAtIndex(blockNumber, index);
    }

    public getReservationIdAtIndex(blockNumber: u64, index: u32): u128 {
        return this.reservationManager.getReservationIdAtIndex(blockNumber, index);
    }

    public getReservationWithExpirationChecks(): Reservation {
        return this.reservationManager.getReservationWithExpirationChecks(Blockchain.tx.sender);
    }

    /**
     * Run the gas-bounded incremental purge.
     * Updates `lastPurgedBlock` to the new cursor returned by ReservationManager.
     */
    public purgeReservationsAndRestoreProviders(): void {
        this.lastPurgedBlock = this.reservationManager.purgeReservationsAndRestoreProviders(
            this.lastPurgedBlock,
        );
    }

    // ============================================================
    // TickBitmapManager façade
    // ============================================================

    public addToTickFIFO(provider: Provider, tick: i32): void {
        this.tickBitmapManager.addToTickFIFO(provider, tick);
    }

    public addToTickPurged(provider: Provider, tick: i32): void {
        this.tickBitmapManager.addToTickPurged(provider, tick);
    }

    public removeFromPurgeQueue(provider: Provider): void {
        this.tickBitmapManager.removeFromPurgeQueue(provider);
    }

    public removeFromTickQueue(provider: Provider): void {
        this.tickBitmapManager.removeFromTickQueue(provider);
    }

    public addToFulfilled(provider: Provider): void {
        this.tickBitmapManager.addToFulfilled(provider);
    }

    public getNextProviderWithLiquidity(): Provider | null {
        return this.tickBitmapManager.getNextProviderWithLiquidity();
    }

    /** Cheapest occupied tick, or `MAX_TICK + 1` (sentinel) if none. */
    public bestTick(): i32 {
        return this.tickBitmapManager.getCurrentBestTick();
    }

    /** Q40.88 sats per base unit at the cheapest occupied tick. Reverts if no listings. */
    public bestTickPrice(): u128 {
        const t: i32 = this.bestTick();
        if (t > MAX_TICK) return u128.Zero;
        return TickMath.tickToPrice(t);
    }

    public cleanUpQueues(): void {
        this.tickBitmapManager.cleanUpQueues();
    }

    public resetFulfilledProviders(count: u8): u8 {
        return this.tickBitmapManager.resetFulfilledProviders(count);
    }

    public previewWalk(maxSats: u64, maxProviders: u32): u256 {
        return this.tickBitmapManager.previewWalk(maxSats, maxProviders);
    }

    // ============================================================
    // Reserve counters
    // ============================================================

    public increaseTotalReserve(value: u256): void {
        this.liquidityQueueReserve.addToTotalReserve(value);
    }
    public increaseTotalReserved(value: u256): void {
        this.liquidityQueueReserve.addToTotalReserved(value);
    }
    public decreaseTotalReserve(value: u256): void {
        this.liquidityQueueReserve.subFromTotalReserve(value);
    }
    public decreaseTotalReserved(value: u256): void {
        this.liquidityQueueReserve.subFromTotalReserved(value);
    }

    public save(): void {
        this.tickBitmapManager.save();
    }
}
