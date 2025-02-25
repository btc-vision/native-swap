import { clearCachedProviders, getProvider } from '../lib/Provider';
import {
    Blockchain,
    SafeMath,
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
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
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { CreatePoolOperation } from '../lib/Liquidity/operations/CreatePoolOperation';
import { ReserveLiquidityOperation } from '../lib/Liquidity/operations/ReserveLiquidityOperation';
import { SwapOperation } from '../lib/Liquidity/operations/SwapOperation';
import { FEE_COLLECT_SCRIPT_PUBKEY } from '../utils/NativeSwapUtils';
import { ListTokensForSaleOperation } from '../lib/Liquidity/operations/ListTokensForSaleOperation';
import { AddLiquidityOperation } from '../lib/Liquidity/operations/AddLiquidityOperation';
import { RemoveLiquidityOperation } from '../lib/Liquidity/operations/RemoveLiquidityOperation';

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

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3,
                providerId2,
                providerAddress2,
                u256.fromU64(20000000),
                u256.Zero,
                true,
                0,
            );

            reserveOp.execute();
            queue3.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const swapOp = new SwapOperation(queue4);
            swapOp.execute();
        }).toThrow();
    });

    it("should revert if swapping a reservation more than 1 time'", () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3,
                providerId2,
                providerAddress2,
                u256.fromU64(20000000),
                u256.Zero,
                false,
                0,
            );

            reserveOp.execute();
            queue3.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
            transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
            transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 10000));

            Blockchain.mockTransactionOutput(transactionOutput);

            const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const swapOp = new SwapOperation(queue4);
            swapOp.execute();
            queue4.save();

            const queue5 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const swapOp2 = new SwapOperation(queue5);
            swapOp2.execute();
            queue5.save();
        }).toThrow();
    });

    it('should restoreReservedLiquidityForProvider when no satoshi sent', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        const initialProvider = getProvider(initialProviderId);
        setBlockchainEnvironment(101, providerAddress2, providerAddress2);

        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId2,
            providerAddress2,
            u256.fromU64(20000000),
            u256.Zero,
            false,
            0,
        );

        reserveOp.execute();
        queue3.save();

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);

        expect(initialProvider.reserved).toStrictEqual(u128.fromString(`13333333333333333333333`));
        expect(initialProvider.liquidity).toStrictEqual(
            u128.fromString(`1000000000000000000000000`),
        );

        const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const swapOp = new SwapOperation(queue4);

        swapOp.execute();
        queue4.save();

        expect(initialProvider.reserved).toStrictEqual(u128.Zero);
        expect(initialProvider.liquidity).toStrictEqual(
            u128.fromString(`1000000000000000000000000`),
        );

        expect(queue4.liquidity).toStrictEqual(u256.fromString(`1000000000000000000000000`));
        expect(queue4.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue4.deltaTokensBuy).toStrictEqual(u256.Zero);
        expect(queue4.deltaBTCBuy).toStrictEqual(u256.Zero);
        expect(TransferHelper.safeTransferCalled).toBeFalsy();
    });

    it('should set the active array => [purgeIndex]=false => then save', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initialProvider = getProvider(initialProviderId);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(101, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId2,
            providerAddress2,
            u256.fromU64(10000),
            u256.Zero,
            false,
            0,
        );

        reserveOp.execute();
        queue3.save();

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 10000));

        Blockchain.mockTransactionOutput(transactionOutput);

        const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const swapOp = new SwapOperation(queue4);

        const reservationActiveList = queue4.getActiveReservationListForBlock(101);
        const reservationList = queue4.getReservationListForBlock(101);

        expect(reservationList.getLength()).toStrictEqual(1);
        expect(reservationActiveList.get(0)).toBeTruthy();

        swapOp.execute();
        queue4.save();

        expect(reservationActiveList.get(0)).toBeFalsy();
    });

    it('should executeTrade => provider updated, liquidity queue update, safeTransfer called ', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initialProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(101, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId2,
            providerAddress2,
            u256.fromU64(20000000),
            u256.Zero,
            false,
            0,
        );

        reserveOp.execute();
        queue3.save();

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 10000));

        Blockchain.mockTransactionOutput(transactionOutput);

        const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const swapOp = new SwapOperation(queue4);
        swapOp.execute();
        queue4.save();

        expect(initialProvider.reserved).toStrictEqual(u128.Zero);
        expect(initialProvider.liquidity).toStrictEqual(
            u128.fromString(`999993333333333333333334`),
        );
        expect(queue4.liquidity).toStrictEqual(u256.fromString(`999993346666666666666667`));
        expect(queue4.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue4.deltaBTCBuy).toStrictEqual(u256.fromU32(10000));
        expect(queue4.deltaTokensBuy).toStrictEqual(u256.fromString(`6653333333333333333`));
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
    });

    it('should executeTrade with 2 different providers => 1 provider updated, liquidity queue update, safeTransfer called ', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initialProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(101, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId2,
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        const provider2 = getProvider(providerId2);

        setBlockchainEnvironment(102, providerAddress3, providerAddress3);
        const providerId3 = createProviderId(providerAddress3, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId3,
            providerAddress3,
            u256.fromU64(10000),
            u256.Zero,
            false,
            0,
        );

        reserveOp.execute();
        queue3.save();

        setBlockchainEnvironment(103, providerAddress3, providerAddress3);

        expect(initialProvider.reserved).toStrictEqual(u128.Zero);

        const transactionOutput: TransactionOutput[] = [];
        transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 10000));

        Blockchain.mockTransactionOutput(transactionOutput);

        const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const swapOp = new SwapOperation(queue4);

        const reservationActiveList = queue4.getActiveReservationListForBlock(102);
        const reservationList = queue4.getReservationListForBlock(102);

        expect(reservationList.getLength()).toStrictEqual(1);
        expect(reservationActiveList.get(0)).toBeTruthy();

        swapOp.execute();
        queue4.save();

        expect(provider2.reserved).toStrictEqual(u128.Zero);
        expect(queue4.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue4.deltaBTCBuy).toStrictEqual(u256.fromU64(10000));
        expect(queue4.deltaTokensBuy).toStrictEqual(u256.fromString(`6653333333333333333`));
        expect(reservationActiveList.get(0)).toBeFalsy();
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
    });

    it('should executeTrade with 2 different providers => 2 providers updated, liquidity queue update, safeTransfer called when satoshis = 15600 ', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initialProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(101, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId2,
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        const provider2 = getProvider(providerId2);

        setBlockchainEnvironment(102, providerAddress3, providerAddress3);
        const providerId3 = createProviderId(providerAddress3, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId3,
            providerAddress3,
            u256.fromU64(15600),
            u256.Zero,
            false,
            0,
        );

        reserveOp.execute();
        queue3.save();

        setBlockchainEnvironment(103, providerAddress3, providerAddress3);

        const transactionOutput: TransactionOutput[] = [];
        transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        transactionOutput.push(new TransactionOutput(2, receiverAddress1, 15000));
        transactionOutput.push(new TransactionOutput(3, initialProvider.btcReceiver, 600));

        Blockchain.mockTransactionOutput(transactionOutput);

        const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const swapOp = new SwapOperation(queue4);

        const reservationActiveList = queue4.getActiveReservationListForBlock(102);
        const reservationList = queue4.getReservationListForBlock(102);

        expect(reservationList.getLength()).toStrictEqual(1);
        expect(reservationActiveList.get(0)).toBeTruthy();

        swapOp.execute();
        queue4.save();

        expect(queue4.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue4.liquidity).toStrictEqual(u256.fromString(`999999620800000000000001`));
        expect(provider2.liquidity).toStrictEqual(u128.Zero);
        expect(provider2.reserved).toStrictEqual(u128.Zero);
        expect(initialProvider.liquidity).toStrictEqual(
            u128.fromString(`999999600000000000000001`),
        );
        expect(initialProvider.reserved).toStrictEqual(u128.Zero);
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
        expect(reservationList.getLength()).toStrictEqual(1);
        expect(reservationActiveList.get(0)).toBeFalsy();
    });

    it('should executeTrade with 2 different providers => 1 removal provider, 2 providers updated, liquidity queue update, safeTransfer called when satoshis = 15600 ', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initialProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(101, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const provider2 = getProvider(providerId2);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId2,
            u128.fromString(`10000000000000000000`),
            receiverAddress2,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        setBlockchainEnvironment(102, providerAddress3, providerAddress3);
        const providerId3 = createProviderId(providerAddress3, tokenAddress1);
        const provider3 = getProvider(providerId3);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId3,
            providerAddress3,
            u256.fromU64(15600),
            u256.Zero,
            true,
            0,
        );

        reserveOp.execute();
        queue3.save();

        setBlockchainEnvironment(103, providerAddress3, providerAddress3);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
        transactionOutput.push(new TransactionOutput(2, provider2.btcReceiver, 15000));
        transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 600));

        Blockchain.mockTransactionOutput(transactionOutput);
        const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const addOp = new AddLiquidityOperation(queue4, providerId3, receiverAddress3);
        addOp.execute();
        queue4.save();

        setBlockchainEnvironment(104, providerAddress3, providerAddress3);
        const queue5 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const removeOp = new RemoveLiquidityOperation(queue5, providerId3, u256.fromU32(15600));
        removeOp.execute();
        queue5.save();

        setBlockchainEnvironment(105, providerAddress4, providerAddress4);
        const providerId4 = createProviderId(providerAddress4, tokenAddress1);
        const queue6 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp2 = new ReserveLiquidityOperation(
            queue6,
            providerId4,
            providerAddress4,
            u256.fromU64(15600),
            u256.Zero,
            false,
            0,
        );

        reserveOp2.execute();
        queue6.save();

        setBlockchainEnvironment(106, providerAddress4, providerAddress4);

        const transactionOutput2: TransactionOutput[] = [];
        transactionOutput2.push(new TransactionOutput(0, 'fakeaddress', 0));
        transactionOutput2.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        transactionOutput2.push(new TransactionOutput(2, provider3.btcReceiver, 15600));

        Blockchain.mockTransactionOutput(transactionOutput2);

        const queue7 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const swapOp = new SwapOperation(queue7);

        const reservationActiveList = queue7.getActiveReservationListForBlock(105);
        const reservationList = queue7.getReservationListForBlock(105);

        expect(reservationList.getLength()).toStrictEqual(1);
        expect(reservationActiveList.get(0)).toBeTruthy();

        swapOp.execute();
        queue7.save();

        expect(queue7.getBTCowedReserved(providerId3)).toStrictEqual(u256.Zero);
        expect(queue7.getBTCowed(providerId3)).toStrictEqual(u256.Zero);
        expect(queue7.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue7.liquidity).toStrictEqual(u256.fromString(`999999620800000000000000`));
        expect(queue7.deltaBTCBuy).toStrictEqual(u256.fromString(`15600`));
        expect(queue7.deltaTokensBuy).toStrictEqual(u256.fromString(`10379200000000000000`));

        expect(provider3.liquidity).toStrictEqual(u128.Zero);
        expect(provider3.reserved).toStrictEqual(u128.Zero);
        expect(initialProvider.liquidity).toStrictEqual(
            u128.fromString(`999999600000000000000001`),
        );
        expect(initialProvider.reserved).toStrictEqual(u128.Zero);
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
        expect(reservationList.getLength()).toStrictEqual(1);
        expect(reservationActiveList.get(0)).toBeFalsy();
    });

    it('should executeTrade with 3 different providers => 1 priority provider, 1 provider updated, liquidity queue update, safeTransfer called ', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initialProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(101, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const provider2 = getProvider(providerId2);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId2,
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        setBlockchainEnvironment(102, providerAddress3, providerAddress3);
        const providerId3 = createProviderId(providerAddress3, tokenAddress1);
        const provider3 = getProvider(providerId3);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const listOp2 = new ListTokensForSaleOperation(
            queue3,
            providerId3,
            u128.fromString(`10000000000000000000`),
            receiverAddress2,
            true,
            false,
        );

        listOp2.execute();
        queue3.save();

        setBlockchainEnvironment(103, providerAddress4, providerAddress4);
        const providerId4 = createProviderId(providerAddress4, tokenAddress1);
        const provider4 = getProvider(providerId4);
        const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue4,
            providerId4,
            providerAddress4,
            u256.fromU64(10000),
            u256.Zero,
            false,
            0,
        );

        reserveOp.execute();
        queue4.save();

        setBlockchainEnvironment(104, providerAddress4, providerAddress4);

        expect(initialProvider.reserved).toStrictEqual(u128.Zero);
        expect(provider2.reserved).toStrictEqual(u128.Zero);
        expect(provider3.reserved).toStrictEqual(u128.fromString(`6666666666666666666`));

        const transactionOutput: TransactionOutput[] = [];
        transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        transactionOutput.push(new TransactionOutput(2, provider3.btcReceiver, 10000));

        Blockchain.mockTransactionOutput(transactionOutput);

        const queue5 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const swapOp = new SwapOperation(queue5);

        const reservationActiveList = queue5.getActiveReservationListForBlock(103);
        const reservationList = queue5.getReservationListForBlock(103);

        expect(reservationList.getLength()).toStrictEqual(1);
        expect(reservationActiveList.get(0)).toBeTruthy();

        swapOp.execute();
        queue4.save();

        expect(provider3.reserved).toStrictEqual(u128.Zero);
        expect(queue4.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue4.deltaBTCBuy).toStrictEqual(u256.fromU64(10000));
        expect(queue4.deltaTokensBuy).toStrictEqual(u256.fromString(`6653333333333333333`));
        expect(reservationActiveList.get(0)).toBeFalsy();
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
    });
});
