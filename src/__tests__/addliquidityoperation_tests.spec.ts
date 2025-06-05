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
import { AddLiquidityOperation } from '../operations/AddLiquidityOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import {
    FEE_COLLECT_SCRIPT_PUBKEY,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
} from '../constants/Contract';
import { ProviderTypes } from '../types/ProviderTypes';
import { ReservationProviderData } from '../models/ReservationProdiverData';

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
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const operation = new AddLiquidityOperation(
                queue.liquidityQueue,
                queue.tradeManager,
                provider.getId(),
                'dkjoewjweoj',
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if reservation.reservedLP= false => 'You must reserve liquidity for LP first'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const reservation = createReservation(tokenAddress1, msgSender1);
            reservation.addProvider(
                new ReservationProviderData(0, u128.fromU64(1000), ProviderTypes.Normal, 100),
            );
            reservation.save();

            setBlockchainEnvironment(103);
            const provider = createProvider(providerAddress1, tokenAddress1);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const operation = new AddLiquidityOperation(
                queue.liquidityQueue,
                queue.tradeManager,
                provider.getId(),
                'dkjoewjweoj',
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if tokensBoughtFromQueue=0 || btcSpent=0 => 'No effective purchase made'", () => {
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
            const addOp = new AddLiquidityOperation(
                queue4.liquidityQueue,
                queue4.tradeManager,
                providerId2,
                receiverAddress2,
            );
            addOp.execute();
        }).toThrow();
    });

    it('should revert getActivationDelay=>0, createdAt=>current block number', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        expect(() => {
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
            const initialProvider = getProvider(initialProviderId);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000),
            );
            transactionOutput.push(
                new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

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

            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const addOp = new AddLiquidityOperation(
                queue4.liquidityQueue,
                queue4.tradeManager,
                providerId2,
                receiverAddress2,
            );
            addOp.execute();
        }).toThrow();
    });

    it('should revert getActivationDelay=>4, createdAt=>current block number', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        expect(() => {
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
            const initialProvider = getProvider(initialProviderId);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000),
            );
            transactionOutput.push(
                new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                20000000,
                u256.Zero,
                true,
                4,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(104, providerAddress2, providerAddress2);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const addOp = new AddLiquidityOperation(
                queue4.liquidityQueue,
                queue4.tradeManager,
                providerId2,
                receiverAddress2,
            );
            addOp.execute();
        }).toThrow();
    });

    it('should call safeTransferFrom', () => {
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
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        transactionOutput.push(
            new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
        );

        Blockchain.mockTransactionOutput(transactionOutput);

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
        const addOp = new AddLiquidityOperation(
            queue4.liquidityQueue,
            queue4.tradeManager,
            providerId2,
            receiverAddress2,
        );
        addOp.execute();

        expect(TransferHelper.safeTransferFromCalled).toBeTruthy();
    });

    it('should update liquidity queue and mark the provider as a LP', () => {
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
        const initialProvider = getProvider(initialProviderId);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
        transactionOutput.push(
            new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
        );

        Blockchain.mockTransactionOutput(transactionOutput);

        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue3.liquidityQueue,
            providerId2,
            providerAddress2,
            10000,
            u256.Zero,
            true,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp.execute();
        queue3.liquidityQueue.save();

        const provider2 = getProvider(providerId2);
        expect(provider2.isLiquidityProvider()).toBeFalsy();
        expect(provider2.getLiquidityProvided()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);
        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const addOp = new AddLiquidityOperation(
            queue4.liquidityQueue,
            queue4.tradeManager,
            providerId2,
            receiverAddress2,
        );
        addOp.execute();

        expect(TransferHelper.safeTransferFromCalled).toBeTruthy();
        expect(queue4.liquidityQueue.liquidity).toStrictEqual(
            u256.fromString('1000006666666666666666666'),
        );
        expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue4.liquidityQueue.virtualSatoshisReserve).toStrictEqual(1500010000);
        expect(queue4.liquidityQueue.virtualTokenReserve).toStrictEqual(
            u256.fromString('1000006666666666666666666'),
        );
        expect(queue4.liquidityQueue.getSatoshisOwed(providerId2)).toStrictEqual(10000);
        expect(provider2.isLiquidityProvider()).toBeTruthy();
        expect(provider2.getLiquidityProvided()).toStrictEqual(
            u128.fromString('6666666666666666666'),
        );
    });

    it('should update liquidity provided when already LP', () => {
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
        const initialProvider = getProvider(initialProviderId);
        const transactionOutput: TransactionOutput[] = [];

        transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
        transactionOutput.push(
            new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
        );

        Blockchain.mockTransactionOutput(transactionOutput);

        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp = new ReserveLiquidityOperation(
            queue3.liquidityQueue,
            providerId2,
            providerAddress2,
            10000,
            u256.Zero,
            true,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp.execute();
        queue3.liquidityQueue.save();

        const provider2 = getProvider(providerId2);
        expect(provider2.isLiquidityProvider()).toBeFalsy();
        expect(provider2.getLiquidityProvided()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);
        const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const addOp = new AddLiquidityOperation(
            queue4.liquidityQueue,
            queue4.tradeManager,
            providerId2,
            receiverAddress2,
        );
        addOp.execute();

        expect(TransferHelper.safeTransferFromCalled).toBeTruthy();
        expect(queue4.liquidityQueue.liquidity).toStrictEqual(
            u256.fromString('1000006666666666666666666'),
        );
        expect(queue4.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue4.liquidityQueue.virtualSatoshisReserve).toStrictEqual(1500010000);
        expect(queue4.liquidityQueue.virtualTokenReserve).toStrictEqual(
            u256.fromString('1000006666666666666666666'),
        );
        expect(queue4.liquidityQueue.getSatoshisOwed(providerId2)).toStrictEqual(10000);
        expect(provider2.isLiquidityProvider()).toBeTruthy();
        expect(provider2.getLiquidityProvided()).toStrictEqual(
            u128.fromString('6666666666666666666'),
        );

        setBlockchainEnvironment(103, providerAddress2, providerAddress2);
        const transactionOutput2: TransactionOutput[] = [];

        transactionOutput2.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
        transactionOutput2.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
        transactionOutput2.push(
            new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
        );

        Blockchain.mockTransactionOutput(transactionOutput2);

        const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const reserveOp2 = new ReserveLiquidityOperation(
            queue5.liquidityQueue,
            providerId2,
            providerAddress2,
            10000,
            u256.Zero,
            true,
            0,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        reserveOp2.execute();
        queue5.liquidityQueue.save();

        expect(provider2.isLiquidityProvider()).toBeTruthy();
        expect(provider2.getLiquidityProvided()).toStrictEqual(
            u128.fromString('6666666666666666666'),
        );

        setBlockchainEnvironment(104, providerAddress2, providerAddress2);
        const queue6 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const addOp2 = new AddLiquidityOperation(
            queue6.liquidityQueue,
            queue6.tradeManager,
            providerId2,
            receiverAddress2,
        );
        addOp2.execute();

        expect(TransferHelper.safeTransferFromCalled).toBeTruthy();
        expect(queue6.liquidityQueue.liquidity).toStrictEqual(
            u256.fromString('1000013333333333333333332'),
        );
        expect(queue6.liquidityQueue.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue6.liquidityQueue.virtualSatoshisReserve).toStrictEqual(1500020000);
        expect(queue6.liquidityQueue.virtualTokenReserve).toStrictEqual(
            u256.fromString('1000013333333333333333332'),
        );
        expect(queue6.liquidityQueue.getSatoshisOwed(providerId2)).toStrictEqual(20000);
        expect(provider2.isLiquidityProvider()).toBeTruthy();
        expect(provider2.getLiquidityProvided()).toStrictEqual(
            u128.fromString('13333333333333333332'),
        );
    });

    it('should not allow to add liquidity 2 times for the same reservation', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        expect(() => {
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
            const initialProvider = getProvider(initialProviderId);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 2000),
            );
            transactionOutput.push(
                new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 2000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                2000,
                u256.Zero,
                true,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            const provider2 = getProvider(providerId2);
            expect(provider2.isLiquidityProvider()).toBeFalsy();
            expect(provider2.getLiquidityProvided()).toStrictEqual(u128.Zero);

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const addOp = new AddLiquidityOperation(
                queue4.liquidityQueue,
                queue4.tradeManager,
                providerId2,
                receiverAddress2,
            );
            addOp.execute();
            queue4.liquidityQueue.save();

            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const addOp2 = new AddLiquidityOperation(
                queue5.liquidityQueue,
                queue5.tradeManager,
                providerId2,
                receiverAddress2,
            );
            addOp2.execute();
            queue5.liquidityQueue.save();
        }).toThrow();
    });
});
