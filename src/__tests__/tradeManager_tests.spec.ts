import { clearCachedProviders, getProvider, Provider } from '../models/Provider';
import {
    Blockchain,
    SafeMath,
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    createProviderId,
    createReservation,
    ownerAddress1,
    providerAddress1,
    providerAddress2,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Reservation } from '../models/Reservation';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ProviderTypes } from '../types/ProviderTypes';
import { INDEX_NOT_SET_VALUE, INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';

const dummyBTCReceiver: string = 'dj2d89j22j23jdwejhd2903du02';

describe('TradeManager tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('TradeManager tests - executeTradeNotExpired', () => {
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

                queue.tradeManager.executeTradeNotExpired(
                    reservation,
                    queue.liquidityQueue.quote(),
                );
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

                queue.tradeManager.executeTradeNotExpired(
                    reservation,
                    queue.liquidityQueue.quote(),
                );
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
                dummyBTCReceiver,
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

            queue.tradeManager.executeTradeNotExpired(reservation, queue.liquidityQueue.quote());

            expect(reservation.isValid()).toBeFalsy();
        });

        it('should restore reserved liquidity when no UTXO sent', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
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
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            queue4.tradeManager.executeTradeNotExpired(reservation2, queue4.liquidityQueue.quote());

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
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
                initialProvider.setBtcReceiver(dummyBTCReceiver);
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

                queue4.tradeManager.executeTradeNotExpired(
                    reservation2,
                    queue4.liquidityQueue.quote(),
                );
            }).toThrow();
        });

        it('should handle actualTokens is zero', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
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

            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            queue4.tradeManager.executeTradeNotExpired(reservation2, queue4.liquidityQueue.quote());

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getReservedAmount()).toStrictEqual(u128.fromU64(7000));
            expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
        });

        it('should handle provider activation when VirtualBTCContribution is 0', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
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

            queue4.tradeManager.executeTradeNotExpired(reservation2, queue4.liquidityQueue.quote());
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(995000));
            expect(queue4.liquidityQueue.totalTokensSellActivated).toStrictEqual(
                u256.fromU64(995000),
            );
        });

        it('should handle provider activation when VirtualBTCContribution is not 0', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
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

            provider.setVirtualBTCContribution(10);
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

            queue4.tradeManager.executeTradeNotExpired(reservation2, queue4.liquidityQueue.quote());
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(995000));
            expect(queue4.liquidityQueue.totalTokensSellActivated).toStrictEqual(
                u256.fromU64(497500),
            );
        });

        it('should reset provider when only dust remaining', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
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
                u128.fromU64(999999),
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
                    u128.fromU32(999999),
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(999999));
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 10000));

            Blockchain.mockTransactionOutput(txOut);

            queue4.tradeManager.executeTradeNotExpired(reservation2, queue4.liquidityQueue.quote());
            expect(provider.isActive()).toBeFalsy();
        });

        it('should handle partial swap', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
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

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1));

            Blockchain.mockTransactionOutput(txOut);

            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            queue4.tradeManager.executeTradeNotExpired(reservation2, queue4.liquidityQueue.quote());
            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
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

        it('should revert when reservation is invalid', () => {
            expect(() => {
                setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

                const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
                const initialProvider: Provider = getProvider(initialProviderId);

                initialProvider.markInitialLiquidityProvider();
                initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
                initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
                initialProvider.activate();
                initialProvider.clearPriority();
                initialProvider.setBtcReceiver(dummyBTCReceiver);
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

                queue4.tradeManager.executeTradeNotExpired(
                    reservation2,
                    queue4.liquidityQueue.quote(),
                );
            }).toThrow();
        });

        it('should revert when purge index is invalid', () => {
            expect(() => {
                setBlockchainEnvironment(1000, providerAddress1, providerAddress1);
                const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
                const initialProvider: Provider = getProvider(initialProviderId);

                initialProvider.markInitialLiquidityProvider();
                initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
                initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
                initialProvider.activate();
                initialProvider.clearPriority();
                initialProvider.setBtcReceiver(dummyBTCReceiver);
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

                reservation.setPurgeIndex(INDEX_NOT_SET_VALUE);
                reservation.save();

                setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

                const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

                const txOut: TransactionOutput[] = [];

                txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 100));

                Blockchain.mockTransactionOutput(txOut);

                queue4.tradeManager.executeTradeNotExpired(
                    reservation2,
                    queue4.liquidityQueue.quote(),
                );
            }).toThrow();
        });
    });

    describe('TradeManager tests - executeTradeExpired', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should revert if current block quote quote is 0', () => {
            setBlockchainEnvironment(1000);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
                queue.tradeManager.executeTradeExpired(reservation, u256.Zero);
            }).toThrow();
        });

        it('should return CompletedTrade with all fields to 0 when reservation has no providers', () => {
            setBlockchainEnvironment(1000);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.setPurgeIndex(0);

            const reservationActiveList = queue.reservationManager.callgetActiveListForBlock(1000);
            reservationActiveList.push(true);
            reservationActiveList.save();

            const result = queue.tradeManager.executeTradeExpired(
                reservation,
                u256.fromU32(1000000),
            );

            expect(result.totalSatoshisRefunded).toStrictEqual(0);
            expect(result.totalSatoshisSpent).toStrictEqual(0);
            expect(result.totalTokensRefunded).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.Zero);
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
        });

        it('should delete the reservation', () => {
            setBlockchainEnvironment(1000);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.setSwapped(true);
            reservation.setCreationBlock(1000);
            reservation.setPurgeIndex(0);

            const reservationActiveList = queue.reservationManager.callgetActiveListForBlock(1000);
            reservationActiveList.push(true);
            reservationActiveList.save();

            setBlockchainEnvironment(1006);
            queue.tradeManager.executeTradeExpired(reservation, u256.fromU32(1000000));

            expect(reservation.isValid()).toBeFalsy();
            expect(reservation.getSwapped()).toBeTruthy();
            expect(reservation.getProviderCount()).toStrictEqual(0);
            expect(reservation.getPurgeIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('should not trade when no UTXO sent to provider', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
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

            setBlockchainEnvironment(1020, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(1, 0, null, dummyBTCReceiver, 10000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            const result = queue4.tradeManager.executeTradeExpired(
                reservation2,
                u256.fromU32(100000),
            );
            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(result.totalSatoshisRefunded).toStrictEqual(0);
            expect(result.totalSatoshisSpent).toStrictEqual(0);
            expect(result.totalTokensRefunded).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.Zero);
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
        });

        it('should not trade if actualTokens is zero', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
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

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 10));

            Blockchain.mockTransactionOutput(txOut);

            const result = queue4.tradeManager.executeTradeExpired(
                reservation2,
                u256.fromU32(10000),
            );
            expect(result.totalSatoshisRefunded).toStrictEqual(0);
            expect(result.totalSatoshisSpent).toStrictEqual(0);
            expect(result.totalTokensRefunded).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.Zero);
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
        });

        it('should handle provider activation and trade when VirtualBTCContribution is 0', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(1000),
                initialProvider.getId(),
                u128.fromU64(3000000000),
                100,
            );
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

            const providerLiquidity = u128.fromString('1000000000000000000000');

            const provider: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                false,
                false,
                'wedwedwdwdw',
                u128.Zero,
                providerLiquidity,
                u128.fromString(`5000000000`),
            );

            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToNormalQueue(provider);
            queue2.liquidityQueue.setBlockQuote();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getQueueIndex(),
                    u128.fromString(`5000000000`),
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            const result = queue4.tradeManager.executeTradeExpired(
                reservation2,
                u256.fromString('100000000000000'),
            );

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.fromU64(1000000000));
            expect(result.totalSatoshisSpent).toStrictEqual(1000);

            expect(queue4.liquidityQueue.totalTokensSellActivated).toStrictEqual(
                providerLiquidity.toU256(),
            );

            expect(provider.getLiquidityAmount()).toStrictEqual(
                u128.fromString(`999999999999000000000`),
            );
        });

        it('should handle provider activation and trade when VirtualBTCContribution is not 0', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(1000),
                initialProvider.getId(),
                u128.fromU64(3000000000),
                100,
            );
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

            const providerLiquidity = u128.fromString('1000000000000000000000');

            const provider: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                false,
                false,
                'wedwedwdwdw',
                u128.Zero,
                providerLiquidity,
                u128.fromString(`5000000000`),
            );
            provider.setVirtualBTCContribution(100);
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToNormalQueue(provider);
            queue2.liquidityQueue.setBlockQuote();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getQueueIndex(),
                    u128.fromString(`5000000000`),
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            const result = queue4.tradeManager.executeTradeExpired(
                reservation2,
                u256.fromString('100000000000000'),
            );

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.fromU64(1000000000));
            expect(result.totalSatoshisSpent).toStrictEqual(1000);

            expect(queue4.liquidityQueue.totalTokensSellActivated).toStrictEqual(
                SafeMath.div128(providerLiquidity, u128.fromU32(2)).toU256(),
            );

            expect(provider.getLiquidityAmount()).toStrictEqual(
                u128.fromString(`999999999999000000000`),
            );
        });

        it('should restore provider liquidity when reservation is not purged and mark it as not purged', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(1000),
                initialProvider.getId(),
                u128.fromU64(3000000000),
                100,
            );
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

            const providerLiquidity = u128.fromString('1000000000000000000000');

            const provider: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                false,
                false,
                'wedwedwdwdw',
                u128.Zero,
                providerLiquidity,
                providerLiquidity,
            );

            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToNormalQueue(provider);
            queue2.liquidityQueue.setBlockQuote();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getQueueIndex(),
                    providerLiquidity,
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(providerLiquidity.toU256());
            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getReservedAmount()).toStrictEqual(provider.getReservedAmount());
            expect(reservation2.getPurged()).toBeFalsy();

            const result = queue4.tradeManager.executeTradeExpired(
                reservation2,
                u256.fromString('100000000000000'),
            );

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(providerLiquidity, u128.fromU64(1000000000)),
            );
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.fromU64(1000000000));
            expect(result.totalSatoshisSpent).toStrictEqual(1000);

            expect(queue4.liquidityQueue.totalTokensSellActivated).toStrictEqual(
                providerLiquidity.toU256(),
            );
            expect(reservation2.getPurged()).toBeFalsy();
        });

        it('should not restore provider liquidity when reservation is purged and mark it as not purged', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromString(`100000000`),
                initialProvider.getId(),
                u128.fromU64(3000000000),
                100,
            );
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

            const providerLiquidity = u128.fromString('1000000000000000000000');

            const provider: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                false,
                false,
                'wedwedwdwdw',
                u128.Zero,
                providerLiquidity,
                providerLiquidity,
            );

            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToNormalQueue(provider);
            queue2.liquidityQueue.setBlockQuote();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getQueueIndex(),
                    providerLiquidity,
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(providerLiquidity.toU256());
            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1023, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue4.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(reservation2.getPurged()).toBeTruthy();

            const result = queue5.tradeManager.executeTradeExpired(
                reservation2,
                u256.fromString('100000000000000'),
            );

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.fromU64(1000000000));
            expect(result.totalSatoshisSpent).toStrictEqual(1000);

            expect(queue5.liquidityQueue.totalTokensSellActivated).toStrictEqual(
                providerLiquidity.toU256(),
            );

            expect(provider.getLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(providerLiquidity, u128.fromU64(1000000000)),
            );
            expect(reservation2.getPurged()).toBeFalsy();
        });

        it('should skip a provider marked toReset', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(1000),
                initialProvider.getId(),
                u128.fromU64(3000000000),
                100,
            );
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

            const providerLiquidity = u128.fromString('1000000000000000000000');

            const provider: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                false,
                false,
                'wedwedwdwdw',
                u128.Zero,
                providerLiquidity,
                u128.fromString(`5000000000`),
            );

            provider.markToReset();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToNormalQueue(provider);
            queue2.liquidityQueue.setBlockQuote();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getQueueIndex(),
                    u128.fromString(`5000000000`),
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            const result = queue4.tradeManager.executeTradeExpired(
                reservation2,
                u256.fromString('100000000000000'),
            );

            expect(result.totalTokensPurchased).toStrictEqual(u256.Zero);
        });

        it('should skip a deactivated provider', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(1000),
                initialProvider.getId(),
                u128.fromU64(3000000000),
                100,
            );
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

            const providerLiquidity = u128.fromString('1000000000000000000000');

            const provider: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                false,
                false,
                'wedwedwdwdw',
                u128.Zero,
                providerLiquidity,
                u128.fromString(`5000000000`),
            );

            provider.deactivate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToNormalQueue(provider);
            queue2.liquidityQueue.setBlockQuote();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getQueueIndex(),
                    u128.fromString(`5000000000`),
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            const result = queue4.tradeManager.executeTradeExpired(
                reservation2,
                u256.fromString('100000000000000'),
            );

            expect(result.totalTokensPurchased).toStrictEqual(u256.Zero);
        });

        it('should skip when provider is not in the normal/priority queue', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(1000),
                initialProvider.getId(),
                u128.fromU64(3000000000),
                100,
            );
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

            const providerLiquidity = u128.fromString('1000000000000000000000');

            const provider: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                false,
                false,
                'wedwedwdwdw',
                u128.Zero,
                providerLiquidity,
                u128.fromString(`5000000000`),
            );

            provider.deactivate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToNormalQueue(provider);
            queue2.liquidityQueue.setBlockQuote();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getQueueIndex(),
                    u128.fromString(`5000000000`),
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            const provider2: Provider = getProvider(provider.getId());
            queue4.providerManager.removeFromNormalQueue(provider2);

            const result = queue4.tradeManager.executeTradeExpired(
                reservation2,
                u256.fromString('100000000000000'),
            );

            expect(result.totalTokensPurchased).toStrictEqual(u256.Zero);
        });

        it('should not check if initial provider is in normal/priority queue and use it', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);
            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.setLiquidityAmount(u128.fromU64(7000000000));
            initialProvider.activate();
            initialProvider.clearPriority();
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU32(1000),
                initialProvider.getId(),
                u128.fromU64(7000000000),
                100,
            );
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(7000000000));
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    initialProvider.getQueueIndex(),
                    u128.fromString(`5000000000`),
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );

            const initialProvider2: Provider = getProvider(initialProviderId);
            initialProvider2.setReservedAmount(u128.fromString(`5000000000`));
            initialProvider2.save();

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();
            reservation.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, initialProvider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);

            const result = queue4.tradeManager.executeTradeExpired(
                reservation2,
                u256.fromString('100000000000000'),
            );

            expect(result.totalTokensPurchased).toStrictEqual(u256.fromString(`1000000000`));
        });
    });
});
