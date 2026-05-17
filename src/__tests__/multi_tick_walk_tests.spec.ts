import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { clearCachedProviders, getProvider, Provider } from '../models/Provider';
import {
    createLiquidityQueue,
    createProvider,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    providerAddress4,
    receiverAddress1CSV,
    receiverAddress2CSV,
    receiverAddress3CSV,
    receiverAddress4CSV,
    msgSender1,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';

/**
 * Multi-tick reserve walk with mixed purged/FIFO state.
 *
 * Verifies the ordering invariant:
 *   - Across ticks, the cheapest tick is served first.
 *   - Within a tick, `purged[T]` is served before fresh `FIFO[T]`.
 *
 * Scenario: providers at three different ticks, one of which has both
 * a purged entry and a fresh FIFO entry. Walk order must be:
 *   1. purged at cheap tick
 *   2. fresh at cheap tick
 *   3. fresh at mid tick
 *   4. fresh at high tick
 */

describe('Multi-tick walk with mixed purged/FIFO', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('walks (cheap.purged, cheap.fifo, mid.fifo, high.fifo) in that exact order', () => {
        setBlockchainEnvironment(1, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const tickCheap: i32 = -500;
        const tickMid: i32 = 0;
        const tickHigh: i32 = 700;

        // pPurgedAtCheap — listed at cheap tick, then pushed onto purged sub-queue
        const pPurgedAtCheap = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        pPurgedAtCheap.setPriceTick(tickCheap);
        q.tickBitmapManager.addToTickFIFO(pPurgedAtCheap, tickCheap);
        q.tickBitmapManager.addToTickPurged(pPurgedAtCheap, tickCheap);

        // pFreshAtCheap — listed at cheap tick AFTER, into FIFO only
        const pFreshAtCheap = createProvider(
            providerAddress2, tokenAddress1, false, false, false,
            receiverAddress2CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        pFreshAtCheap.setPriceTick(tickCheap);
        q.tickBitmapManager.addToTickFIFO(pFreshAtCheap, tickCheap);

        // pFreshAtMid — fresh listing at mid tick
        const pFreshAtMid = createProvider(
            providerAddress3, tokenAddress1, false, false, false,
            receiverAddress3CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        pFreshAtMid.setPriceTick(tickMid);
        q.tickBitmapManager.addToTickFIFO(pFreshAtMid, tickMid);

        // pFreshAtHigh — fresh listing at high tick
        const pFreshAtHigh = createProvider(
            providerAddress4, tokenAddress1, false, false, false,
            receiverAddress4CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        pFreshAtHigh.setPriceTick(tickHigh);
        q.tickBitmapManager.addToTickFIFO(pFreshAtHigh, tickHigh);

        // Walk: each call returns next provider in the expected order.
        // To force the cursor to advance past each, we drain their liquidity after returning.
        const ids: u256[] = [];

        const r1 = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(r1 !== null).toBe(true);
        ids.push((r1 as Provider).getId());
        (r1 as Provider).setLiquidityAmount(u128.Zero); // drain

        const r2 = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(r2 !== null).toBe(true);
        ids.push((r2 as Provider).getId());
        (r2 as Provider).setLiquidityAmount(u128.Zero);

        const r3 = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(r3 !== null).toBe(true);
        ids.push((r3 as Provider).getId());
        (r3 as Provider).setLiquidityAmount(u128.Zero);

        const r4 = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(r4 !== null).toBe(true);
        ids.push((r4 as Provider).getId());

        // Expected order:
        //  1. pPurgedAtCheap (purged sub-queue at the cheapest tick wins)
        //  2. pFreshAtCheap  (FIFO at the cheapest tick, after the purged sub-queue)
        //  3. pFreshAtMid    (next-cheapest tick)
        //  4. pFreshAtHigh   (highest tick)
        expect<bool>(u256.eq(ids[0], pPurgedAtCheap.getId())).toBe(true);
        expect<bool>(u256.eq(ids[1], pFreshAtCheap.getId())).toBe(true);
        expect<bool>(u256.eq(ids[2], pFreshAtMid.getId())).toBe(true);
        expect<bool>(u256.eq(ids[3], pFreshAtHigh.getId())).toBe(true);
    });

    it('cheapest tick may still contain only purged providers — they still serve first', () => {
        setBlockchainEnvironment(2, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const tickCheap: i32 = -1000;
        const tickHigh: i32 = 200;

        // Only one provider at cheapest tick, and they're purged.
        const pCheapPurged = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        pCheapPurged.setPriceTick(tickCheap);
        q.tickBitmapManager.addToTickFIFO(pCheapPurged, tickCheap);
        q.tickBitmapManager.addToTickPurged(pCheapPurged, tickCheap);

        const pHigh = createProvider(
            providerAddress2, tokenAddress1, false, false, false,
            receiverAddress2CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        pHigh.setPriceTick(tickHigh);
        q.tickBitmapManager.addToTickFIFO(pHigh, tickHigh);

        const first = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(first !== null).toBe(true);
        expect<bool>(u256.eq((first as Provider).getId(), pCheapPurged.getId())).toBe(true);
    });

    it('after the cheap tick is exhausted, walker advances to the next occupied tick', () => {
        setBlockchainEnvironment(3, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const tickCheap: i32 = -2000;
        const tickHigh: i32 = 5000;

        const pCheap = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        pCheap.setPriceTick(tickCheap);
        q.tickBitmapManager.addToTickFIFO(pCheap, tickCheap);

        const pHigh = createProvider(
            providerAddress2, tokenAddress1, false, false, false,
            receiverAddress2CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        pHigh.setPriceTick(tickHigh);
        q.tickBitmapManager.addToTickFIFO(pHigh, tickHigh);

        // Drain cheap immediately.
        pCheap.setLiquidityAmount(u128.Zero);

        // First call must skip cheap (no liquidity) and return pHigh.
        const first = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(first !== null).toBe(true);
        expect<bool>(u256.eq((first as Provider).getId(), pHigh.getId())).toBe(true);
    });
});
