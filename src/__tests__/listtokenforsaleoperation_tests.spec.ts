import { clearCachedProviders } from '../lib/Provider';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
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

describe('ListTokenForSaleOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
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
                true,
                false,
            );

            operation.execute();
        }).toThrow();
    });

    it('should revert on overflow if oldLiquidity + amountIn > u128.Max', () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.liquidity = u128.Max;

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new ListTokensForSaleOperation(
                queue,
                provider.providerId,
                u128.fromU64(100),
                receiverAddress1,
                true,
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

    it('should update provider.liquidity= oldLiquidity+ amountIn', () => {});

    it("should revert if provider.reserved!=0 and addresses differ => 'Cannot change receiver address while reserved'", () => {});

    it('should set provider.btcReceiver if reserved=0', () => {});

    it('should update total reserve => updateTotalReserve(...,true)', () => {});

    it('should remove tax if usePriorityQueue => removeTax => calls ensureEnoughPriorityFees => revert if fees < cost', () => {});

    it('should call buyTokens & updateTotalReserve(false) & safeTransfer to burn if newTax>0', () => {});

    it('should call setBlockQuote, no revert => normal scenario', () => {});
});
