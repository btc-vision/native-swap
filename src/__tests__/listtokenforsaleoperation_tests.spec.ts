import { clearCachedProviders } from '../lib/Provider';
import { Blockchain, TransactionOutput, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createProvider,
    providerAddress1,
    receiverAddress1,
    setBlockchainEnvironment,
    TestLiquidityQueue,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import { ListTokensForSaleOperation } from '../lib/Liquidity/operations/ListTokensForSaleOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../lib/FeeManager';
import { FEE_COLLECT_SCRIPT_PUBKEY } from '../utils/OrderBookUtils';

describe('ListTokenForSaleOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('should revert on amountIn = 0', () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new ListTokensForSaleOperation(
                queue,
                u256.fromU64(111),
                u128.Zero,
                receiverAddress1,
                false,
                false,
            );

            operation.execute();
        }).toThrow();
    });

    it('should revert on overflow if oldLiquidity + amountIn > u128.Max', () => {
        expect(() => {
            setBlockchainEnvironment(100);
            FeeManager.onDeploy();

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.liquidity = u128.Max;

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new ListTokensForSaleOperation(
                queue,
                provider.providerId,
                u128.fromU64(100),
                receiverAddress1,
                false,
                false,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider is priority but usePriorityQueue=false => 'You already have an active position...'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(true, true);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new ListTokensForSaleOperation(
                queue,
                provider.providerId,
                u128.fromU64(100),
                receiverAddress1,
                false,
                false,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if !initialLiquidity and queue.quote=0 => 'Quote is zero'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(true, false);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.virtualTokenReserve = u256.Zero;

            const operation = new ListTokensForSaleOperation(
                queue,
                provider.providerId,
                u128.fromU64(100),
                receiverAddress1,
                false,
                false,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if !initialLiquidity and providerId= lq.initialLiquidityProvider => 'Initial provider can only add once'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(true, false);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.initialLiquidityProvider = provider.providerId;
            queue.virtualTokenReserve = u256.fromU64(100000000000);
            queue.virtualBTCReserve = u256.fromU64(1000);

            const operation = new ListTokensForSaleOperation(
                queue,
                provider.providerId,
                u128.fromU64(100),
                receiverAddress1,
                false,
                false,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if !initialLiquidity and liquidityInSatoshis < MINIMUM => 'Liquidity value is too low'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(true, false);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.virtualTokenReserve = u256.fromU64(10000000000000);
            queue.virtualBTCReserve = u256.fromU64(1000);

            const operation = new ListTokensForSaleOperation(
                queue,
                provider.providerId,
                u128.fromU64(100),
                receiverAddress1,
                false,
                false,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if oldLiquidity!=0, usePriorityQueue!= provider.isPriority => 'You must cancel your listings...'", () => {
        expect(() => {
            setBlockchainEnvironment(100);
            FeeManager.onDeploy();

            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(0, `random address`, 0));
            txOut.push(
                new TransactionOutput(
                    1,
                    FEE_COLLECT_SCRIPT_PUBKEY,
                    FeeManager.PRIORITY_QUEUE_BASE_FEE,
                ),
            );
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(true, false);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.virtualTokenReserve = u256.fromU64(1000000);
            queue.virtualBTCReserve = u256.fromU64(100);

            const operation = new ListTokensForSaleOperation(
                queue,
                provider.providerId,
                u128.fromU64(100000000),
                receiverAddress1,
                true,
                false,
            );

            operation.execute();
        }).toThrow();
    });

    it('should setActive and addToPriorityQueue if was normal => now priority', () => {
        setBlockchainEnvironment(100);
        FeeManager.onDeploy();

        const txOut: TransactionOutput[] = [];
        txOut.push(new TransactionOutput(0, `random address`, 0));
        txOut.push(
            new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, FeeManager.PRIORITY_QUEUE_BASE_FEE),
        );
        Blockchain.mockTransactionOutput(txOut);

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(true, false);
        provider.liquidity = u128.Zero;
        provider.liquidityProvided = u256.Zero;

        const queue = new TestLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.virtualTokenReserve = u256.fromU64(1000000);
        queue.virtualBTCReserve = u256.fromU64(100);

        expect(queue.getProviderManager().priorityQueueLength).toStrictEqual(0);
        expect(provider.isPriority()).toBeFalsy();

        const operation = new ListTokensForSaleOperation(
            queue,
            provider.providerId,
            u128.fromU64(100000000),
            receiverAddress1,
            true,
            false,
        );

        operation.execute();

        expect(provider.isPriority()).toBeTruthy();
        expect(queue.getProviderManager().priorityQueueLength).toStrictEqual(1);
    });

    it('should setActive and add to priority queue if provider not active', () => {
        setBlockchainEnvironment(100);
        FeeManager.onDeploy();

        const txOut: TransactionOutput[] = [];
        txOut.push(new TransactionOutput(0, `random address`, 0));
        txOut.push(
            new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, FeeManager.PRIORITY_QUEUE_BASE_FEE),
        );
        Blockchain.mockTransactionOutput(txOut);

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(false, false);
        provider.liquidity = u128.Zero;
        provider.liquidityProvided = u256.Zero;

        const queue = new TestLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.virtualTokenReserve = u256.fromU64(1000000);
        queue.virtualBTCReserve = u256.fromU64(100);

        expect(queue.getProviderManager().priorityQueueLength).toStrictEqual(0);
        expect(provider.isPriority()).toBeFalsy();
        expect(provider.isActive()).toBeFalsy();

        const operation = new ListTokensForSaleOperation(
            queue,
            provider.providerId,
            u128.fromU64(100000000),
            receiverAddress1,
            true,
            false,
        );

        operation.execute();

        expect(provider.isActive()).toBeTruthy();
        expect(provider.isPriority()).toBeTruthy();
        expect(queue.getProviderManager().priorityQueueLength).toStrictEqual(1);
    });

    it('should setActive and add to normal queue if provider not active', () => {
        setBlockchainEnvironment(100);

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(false, false);
        provider.liquidity = u128.Zero;
        provider.liquidityProvided = u256.Zero;

        const queue = new TestLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.virtualTokenReserve = u256.fromU64(1000000);
        queue.virtualBTCReserve = u256.fromU64(100);

        expect(queue.getProviderManager().standardQueueLength).toStrictEqual(0);
        expect(provider.isPriority()).toBeFalsy();
        expect(provider.isActive()).toBeFalsy();

        const operation = new ListTokensForSaleOperation(
            queue,
            provider.providerId,
            u128.fromU64(100000000),
            receiverAddress1,
            false,
            false,
        );

        operation.execute();

        expect(provider.isActive()).toBeTruthy();
        expect(provider.isPriority()).toBeFalsy();
        expect(queue.getProviderManager().standardQueueLength).toStrictEqual(1);
    });

    it('should setActive and not add to queue if provider not active and initial liquidity', () => {
        setBlockchainEnvironment(100);

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(false, false);
        provider.liquidity = u128.Zero;
        provider.liquidityProvided = u256.Zero;

        const queue = new TestLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.virtualTokenReserve = u256.fromU64(1000000);
        queue.virtualBTCReserve = u256.fromU64(100);

        expect(queue.getProviderManager().priorityQueueLength).toStrictEqual(0);
        expect(queue.getProviderManager().standardQueueLength).toStrictEqual(0);
        expect(provider.isPriority()).toBeFalsy();
        expect(provider.isActive()).toBeFalsy();

        const operation = new ListTokensForSaleOperation(
            queue,
            provider.providerId,
            u128.fromU64(100000000),
            receiverAddress1,
            false,
            true,
        );

        operation.execute();

        expect(provider.isActive()).toBeTruthy();
        expect(provider.isPriority()).toBeFalsy();
        expect(queue.getProviderManager().priorityQueueLength).toStrictEqual(0);
        expect(queue.getProviderManager().standardQueueLength).toStrictEqual(0);
    });

    it('should update provider.liquidity= oldLiquidity+ amountIn', () => {
        setBlockchainEnvironment(100);

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(false, false);
        provider.liquidity = u128.fromU32(10000);
        provider.liquidityProvided = u256.fromU32(10000);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.virtualTokenReserve = u256.fromU64(1000000);
        queue.virtualBTCReserve = u256.fromU64(100);

        const operation = new ListTokensForSaleOperation(
            queue,
            provider.providerId,
            u128.fromU64(100000000),
            receiverAddress1,
            false,
            true,
        );

        operation.execute();
        expect(provider.liquidity).toStrictEqual(u128.fromU64(100010000));
    });

    it("should revert if provider.reserved!=0 and addresses differ => 'Cannot change receiver address while reserved'", () => {
        setBlockchainEnvironment(100);

        expect(() => {
            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(false, false);
            provider.liquidity = u128.fromU32(10000);
            provider.liquidityProvided = u256.fromU32(10000);
            provider.reserved = u128.fromU32(1000);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.virtualTokenReserve = u256.fromU64(1000000);
            queue.virtualBTCReserve = u256.fromU64(100);

            const operation = new ListTokensForSaleOperation(
                queue,
                provider.providerId,
                u128.fromU64(100000000),
                receiverAddress1,
                false,
                true,
            );

            operation.execute();
        }).toThrow();
    });

    it('should set provider.btcReceiver if reserved=0', () => {
        setBlockchainEnvironment(100);

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(false, false);
        provider.liquidity = u128.fromU32(10000);
        provider.liquidityProvided = u256.fromU32(10000);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.virtualTokenReserve = u256.fromU64(1000000);
        queue.virtualBTCReserve = u256.fromU64(100);

        const operation = new ListTokensForSaleOperation(
            queue,
            provider.providerId,
            u128.fromU64(100000000),
            receiverAddress1,
            false,
            true,
        );

        operation.execute();

        expect(provider.btcReceiver).toStrictEqual(receiverAddress1);
    });

    it('should update total reserve => updateTotalReserve(...,true)', () => {
        setBlockchainEnvironment(100);

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(false, false);
        provider.liquidity = u128.fromU32(10000);
        provider.liquidityProvided = u256.fromU32(10000);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.virtualTokenReserve = u256.fromU64(1000000);
        queue.virtualBTCReserve = u256.fromU64(100);

        expect(queue.liquidity).toStrictEqual(u256.Zero);

        const operation = new ListTokensForSaleOperation(
            queue,
            provider.providerId,
            u128.fromU64(100000000),
            receiverAddress1,
            false,
            true,
        );

        operation.execute();

        expect(queue.liquidity).toStrictEqual(u256.fromU64(100000000));
    });

    it('should remove tax if usePriorityQueue => removeTax => calls ensureEnoughPriorityFees => revert if fees < cost', () => {
        setBlockchainEnvironment(100);
        FeeManager.onDeploy();

        const txOut: TransactionOutput[] = [];
        txOut.push(new TransactionOutput(0, `random address`, 0));
        txOut.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 10000));
        Blockchain.mockTransactionOutput(txOut);

        expect(() => {
            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(false, true);
            provider.liquidity = u128.fromU32(10000);
            provider.liquidityProvided = u256.fromU32(10000);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.virtualTokenReserve = u256.fromU64(1000000);
            queue.virtualBTCReserve = u256.fromU64(100);

            const operation = new ListTokensForSaleOperation(
                queue,
                provider.providerId,
                u128.fromU64(100000000),
                receiverAddress1,
                true,
                false,
            );

            operation.execute();
        }).toThrow();
    });

    it('should call buyTokens & updateTotalReserve(false) & safeTransfer to burn if newTax>0', () => {
        setBlockchainEnvironment(100);
        FeeManager.onDeploy();

        const txOut: TransactionOutput[] = [];
        txOut.push(new TransactionOutput(0, `random address`, 0));
        txOut.push(
            new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, FeeManager.PRIORITY_QUEUE_BASE_FEE),
        );
        Blockchain.mockTransactionOutput(txOut);

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(false, true);
        provider.liquidity = u128.fromU32(200000000);
        provider.liquidityProvided = u256.fromU32(200000000);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.virtualTokenReserve = u256.fromU64(1000000);
        queue.virtualBTCReserve = u256.fromU64(100);

        const operation = new ListTokensForSaleOperation(
            queue,
            provider.providerId,
            u128.fromU64(100000000),
            receiverAddress1,
            true,
            false,
        );

        operation.execute();

        expect(provider.liquidity).toStrictEqual(u128.fromU64(297000000));
        expect(queue.deltaBTCBuy).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensBuy).toStrictEqual(u256.fromU64(3000000));
        expect(queue.liquidity).toStrictEqual(u256.fromU64(97000000));
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
    });

    it('should call setBlockQuote, no revert => normal scenario', () => {
        setBlockchainEnvironment(100);
        FeeManager.onDeploy();

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(false, false);
        provider.liquidity = u128.fromU32(10000);
        provider.liquidityProvided = u256.fromU32(10000);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.virtualTokenReserve = u256.fromU64(1000000);
        queue.virtualBTCReserve = u256.fromU64(100);

        expect(queue.liquidity).toStrictEqual(u256.Zero);

        const operation = new ListTokensForSaleOperation(
            queue,
            provider.providerId,
            u128.fromU64(100000000),
            receiverAddress1,
            false,
            false,
        );

        operation.execute();

        expect(queue.getBlockQuote(100)).toStrictEqual(u256.fromU64(1000000000000));
    });
});
