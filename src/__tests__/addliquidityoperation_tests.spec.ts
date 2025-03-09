import { clearCachedProviders, getProvider } from '../lib/Provider';
import {
    Address,
    Blockchain,
    SafeMath,
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
    createProvider,
    createProviderId,
    createReservation,
    msgSender1,
    providerAddress1,
    providerAddress2,
    receiverAddress1,
    receiverAddress2,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import { AddLiquidityOperation } from '../lib/Liquidity/operations/AddLiquidityOperation';
import { NORMAL_TYPE } from '../lib/Reservation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { CreatePoolOperation } from '../lib/Liquidity/operations/CreatePoolOperation';
import { ReserveLiquidityOperation } from '../lib/Liquidity/operations/ReserveLiquidityOperation';
import { FEE_COLLECT_SCRIPT_PUBKEY } from '../utils/NativeSwapUtils';

describe('AddLiquidityOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it("should revert if provider is in removal queue => 'Wait for removal'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, true, true, false);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const operation = new AddLiquidityOperation(queue, provider.providerId, 'dkjoewjweoj');

            operation.execute();
        }).toThrow();
    });

    it("should revert if reservation.reservedLP= false => 'You must reserve liquidity for LP first'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const reservation = createReservation(tokenAddress1, msgSender1);
            reservation.reserveAtIndex(0, u128.fromU64(1000), NORMAL_TYPE);
            reservation.save();

            setBlockchainEnvironment(103);
            const provider = createProvider(providerAddress1, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const operation = new AddLiquidityOperation(queue, provider.providerId, 'dkjoewjweoj');

            operation.execute();
        }).toThrow();
    });

    it("should revert if tokensBoughtFromQueue=0 || btcSpent=0 => 'No effective purchase made'", () => {
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
                Address.dead(),
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
            const addOp = new AddLiquidityOperation(queue4, providerId2, receiverAddress2);
            addOp.execute();
        }).toThrow();
    });

    it('should revert getActivationDelay=>0, createdAt=>current block number', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        expect(() => {
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
                Address.dead(),
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const initialProvider = getProvider(initialProviderId);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
            transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
            transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 10000));

            Blockchain.mockTransactionOutput(transactionOutput);

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

            const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const addOp = new AddLiquidityOperation(queue4, providerId2, receiverAddress2);
            addOp.execute();
        }).toThrow();
    });

    it('should revert getActivationDelay=>4, createdAt=>current block number', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        expect(() => {
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
                Address.dead(),
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const initialProvider = getProvider(initialProviderId);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
            transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
            transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 10000));

            Blockchain.mockTransactionOutput(transactionOutput);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3,
                providerId2,
                providerAddress2,
                u256.fromU64(20000000),
                u256.Zero,
                true,
                4,
            );

            reserveOp.execute();
            queue3.save();

            setBlockchainEnvironment(104, providerAddress2, providerAddress2);
            const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const addOp = new AddLiquidityOperation(queue4, providerId2, receiverAddress2);
            addOp.execute();
        }).toThrow();
    });

    it('should call safeTransferFrom', () => {
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
            Address.dead(),
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(101, providerAddress2, providerAddress2);
        const initialProvider = getProvider(initialProviderId);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 10000));

        Blockchain.mockTransactionOutput(transactionOutput);

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
        const addOp = new AddLiquidityOperation(queue4, providerId2, receiverAddress2);
        addOp.execute();

        expect(TransferHelper.safeTransferFromCalled).toBeTruthy();
    });

    it('should update liquidity queue and mark the provider as a LP', () => {
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
            Address.dead(),
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(101, providerAddress2, providerAddress2);
        const initialProvider = getProvider(initialProviderId);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
        transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 10000));

        Blockchain.mockTransactionOutput(transactionOutput);

        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId2,
            providerAddress2,
            u256.fromU64(10000),
            u256.Zero,
            true,
            0,
        );

        reserveOp.execute();
        queue3.save();

        const provider2 = getProvider(providerId2);
        expect(provider2.isLp).toBeFalsy();
        expect(provider2.liquidityProvided).toStrictEqual(u256.Zero);

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);
        const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const addOp = new AddLiquidityOperation(queue4, providerId2, receiverAddress2);
        addOp.execute();

        expect(TransferHelper.safeTransferFromCalled).toBeTruthy();
        expect(queue4.liquidity).toStrictEqual(u256.fromString('1000006666666666666666666'));
        expect(queue4.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue4.virtualBTCReserve).toStrictEqual(u256.fromU64(1500010000));
        expect(queue4.virtualTokenReserve).toStrictEqual(
            u256.fromString('1000006666666666666666666'),
        );
        expect(queue4.getBTCowed(providerId2)).toStrictEqual(u256.fromU32(10000));
        expect(provider2.isLp).toBeTruthy();
        expect(provider2.liquidityProvided).toStrictEqual(u256.fromString('6666666666666666666'));
    });

    it('should not allow to add liquidity 2 times for the same reservation', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        expect(() => {
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
                Address.dead(),
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress2, providerAddress2);
            const initialProvider = getProvider(initialProviderId);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
            transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
            transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 2000));

            Blockchain.mockTransactionOutput(transactionOutput);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3,
                providerId2,
                providerAddress2,
                u256.fromU64(2000),
                u256.Zero,
                true,
                0,
            );

            reserveOp.execute();
            queue3.save();

            const provider2 = getProvider(providerId2);
            expect(provider2.isLp).toBeFalsy();
            expect(provider2.liquidityProvided).toStrictEqual(u256.Zero);

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const addOp = new AddLiquidityOperation(queue4, providerId2, receiverAddress2);
            addOp.execute();
            queue4.save();

            const queue5 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const addOp2 = new AddLiquidityOperation(queue5, providerId2, receiverAddress2);
            addOp2.execute();
            queue5.save();
        }).toThrow();
    });
});
