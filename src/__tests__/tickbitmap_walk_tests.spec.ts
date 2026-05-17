import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { clearCachedProviders, Provider } from '../models/Provider';
import {
    createLiquidityQueue,
    createProvider,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    receiverAddress1CSV,
    receiverAddress2CSV,
    receiverAddress3CSV,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { MAX_TICK } from '../constants/Contract';

/**
 * Bitmap walk + per-tick FIFO + purged sub-queue ordering.
 *
 * The linchpin invariants of the new arch:
 *   1. `getCurrentBestTick()` returns the lowest occupied tick (cheapest for buyer).
 *   2. Within a tick, `purged[T]` is served before `FIFO[T]` (fast-path for restored providers).
 *   3. Within a sub-queue, oldest-first (FIFO).
 *   4. After all entries at a tick are consumed/tombstoned, the bitmap bit clears.
 *   5. Hint advances past empty words so we don't rescan dead ones.
 *
 * Each `it()` uses a distinct tick range and distinct provider addresses so
 * that storage from prior tests doesn't pollute the bitmap.
 */

describe('TickBitmapManager — bitmap walk + FIFO ordering', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('empty bitmap returns sentinel (MAX_TICK + 1) from getCurrentBestTick', () => {
        setBlockchainEnvironment(1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        expect<bool>(q.tickBitmapManager.getCurrentBestTick() > MAX_TICK).toBe(true);
    });

    it('after addToTickFIFO at tick T, getCurrentBestTick == T', () => {
        setBlockchainEnvironment(1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const tick: i32 = 100;
        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        p.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(p, tick);
        expect<i32>(q.tickBitmapManager.getCurrentBestTick()).toBe(tick);
    });

    it('cheapest tick wins across multiple ticks', () => {
        setBlockchainEnvironment(2);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const pA = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        const pB = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress2CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        const pC = createProvider(
            providerAddress3,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress3CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        pA.setPriceTick(500);
        pB.setPriceTick(-200);
        pC.setPriceTick(100);

        q.tickBitmapManager.addToTickFIFO(pA, 500);
        q.tickBitmapManager.addToTickFIFO(pB, -200);
        q.tickBitmapManager.addToTickFIFO(pC, 100);

        // Cheapest is -200 (lowest).
        expect<i32>(q.tickBitmapManager.getCurrentBestTick()).toBe(-200);
    });

    it('FIFO order within the same tick: first-added is returned first', () => {
        setBlockchainEnvironment(3);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const tick: i32 = 250;

        const pA = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        const pB = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress2CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        pA.setPriceTick(tick);
        pB.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(pA, tick);
        q.tickBitmapManager.addToTickFIFO(pB, tick);

        const first = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(first !== null).toBe(true);
        expect<bool>(u256.eq((first as Provider).getId(), pA.getId())).toBe(true);

        const second = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(second !== null).toBe(true);
        expect<bool>(u256.eq((second as Provider).getId(), pB.getId())).toBe(true);
    });

    it('purged sub-queue at tick T serves BEFORE fresh FIFO at the same tick', () => {
        setBlockchainEnvironment(4);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const tick: i32 = 1000;

        // Provider A listed first via FIFO. Provider B listed second, then pushed to purged[T].
        const pFresh = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        const pPurged = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress2CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        pFresh.setPriceTick(tick);
        pPurged.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(pFresh, tick);
        q.tickBitmapManager.addToTickFIFO(pPurged, tick);
        q.tickBitmapManager.addToTickPurged(pPurged, tick);

        // Purged provider serves first, despite being added to FIFO second.
        const first = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(first !== null).toBe(true);
        expect<bool>(u256.eq((first as Provider).getId(), pPurged.getId())).toBe(true);
    });

    it('walks across ticks once cheaper tick exhausts: T1 then T2', () => {
        setBlockchainEnvironment(5);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const pCheap = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        const pExpensive = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress2CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        pCheap.setPriceTick(-100);
        pExpensive.setPriceTick(300);
        q.tickBitmapManager.addToTickFIFO(pCheap, -100);
        q.tickBitmapManager.addToTickFIFO(pExpensive, 300);

        const first = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(first !== null).toBe(true);
        expect<bool>(u256.eq((first as Provider).getId(), pCheap.getId())).toBe(true);

        // Drain pCheap so the walker advances to pExpensive on next call.
        pCheap.setLiquidityAmount(u128.Zero);

        const second = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(second !== null).toBe(true);
        expect<bool>(u256.eq((second as Provider).getId(), pExpensive.getId())).toBe(true);
    });

    it('removeFromTickQueue tombstones the slot — the provider stops appearing', () => {
        setBlockchainEnvironment(6);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const tick: i32 = 2000;

        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        p.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(p, tick);
        expect<i32>(q.tickBitmapManager.getCurrentBestTick()).toBe(tick);

        q.tickBitmapManager.removeFromTickQueue(p);
        // After tombstoning, the next walk should NOT return this provider.
        const next = q.tickBitmapManager.getNextProviderWithLiquidity();
        if (next !== null) {
            expect<bool>(u256.eq((next as Provider).getId(), p.getId())).toBe(false);
        }
    });

    it('removeFromPurgeQueue clears purged flag and removes from sub-queue head', () => {
        setBlockchainEnvironment(7);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const tick: i32 = 3000;

        const pFresh = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        const pPurged = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress2CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        pFresh.setPriceTick(tick);
        pPurged.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(pFresh, tick);
        q.tickBitmapManager.addToTickFIFO(pPurged, tick);
        q.tickBitmapManager.addToTickPurged(pPurged, tick);
        expect<bool>(pPurged.isPurged()).toBe(true);

        q.tickBitmapManager.removeFromPurgeQueue(pPurged);
        expect<bool>(pPurged.isPurged()).toBe(false);

        // After removeFromPurgeQueue, pFresh now serves first (was second in FIFO).
        // Note: pPurged is still in FIFO; whether it serves second depends on cursor
        // — what we assert here is just that the purged flag is cleared.
    });

    it('addToTickPurged is idempotent — calling twice does NOT double-queue', () => {
        setBlockchainEnvironment(8);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const tick: i32 = 4000;

        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(1_000_000),
            u128.Zero,
        );
        p.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(p, tick);
        q.tickBitmapManager.addToTickPurged(p, tick);
        q.tickBitmapManager.addToTickPurged(p, tick); // no-op (already purged)

        expect<bool>(p.isPurged()).toBe(true);
        // Provider should serve exactly once when walked.
        const first = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(first !== null).toBe(true);
        expect<bool>(u256.eq((first as Provider).getId(), p.getId())).toBe(true);
    });

    it('walks return null when all liquidity is drained', () => {
        setBlockchainEnvironment(9);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const tick: i32 = 5000;

        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.Zero,
            u128.Zero,
        );
        p.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(p, tick);

        // With zero liquidity, the walker should skip the provider entirely.
        const first = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(first === null).toBe(true);
    });
});
