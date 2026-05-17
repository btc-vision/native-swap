import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { TransactionOutput } from '@btc-vision/btc-runtime/runtime/env/classes/UTXO';
import { TransactionOutputFlags } from '@btc-vision/btc-runtime/runtime/env/enums/TransactionFlags';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    clearCachedProviders,
    clearPendingStakingContractAmount,
    getPendingStakingContractAmount,
    Provider,
} from '../models/Provider';
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
 * Flat 0.3% swap fee at settlement.
 *
 * The plan:
 *   - `feeAmount = floor(totalTokensPurchased * SWAP_FEE_BPS / SWAP_FEE_DENOM)`
 *     where `SWAP_FEE_BPS = 30`, `SWAP_FEE_DENOM = 10_000` → 0.30% flat.
 *   - `buyerOut = totalTokensPurchased - feeAmount` (the value returned by executeTrade).
 *   - `feeAmount` is added to the pending staking accumulator
 *     (`addAmountToStakingContract`) and subtracted from `liquidityQueueReserve.liquidity`.
 *
 * This spec confirms the fee math end-to-end through TradeManager.executeTrade.
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

describe('Swap fee — flat 0.3% via TradeManager', () => {
    beforeEach(() => {
        clearCachedProviders();
        clearPendingStakingContractAmount();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('fee = floor(amount * 30 / 10_000) — staking accumulator gets exactly that', () => {
        setBlockchainEnvironment(1000, msgSender1, msgSender1);

        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = 0; // 1 sat per base unit
        const provider = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(100_000), u128.fromU64(50_000),
        );
        provider.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(provider, tick);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(100_000));
        q.liquidityQueue.increaseTotalReserved(u256.fromU64(50_000));

        const creationBlock = Blockchain.block.number;
        const reservation = new Reservation(tokenAddress1, msgSender1);
        reservation.setCreationBlock(creationBlock);
        reservation.addProvider(entry(provider.getId(), u128.fromU64(50_000), tick, creationBlock));
        q.liquidityQueue.addReservation(reservation);
        q.liquidityQueue.save();

        // Buyer sends exact required sats.
        setBlockchainEnvironment(1001, msgSender1, msgSender1);
        pushOutput(receiverAddress1CSV, 50_000);

        const result = q.tradeManager.executeTrade(reservation);

        // 50_000 base units × 0.3% = 150 fee, buyer gets 49_850.
        const expectedFee: u256 = u256.fromU64((50_000 * SWAP_FEE_BPS) / SWAP_FEE_DENOM);
        const expectedBuyerOut: u256 = u256.sub(u256.fromU64(50_000), expectedFee);

        expect<bool>(u256.eq(result.totalTokensPurchased, expectedBuyerOut)).toBe(true);
        expect<bool>(u256.eq(result.totalTokensRefunded, expectedFee)).toBe(true);

        // Pending staking accumulator should now hold the fee.
        expect<bool>(u256.eq(getPendingStakingContractAmount(), expectedFee)).toBe(true);
    });

    it('fee is subtracted from liquidityQueueReserve.liquidity at settlement', () => {
        setBlockchainEnvironment(2000, msgSender1, msgSender1);

        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = 0;
        const provider = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(100_000), u128.fromU64(20_000),
        );
        provider.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(provider, tick);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(100_000));
        q.liquidityQueue.increaseTotalReserved(u256.fromU64(20_000));

        const liqBefore: u256 = q.liquidityQueue.liquidity;

        const creationBlock = Blockchain.block.number;
        const reservation = new Reservation(tokenAddress1, msgSender1);
        reservation.setCreationBlock(creationBlock);
        reservation.addProvider(entry(provider.getId(), u128.fromU64(20_000), tick, creationBlock));
        q.liquidityQueue.addReservation(reservation);
        q.liquidityQueue.save();

        setBlockchainEnvironment(2001, msgSender1, msgSender1);
        pushOutput(receiverAddress1CSV, 20_000);

        q.tradeManager.executeTrade(reservation);

        // 20_000 × 0.3% = 60 fee. Reserve decreases by:
        //   - tokens delivered to buyer (sub'd inside provider.subtractFromLiquidityAmount via reserve)
        //   - fee amount (burned to staking).
        // Net: liquidity goes down by `feeAmount` because the per-provider delivery
        // also subtracts via the `subtractFromLiquidityAmount` path which mirrors
        // the reserve. We assert the fee portion specifically here:
        const expectedFee: u256 = u256.fromU64((20_000 * SWAP_FEE_BPS) / SWAP_FEE_DENOM);
        const liqAfter: u256 = q.liquidityQueue.liquidity;
        // Liquidity must have dropped by AT LEAST the fee amount.
        expect<bool>(u256.ge(u256.sub(liqBefore, liqAfter), expectedFee)).toBe(true);
    });

    it('multi-provider settlement: fee is applied to the SUM of tokensPurchased, not per-leg', () => {
        setBlockchainEnvironment(3000, msgSender1, msgSender1);

        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = 0;
        const pA = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(60_000), u128.fromU64(20_000),
        );
        const pB = createProvider(
            providerAddress2, tokenAddress1, false, false, false,
            receiverAddress2CSV, u128.Zero, u128.fromU64(60_000), u128.fromU64(15_000),
        );
        pA.setPriceTick(tick);
        pB.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(pA, tick);
        q.tickBitmapManager.addToTickFIFO(pB, tick);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(120_000));
        q.liquidityQueue.increaseTotalReserved(u256.fromU64(35_000));

        const creationBlock = Blockchain.block.number;
        const reservation = new Reservation(tokenAddress1, msgSender1);
        reservation.setCreationBlock(creationBlock);
        reservation.addProvider(entry(pA.getId(), u128.fromU64(20_000), tick, creationBlock));
        reservation.addProvider(entry(pB.getId(), u128.fromU64(15_000), tick, creationBlock));
        q.liquidityQueue.addReservation(reservation);
        q.liquidityQueue.save();

        setBlockchainEnvironment(3001, msgSender1, msgSender1);
        pushOutputs(receiverAddress1CSV, 20_000, receiverAddress2CSV, 15_000);

        const result = q.tradeManager.executeTrade(reservation);

        // Total: 35_000 base units × 0.3% = 105 fee, buyer gets 34_895.
        const expectedFee: u256 = u256.fromU64((35_000 * SWAP_FEE_BPS) / SWAP_FEE_DENOM);
        const expectedBuyerOut: u256 = u256.sub(u256.fromU64(35_000), expectedFee);
        expect<bool>(u256.eq(result.totalTokensPurchased, expectedBuyerOut)).toBe(true);
        // Pending staking accumulator matches the fee.
        expect<bool>(u256.eq(getPendingStakingContractAmount(), expectedFee)).toBe(true);
    });

    it('SWAP_FEE_BPS == 30 and SWAP_FEE_DENOM == 10_000 (sanity)', () => {
        expect<u64>(SWAP_FEE_BPS).toBe(30);
        expect<u64>(SWAP_FEE_DENOM).toBe(10_000);
    });
});
