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
    receiverAddress1,
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

        expect(initialProvider.reserved).toStrictEqual(u128.fromString(`13333332666666666666666`));
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
        expect(queue4.deltaBTCBuy).toStrictEqual(u256.fromU64(9999));
        expect(queue4.deltaTokensBuy).toStrictEqual(
            SafeMath.sub(
                u256.fromString(`6665999999999999999`),
                u256.fromString('13331999999999999'),
            ),
        );
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

        /*log(`q3:${queue3.liquidity}`);
        log(`q3:${queue3.reservedLiquidity}`);

        log(`p2:${provider2.liquidity}`);
        log(`p2:${provider2.reserved}`);

        log(`ip:${initialProvider.liquidity}`);
        log(`ip:${initialProvider.reserved}`);*/
    });
});
