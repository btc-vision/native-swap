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
    receiverAddress2,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Reservation } from '../models/Reservation';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ProviderTypes } from '../types/ProviderTypes';
import { INDEX_NOT_SET_VALUE, INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';

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
                    ProviderTypes.LiquidityRemoval,
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
                    reservation.getCreationBlock(),
                ),
            );
            queue.liquidityQueue.addReservation(reservation);
            queue.liquidityQueue.save();

            setBlockchainEnvironment(1003);

            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, 0, null, provider1.getBtcReceiver(), 100));

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

        queue2.tradeManager.executeTrade(reservation2);
        queue2.liquidityQueue.save();

        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue3.liquidityQueue.getSatoshisOwedReserved(provider2.getId())).toStrictEqual(
            19900,
        );
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

    it('should handle partial fill for removal provider', () => {
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
            u256.fromU32(10),
            initialProvider.getId(),
            u128.fromU64(3000000000),
            5,
        );
        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
        queue.liquidityQueue.setBlockQuote();

        queue.liquidityQueue.save();

        setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

        const removalProvider: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            false,
            false,
            'wedwedwdwdw',
            u128.Zero,
            u128.Zero,
            u128.fromU64(1000),
        );

        removalProvider.save();

        const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue2.liquidityQueue.addToRemovalQueue(removalProvider);
        queue2.liquidityQueue.setSatoshisOwed(removalProvider.getId(), 1000);
        queue2.liquidityQueue.setBlockQuote();
        queue2.liquidityQueue.save();

        setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.addProvider(
            new ReservationProviderData(
                removalProvider.getQueueIndex(),
                u128.fromU32(100),
                ProviderTypes.LiquidityRemoval,
                reservation.getCreationBlock(),
            ),
        );

        queue3.liquidityQueue.setSatoshisOwedReserved(removalProvider.getId(), 1000);
        queue3.liquidityQueue.addReservation(reservation);

        queue3.liquidityQueue.setBlockQuote();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, 0, null, removalProvider.getBtcReceiver(), 1));

        Blockchain.mockTransactionOutput(txOut);

        const tradeResult = queue4.tradeManager.executeTrade(reservation2);

        expect(tradeResult.totalTokensRefunded).toStrictEqual(u256.fromU32(10));
        expect(tradeResult.totalSatoshisRefunded).toStrictEqual(1);
        expect(
            queue4.liquidityQueue.getSatoshisOwedReserved(removalProvider.getId()),
        ).toStrictEqual(990);
        expect(queue4.liquidityQueue.getSatoshisOwed(removalProvider.getId())).toStrictEqual(999);
    });

    it('should handle when user pay too much for a removal provider', () => {
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

        const removalProvider: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            false,
            false,
            'wedwedwdwdw',
            u128.Zero,
            u128.Zero,
            u128.fromU64(1000),
        );

        removalProvider.save();

        const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue2.liquidityQueue.addToRemovalQueue(removalProvider);
        queue2.liquidityQueue.setSatoshisOwed(removalProvider.getId(), 1000);
        queue2.liquidityQueue.setBlockQuote();
        queue2.liquidityQueue.save();

        setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.addProvider(
            new ReservationProviderData(
                removalProvider.getQueueIndex(),
                u128.fromU32(10000),
                ProviderTypes.LiquidityRemoval,
                reservation.getCreationBlock(),
            ),
        );

        queue3.liquidityQueue.setSatoshisOwedReserved(removalProvider.getId(), 1000);
        queue3.liquidityQueue.addReservation(reservation);

        queue3.liquidityQueue.setBlockQuote();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, 0, null, removalProvider.getBtcReceiver(), 100));

        Blockchain.mockTransactionOutput(txOut);

        const tradeResult = queue4.tradeManager.executeTrade(reservation2);

        expect(tradeResult.totalTokensRefunded).toStrictEqual(u256.fromU32(10000));
        expect(tradeResult.totalSatoshisRefunded).toStrictEqual(10);
        expect(
            queue4.liquidityQueue.getSatoshisOwedReserved(removalProvider.getId()),
        ).toStrictEqual(990);
        expect(queue4.liquidityQueue.getSatoshisOwed(removalProvider.getId())).toStrictEqual(990);
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

    it('should revert when provider is flagged pendingRemoval but is not in removal queue', () => {
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
                true,
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
        }).toThrow();
    });

    it('should handle tokensDesiredRemoval is zero for removal provider', () => {
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
            u256.fromU32(1),
            initialProvider.getId(),
            u128.fromU64(3000000000),
            5,
        );
        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
        queue.liquidityQueue.setBlockQuote();

        queue.liquidityQueue.save();

        setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

        const removalProvider: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            false,
            false,
            'wedwedwdwdw',
            u128.Zero,
            u128.Zero,
            u128.fromU64(1000),
        );

        removalProvider.save();

        const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue2.liquidityQueue.addToRemovalQueue(removalProvider);
        queue2.liquidityQueue.setSatoshisOwed(removalProvider.getId(), 1000);
        queue2.liquidityQueue.setBlockQuote();
        queue2.liquidityQueue.save();

        setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.addProvider(
            new ReservationProviderData(
                removalProvider.getQueueIndex(),
                u128.fromU32(100),
                ProviderTypes.LiquidityRemoval,
                reservation.getCreationBlock(),
            ),
        );

        queue3.liquidityQueue.setSatoshisOwedReserved(removalProvider.getId(), 11000000000);
        queue3.liquidityQueue.addReservation(reservation);

        queue3.quoteManager.setBlockQuote(1003, u256.fromU64(1));
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, 0, null, removalProvider.getBtcReceiver(), 1));

        Blockchain.mockTransactionOutput(txOut);

        queue4.tradeManager.executeTrade(reservation2);

        expect(
            queue4.liquidityQueue.getSatoshisOwedReserved(removalProvider.getId()),
        ).toStrictEqual(900000000);
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
    });

    it('should handle double spend', () => {});

    it('should remove the provider from the removal queue when owed < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT', () => {
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
            u256.fromU32(10),
            initialProvider.getId(),
            u128.fromU64(3000000000),
            5,
        );
        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(3000000000));
        queue.liquidityQueue.setBlockQuote();

        queue.liquidityQueue.save();

        setBlockchainEnvironment(1001, providerAddress2, providerAddress2);

        const removalProvider: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            false,
            false,
            'wedwedwdwdw',
            u128.Zero,
            u128.Zero,
            u128.fromU64(609),
        );

        removalProvider.save();

        const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue2.liquidityQueue.addToRemovalQueue(removalProvider);
        queue2.liquidityQueue.setSatoshisOwed(removalProvider.getId(), 609);
        queue2.liquidityQueue.setBlockQuote();
        queue2.liquidityQueue.save();

        setBlockchainEnvironment(1003, ownerAddress1, ownerAddress1);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.addProvider(
            new ReservationProviderData(
                removalProvider.getQueueIndex(),
                u128.fromU32(100),
                ProviderTypes.LiquidityRemoval,
                reservation.getCreationBlock(),
            ),
        );

        queue3.liquidityQueue.setSatoshisOwedReserved(removalProvider.getId(), 10);
        queue3.liquidityQueue.addReservation(reservation);

        queue3.liquidityQueue.setBlockQuote();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(1004, ownerAddress1, ownerAddress1);

        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, 0, null, removalProvider.getBtcReceiver(), 10));

        Blockchain.mockTransactionOutput(txOut);

        const oldIndex = removalProvider.getQueueIndex();
        queue4.tradeManager.executeTrade(reservation2);

        expect(removalProvider.isFromRemovalQueue()).toBeFalsy();
        expect(removalProvider.isLiquidityProvider()).toBeFalsy();
        expect(removalProvider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        expect(removalProvider.isFromRemovalQueue()).toBeFalsy();
        expect(queue4.providerManager.getFromRemovalQueue(oldIndex)).toStrictEqual(u256.Zero);
    });
});
