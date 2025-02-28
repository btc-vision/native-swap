import { clearCachedProviders, getProvider } from '../lib/Provider';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { CreatePoolOperation } from '../lib/Liquidity/operations/CreatePoolOperation';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import {
    createProviderId,
    providerAddress1,
    receiverAddress1,
    setBlockchainEnvironment,
    TestLiquidityQueue,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

describe('CreatePoolOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should revert if receiver address is invalid', () => {
        setBlockchainEnvironment(100);
        Blockchain.mockValidateBitcoinAddressResult(false);

        expect(() => {
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CreatePoolOperation(
                queue,
                u256.fromU64(100),
                u256.fromU64(100),
                u128.fromU64(100),
                'd9dhdh92hd923hd',
                0,
                u256.Zero,
                5,
            );

            operation.execute();
        }).toThrow();
    });

    it('should revert if floorPrice=0', () => {
        setBlockchainEnvironment(100);
        Blockchain.mockValidateBitcoinAddressResult(true);

        expect(() => {
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CreatePoolOperation(
                queue,
                u256.Zero,
                u256.fromU64(100),
                u128.fromU64(100),
                'd9dhdh92hd923hd',
                0,
                u256.Zero,
                5,
            );

            operation.execute();
        }).toThrow();
    });

    it('should revert if initialLiquidity=0', () => {
        setBlockchainEnvironment(100);
        Blockchain.mockValidateBitcoinAddressResult(true);

        expect(() => {
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CreatePoolOperation(
                queue,
                u256.fromU64(100),
                u256.fromU64(100),
                u128.Zero,
                'd9dhdh92hd923hd',
                0,
                u256.Zero,
                5,
            );

            operation.execute();
        }).toThrow();
    });

    it('should revert if antiBotEnabledFor !=0 but antiBotMaximumTokensPerReservation=0', () => {
        setBlockchainEnvironment(100);
        Blockchain.mockValidateBitcoinAddressResult(true);

        expect(() => {
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CreatePoolOperation(
                queue,
                u256.fromU64(100),
                u256.fromU64(100),
                u128.fromU64(100),
                'd9dhdh92hd923hd',
                10,
                u256.Zero,
                5,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if p0 !=0 => 'Base quote already set'", () => {
        setBlockchainEnvironment(100);
        Blockchain.mockValidateBitcoinAddressResult(true);

        expect(() => {
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CreatePoolOperation(
                queue,
                u256.fromU64(100),
                u256.fromU64(100),
                u128.fromU64(100),
                'd9dhdh92hd923hd',
                0,
                u256.Zero,
                5,
            );

            operation.execute();
            queue.save();

            const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation2 = new CreatePoolOperation(
                queue2,
                u256.fromU64(100),
                u256.fromU64(100),
                u128.fromU64(100),
                'd9dhdh92hd923hd',
                0,
                u256.Zero,
                5,
            );

            operation2.execute();
        }).toThrow();
    });

    it('should call initializeInitialLiquidity and listTokensForSaleOp.execute to correctly initialize the pool', () => {
        setBlockchainEnvironment(100);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(providerAddress1, tokenAddress1);

        const queue = new TestLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const operation = new CreatePoolOperation(
            queue,
            u256.fromU64(100),
            initialProviderId,
            u128.fromU64(1000000),
            receiverAddress1,
            10,
            u256.fromU32(20),
            5,
        );

        operation.execute();
        queue.save();

        // Reload queue and test
        const queue2 = new TestLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const provider = getProvider(initialProviderId);

        expect(queue2.p0).toStrictEqual(u256.fromU64(100));
        expect(queue2.initialLiquidityProvider).toStrictEqual(initialProviderId);
        expect(queue2.virtualBTCReserve).toStrictEqual(u256.fromU64(10000));
        expect(queue2.virtualTokenReserve).toStrictEqual(u256.fromU64(1000000));
        expect(queue2.liquidity).toStrictEqual(u256.fromU64(1000000));
        expect(queue2.maxReserves5BlockPercent).toStrictEqual(5);
        expect(queue2.antiBotExpirationBlock).toStrictEqual(110);
        expect(queue2.maxTokensPerReservation).toStrictEqual(u256.fromU64(20));
        expect(queue2.getProviderManager().standardQueueLength).toStrictEqual(0);
        expect(queue2.getProviderManager().removalQueueLength).toStrictEqual(0);
        expect(queue2.getProviderManager().priorityQueueLength).toStrictEqual(0);
        expect(queue2.getBlockQuote(100)).toStrictEqual(u256.fromU64(10000000000));
        expect(provider.liquidity).toStrictEqual(u128.fromU64(1000000));
        expect(provider.reserved).toStrictEqual(u128.Zero);
        expect(provider.btcReceiver).toStrictEqual(receiverAddress1);
        expect(provider.isActive()).toBeTruthy();
        expect(provider.isPriority()).toBeFalsy();
    });

    it('should set antiBot fields if antiBotEnabledFor>0', () => {
        setBlockchainEnvironment(100);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const operation = new CreatePoolOperation(
            queue,
            u256.fromU64(100),
            u256.fromU64(100),
            u128.fromU64(100),
            'd9dhdh92hd923hd',
            10,
            u256.fromU32(20),
            5,
        );

        operation.execute();

        expect(queue.antiBotExpirationBlock).toStrictEqual(100 + 10);
        expect(queue.maxTokensPerReservation).toStrictEqual(u256.fromU32(20));
    });

    it('should not set antiBot fields if antiBotEnabledFor=0', () => {
        setBlockchainEnvironment(100);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const operation = new CreatePoolOperation(
            queue,
            u256.fromU64(100),
            u256.fromU64(100),
            u128.fromU64(100),
            'd9dhdh92hd923hd',
            0,
            u256.fromU32(20),
            5,
        );

        operation.execute();

        expect(queue.antiBotExpirationBlock).toStrictEqual(0);
        expect(queue.maxTokensPerReservation).toStrictEqual(u256.Zero);
    });
});
