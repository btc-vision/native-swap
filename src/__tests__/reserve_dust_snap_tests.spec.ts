import { Blockchain, ExtendedAddress, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { TransactionOutput } from '@btc-vision/btc-runtime/runtime/env/classes/UTXO';
import { TransactionOutputFlags } from '@btc-vision/btc-runtime/runtime/env/enums/TransactionFlags';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { clearCachedProviders, getProvider, Provider } from '../models/Provider';
import {
    createLiquidityQueue,
    createProvider,
    createProviderId,
    msgSender1,
    providerAddress1,
    receiverAddress1,
    receiverAddress1CSV,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import {
    MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
    MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';

/**
 * Dust-snap behavior in the reserve walk.
 *
 * The mechanism (in `ReserveLiquidityOperation.reserveProviders`):
 *   - For each provider walked, the operation computes `tokensToReserve = min(avail, budgetTokens)`.
 *   - If `(avail - tokensToReserve)` would leave the provider with < 1000 sat-equivalent
 *     (`MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT`), the leftover is dust.
 *   - To avoid leaving stranded dust, the walk snaps `tokensToReserve = avail` — the
 *     reservation absorbs the whole remaining liquidity into THIS entry.
 *
 * At tick 0, the math is direct: 1 base unit = 1 sat. Test cases below pick avail/budget
 * pairs that put the leftover above or below the 1000-sat threshold.
 */

/**
 * Mock the buyer's "prove ownership" output — send `sats` to the buyer's CSV
 * (which is derived from `(sender bytes, activationDelay)` in the operation).
 */
function mockBuyerOutputForReserve(
    senderBytes: Uint8Array,
    activationDelay: u8,
    sats: u64,
): void {
    const csv = ExtendedAddress.toCSV(senderBytes, <u32>activationDelay);
    Blockchain.mockTransactionOutput([
        new TransactionOutput(0, <u8>TransactionOutputFlags.hasTo, null, csv, sats),
    ]);
}

describe('Reserve walk — dust-snap', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
        Blockchain.mockValidateBitcoinAddressResult(true);
    });

    it('snaps entire avail when leftover would be < 1000 sats', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        // Provider at tick 0 with avail = 10_500 base units (= 10_500 sats).
        const tick: i32 = 0;
        const p = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(10_500), u128.Zero,
        );
        p.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(p, tick);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(10_500));
        q.liquidityQueue.save();

        // Buyer budgets 10_000 sats (the minimum trade size). Buys 10_000 base units,
        // leftover = 500 (< 1000). Dust-snap should kick in → reserve full 10_500.
        const buyerProviderId = createProviderId(msgSender1, tokenAddress1);
        const activationDelay: u8 = 1;
        const maxSats: u64 = 10_000;
        mockBuyerOutputForReserve(receiverAddress1, activationDelay, maxSats);

        const op = new ReserveLiquidityOperation(
            q.liquidityQueue,
            buyerProviderId,
            msgSender1,
            maxSats,
            u256.fromU64(1),
            activationDelay,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
            MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS,
            receiverAddress1,
        );
        op.execute();

        // The whole 10_500 should be reserved against this provider.
        const after: Provider = getProvider(p.getId());
        expect<bool>(u128.eq(after.getReservedAmount(), u128.fromU64(10_500))).toBe(true);
    });

    it('no snap when leftover is exactly the dust threshold (1000 sats)', () => {
        setBlockchainEnvironment(200, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = 0;
        const p = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(11_000), u128.Zero,
        );
        p.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(p, tick);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(11_000));
        q.liquidityQueue.save();

        // Buyer budget 10_000, avail 11_000. Leftover after reserving 10_000
        // would be 1000 = MINIMUM (not strictly < 1000) → no snap.
        const buyerProviderId = createProviderId(msgSender1, tokenAddress1);
        const activationDelay: u8 = 1;
        const maxSats: u64 = 10_000;
        mockBuyerOutputForReserve(receiverAddress1, activationDelay, maxSats);

        const op = new ReserveLiquidityOperation(
            q.liquidityQueue,
            buyerProviderId,
            msgSender1,
            maxSats,
            u256.fromU64(1),
            activationDelay,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
            MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS,
            receiverAddress1,
        );
        op.execute();

        const after: Provider = getProvider(p.getId());
        expect<bool>(u128.eq(after.getReservedAmount(), u128.fromU64(10_000))).toBe(true);
    });

    it('no snap when buyer drains the provider exactly (leftover == 0)', () => {
        setBlockchainEnvironment(300, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = 0;
        const p = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(15_000), u128.Zero,
        );
        p.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(p, tick);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(15_000));
        q.liquidityQueue.save();

        const buyerProviderId = createProviderId(msgSender1, tokenAddress1);
        const activationDelay: u8 = 1;
        const maxSats: u64 = 15_000;
        mockBuyerOutputForReserve(receiverAddress1, activationDelay, maxSats);

        const op = new ReserveLiquidityOperation(
            q.liquidityQueue,
            buyerProviderId,
            msgSender1,
            maxSats,
            u256.fromU64(1),
            activationDelay,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
            MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS,
            receiverAddress1,
        );
        op.execute();

        const after: Provider = getProvider(p.getId());
        expect<bool>(u128.eq(after.getReservedAmount(), u128.fromU64(15_000))).toBe(true);
    });

    it('strict minimum (1000 sats) constants are consistent', () => {
        expect<u64>(STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT).toBe(1_000);
        expect<u64>(MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT).toBe(1_000);
    });
});
