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
    msgSender1,
    providerAddress1,
    providerAddress2,
    receiverAddress1,
    receiverAddress2,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { RemoveLiquidityOperation } from '../operations/RemoveLiquidityOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import { FEE_COLLECT_SCRIPT_PUBKEY } from '../constants/Contract';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { AddLiquidityOperation } from '../operations/AddLiquidityOperation';

describe('RemoveLiquidityOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it("should revert if provider is not a liquidity provider => 'Not a liquidity provider'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, false, false);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new RemoveLiquidityOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider is the initial provider => 'cannot remove liquidity'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, true, true);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.initialLiquidityProviderId = provider.getId();

            const operation = new RemoveLiquidityOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider has liquidity listed => 'You cannot remove... active listing'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, true, true);
            provider.setLiquidityAmount(u128.fromU32(1000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new RemoveLiquidityOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it("should revert if getSatoshisOwed(...)= 0 => 'You have no BTC owed'", () => {
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

            transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
            transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
            transactionOutput.push(
                new TransactionOutput(2, initialProvider.getBtcReceiver(), 12000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                12000,
                u256.Zero,
                true,
                0,
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
            queue4.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            queue5.liquidityQueue.setSatoshisOwed(providerId2, 0);
            const removeOp = new RemoveLiquidityOperation(queue5.liquidityQueue, providerId2);
            removeOp.execute();
            queue5.liquidityQueue.save();
        }).toThrow();
    });

    it("should revert if provider.pendingRemoval==true => 'already in removal queue'", () => {
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

            transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
            transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
            transactionOutput.push(
                new TransactionOutput(2, initialProvider.getBtcReceiver(), 12000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                12000,
                u256.Zero,
                true,
                0,
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
            queue4.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const removeOp = new RemoveLiquidityOperation(queue5.liquidityQueue, providerId2);
            removeOp.execute();
            queue5.liquidityQueue.save();
            const removeOp2 = new RemoveLiquidityOperation(queue5.liquidityQueue, providerId2);
            removeOp2.execute();
        }).toThrow();
    });

    it("should revert if liquidityProvided=0 => 'You have no tokens to remove'", () => {
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

            transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
            transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
            transactionOutput.push(
                new TransactionOutput(2, initialProvider.getBtcReceiver(), 12000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                12000,
                u256.Zero,
                true,
                0,
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
            queue4.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const provider2 = getProvider(providerId2);
            expect(provider2.getLiquidityProvided()).not.toStrictEqual(u128.Zero);

            provider2.setLiquidityProvided(u128.Zero);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const removeOp = new RemoveLiquidityOperation(queue5.liquidityQueue, providerId2);
            removeOp.execute();
            queue5.liquidityQueue.save();
        }).toThrow();
    });

    it('should succeed => transfer tokens to user, update totalReserve( false ), subtract from virtual reserves, set pendingRemoval, addToRemovalQueue, emit event', () => {
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

        transactionOutput.push(new TransactionOutput(0, 'fakeaddress', 0));
        transactionOutput.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
        transactionOutput.push(new TransactionOutput(2, initialProvider.getBtcReceiver(), 10000));

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
        queue4.liquidityQueue.save();

        setBlockchainEnvironment(103, providerAddress2, providerAddress2);
        const provider2 = getProvider(providerId2);

        expect(provider2.isPendingRemoval()).toBeFalsy();
        expect(provider2.getLiquidityProvided()).not.toStrictEqual(u128.Zero);

        const liquidityProvided = provider2.getLiquidityProvided();
        const liquidity = queue4.liquidityQueue.liquidity;
        const virtualTokenReserve = queue4.liquidityQueue.virtualTokenReserve;
        const virtualSatoshisReserve = queue4.liquidityQueue.virtualSatoshisReserve;
        const SatoshisOwed = queue4.liquidityQueue.getSatoshisOwed(providerId2);

        const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const removeOp = new RemoveLiquidityOperation(queue5.liquidityQueue, providerId2);
        removeOp.execute();
        queue5.liquidityQueue.save();

        expect(TransferHelper.safeTransferFromCalled).toBeTruthy();
        expect(queue5.providerManager.getFromRemovalQueue(0)).toStrictEqual(providerId2);
        expect(provider2.isPendingRemoval()).toBeTruthy();
        expect(provider2.getLiquidityProvided()).toStrictEqual(u128.Zero);
        expect(queue5.liquidityQueue.liquidity).toStrictEqual(
            SafeMath.sub(liquidity, liquidityProvided.toU256()),
        );
        expect(queue5.liquidityQueue.virtualTokenReserve).toStrictEqual(
            SafeMath.sub(virtualTokenReserve, liquidityProvided.toU256()),
        );
        expect(queue5.liquidityQueue.virtualSatoshisReserve).toStrictEqual(
            SafeMath.sub64(virtualSatoshisReserve, SatoshisOwed),
        );
    });
});
