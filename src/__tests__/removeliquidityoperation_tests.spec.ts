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
    msgSender1,
    providerAddress1,
    providerAddress2,
    receiverAddress1,
    receiverAddress2,
    setBlockchainEnvironment,
    TestLiquidityQueue,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import { RemoveLiquidityOperation } from '../lib/Liquidity/operations/RemoveLiquidityOperation';
import { u128, u256 } from '@btc-vision/as-bignum';
import { CreatePoolOperation } from '../lib/Liquidity/operations/CreatePoolOperation';
import { FEE_COLLECT_SCRIPT_PUBKEY } from '../utils/NativeSwapUtils';
import { ReserveLiquidityOperation } from '../lib/Liquidity/operations/ReserveLiquidityOperation';
import { AddLiquidityOperation } from '../lib/Liquidity/operations/AddLiquidityOperation';

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
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new RemoveLiquidityOperation(queue, provider.providerId);

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider is the initial provider => 'cannot remove liquidity'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, true, true);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.initialLiquidityProvider = provider.providerId;

            const operation = new RemoveLiquidityOperation(queue, provider.providerId);

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider has liquidity listed => 'You cannot remove... active listing'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, true, true);
            provider.liquidity = u128.fromU32(1000);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new RemoveLiquidityOperation(queue, provider.providerId);

            operation.execute();
        }).toThrow();
    });

    it("should revert if getBTCowed(...)= 0 => 'You have no BTC owed'", () => {
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
            transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 12000));

            Blockchain.mockTransactionOutput(transactionOutput);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3,
                providerId2,
                providerAddress2,
                u256.fromU64(12000),
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
            queue4.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const queue5 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            queue5.setBTCowed(providerId2, u256.Zero);
            const removeOp = new RemoveLiquidityOperation(queue5, providerId2);
            removeOp.execute();
            queue5.save();
        }).toThrow();
    });

    it("should revert if provider.pendingRemoval==true => 'already in removal queue'", () => {
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
            transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 12000));

            Blockchain.mockTransactionOutput(transactionOutput);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3,
                providerId2,
                providerAddress2,
                u256.fromU64(12000),
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
            queue4.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const queue5 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const removeOp = new RemoveLiquidityOperation(queue5, providerId2);
            removeOp.execute();
            queue5.save();
            const removeOp2 = new RemoveLiquidityOperation(queue5, providerId2);
            removeOp2.execute();
        }).toThrow();
    });

    it("should revert if liquidityProvided=0 => 'You have no tokens to remove'", () => {
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
            transactionOutput.push(new TransactionOutput(2, initialProvider.btcReceiver, 12000));

            Blockchain.mockTransactionOutput(transactionOutput);

            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue3,
                providerId2,
                providerAddress2,
                u256.fromU64(12000),
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
            queue4.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const provider2 = getProvider(providerId2);
            expect(provider2.liquidityProvided).not.toStrictEqual(u256.Zero);

            provider2.liquidityProvided = u256.Zero;
            const queue5 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const removeOp = new RemoveLiquidityOperation(queue5, providerId2);
            removeOp.execute();
            queue5.save();
        }).toThrow();
    });

    it('should succeed => transfer tokens to user, update totalReserve( false ), subtract from virtual reserves, set pendingRemoval, addToRemovalQueue, emit event', () => {
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

        setBlockchainEnvironment(102, providerAddress2, providerAddress2);
        const queue4 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const addOp = new AddLiquidityOperation(queue4, providerId2, receiverAddress2);
        addOp.execute();
        queue4.save();

        setBlockchainEnvironment(103, providerAddress2, providerAddress2);
        const provider2 = getProvider(providerId2);

        expect(provider2.pendingRemoval).toBeFalsy();
        expect(provider2.liquidityProvided).not.toStrictEqual(u256.Zero);

        const liquidityProvided = provider2.liquidityProvided;
        const liquidity = queue4.liquidity;
        const virtualTokenReserve = queue4.virtualTokenReserve;
        const virtualBTCReserve = queue4.virtualBTCReserve;
        const BTCOwed = queue4.getBTCowed(providerId2);

        const queue5 = new TestLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const removeOp = new RemoveLiquidityOperation(queue5, providerId2);
        removeOp.execute();
        queue5.save();

        expect(TransferHelper.safeTransferFromCalled).toBeTruthy();
        expect(queue5.getProviderManager().getFromRemovalQueue(0)).toStrictEqual(providerId2);
        expect(provider2.pendingRemoval).toBeTruthy();
        expect(provider2.liquidityProvided).toStrictEqual(u256.Zero);
        expect(queue5.liquidity).toStrictEqual(SafeMath.sub(liquidity, liquidityProvided));
        expect(queue5.virtualTokenReserve).toStrictEqual(
            SafeMath.sub(virtualTokenReserve, liquidityProvided),
        );
        expect(queue5.virtualBTCReserve).toStrictEqual(SafeMath.sub(virtualBTCReserve, BTCOwed));
    });
});
