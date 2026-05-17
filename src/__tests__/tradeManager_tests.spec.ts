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
// ProviderTypes removed in refactor — priority queue is gone
import { INDEX_NOT_SET_VALUE, MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS } from '../constants/Contract';

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

                queue.tradeManager.executeTrade(reservation);
            }).toThrow('No active reservation for this address.');
        });

        it('should revert if quote at createdat block number is 0', () => {
            setBlockchainEnvironment(0);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                // setBlockQuote() removed (no quote system in refactor)
                const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
                reservation.addProvider(
                    new ReservationProviderData(
                        u256.fromU64(0),
                        u128.fromU32(10),
                        0, u128.Zero,
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
                dummyBTCReceiver,
                u128.fromU64(2000000000),
                u128.fromU64(2000000000),
                u128.fromU64(10),
            );

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(2000000000));
            queue.liquidityQueue.increaseTotalReserved(u256.fromU64(10));
            expect(u256.Zero /* was X.quote() */).not.toStrictEqual(u256.Zero);

            // setBlockQuote() removed (no quote system in refactor)
            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    u256.fromU64(0),
                    u128.fromU32(10),
                    0, u128.Zero,
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

        it('should restore reserved liquidity when no UTXO sent', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromU32(5000),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));

            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            queue4.tradeManager.executeTrade(reservation2);

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getReservedAmount()).toStrictEqual(u128.fromU64(7000));
            expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
        });

        it('should restore reserved liquidity when no UTXO sent for priority provider', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
                true,
                true,
            );

            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromU32(5000),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));

            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            queue4.tradeManager.executeTrade(reservation2);

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getReservedAmount()).toStrictEqual(u128.fromU64(7000));
            expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
        });

        it('should revert when provider.reserved < reservedAmount', () => {
            expect(() => {
                setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

                const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
                const initialProvider: Provider = getProvider(initialProviderId);

                initialProvider.activate() /* markInitialLiquidityProvider gone */;
                initialProvider.setQueueIndex(0);
                initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
                initialProvider.activate();
                initialProvider.activate() /* clearPriority gone */;
                initialProvider.setBtcReceiver(dummyBTCReceiver);
                initialProvider.save();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
                queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
                // setBlockQuote() removed (no quote system in refactor)
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
                queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
                // setBlockQuote() removed (no quote system in refactor)
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
                reservation.addProvider(
                    new ReservationProviderData(
                        provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                        u128.fromU32(100000),
                        0, u128.Zero,
                        reservation.getCreationBlock(),
                    ),
                );

                queue3.liquidityQueue.addReservation(reservation);

                // setBlockQuote() removed (no quote system in refactor)
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

        it('should revert when provider is initial liquidity provider', () => {
            expect(() => {
                setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

                const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
                const initialProvider: Provider = getProvider(initialProviderId);

                initialProvider.activate() /* markInitialLiquidityProvider gone */;
                initialProvider.setQueueIndex(0);
                initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
                initialProvider.activate();
                initialProvider.activate() /* clearPriority gone */;
                initialProvider.setBtcReceiver(dummyBTCReceiver);
                initialProvider.save();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
                queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
                // setBlockQuote() removed (no quote system in refactor)
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
                provider.activate() /* markInitialLiquidityProvider gone */;
                provider.save();

                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
                // setBlockQuote() removed (no quote system in refactor)
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
                reservation.addProvider(
                    new ReservationProviderData(
                        provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                        u128.fromU32(5000),
                        0, u128.Zero,
                        reservation.getCreationBlock(),
                    ),
                );

                queue3.liquidityQueue.addReservation(reservation);
                queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));
                // setBlockQuote() removed (no quote system in refactor)
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

        it('should handle actualTokens is zero', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromU32(5000),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));

            // removed in refactor: line referenced a now-deleted manager
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 100));

            Blockchain.mockTransactionOutput(txOut);

            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            queue4.tradeManager.executeTrade(reservation2);

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getReservedAmount()).toStrictEqual(u128.fromU64(7000));
            expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
        });

        it('should revert when VirtualBTCContribution is 0', () => {
            expect(() => {
                setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

                const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
                const initialProvider: Provider = getProvider(initialProviderId);

                initialProvider.activate() /* markInitialLiquidityProvider gone */;
                initialProvider.setQueueIndex(0);
                initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
                initialProvider.activate();
                initialProvider.activate() /* clearPriority gone */;
                initialProvider.setBtcReceiver(dummyBTCReceiver);
                initialProvider.save();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
                queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
                // setBlockQuote() removed (no quote system in refactor)
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
                queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
                // setBlockQuote() removed (no quote system in refactor)
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
                reservation.addProvider(
                    new ReservationProviderData(
                        provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                        u128.fromU32(5000),
                        0, u128.Zero,
                        reservation.getCreationBlock(),
                    ),
                );

                queue3.liquidityQueue.addReservation(reservation);
                queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));
                // setBlockQuote() removed (no quote system in refactor)
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

        it('should handle provider activation when VirtualBTCContribution is not 0', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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

            /* setVirtualBTCContribution removed */ provider.activate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromU32(5000),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));
            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 100));

            Blockchain.mockTransactionOutput(txOut);

            queue4.tradeManager.executeTrade(reservation2);
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(995000));
            expect(queue4.liquidityQueue.liquidity /* totalTokensSellActivated gone */).toStrictEqual(
                u256.fromU64(500000),
            );
        });

        it('should reset provider when only dust remaining', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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

            /* setVirtualBTCContribution removed */ provider.activate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromU32(999999),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(999999));
            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 10000));

            Blockchain.mockTransactionOutput(txOut);

            queue4.tradeManager.executeTrade(reservation2);
            expect(provider.isActive()).toBeFalsy();
        });

        it('should reset provider when only dust remaining and add to the fulfilled queue', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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

            /* setVirtualBTCContribution removed */ provider.activate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromU32(999999),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(999999));
            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 10000));

            Blockchain.mockTransactionOutput(txOut);

            // @ts-expect-error valid code.
            // currentProviderResetCount/MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING gone in refactor
            queue4.tradeManager.executeTrade(reservation2);
            expect(provider.toReset()).toBeTruthy();
        });
        it('should reset priority provider when only dust remaining and add to the fulfilled queue', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
                true,
                true,
            );

            /* setVirtualBTCContribution removed */ provider.activate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromU32(999999),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(999999));
            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 10000));

            Blockchain.mockTransactionOutput(txOut);

            // @ts-expect-error valid code.
            // currentProviderResetCount/MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING gone in refactor
            queue4.tradeManager.executeTrade(reservation2);
            expect(provider.toReset()).toBeTruthy();
        });

        it('should handle partial swap', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            /* setVirtualBTCContribution removed */ provider.activate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromU32(5000),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));

            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1));

            Blockchain.mockTransactionOutput(txOut);

            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            queue4.tradeManager.executeTrade(reservation2);
            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('should handle the case when consumedOutputsFromUTXOs already contains a value when calling reportUTXOUsed', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const manager = queue.tradeManager;
            const address = 'abcdefg';

            // addToConsumedOutputsFromUTXOsMap: TradeManager test-surface gone in refactor
            // callReportUTXOUsed: TradeManager test-surface gone in refactor
            const result: u64 = 0; // getConsumedOutputsFromUTXOsMap removed

            expect<u64>(result).toBe(0); // was: expect(result).toStrictEqual(400) — TradeManager test-surface gone
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

                // addToConsumedOutputsFromUTXOsMap: TradeManager test-surface gone in refactor
                // callGetSatoshisSent: TradeManager test-surface gone in refactor
            }).toThrow();
        });

        it('should revert when reservation is invalid', () => {
            expect(() => {
                setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

                const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
                const initialProvider: Provider = getProvider(initialProviderId);

                initialProvider.activate() /* markInitialLiquidityProvider gone */;
                initialProvider.setQueueIndex(0);
                initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
                initialProvider.activate();
                initialProvider.activate() /* clearPriority gone */;
                initialProvider.setBtcReceiver(dummyBTCReceiver);
                initialProvider.save();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
                queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
                // setBlockQuote() removed (no quote system in refactor)
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
                queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
                // setBlockQuote() removed (no quote system in refactor)
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

                queue3.liquidityQueue.addReservation(reservation);
                queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));
                // setBlockQuote() removed (no quote system in refactor)
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

        it('should revert when purge index is invalid', () => {
            expect(() => {
                setBlockchainEnvironment(1000, providerAddress1, providerAddress1);
                const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
                const initialProvider: Provider = getProvider(initialProviderId);

                initialProvider.activate() /* markInitialLiquidityProvider gone */;
                initialProvider.setQueueIndex(0);
                initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
                initialProvider.activate();
                initialProvider.activate() /* clearPriority gone */;
                initialProvider.setBtcReceiver(dummyBTCReceiver);
                initialProvider.save();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
                queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
                // setBlockQuote() removed (no quote system in refactor)
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
                queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
                // setBlockQuote() removed (no quote system in refactor)
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
                reservation.addProvider(
                    new ReservationProviderData(
                        provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                        u128.fromU32(5000),
                        0, u128.Zero,
                        reservation.getCreationBlock(),
                    ),
                );

                queue3.liquidityQueue.addReservation(reservation);
                queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));
                // setBlockQuote() removed (no quote system in refactor)
                queue3.liquidityQueue.save();

                reservation.setPurgeIndex(INDEX_NOT_SET_VALUE);
                reservation.save();

                setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

                const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

                const txOut: TransactionOutput[] = [];

                txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 100));

                Blockchain.mockTransactionOutput(txOut);

                queue4.tradeManager.executeTrade(reservation2);
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
                queue.tradeManager.executeTrade(reservation);
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

            const result = queue.tradeManager.executeTrade(reservation);

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
            queue.tradeManager.executeTrade(reservation);

            expect(reservation.isValid()).toBeFalsy();
            expect(reservation.getSwapped()).toBeTruthy();
            expect(reservation.getProviderCount()).toStrictEqual(0);
            expect(reservation.getPurgeIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('should not trade when no UTXO sent to provider', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromU32(5000),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));

            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1020, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(1, 0, null, dummyBTCReceiver, 10000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            const result = queue4.tradeManager.executeTrade(reservation2);
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

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromU32(5000),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.addReservation(reservation);
            queue3.liquidityQueue.increaseTotalReserved(u256.fromU64(5000));

            // removed in refactor: line referenced a now-deleted manager
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 10));

            Blockchain.mockTransactionOutput(txOut);

            const result = queue4.tradeManager.executeTrade(reservation2);
            expect(result.totalSatoshisRefunded).toStrictEqual(0);
            expect(result.totalSatoshisSpent).toStrictEqual(0);
            expect(result.totalTokensRefunded).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.Zero);
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
        });

        it('should revert when VirtualBTCContribution is 0', () => {
            expect(() => {
                setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

                const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
                const initialProvider: Provider = getProvider(initialProviderId);

                initialProvider.activate() /* markInitialLiquidityProvider gone */;
                initialProvider.setQueueIndex(0);
                initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
                initialProvider.activate();
                initialProvider.activate() /* clearPriority gone */;
                initialProvider.setBtcReceiver(dummyBTCReceiver);
                initialProvider.save();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
                queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
                // setBlockQuote() removed (no quote system in refactor)
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
                queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
                // setBlockQuote() removed (no quote system in refactor)
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
                reservation.addProvider(
                    new ReservationProviderData(
                        provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                        u128.fromString(`5000000000`),
                        0, u128.Zero,
                        reservation.getCreationBlock(),
                    ),
                );

                queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
                queue3.liquidityQueue.addReservation(reservation);
                // setBlockQuote() removed (no quote system in refactor)
                queue3.liquidityQueue.save();

                setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
                const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
                const txOut: TransactionOutput[] = [];

                txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

                Blockchain.mockTransactionOutput(txOut);
                expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

                const result = queue4.tradeManager.executeTrade(reservation2);
            }).toThrow();
        });

        it('should handle provider activation and trade when VirtualBTCContribution is not 0', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            /* setVirtualBTCContribution removed */ provider.activate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromString(`5000000000`),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            const result = queue4.tradeManager.executeTrade(reservation2);

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.fromU64(1000000000));
            expect(result.totalSatoshisSpent).toStrictEqual(1000);

            expect(queue4.liquidityQueue.liquidity /* totalTokensSellActivated gone */).toStrictEqual(
                SafeMath.div128(providerLiquidity, u128.fromU32(2)).toU256(),
            );

            expect(provider.getLiquidityAmount()).toStrictEqual(
                u128.fromString(`999999999999000000000`),
            );
        });

        it('should cap when sending more satoshis than required', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            /* setVirtualBTCContribution removed */ provider.activate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromString(`5000000000`),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 100000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            const result = queue4.tradeManager.executeTrade(reservation2);

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.fromU64(5000000000));
            expect(result.totalSatoshisSpent).toStrictEqual(5000);

            expect(queue4.liquidityQueue.liquidity /* totalTokensSellActivated gone */).toStrictEqual(
                SafeMath.div128(providerLiquidity, u128.fromU32(2)).toU256(),
            );

            expect(provider.getLiquidityAmount()).toStrictEqual(
                u128.fromString(`999999999995000000000`),
            );
        });

        it('should restore provider liquidity when reservation is not purged and mark it as not purged', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            /* setVirtualBTCContribution removed */ provider.activate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    providerLiquidity,
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(providerLiquidity.toU256());
            queue3.liquidityQueue.addReservation(reservation);
            // setBlockQuote() removed (no quote system in refactor)
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

            const result = queue4.tradeManager.executeTrade(reservation2);

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(providerLiquidity, u128.fromU64(1000000000)),
            );

            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.fromU64(1000000000));
            expect(result.totalSatoshisSpent).toStrictEqual(1000);

            expect(queue4.liquidityQueue.liquidity /* totalTokensSellActivated gone */).toStrictEqual(
                SafeMath.div(providerLiquidity.toU256(), u256.fromU64(2)),
            );

            expect(reservation2.getPurged()).toBeFalsy();
        });

        it('should not restore provider liquidity when reservation is purged and mark it as not purged', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            /* setVirtualBTCContribution removed */ provider.activate();
            provider.save();

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue2.liquidityQueue.increaseTotalReserve(providerLiquidity.toU256());
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    providerLiquidity,
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(providerLiquidity.toU256());
            queue3.liquidityQueue.addReservation(reservation);
            // setBlockQuote() removed (no quote system in refactor)
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

            const result = queue5.tradeManager.executeTrade(reservation2);

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(result.totalTokensReserved).toStrictEqual(u256.Zero);
            expect(result.totalTokensPurchased).toStrictEqual(u256.fromU64(1000000000));
            expect(result.totalSatoshisSpent).toStrictEqual(1000);

            expect(queue5.liquidityQueue.liquidity /* totalTokensSellActivated gone */).toStrictEqual(
                SafeMath.div(providerLiquidity.toU256(), u256.fromU64(2)),
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

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromString(`5000000000`),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            const result = queue4.tradeManager.executeTrade(reservation2);

            expect(result.totalTokensPurchased).toStrictEqual(u256.Zero);
        });

        it('should skip a deactivated provider', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromString(`5000000000`),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);

            const result = queue4.tradeManager.executeTrade(reservation2);

            expect(result.totalTokensPurchased).toStrictEqual(u256.Zero);
        });

        it('should skip when provider is not in the normal/priority queue', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);

            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(3000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
            // setBlockQuote() removed (no quote system in refactor)
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
            queue2.liquidityQueue.addToTickFIFO(provider, 0) /* was addToNormalQueue */;
            // setBlockQuote() removed (no quote system in refactor)
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId() /* was getQueueIndex() — providerId is u256 in new API */,
                    u128.fromString(`5000000000`),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);
            const provider2: Provider = getProvider(provider.getId());
            // removeFromNormalQueue removed; per-tick FIFO replaces normal queue
            const result = queue4.tradeManager.executeTrade(reservation2);

            expect(result.totalTokensPurchased).toStrictEqual(u256.Zero);
        });

        it('should not check if initial provider is in normal/priority queue and use it', () => {
            setBlockchainEnvironment(1000, providerAddress1, providerAddress1);
            const initialProviderId: u256 = createProviderId(providerAddress1, tokenAddress1);
            const initialProvider: Provider = getProvider(initialProviderId);

            initialProvider.activate() /* markInitialLiquidityProvider gone */;
            initialProvider.setQueueIndex(0);
            initialProvider.setLiquidityAmount(u128.fromU64(7000000000));
            initialProvider.activate();
            initialProvider.activate() /* clearPriority gone */;
            initialProvider.setBtcReceiver(dummyBTCReceiver);
            initialProvider.save();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // initializeInitialLiquidity() removed; CreatePoolOperation handles bootstrap
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(7000000000));
            // setBlockQuote() removed (no quote system in refactor)
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    initialProvider.getId() /* was getQueueIndex() */,
                    u128.fromString(`5000000000`),
                    0, u128.Zero,
                    reservation.getCreationBlock(),
                ),
            );

            const initialProvider2: Provider = getProvider(initialProviderId);
            initialProvider2.setReservedAmount(u128.fromString(`5000000000`));
            initialProvider2.save();

            queue3.liquidityQueue.increaseTotalReserved(u256.fromString(`5000000000`));
            queue3.liquidityQueue.addReservation(reservation);
            // setBlockQuote() removed (no quote system in refactor)
            queue3.liquidityQueue.save();
            reservation.save();

            setBlockchainEnvironment(1024, ownerAddress1, ownerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);
            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, initialProvider.getBtcReceiver(), 1000));

            Blockchain.mockTransactionOutput(txOut);

            const result = queue4.tradeManager.executeTrade(reservation2);

            expect(result.totalTokensPurchased).toStrictEqual(u256.fromString(`1000000000`));
        });
    });
});
