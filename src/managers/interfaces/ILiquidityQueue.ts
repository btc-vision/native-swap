import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../../models/Provider';
import { Reservation } from '../../models/Reservation';
import { Address } from '@btc-vision/btc-runtime/runtime';

/**
 * Thin façade exposing the tick-bucketed queue + reserves + reservation manager.
 * Replaces the heavy AMM-era LiquidityQueue interface (no quote, no virtual pool,
 * no priority/normal split, no antibot, no dynamic fee).
 */
export interface ILiquidityQueue {
    token: Address;
    lastPurgedBlock: u64;
    readonly availableLiquidity: u256;
    readonly liquidity: u256;
    readonly reservedLiquidity: u256;
    readonly timeOutEnabled: bool;

    // ---- Reserve / reservation manager façade ----
    addReservation(reservation: Reservation): void;
    blockWithReservationsLength(): u32;
    isReservationActiveAtIndex(blockNumber: u64, index: u32): boolean;
    getReservationIdAtIndex(blockNumber: u64, index: u32): u128;
    getReservationWithExpirationChecks(): Reservation;
    purgeReservationsAndRestoreProviders(): void;

    // ---- TickBitmapManager façade ----
    addToTickFIFO(provider: Provider, tick: i32): void;
    addToTickPurged(provider: Provider, tick: i32): void;
    removeFromPurgeQueue(provider: Provider): void;
    removeFromTickQueue(provider: Provider): void;
    addToFulfilled(provider: Provider): void;
    getNextProviderWithLiquidity(): Provider | null;
    bestTick(): i32;
    bestTickPrice(): u128;
    cleanUpQueues(): void;
    resetFulfilledProviders(count: u8): u8;
    previewWalk(maxSats: u64, maxProviders: u32): u256;

    // ---- Liquidity-reserve façade ----
    increaseTotalReserve(value: u256): void;
    increaseTotalReserved(value: u256): void;
    decreaseTotalReserve(value: u256): void;
    decreaseTotalReserved(value: u256): void;

    // ---- Pool registration ----
    isPoolRegistered(): bool;
    registerPool(): void;

    save(): void;
}
