import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { TransactionOutput } from '@btc-vision/btc-runtime/runtime/env/classes/UTXO';
import { TransactionOutputFlags } from '@btc-vision/btc-runtime/runtime/env/enums/TransactionFlags';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { clearCachedProviders, clearPendingStakingContractAmount } from '../models/Provider';
import {
    createLiquidityQueue,
    createProvider,
    msgSender1,
    providerAddress1,
    providerAddress2,
    receiverAddress1CSV,
    receiverAddress2CSV,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { Reservation } from '../models/Reservation';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { TickMath } from '../utils/TickMath';
import { SWAP_FEE_BPS, SWAP_FEE_DENOM } from '../constants/Contract';

/**
 * Per-entry frozen fillPrice settlement — TradeManager exact value verification.
 *
 * The contract no longer maintains a global quote. Each `ReservationProviderData`
 * entry records its own `(tick, fillPrice)` at reserve time. TradeManager uses
 * THAT frozen pair to compute `requiredSats = (providedAmount * fillPrice) >> 88`.
 *
 * This spec verifies:
 *   - At non-zero ticks, settlement uses the entry's tick (not the provider's
 *     current tick, in case the provider has since done updateListing).
 *   - Partial fills compute `actualTokens = floor((sentSats << 88) / fillPrice)`.
 *   - Multi-leg reservations apply each leg's own fillPrice independently.
 *   - Total fee = floor(SUM(deliveredTokens) * 30 / 10_000).
 */

function pushOutput(to: string, value: u64): void {
    Blockchain.mockTransactionOutput([
        new TransactionOutput(0, <u8>TransactionOutputFlags.hasTo, null, to, value),
    ]);
}

function pushOutputs(toA: string, valA: u64, toB: string, valB: u64): void {
    Blockchain.mockTransactionOutput([
        new TransactionOutput(0, <u8>TransactionOutputFlags.hasTo, null, toA, valA),
        new TransactionOutput(1, <u8>TransactionOutputFlags.hasTo, null, toB, valB),
    ]);
}

function entry(
    providerId: u256,
    amount: u128,
    tick: i32,
    creationBlock: u64,
): ReservationProviderData {
    return new ReservationProviderData(
        providerId,
        amount,
        tick,
        TickMath.tickToPrice(tick),
        creationBlock,
    );
}

describe('Per-entry fillPrice settlement — exact values', () => {
    beforeEach(() => {
        clearCachedProviders();
        clearPendingStakingContractAmount();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('at tick +10, full-fill: 10000 base units required ≈ 10100 sats (1.001^10 ≈ 1.01005)', () => {
        setBlockchainEnvironment(1000, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = 10;
        // requiredSats = floor(10_000 * tickToPrice(10) / 2^88).
        const requiredSats: u64 = TickMath.tokensToSatoshis(
            u128.fromU64(10_000),
            TickMath.tickToPrice(tick),
        );

        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(20_000),
            u128.fromU64(10_000),
        );
        p.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(p, tick);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(20_000));
        q.liquidityQueue.increaseTotalReserved(u256.fromU64(10_000));

        const cb = Blockchain.block.number;
        const r = new Reservation(tokenAddress1, msgSender1);
        r.setCreationBlock(cb);
        r.addProvider(entry(p.getId(), u128.fromU64(10_000), tick, cb));
        q.liquidityQueue.addReservation(r);
        q.liquidityQueue.save();

        // Buyer sends exactly `requiredSats` to the provider's CSV → full fill.
        setBlockchainEnvironment(1001, msgSender1, msgSender1);
        pushOutput(receiverAddress1CSV, requiredSats);

        const result = q.tradeManager.executeTrade(r);

        // Full fill: 10_000 tokens delivered, minus the 0.3% fee.
        const expectedFee: u256 = u256.fromU64((10_000 * SWAP_FEE_BPS) / SWAP_FEE_DENOM);
        const expectedBuyerOut: u256 = u256.sub(u256.fromU64(10_000), expectedFee);

        expect<bool>(u256.eq(result.totalTokensPurchased, expectedBuyerOut)).toBe(true);
        expect<u64>(result.totalSatoshisSpent).toBe(requiredSats);
        // Sanity: requiredSats > 10_000 because tick is positive.
        expect<bool>(requiredSats > 10_000).toBe(true);
    });

    it('at tick -10, full-fill: 10000 base units required ≈ 9900 sats (1.001^-10 ≈ 0.99005)', () => {
        setBlockchainEnvironment(2000, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = -10;
        const requiredSats: u64 = TickMath.tokensToSatoshis(
            u128.fromU64(10_000),
            TickMath.tickToPrice(tick),
        );

        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(20_000),
            u128.fromU64(10_000),
        );
        p.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(p, tick);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(20_000));
        q.liquidityQueue.increaseTotalReserved(u256.fromU64(10_000));

        const cb = Blockchain.block.number;
        const r = new Reservation(tokenAddress1, msgSender1);
        r.setCreationBlock(cb);
        r.addProvider(entry(p.getId(), u128.fromU64(10_000), tick, cb));
        q.liquidityQueue.addReservation(r);
        q.liquidityQueue.save();

        setBlockchainEnvironment(2001, msgSender1, msgSender1);
        pushOutput(receiverAddress1CSV, requiredSats);

        const result = q.tradeManager.executeTrade(r);

        const expectedFee: u256 = u256.fromU64((10_000 * SWAP_FEE_BPS) / SWAP_FEE_DENOM);
        const expectedBuyerOut: u256 = u256.sub(u256.fromU64(10_000), expectedFee);
        expect<bool>(u256.eq(result.totalTokensPurchased, expectedBuyerOut)).toBe(true);
        // Sats sent must be LESS than 10_000 because tick is negative.
        expect<bool>(requiredSats < 10_000).toBe(true);
    });

    it('partial fill at tick +100: actualTokens = floor((sentSats << 88) / fillPrice)', () => {
        setBlockchainEnvironment(3000, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = 100;
        const fillPrice: u128 = TickMath.tickToPrice(tick);
        // At tick 100, 1.001^100 ≈ 1.10516. 50_000 tokens require ~55_258 sats.
        // We send only 30_000 sats → expect actualTokens = floor((30000 << 88) / fp) ≈ 27_146.
        const sentSats: u64 = 30_000;
        const expectedActualTokens: u128 = TickMath.satoshisToTokens(sentSats, fillPrice);

        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(100_000),
            u128.fromU64(50_000),
        );
        p.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(p, tick);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(100_000));
        q.liquidityQueue.increaseTotalReserved(u256.fromU64(50_000));

        const cb = Blockchain.block.number;
        const r = new Reservation(tokenAddress1, msgSender1);
        r.setCreationBlock(cb);
        r.addProvider(entry(p.getId(), u128.fromU64(50_000), tick, cb));
        q.liquidityQueue.addReservation(r);
        q.liquidityQueue.save();

        setBlockchainEnvironment(3001, msgSender1, msgSender1);
        pushOutput(receiverAddress1CSV, sentSats);

        const result = q.tradeManager.executeTrade(r);

        // The buyer should have received `expectedActualTokens − fee`.
        const feeBps: u64 = SWAP_FEE_BPS;
        const feeDenom: u64 = SWAP_FEE_DENOM;
        const actualU64: u64 = expectedActualTokens.toU64();
        const expectedFee: u256 = u256.fromU64((actualU64 * feeBps) / feeDenom);
        const expectedBuyerOut: u256 = u256.sub(expectedActualTokens.toU256(), expectedFee);

        expect<bool>(u256.eq(result.totalTokensPurchased, expectedBuyerOut)).toBe(true);
    });

    it('multi-leg with different ticks: each leg settles using its OWN frozen fillPrice', () => {
        setBlockchainEnvironment(4000, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tickA: i32 = 20;
        const tickB: i32 = -30;
        const reserveA: u64 = 5_000;
        const reserveB: u64 = 8_000;
        const sendA: u64 = TickMath.tokensToSatoshis(
            u128.fromU64(reserveA),
            TickMath.tickToPrice(tickA),
        );
        const sendB: u64 = TickMath.tokensToSatoshis(
            u128.fromU64(reserveB),
            TickMath.tickToPrice(tickB),
        );

        const pA = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(10_000),
            u128.fromU64(reserveA),
        );
        const pB = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress2CSV,
            u128.Zero,
            u128.fromU64(10_000),
            u128.fromU64(reserveB),
        );
        pA.setPriceTick(tickA);
        pB.setPriceTick(tickB);
        q.tickBitmapManager.addToTickFIFO(pA, tickA);
        q.tickBitmapManager.addToTickFIFO(pB, tickB);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(20_000));
        q.liquidityQueue.increaseTotalReserved(u256.fromU64(reserveA + reserveB));

        const cb = Blockchain.block.number;
        const r = new Reservation(tokenAddress1, msgSender1);
        r.setCreationBlock(cb);
        r.addProvider(entry(pA.getId(), u128.fromU64(reserveA), tickA, cb));
        r.addProvider(entry(pB.getId(), u128.fromU64(reserveB), tickB, cb));
        q.liquidityQueue.addReservation(r);
        q.liquidityQueue.save();

        // Even if Alice or Bob updateListing'd their providers post-reservation, the
        // settlement uses the entry's frozen fillPrice — not the provider's current one.
        // (Simulating the after-effect: move pA to a different tick AFTER the reservation.)
        pA.setPriceTick(50_000);

        setBlockchainEnvironment(4001, msgSender1, msgSender1);
        pushOutputs(receiverAddress1CSV, sendA, receiverAddress2CSV, sendB);

        const result = q.tradeManager.executeTrade(r);

        // Total tokens delivered (pre-fee) should be reserveA + reserveB.
        const total: u64 = reserveA + reserveB;
        const expectedFee: u256 = u256.fromU64((total * SWAP_FEE_BPS) / SWAP_FEE_DENOM);
        const expectedBuyerOut: u256 = u256.sub(u256.fromU64(total), expectedFee);
        expect<bool>(u256.eq(result.totalTokensPurchased, expectedBuyerOut)).toBe(true);
        expect<u64>(result.totalSatoshisSpent).toBe(sendA + sendB);
    });

    it('changing provider.priceTick AFTER reserve does NOT affect settlement', () => {
        // Same as the multi-leg test above, but in isolation: verify the frozen
        // fillPrice locks the settlement math.
        setBlockchainEnvironment(5000, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tickReserve: i32 = 100; // frozen tick for this entry
        const tickAfter: i32 = -100; // provider moves here AFTER reserve
        const tokensRequested: u64 = 10_000;

        const requiredSatsAtFrozen: u64 = TickMath.tokensToSatoshis(
            u128.fromU64(tokensRequested),
            TickMath.tickToPrice(tickReserve),
        );

        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(20_000),
            u128.fromU64(tokensRequested),
        );
        p.setPriceTick(tickReserve);
        q.tickBitmapManager.addToTickFIFO(p, tickReserve);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(20_000));
        q.liquidityQueue.increaseTotalReserved(u256.fromU64(tokensRequested));

        const cb = Blockchain.block.number;
        const r = new Reservation(tokenAddress1, msgSender1);
        r.setCreationBlock(cb);
        r.addProvider(entry(p.getId(), u128.fromU64(tokensRequested), tickReserve, cb));
        q.liquidityQueue.addReservation(r);
        q.liquidityQueue.save();

        // Provider moves to a much cheaper tick AFTER the reservation was created.
        // Settlement must still use tickReserve's frozen fillPrice — buyer pays the
        // higher amount they originally locked in, NOT the now-cheaper current price.
        p.setPriceTick(tickAfter);

        setBlockchainEnvironment(5001, msgSender1, msgSender1);
        pushOutput(receiverAddress1CSV, requiredSatsAtFrozen);

        const result = q.tradeManager.executeTrade(r);

        const expectedFee: u256 = u256.fromU64((tokensRequested * SWAP_FEE_BPS) / SWAP_FEE_DENOM);
        const expectedBuyerOut: u256 = u256.sub(u256.fromU64(tokensRequested), expectedFee);
        expect<bool>(u256.eq(result.totalTokensPurchased, expectedBuyerOut)).toBe(true);
        // The sats spent should be the FROZEN-tick amount, not the after-tick amount.
        expect<u64>(result.totalSatoshisSpent).toBe(requiredSatsAtFrozen);
    });
});
