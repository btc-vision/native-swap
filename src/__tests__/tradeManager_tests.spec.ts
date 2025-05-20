import { clearCachedProviders, Provider } from '../models/Provider';
import { Blockchain, TransactionOutput, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    createReservation,
    ownerAddress1,
    providerAddress1,
    providerAddress2,
    receiverAddress1,
    receiverAddress2,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Reservation } from '../models/Reservation';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ProviderTypes } from '../types/ProviderTypes';
import { INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';

describe('TradeManager tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('should revert if reservation is invalid', () => {
        setBlockchainEnvironment(0);

        expect(() => {
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

            reservation.timeoutUser();

            queue.tradeManager.executeTrade(reservation);
        }).toThrow('No active reservation for this address.');
    });

    it('should revert if quote at createdat block number is 0', () => {
        setBlockchainEnvironment(0);

        expect(() => {
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            queue.liquidityQueue.setBlockQuote();

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(0, u128.fromU32(10), ProviderTypes.LiquidityRemoval),
            );

            queue.tradeManager.executeTrade(reservation);
        }).toThrow();
    });

    it('should delete reservation', () => {
        setBlockchainEnvironment(0);

        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            receiverAddress1,
            u128.fromU64(2000000000),
            u128.fromU64(2000000000),
            u128.fromU64(10),
        );

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.liquidityQueue.initializeInitialLiquidity(
            u256.fromU32(10000),
            provider1.getId(),
            u128.fromU64(2000000000),
            5,
        );

        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(2000000000));
        queue.liquidityQueue.increaseTotalReserved(u256.fromU64(10));
        expect(queue.liquidityQueue.quote()).not.toStrictEqual(u256.Zero);

        queue.liquidityQueue.setBlockQuote();

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.addProvider(
            new ReservationProviderData(
                INITIAL_LIQUIDITY_PROVIDER_INDEX,
                u128.fromU32(10),
                ProviderTypes.Normal,
            ),
        );
        reservation.setPurgeIndex(0);

        const reservationActiveList = queue.reservationManager.getActiveReservationListForBlock(0);
        reservationActiveList.push(true);
        reservationActiveList.save();

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, provider1.getBtcReceiver(), 100));

        Blockchain.mockTransactionOutput(txOut);

        queue.tradeManager.executeTrade(reservation);

        expect(reservation.isValid()).toBeFalsy();
    });

    it('should set blockNumber to 0 if reservation.createdAt=0', () => {
        setBlockchainEnvironment(0);

        expect(() => {
            const provider1: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                receiverAddress1,
                u128.fromU64(2000000000),
                u128.fromU64(2000000000),
                u128.fromU64(10),
            );

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(10000),
                provider1.getId(),
                u128.fromU64(2000000000),
                5,
            );

            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(2000000000));
            queue.liquidityQueue.increaseTotalReserved(u256.fromU64(10));
            expect(queue.liquidityQueue.quote()).not.toStrictEqual(u256.Zero);

            queue.liquidityQueue.setBlockQuote();

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    INITIAL_LIQUIDITY_PROVIDER_INDEX,
                    u128.fromU32(10),
                    ProviderTypes.Normal,
                ),
            );

            reservation.setPurgeIndex(0);

            const reservationActiveList =
                queue.reservationManager.getActiveReservationListForBlock(0);
            reservationActiveList.push(true);
            reservationActiveList.save();

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, provider1.getBtcReceiver(), 100));

            Blockchain.mockTransactionOutput(txOut);

            queue.tradeManager.executeTrade(reservation);
        }).not.toThrow();
    });

    it('should set blockNumber to createdAt if createdAt < 4294967294', () => {
        setBlockchainEnvironment(1000);

        expect(() => {
            const provider1: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                receiverAddress1,
                u128.fromU64(2000000000),
                u128.fromU64(2000000000),
                u128.fromU64(10),
            );
            provider1.markInitialLiquidityProvider();
            provider1.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(10000),
                provider1.getId(),
                u128.fromU64(2000000000),
                5,
            );

            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(2000000000));
            queue.liquidityQueue.increaseTotalReserved(u256.fromU64(10));
            expect(queue.liquidityQueue.quote()).not.toStrictEqual(u256.Zero);

            queue.liquidityQueue.setBlockQuote();

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    INITIAL_LIQUIDITY_PROVIDER_INDEX,
                    u128.fromU32(10),
                    ProviderTypes.Normal,
                ),
            );
            reservation.setPurgeIndex(0);
            reservation.save();

            const reservationActiveList =
                queue.reservationManager.getActiveReservationListForBlock(1000);
            reservationActiveList.push(true);
            reservationActiveList.save();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1003);

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, provider1.getBtcReceiver(), 100));

            Blockchain.mockTransactionOutput(txOut);

            queue2.tradeManager.executeTrade(reservation2);
        }).not.toThrow();
    });

    it('should revert when queueType = LIQUIDITY_REMOVAL_TYPE and !provider.pendingRemoval', () => {
        setBlockchainEnvironment(1000);

        expect(() => {
            const provider1: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                receiverAddress1,
                u128.fromU64(2000000000),
                u128.fromU64(2000000000),
                u128.Zero,
            );
            provider1.markInitialLiquidityProvider();
            provider1.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);

            const provider2: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                true,
                true,
                receiverAddress1,
                u128.fromU64(1000000000),
                u128.fromU64(1000000000),
                u128.fromU64(10),
            );
            provider2.setQueueIndex(0);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(10000),
                provider1.getId(),
                u128.fromU64(2000000000),
                5,
            );

            queue.liquidityQueue.addToRemovalQueue(provider2);
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            queue.liquidityQueue.increaseTotalReserved(u256.fromU64(10));
            expect(queue.liquidityQueue.quote()).not.toStrictEqual(u256.Zero);

            queue.liquidityQueue.setBlockQuote();

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider2.getQueueIndex(),
                    u128.fromU32(10),
                    ProviderTypes.LiquidityRemoval,
                ),
            );
            const index = queue.liquidityQueue.addActiveReservation(reservation);
            reservation.setPurgeIndex(index);
            reservation.save();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1003);

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, provider1.getBtcReceiver(), 100));

            Blockchain.mockTransactionOutput(txOut);

            queue2.tradeManager.executeTrade(reservation2);
        }).toThrow();
    });

    it('should update SatoshisOwedReserved when queueType = LIQUIDITY_REMOVAL_TYPE and no UTXO sent', () => {
        setBlockchainEnvironment(1000);

        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            receiverAddress1,
            u128.fromU64(2000000000),
            u128.fromU64(2000000000),
            u128.Zero,
        );
        provider1.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
        provider1.markInitialLiquidityProvider();

        const provider2: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            true,
            true,
            receiverAddress2,
            u128.fromU64(1000000000),
            u128.fromU64(1000000000),
            u128.fromU64(10),
        );
        provider2.setQueueIndex(0);

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.liquidityQueue.initializeInitialLiquidity(
            u256.fromU32(10000),
            provider1.getId(),
            u128.fromU64(2000000000),
            5,
        );

        queue.liquidityQueue.addToRemovalQueue(provider2);
        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
        queue.liquidityQueue.increaseTotalReserved(u256.fromU64(10));
        queue.liquidityQueue.setSatoshisOwedReserved(provider2.getId(), 20000);
        expect(queue.liquidityQueue.quote()).not.toStrictEqual(u256.Zero);

        queue.liquidityQueue.setBlockQuote();

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

        reservation.addProvider(
            new ReservationProviderData(
                provider2.getQueueIndex(),
                u128.fromU32(999999),
                ProviderTypes.LiquidityRemoval,
            ),
        );
        reservation.setPurgeIndex(0);
        reservation.save();

        const reservationActiveList =
            queue.reservationManager.getActiveReservationListForBlock(1000);
        reservationActiveList.push(true);
        reservationActiveList.save();

        queue.liquidityQueue.save();

        setBlockchainEnvironment(1003);

        const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        queue2.tradeManager.executeTrade(reservation2);
        queue2.liquidityQueue.save();

        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue3.liquidityQueue.getSatoshisOwedReserved(provider2.getId())).toStrictEqual(
            19900,
        );
    });
});
