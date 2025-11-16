import { clearCachedProviders, getProvider } from '../models/Provider';
import {
    Blockchain,
    SafeMath,
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProviderId,
    msgSender1,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    providerAddress4,
    receiverAddress1,
    receiverAddress1CSV,
    receiverAddress2,
    receiverAddress2CSV,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { SwapOperation } from '../operations/SwapOperation';
import {
    INITIAL_FEE_COLLECT_ADDRESS,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
} from '../constants/Contract';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { Reservation } from '../models/Reservation';

describe('SwapOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('SwapOperation tests - Not Expired', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should revert if reservation does not exists', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    receiverAddress1CSV,
                    0,
                    u256.Zero,
                    5,
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress1, providerAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp = new SwapOperation(queue2.liquidityQueue, queue2.tradeManager);
                swapOp.execute();
            }).toThrow();
        });

        it('should revert if swapping a reservation more than 1 time', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const initialProvider = getProvider(initialProviderId);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    receiverAddress1CSV,
                    0,
                    u256.Zero,
                    5,
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const reserveOp = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    20000000,
                    u256.Zero,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                    MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
                );

                reserveOp.execute();
                queue3.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress2, providerAddress2);
                const transactionOutput: TransactionOutput[] = [];

                transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
                transactionOutput.push(
                    new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 10000),
                );
                transactionOutput.push(
                    new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
                );

                Blockchain.mockTransactionOutput(transactionOutput);

                const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);
                swapOp.execute();
                queue4.liquidityQueue.save();

                const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp2 = new SwapOperation(queue5.liquidityQueue, queue5.tradeManager);
                swapOp2.execute();
                queue5.liquidityQueue.save();
            }).toThrow();
        });

        it('should throw  when no satoshi sent', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                receiverAddress1CSV,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            const initialProvider = getProvider(initialProviderId);
            setBlockchainEnvironment(101, providerAddress2, providerAddress2);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                20000000,
                u256.Zero,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
                MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);

            Blockchain.mockTransactionOutput([]);

            expect(() => {
                const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);
                swapOp.execute();
            }).toThrow();
        });

        it('should set the active array => [purgeIndex]=false => then save', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                receiverAddress1CSV,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                10000,
                u256.Zero,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
                MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 10000),
            );
            transactionOutput.push(
                new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);

            const reservationActiveList = queue4.reservationManager.callgetActiveListForBlock(101);
            const reservationList = queue4.reservationManager.callgetReservationListForBlock(101);

            expect(reservationList.getLength()).toStrictEqual(1);
            expect(reservationActiveList.get(0)).toBeTruthy();

            swapOp.execute();
            queue4.liquidityQueue.save();

            expect(reservationActiveList.get(0)).toBeFalsy();
        });

        it('should executeTrade => provider updated, liquidity queue update, safeTransfer called ', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                receiverAddress1CSV,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                20000000,
                u256.Zero,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
                MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 10000),
            );
            transactionOutput.push(
                new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);
            swapOp.execute();
            queue4.liquidityQueue.save();

            expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

            expect(initialProvider.getLiquidityAmount()).toStrictEqual(
                u128.fromString(`999990000000000000000000`),
            );
            expect(queue4.liquidityQueue.liquidity).toStrictEqual(
                u256.fromString(`999990000000000000000000`),
            );
            expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
            expect(queue4.liquidityQueue.totalSatoshisExchangedForTokens).toStrictEqual(10000);
            expect(queue4.liquidityQueue.totalTokensExchangedForSatoshis).toStrictEqual(
                u256.fromString(`9980000000000000000`),
            );
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
        });

        it('should executeTrade with 2 different providers => 1 provider updated, liquidity queue update, safeTransfer called ', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                receiverAddress1CSV,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const listOp = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                providerId2,
                u128.fromString(`1000000000000000000000`),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            listOp.execute();
            queue2.liquidityQueue.save();

            const provider2 = getProvider(providerId2);

            setBlockchainEnvironment(102, providerAddress3, providerAddress3);
            const providerId3 = createProviderId(providerAddress3, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId3,
                providerAddress3,
                10000,
                u256.Zero,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
                MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress3, providerAddress3);

            expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

            const transactionOutput: TransactionOutput[] = [];
            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 10000),
            );
            transactionOutput.push(
                new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);

            const reservationActiveList = queue4.reservationManager.callgetActiveListForBlock(102);
            const reservationList = queue4.reservationManager.callgetReservationListForBlock(102);

            expect(reservationList.getLength()).toStrictEqual(1);
            expect(reservationActiveList.get(0)).toBeTruthy();

            swapOp.execute();
            queue4.liquidityQueue.save();

            expect(provider2.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
            expect(queue4.liquidityQueue.totalSatoshisExchangedForTokens).toStrictEqual(10000);
            expect(queue4.liquidityQueue.totalTokensExchangedForSatoshis).toStrictEqual(
                u256.fromString(`9990814375050294936`),
            );
            expect(reservationActiveList.get(0)).toBeFalsy();
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
        });

        it('should executeTrade with 2 different providers => 2 providers updated, liquidity queue update, safeTransfer called when satoshis = 15600 ', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                receiverAddress1CSV,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const provider2 = getProvider(providerId2);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const listOp = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                providerId2,
                u128.fromString(`1000000000000000000000`),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            listOp.execute();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress3, providerAddress3);
            const providerId3 = createProviderId(providerAddress3, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId3,
                providerAddress3,
                15600,
                u256.Zero,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
                MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress3, providerAddress3);

            const transactionOutput: TransactionOutput[] = [];
            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 10000),
            );
            transactionOutput.push(new TransactionOutput(2, 0, null, receiverAddress1CSV, 15000));
            transactionOutput.push(
                new TransactionOutput(3, 0, null, initialProvider.getBtcReceiver(), 600),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);

            const reservationActiveList = queue4.reservationManager.callgetActiveListForBlock(102);
            const reservationList = queue4.reservationManager.callgetReservationListForBlock(102);

            expect(reservationList.getLength()).toStrictEqual(1);
            expect(reservationActiveList.get(0)).toBeTruthy();

            swapOp.execute();
            queue4.liquidityQueue.save();

            expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
            expect(queue4.liquidityQueue.liquidity).toStrictEqual(
                u256.fromString(`1000984383095766454448798`),
            );
            expect(provider2.getLiquidityAmount()).toStrictEqual(
                u128.fromString(`984383095766454448798`),
            );
            expect(provider2.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(initialProvider.getLiquidityAmount()).toStrictEqual(
                u128.fromString(`1000000000000000000000000`),
            );
            expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
            expect(reservationList.getLength()).toStrictEqual(1);
            expect(reservationActiveList.get(0)).toBeFalsy();
        });

        it('should executeTrade with 3 different providers => 1 priority provider, 1 provider updated, liquidity queue update, safeTransfer called ', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                receiverAddress1CSV,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const provider2 = getProvider(providerId2);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const listOp = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                providerId2,
                u128.fromString(`1000000000000000000000`),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            listOp.execute();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress3, providerAddress3);
            const providerId3 = createProviderId(providerAddress3, tokenAddress1);
            const provider3 = getProvider(providerId3);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const listOp2 = new ListTokensForSaleOperation(
                queue3.liquidityQueue,
                providerId3,
                u128.fromString(`1000000000000000000000`),
                receiverAddress2,
                receiverAddress2CSV,
                true,
                false,
            );

            listOp2.execute();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress4, providerAddress4);
            const providerId4 = createProviderId(providerAddress4, tokenAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue4.liquidityQueue,
                providerId4,
                providerAddress4,
                10000,
                u256.Zero,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
                MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
            );

            reserveOp.execute();
            queue4.liquidityQueue.save();

            setBlockchainEnvironment(104, providerAddress4, providerAddress4);

            expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider2.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider3.getReservedAmount()).toStrictEqual(
                u128.fromString(`10021627509671387302`),
            );

            const transactionOutput: TransactionOutput[] = [];
            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 10000),
            );
            transactionOutput.push(
                new TransactionOutput(2, 0, null, provider3.getBtcReceiver(), 10000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reservationActiveList = queue5.reservationManager.callgetActiveListForBlock(103);
            const reservationList = queue5.reservationManager.callgetReservationListForBlock(103);

            expect(reservationList.getLength()).toStrictEqual(1);
            expect(reservationActiveList.get(0)).toBeTruthy();

            const swapOp = new SwapOperation(queue5.liquidityQueue, queue5.tradeManager);
            swapOp.execute();
            queue5.liquidityQueue.save();

            expect(provider3.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(queue5.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
            expect(queue5.liquidityQueue.totalSatoshisExchangedForTokens).toStrictEqual(10000);
            expect(queue5.liquidityQueue.totalTokensExchangedForSatoshis).toStrictEqual(
                u256.fromString(`10001584254652044528`),
            );
            expect(reservationActiveList.get(0)).toBeFalsy();
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
        });
    });

    describe('SwapOperation tests - Expired', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should revert if reservation does not exists', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    receiverAddress1CSV,
                    0,
                    u256.Zero,
                    5,
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress1, providerAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp = new SwapOperation(queue2.liquidityQueue, queue2.tradeManager);
                swapOp.execute();
            }).toThrow();
        });

        it('should revert if reservation does not have providers', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    receiverAddress1CSV,
                    0,
                    u256.Zero,
                    5,
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const reserveOp = new ReserveLiquidityOperation(
                    queue2.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    20000000,
                    u256.Zero,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                    MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
                );

                reserveOp.execute();
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(122, providerAddress2, providerAddress2);
                // delete will empty providers
                const reservation = new Reservation(tokenAddress1, providerAddress2);
                reservation.delete(true);

                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp = new SwapOperation(queue3.liquidityQueue, queue3.tradeManager);
                swapOp.execute();
            }).toThrow();
        });

        it('should revert if reservation result with no purchase', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const initialProvider = getProvider(initialProviderId);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    receiverAddress1CSV,
                    0,
                    u256.Zero,
                    5,
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const reserveOp = new ReserveLiquidityOperation(
                    queue2.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    20000000,
                    u256.Zero,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                    MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
                );

                reserveOp.execute();
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(122, providerAddress2, providerAddress2);
                // Simulate provider does not have available liquidity
                initialProvider.setReservedAmount(initialProvider.getAvailableLiquidityAmount());

                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp = new SwapOperation(queue3.liquidityQueue, queue3.tradeManager);
                swapOp.execute();
            }).toThrow();
        });

        it('should revert if swapping an expired reservation more than 1 time', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const initialProvider = getProvider(initialProviderId);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    receiverAddress1CSV,
                    0,
                    u256.Zero,
                    5,
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const reserveOp = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    20000000,
                    u256.Zero,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                    MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
                );

                reserveOp.execute();
                queue3.liquidityQueue.save();

                setBlockchainEnvironment(122, providerAddress2, providerAddress2);
                const transactionOutput: TransactionOutput[] = [];

                transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
                transactionOutput.push(
                    new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 10000),
                );
                transactionOutput.push(
                    new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
                );

                Blockchain.mockTransactionOutput(transactionOutput);

                const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);
                swapOp.execute();
                queue4.liquidityQueue.save();

                const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp2 = new SwapOperation(queue5.liquidityQueue, queue5.tradeManager);
                swapOp2.execute();
                queue5.liquidityQueue.save();
            }).toThrow();
        });

        it('should revert if swapping an already swapped reservation that is now expired', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const initialProvider = getProvider(initialProviderId);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    receiverAddress1CSV,
                    0,
                    u256.Zero,
                    5,
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const reserveOp = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    20000000,
                    u256.Zero,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                    MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
                );

                reserveOp.execute();
                queue3.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress2, providerAddress2);
                let transactionOutput: TransactionOutput[] = [];

                transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
                transactionOutput.push(
                    new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 10000),
                );
                transactionOutput.push(
                    new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
                );

                Blockchain.mockTransactionOutput(transactionOutput);

                const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);
                swapOp.execute();
                queue4.liquidityQueue.save();

                setBlockchainEnvironment(122, providerAddress2, providerAddress2);
                transactionOutput = [];

                transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
                transactionOutput.push(
                    new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 10000),
                );
                transactionOutput.push(
                    new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
                );

                Blockchain.mockTransactionOutput(transactionOutput);
                const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                const swapOp2 = new SwapOperation(queue5.liquidityQueue, queue5.tradeManager);
                swapOp2.execute();
                queue5.liquidityQueue.save();
            }).toThrow();
        });

        it('should swap and set swapped flag to true', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                receiverAddress1CSV,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const listOp = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                providerId2,
                u128.fromString(`1000000000000000000000`),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            listOp.execute();
            queue2.liquidityQueue.save();

            const provider2 = getProvider(providerId2);

            setBlockchainEnvironment(102, providerAddress3, providerAddress3);
            const providerId3 = createProviderId(providerAddress3, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId3,
                providerAddress3,
                10000,
                u256.Zero,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
                MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(123, providerAddress3, providerAddress3);

            const transactionOutput: TransactionOutput[] = [];
            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 10000),
            );
            transactionOutput.push(
                new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);
            swapOp.execute();
            queue4.liquidityQueue.save();

            const reservation = new Reservation(tokenAddress1, providerAddress3);
            expect(reservation.getSwapped()).toBeTruthy();
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
        });
    });
});
