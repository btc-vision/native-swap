import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { clearCachedProviders, getProvider, Provider } from '../models/Provider';
import {
    createLiquidityQueue,
    createProvider,
    msgSender1,
    ownerAddress1,
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
import { RESERVATION_EXPIRE_AFTER_IN_BLOCKS } from '../constants/Contract';

/**
 * Per-tick purge → restore flow.
 *
 * The mechanism:
 *   1. Buyer creates a reservation against provider Alice at tick T.
 *   2. provider.reservedAmount += providedAmount
 *      reservation gets indexed under its creationBlock.
 *   3. Reservation expires (block > creationBlock + RESERVATION_EXPIRE_AFTER_IN_BLOCKS).
 *   4. Next call to `purgeReservationsAndRestoreProviders` walks the per-block
 *      reservation list, for each active expired entry:
 *        - subtracts providedAmount from provider.reservedAmount
 *        - if provider still meets per-provider minimum at their tick → push
 *          onto purged[priceTick] (fast-path re-allocation)
 *        - else (dust) → push onto global fulfilled queue
 *   5. The next `getNextProviderWithLiquidity()` walk hits purged[T] first.
 *
 * Each `it()` uses a distinct creation block and tick range.
 */

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

describe('Per-tick purge → restore flow', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('expired reservation: provider gets reservedAmount returned and is flagged purged', () => {
        const startBlock: u64 = 100;
        setBlockchainEnvironment(startBlock, msgSender1, msgSender1);

        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = 0;
        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(50_000),
            u128.Zero,
        );
        provider.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(provider, tick);

        // Reserve 12_000 base units from Alice.
        const reservation = new Reservation(tokenAddress1, ownerAddress1);
        reservation.setCreationBlock(startBlock);
        reservation.addProvider(entry(provider.getId(), u128.fromU64(12_000), tick, startBlock));
        provider.addToReservedAmount(u128.fromU64(12_000));
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(50_000));
        q.liquidityQueue.increaseTotalReserved(u256.fromU64(12_000));
        q.reservationManager.addReservation(startBlock, reservation);
        q.liquidityQueue.save();

        // Move past expiration and trigger purge.
        const purgeBlock: u64 = startBlock + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + 1;
        setBlockchainEnvironment(purgeBlock, msgSender1, msgSender1);
        q.reservationManager.purgeReservationsAndRestoreProviders(0);

        const after: Provider = getProvider(provider.getId());
        // Reserved tokens returned to availability:
        expect<bool>(after.getReservedAmount().isZero()).toBe(true);
        // Provider was pushed to per-tick purged sub-queue for fast-path re-allocation:
        expect<bool>(after.isPurged()).toBe(true);
    });

    it('after purge, provider in purged[T] serves BEFORE fresh FIFO entries at the same tick', () => {
        const startBlock: u64 = 200;
        setBlockchainEnvironment(startBlock, msgSender1, msgSender1);

        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = 50;

        // Alice was listed first and got a reservation against her.
        const pAlice = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(50_000),
            u128.Zero,
        );
        pAlice.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(pAlice, tick);

        const reservation = new Reservation(tokenAddress1, ownerAddress1);
        reservation.setCreationBlock(startBlock);
        reservation.addProvider(entry(pAlice.getId(), u128.fromU64(15_000), tick, startBlock));
        pAlice.addToReservedAmount(u128.fromU64(15_000));
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(50_000));
        q.liquidityQueue.increaseTotalReserved(u256.fromU64(15_000));
        q.reservationManager.addReservation(startBlock, reservation);

        // Bob lists fresh at the same tick AFTER Alice was reserved against.
        const pBob = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress2CSV,
            u128.Zero,
            u128.fromU64(30_000),
            u128.Zero,
        );
        pBob.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(pBob, tick);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(30_000));
        q.liquidityQueue.save();

        // Reservation expires, purge runs, Alice ends up in purged[T].
        const purgeBlock: u64 = startBlock + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + 1;
        setBlockchainEnvironment(purgeBlock, msgSender1, msgSender1);
        q.reservationManager.purgeReservationsAndRestoreProviders(0);

        expect<bool>(getProvider(pAlice.getId()).isPurged()).toBe(true);

        // Next walk should hit Alice first, even though Bob was added to FIFO before
        // Alice's purge — the per-tick purged sub-queue takes precedence.
        const first = q.tickBitmapManager.getNextProviderWithLiquidity();
        expect<bool>(first !== null).toBe(true);
        expect<bool>(u256.eq((first as Provider).getId(), pAlice.getId())).toBe(true);
    });

    it('purge before expiration window has elapsed is a no-op', () => {
        const startBlock: u64 = 300;
        setBlockchainEnvironment(startBlock, msgSender1, msgSender1);

        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const tick: i32 = -100;
        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(50_000),
            u128.Zero,
        );
        provider.setPriceTick(tick);
        q.tickBitmapManager.addToTickFIFO(provider, tick);

        const reservation = new Reservation(tokenAddress1, ownerAddress1);
        reservation.setCreationBlock(startBlock);
        reservation.addProvider(entry(provider.getId(), u128.fromU64(10_000), tick, startBlock));
        provider.addToReservedAmount(u128.fromU64(10_000));
        q.reservationManager.addReservation(startBlock, reservation);
        q.liquidityQueue.save();

        // One block later — well within expiration window — purge should be a no-op.
        setBlockchainEnvironment(startBlock + 1, msgSender1, msgSender1);
        q.reservationManager.purgeReservationsAndRestoreProviders(0);

        const after: Provider = getProvider(provider.getId());
        expect<bool>(after.getReservedAmount().isZero()).toBe(false);
        expect<bool>(after.isPurged()).toBe(false);
    });
});
