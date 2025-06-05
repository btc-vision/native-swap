import { clearCachedProviders, getProvider } from '../models/Provider';
import {
    Address,
    Blockchain,
    SafeMath,
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProviderId,
    msgSender1,
    providerAddress2,
    providerAddress3,
    providerAddress4,
    receiverAddress1,
    receiverAddress2,
    receiverAddress3,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { SwapOperation } from '../operations/SwapOperation';
import {
    FEE_COLLECT_SCRIPT_PUBKEY,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
} from '../constants/Contract';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { AddLiquidityOperation } from '../operations/AddLiquidityOperation';
import { RemoveLiquidityOperation } from '../operations/RemoveLiquidityOperation';

describe('SwapOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it("should revert if reservation.reservedLP= true => 'Reserved for LP; cannot swap'", () => {
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
                0,
                u256.Zero,
                5,
                Address.dead(),
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
                true,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);
            swapOp.execute();
        }).toThrow();
    });

    it("should revert if swapping a reservation more than 1 time'", () => {
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
                0,
                u256.Zero,
                5,
                Address.dead(),
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
                false,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000),
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

    it('should restoreReservedLiquidityForProvider when no satoshi sent', () => {
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
            0,
            u256.Zero,
            5,
            Address.dead(),
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
            false,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp.execute();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`13333333333333333333333`),
        );
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000000`),
        );

        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);

        swapOp.execute();
        queue4.liquidityQueue.save();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000000`),
        );

        expect(queue4.liquidityQueue.liquidity).toStrictEqual(
            u256.fromString(`1000000000000000000000000`),
        );
        expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue4.liquidityQueue.totalTokensExchangedForSatoshis).toStrictEqual(u256.Zero);
        expect(queue4.liquidityQueue.totalSatoshisExchangedForTokens).toStrictEqual(0);
        expect(TransferHelper.safeTransferCalled).toBeFalsy();
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
            0,
            u256.Zero,
            5,
            Address.dead(),
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
            false,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp.execute();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
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
            0,
            u256.Zero,
            5,
            Address.dead(),
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
            false,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp.execute();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
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
            u128.fromString(`999993333333333333333334`),
        );
        expect(queue4.liquidityQueue.liquidity).toStrictEqual(
            u256.fromString(`999993340000000000000000`),
        );
        expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue4.liquidityQueue.totalSatoshisExchangedForTokens).toStrictEqual(10000);
        expect(queue4.liquidityQueue.totalTokensExchangedForSatoshis).toStrictEqual(
            u256.fromString(`6653333333333333333`),
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
            0,
            u256.Zero,
            5,
            Address.dead(),
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
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            Address.dead(),
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
            false,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp.execute();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(103, providerAddress3, providerAddress3);

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        const transactionOutput: TransactionOutput[] = [];
        transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
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
            u256.fromString(`6653333333333333333`),
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
            0,
            u256.Zero,
            5,
            Address.dead(),
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
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            Address.dead(),
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
            false,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp.execute();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(103, providerAddress3, providerAddress3);

        const transactionOutput: TransactionOutput[] = [];
        transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        transactionOutput.push(new TransactionOutput(2, 0, null, receiverAddress1, 15000));
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
            u256.fromString(`999999610400000000000001`),
        );
        expect(provider2.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(provider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`999999600000000000000001`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
        expect(reservationList.getLength()).toStrictEqual(1);
        expect(reservationActiveList.get(0)).toBeFalsy();
    });

    it('should executeTrade with 2 different providers => 1 removal provider, 2 providers updated, liquidity queue update, safeTransfer called when satoshis = 15600 ', () => {
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
            0,
            u256.Zero,
            5,
            Address.dead(),
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
            u128.fromString(`10000000000000000000`),
            receiverAddress2,
            Address.dead(),
            false,
            false,
        );

        listOp.execute();
        queue2.liquidityQueue.save();

        setBlockchainEnvironment(102, providerAddress3, providerAddress3);
        const providerId3 = createProviderId(providerAddress3, tokenAddress1);
        const provider3 = getProvider(providerId3);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue3.liquidityQueue,
            providerId3,
            providerAddress3,
            15600,
            u256.Zero,
            true,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp.execute();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(103, providerAddress3, providerAddress3);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
        transactionOutput.push(
            new TransactionOutput(2, 0, null, provider2.getBtcReceiver(), 15000),
        );
        transactionOutput.push(
            new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 600),
        );

        Blockchain.mockTransactionOutput(transactionOutput);
        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const addOp = new AddLiquidityOperation(
            queue4.liquidityQueue,
            queue4.tradeManager,
            providerId3,
            receiverAddress3,
        );
        addOp.execute();
        queue4.liquidityQueue.save();

        setBlockchainEnvironment(104, providerAddress3, providerAddress3);
        const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const removeOp = new RemoveLiquidityOperation(queue5.liquidityQueue, providerId3);
        removeOp.execute();
        queue5.liquidityQueue.save();

        setBlockchainEnvironment(105, providerAddress4, providerAddress4);
        const providerId4 = createProviderId(providerAddress4, tokenAddress1);
        const queue6 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp2 = new ReserveLiquidityOperation(
            queue6.liquidityQueue,
            providerId4,
            providerAddress4,
            15600,
            u256.Zero,
            false,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp2.execute();
        queue6.liquidityQueue.save();

        setBlockchainEnvironment(106, providerAddress4, providerAddress4);

        const transactionOutput2: TransactionOutput[] = [];
        transactionOutput2.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput2.push(
            new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000),
        );
        transactionOutput2.push(
            new TransactionOutput(2, 0, null, provider3.getBtcReceiver(), 15600),
        );

        Blockchain.mockTransactionOutput(transactionOutput2);
        const queue7 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservationActiveList = queue7.reservationManager.callgetActiveListForBlock(105);
        const reservationList = queue7.reservationManager.callgetReservationListForBlock(105);

        expect(reservationList.getLength()).toStrictEqual(1);
        expect(reservationActiveList.getLength()).toStrictEqual(1);
        expect(reservationActiveList.get(0)).toBeTruthy();

        const swapOp = new SwapOperation(queue7.liquidityQueue, queue7.tradeManager);
        swapOp.execute();
        queue7.liquidityQueue.save();
        /*
                        expect(queue7.liquidityQueue.getSatoshisOwedReserved(providerId3)).toStrictEqual(0);
                        expect(queue7.liquidityQueue.getSatoshisOwed(providerId3)).toStrictEqual(0);
                        expect(queue7.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
                        expect(queue7.liquidityQueue.liquidity).toStrictEqual(
                            u256.fromString(`999999610400000000000000`),
                        );
                        expect(queue7.liquidityQueue.totalSatoshisExchangedForTokens).toStrictEqual(15600);
                        expect(queue7.liquidityQueue.totalTokensExchangedForSatoshis).toStrictEqual(
                            u256.fromString(`10379200000000000000`),
                            '2',
                        );

                        expect(provider3.getLiquidityAmount()).toStrictEqual(u128.Zero);
                        expect(provider3.getReservedAmount()).toStrictEqual(u128.Zero);
                        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
                            u128.fromString(`999999600000000000000001`),
                            '3',
                        );
                        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
                        expect(TransferHelper.safeTransferCalled).toBeTruthy();
                        expect(reservationList.getLength()).toStrictEqual(1);
                        expect(reservationActiveList.get(0)).toBeFalsy();

                 */
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
            0,
            u256.Zero,
            5,
            Address.dead(),
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
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            Address.dead(),
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
            u128.fromString(`10000000000000000000`),
            receiverAddress2,
            Address.dead(),
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
            false,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp.execute();
        queue4.liquidityQueue.save();

        setBlockchainEnvironment(104, providerAddress4, providerAddress4);

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(provider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(provider3.getReservedAmount()).toStrictEqual(u128.fromString(`6666666666666666666`));

        const transactionOutput: TransactionOutput[] = [];
        transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
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
            u256.fromString(`6653333333333333333`),
        );
        expect(reservationActiveList.get(0)).toBeFalsy();
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
    });

    it('should executeTrade, swap, add liquidity then purged correctly, then swap', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        let initialProvider = getProvider(initialProviderId);
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
            0,
            u256.Zero,
            5,
            Address.dead(),
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
            false,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp.execute();
        queue3.liquidityQueue.save();

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        transactionOutput.push(
            new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
        );

        Blockchain.mockTransactionOutput(transactionOutput);

        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const swapOp = new SwapOperation(queue4.liquidityQueue, queue4.tradeManager);
        swapOp.execute();
        queue4.liquidityQueue.save();

        // Add liquidity
        setBlockchainEnvironment(102, providerAddress3, providerAddress3);
        const providerId3 = createProviderId(providerAddress3, tokenAddress1);
        const queue34 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp4 = new ReserveLiquidityOperation(
            queue34.liquidityQueue,
            providerId3,
            providerAddress3,
            15600,
            u256.Zero,
            true,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp4.execute();
        queue34.liquidityQueue.save();

        setBlockchainEnvironment(103, providerAddress3, providerAddress3);
        const transactionOutput2: TransactionOutput[] = [];
        const provider3 = getProvider(providerId3);
        transactionOutput2.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput2.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
        transactionOutput2.push(
            new TransactionOutput(2, 0, null, provider3.getBtcReceiver(), 15000),
        );
        transactionOutput2.push(
            new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 600),
        );

        Blockchain.mockTransactionOutput(transactionOutput2);
        const queue44 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const addOp = new AddLiquidityOperation(
            queue44.liquidityQueue,
            queue44.tradeManager,
            providerId3,
            receiverAddress3,
        );
        addOp.execute();
        queue44.liquidityQueue.save();

        setBlockchainEnvironment(108, providerAddress2, providerAddress2);
        const liquidity = initialProvider.getLiquidityAmount();

        const queue54 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp54 = new ReserveLiquidityOperation(
            queue54.liquidityQueue,
            providerId2,
            providerAddress2,
            15600,
            u256.Zero,
            false,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp54.execute();
        queue54.liquidityQueue.save();

        setBlockchainEnvironment(109, providerAddress2, providerAddress2);
        const transactionOutput3: TransactionOutput[] = [];

        transactionOutput3.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput3.push(
            new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000),
        );
        transactionOutput3.push(
            new TransactionOutput(2, 0, null, provider3.getBtcReceiver(), 10000),
        );

        Blockchain.mockTransactionOutput(transactionOutput3);

        const queue64 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const swapOp2 = new SwapOperation(queue64.liquidityQueue, queue64.tradeManager);
        swapOp2.execute();
        queue64.liquidityQueue.save();

        const providerAddLiquidity = getProvider(providerId3);
        expect(providerAddLiquidity.getReservedAmount()).toStrictEqual(u128.Zero);

        initialProvider = getProvider(initialProviderId);
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(liquidity);
    });
});
