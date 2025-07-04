import { clearCachedProviders, getProvider, Provider } from '../models/Provider';
import { Blockchain, TransactionOutput, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    createProviderId,
    createReservation,
    ownerAddress1,
    providerAddress1,
    providerAddress2,
    receiverAddress1,
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
                new ReservationProviderData(
                    0,
                    u128.fromU32(10),
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
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
            false,
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
                reservation.getCreationBlock(),
            ),
        );
        reservation.setPurgeIndex(0);

        const reservationActiveList = queue.reservationManager.callgetActiveListForBlock(0);
        reservationActiveList.push(true);
        reservationActiveList.save();

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, 0, null, provider1.getBtcReceiver(), 100));

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
                false,
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
                    reservation.getCreationBlock(),
                ),
            );

            reservation.setPurgeIndex(0);

            const reservationActiveList = queue.reservationManager.callgetActiveListForBlock(0);
            reservationActiveList.push(true);
            reservationActiveList.save();

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider1.getBtcReceiver(), 100));

            Blockchain.mockTransactionOutput(txOut);

            queue.tradeManager.executeTrade(reservation);
        }).not.toThrow();
    });

    it('should set blockNumber to createdAt if createdAt < 4294967294', () => {
        setBlockchainEnvironment(1000);

        //expect(() => {
        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
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
                reservation.getCreationBlock(),
            ),
        );
        reservation.setPurgeIndex(0);
        reservation.save();

        const reservationActiveList = queue.reservationManager.callgetActiveListForBlock(1000);
        reservationActiveList.push(true);
        reservationActiveList.save();
        queue.liquidityQueue.save();

        setBlockchainEnvironment(1003);

        const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, 0, null, provider1.getBtcReceiver(), 100));

        Blockchain.mockTransactionOutput(txOut);

        queue2.tradeManager.executeTrade(reservation2);
        //}).not.toThrow();
    });

    it('should restore reserved liquidity when queueType <> LIQUIDITY_REMOVAL_TYPE and no UTXO sent', () => {
        setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

        const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
        const initialProvider: Provider = getProvider(initialProviderId);

        initialProvider.markInitialLiquidityProvider();
        initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
        initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
        initialProvider.activate();
        initialProvider.clearPriority();
        initialProvider.setBtcReceiver('dj2d89j22j23jdwejhd2903du02');
        initialProvider.save();

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.liquidityQueue.initializeInitialLiquidity(
            u256.fromU32(1000),
            initialProvider.getId(),
            u128.fromU64(3000000000),
            5,
        );
        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
        queue.liquidityQueue.setBlockQuote();

        queue.liquidityQueue.save();

        setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

        const provider: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            'wedwedwdwdw',
            u128.Zero,
            u128.fromU64(100000),
            u128.fromU64(12000),
        );

        provider.save();

        const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue2.liquidityQueue.addToNormalQueue(provider);
        queue2.liquidityQueue.setBlockQuote();
        queue2.liquidityQueue.save();

        setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.addProvider(
            new ReservationProviderData(
                provider.getQueueIndex(),
                u128.fromU32(5000),
                ProviderTypes.Normal,
                reservation.getCreationBlock(),
            ),
        );

        queue3.liquidityQueue.addReservation(reservation);
        queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));

        queue3.liquidityQueue.setBlockQuote();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        const txOut: TransactionOutput[] = [];

        Blockchain.mockTransactionOutput(txOut);

        queue4.tradeManager.executeTrade(reservation2);

        expect(provider.getReservedAmount()).toStrictEqual(u128.fromU64(7000));
        expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
    });

    it('should revert when provider.reserved < reservedAmount', () => {
        expect(() => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver('dj2d89j22j23jdwejhd2903du02');
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(1000),
                initialProvider.getId(),
                u128.fromU64(3000000000),
                5,
            );
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            queue.liquidityQueue.setBlockQuote();

            queue.liquidityQueue.save();

            setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

            const provider: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                false,
                false,
                'wedwedwdwdw',
                u128.Zero,
                u128.fromU64(100000),
                u128.fromU64(10000),
            );

            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.addToNormalQueue(provider);
            queue2.liquidityQueue.setBlockQuote();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getQueueIndex(),
                    u128.fromU32(100000),
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);

            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 100));

            Blockchain.mockTransactionOutput(txOut);

            queue4.tradeManager.executeTrade(reservation2);
        }).toThrow();
    });

    it('should handle actualTokens is zero for normal provider', () => {
        setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

        const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
        const initialProvider: Provider = getProvider(initialProviderId);

        initialProvider.markInitialLiquidityProvider();
        initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
        initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
        initialProvider.activate();
        initialProvider.clearPriority();
        initialProvider.setBtcReceiver('dj2d89j22j23jdwejhd2903du02');
        initialProvider.save();

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.liquidityQueue.initializeInitialLiquidity(
            u256.fromU32(1000),
            initialProvider.getId(),
            u128.fromU64(3000000000),
            5,
        );
        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
        queue.liquidityQueue.setBlockQuote();

        queue.liquidityQueue.save();

        setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

        const provider: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            'wedwedwdwdw',
            u128.Zero,
            u128.fromU64(100000),
            u128.fromU64(12000),
        );

        provider.save();

        const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue2.liquidityQueue.addToNormalQueue(provider);
        queue2.liquidityQueue.setBlockQuote();
        queue2.liquidityQueue.save();

        setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.addProvider(
            new ReservationProviderData(
                provider.getQueueIndex(),
                u128.fromU32(5000),
                ProviderTypes.Normal,
                reservation.getCreationBlock(),
            ),
        );

        queue3.liquidityQueue.addReservation(reservation);
        queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));

        queue3.quoteManager.setBlockQuote(1003, u256.fromU64(1));
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 100));

        Blockchain.mockTransactionOutput(txOut);

        queue4.tradeManager.executeTrade(reservation2);

        expect(provider.getReservedAmount()).toStrictEqual(u128.fromU64(7000));
        expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
    });

    it('should handle provider activation for normal/priority provider', () => {
        setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

        const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
        const initialProvider: Provider = getProvider(initialProviderId);

        initialProvider.markInitialLiquidityProvider();
        initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
        initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
        initialProvider.activate();
        initialProvider.clearPriority();
        initialProvider.setBtcReceiver('dj2d89j22j23jdwejhd2903du02');
        initialProvider.save();

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.liquidityQueue.initializeInitialLiquidity(
            u256.fromU32(1000),
            initialProvider.getId(),
            u128.fromU64(3000000000),
            5,
        );
        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
        queue.liquidityQueue.setBlockQuote();

        queue.liquidityQueue.save();

        setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

        const provider: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            'wedwedwdwdw',
            u128.Zero,
            u128.fromU64(1000000),
            u128.fromU64(12000),
        );

        provider.save();

        const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue2.liquidityQueue.addToNormalQueue(provider);
        queue2.liquidityQueue.setBlockQuote();
        queue2.liquidityQueue.save();

        setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.addProvider(
            new ReservationProviderData(
                provider.getQueueIndex(),
                u128.fromU32(5000),
                ProviderTypes.Normal,
                reservation.getCreationBlock(),
            ),
        );

        queue3.liquidityQueue.addReservation(reservation);
        queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));

        queue3.liquidityQueue.setBlockQuote();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 100));

        Blockchain.mockTransactionOutput(txOut);

        queue4.tradeManager.executeTrade(reservation2);
        expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(995000));
        expect(queue4.liquidityQueue.totalTokensSellActivated).toStrictEqual(u256.fromU64(500000));
    });

    it('should reset provider when liquidity < minimum value for normal/priority provider', () => {
        setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

        const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
        const initialProvider: Provider = getProvider(initialProviderId);

        initialProvider.markInitialLiquidityProvider();
        initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
        initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
        initialProvider.activate();
        initialProvider.clearPriority();
        initialProvider.setBtcReceiver('dj2d89j22j23jdwejhd2903du02');
        initialProvider.save();

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.liquidityQueue.initializeInitialLiquidity(
            u256.fromU32(1000),
            initialProvider.getId(),
            u128.fromU64(3000000000),
            5,
        );
        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
        queue.liquidityQueue.setBlockQuote();

        queue.liquidityQueue.save();

        setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

        const provider: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            false,
            false,
            'wedwedwdwdw',
            u128.Zero,
            u128.fromU64(100000),
            u128.fromU64(12000),
        );

        provider.save();

        const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue2.liquidityQueue.addToNormalQueue(provider);
        queue2.liquidityQueue.setBlockQuote();
        queue2.liquidityQueue.save();

        setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.addProvider(
            new ReservationProviderData(
                provider.getQueueIndex(),
                u128.fromU32(5000),
                ProviderTypes.Normal,
                reservation.getCreationBlock(),
            ),
        );

        queue3.liquidityQueue.addReservation(reservation);
        queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));

        queue3.liquidityQueue.setBlockQuote();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 100));

        Blockchain.mockTransactionOutput(txOut);

        queue4.tradeManager.executeTrade(reservation2);
        expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);

        expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(provider.isActive()).toBeFalsy();
    });

    it('should handle the case when consumedOutputsFromUTXOs already contains a value when calling reportUTXOUsed', () => {
        setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const manager = queue.tradeManager;
        const address = 'abcdefg';

        manager.addToConsumedOutputsFromUTXOsMap(address, 100);
        manager.callReportUTXOUsed(address, 300);
        const result = manager.getConsumedOutputsFromUTXOsMap(address);

        expect(result).toStrictEqual(400);
    });

    it('should revert when double spend is detected when calling getSatoshisSent', () => {
        expect(() => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const address = 'abcdefg';
            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(0, 0, null, address, 100));
            txOut.push(new TransactionOutput(1, 0, null, address, 200));

            Blockchain.mockTransactionOutput(txOut);

            const manager = queue.tradeManager;

            manager.addToConsumedOutputsFromUTXOsMap(address, 301);
            manager.callGetSatoshisSent(address);
        }).toThrow();
    });
});
