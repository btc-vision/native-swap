import { u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../../models/Provider';
import { ReservationProviderData } from '../../models/ReservationProdiverData';

/**
 * Bitmap-driven per-tick provider queue manager.
 *
 * Owns:
 *   - the occupied-tick bitmap (`StoredMap<wordIdx, u256>`)
 *   - per-tick FIFO of provider IDs
 *   - per-tick purged sub-queue (fast-path re-allocation after reservation expiry)
 *   - one global fulfilled queue (dust providers awaiting reset)
 *
 * Walk-cheapest order at each tick T:
 *   1. `purged[T]` — restored providers serve first
 *   2. `FIFO[T]`   — regular listings
 *   → if both empty, clear bit, advance to next tick.
 */
export interface ITickBitmapManager {
    addToTickFIFO(provider: Provider, tick: i32): void;
    addToTickPurged(provider: Provider, tick: i32): void;
    removeFromTickQueue(provider: Provider): void;
    removeFromPurgeQueue(provider: Provider): void;
    addToFulfilled(provider: Provider): void;
    getNextProviderWithLiquidity(): Provider | null;
    cleanUpQueues(): void;
    resetFulfilledProviders(count: u8): u8;
    getCurrentBestTick(): i32;
    previewWalk(maxSats: u64, maxProviders: u32): u256;
    purgeAndRestoreProvider(data: ReservationProviderData): u256;
    save(): void;
}
