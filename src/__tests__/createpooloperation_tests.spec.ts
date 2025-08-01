import { clearCachedProviders, getProvider } from '../models/Provider';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import {
    createLiquidityQueue,
    createProviderId,
    providerAddress1,
    receiverAddress1,
    setBlockchainEnvironment,
    testStackingContractAddress,
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

    describe('CreatePoolOperation pre conditions', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });

        it('should revert if receiver address is invalid', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(false);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    u256.fromU64(100),
                    u256.fromU64(100),
                    u128.fromU64(100),
                    'd9dhdh92hd923hd',
                    0,
                    u256.Zero,
                    5,
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if floorPrice=0', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    u256.Zero,
                    u256.fromU64(100),
                    u128.fromU64(100),
                    'd9dhdh92hd923hd',
                    0,
                    u256.Zero,
                    5,
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if initialLiquidity=0', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    u256.fromU64(100),
                    u256.fromU64(100),
                    u128.Zero,
                    'd9dhdh92hd923hd',
                    0,
                    u256.Zero,
                    5,
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if antibot settings not valid', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    u256.fromU64(100),
                    u256.fromU64(100),
                    u128.fromU64(100),
                    'd9dhdh92hd923hd',
                    10,
                    u256.Zero,
                    5,
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if initial liquidity provider is already set', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    u256.fromU64(100),
                    u256.fromU64(100),
                    u128.fromU64(100),
                    'd9dhdh92hd923hd',
                    0,
                    u256.Zero,
                    5,
                    testStackingContractAddress,
                );

                operation.execute();
                queue.liquidityQueue.save();

                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation2 = new CreatePoolOperation(
                    queue2.liquidityQueue,
                    u256.fromU64(100),
                    u256.fromU64(100),
                    u128.fromU64(100),
                    'd9dhdh92hd923hd',
                    0,
                    u256.Zero,
                    5,
                    testStackingContractAddress,
                );

                operation2.execute();
            }).toThrow();
        });

        it('should revert if maximum reservation percentage for 5 blocks is invalid', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    u256.fromU64(100),
                    u256.fromU64(100),
                    u128.fromU64(100000),
                    'd9dhdh92hd923hd',
                    0,
                    u256.Zero,
                    115,
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });
    });

    describe('CreatePoolOperation execute', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });
        it('should call correctly initialize the pool', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(providerAddress1, tokenAddress1);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CreatePoolOperation(
                queue.liquidityQueue,
                u256.fromU64(100),
                initialProviderId,
                u128.fromU64(1000000),
                receiverAddress1,
                10,
                u256.fromU32(20),
                5,
                testStackingContractAddress,
            );

            operation.execute();
            queue.liquidityQueue.save();

            // Reload queue and test
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const provider = getProvider(initialProviderId);

            expect(queue2.liquidityQueue.initialLiquidityProviderId).toStrictEqual(
                initialProviderId,
            );
            expect(queue2.liquidityQueue.virtualSatoshisReserve).toStrictEqual(10000);
            expect(queue2.liquidityQueue.virtualTokenReserve).toStrictEqual(u256.fromU64(1000000));
            expect(queue2.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(1000000));
            expect(queue2.liquidityQueue.maxReserves5BlockPercent).toStrictEqual(5);
            expect(queue2.liquidityQueue.antiBotExpirationBlock).toStrictEqual(110);
            expect(queue2.liquidityQueue.maxTokensPerReservation).toStrictEqual(u256.fromU64(20));
            expect(queue2.providerManager.normalQueueLength).toStrictEqual(0);
            expect(queue2.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(1000000));
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getBtcReceiver()).toStrictEqual(receiverAddress1);
            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeFalsy();
        });

        it('should set anti bot fields when anti bot is enabled', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CreatePoolOperation(
                queue.liquidityQueue,
                u256.fromU64(100),
                u256.fromU64(100),
                u128.fromU64(100),
                'd9dhdh92hd923hd',
                10,
                u256.fromU32(20),
                5,
                testStackingContractAddress,
            );

            operation.execute();

            expect(queue.liquidityQueue.antiBotExpirationBlock).toStrictEqual(100 + 10);
            expect(queue.liquidityQueue.maxTokensPerReservation).toStrictEqual(u256.fromU32(20));
        });

        it('should not set anti bot when anti bot is disabled', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CreatePoolOperation(
                queue.liquidityQueue,
                u256.fromU64(100),
                u256.fromU64(100),
                u128.fromU64(100),
                'd9dhdh92hd923hd',
                0,
                u256.fromU32(20),
                5,
                testStackingContractAddress,
            );

            operation.execute();

            expect(queue.liquidityQueue.antiBotExpirationBlock).toStrictEqual(0);
            expect(queue.liquidityQueue.maxTokensPerReservation).toStrictEqual(u256.Zero);
        });
    });
});
