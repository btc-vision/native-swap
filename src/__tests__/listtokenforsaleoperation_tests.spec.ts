import {
    clearCachedProviders,
    clearPendingStakingContractAmount,
    getPendingStakingContractAmount,
    getProvider,
    Provider,
} from '../models/Provider';
import { Blockchain, TransactionOutput, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    ITestLiquidityQueue,
    providerAddress1,
    receiverAddress1,
    receiverAddress1CSV,
    receiverAddress2CSV,
    setBlockchainEnvironment,
    TestListTokenForSaleOperation,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../managers/FeeManager';
import {
    INITIAL_FEE_COLLECT_ADDRESS,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
} from '../constants/Contract';

function getLiquidityQueue(): ITestLiquidityQueue {
    const createQueueResult = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

    const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

    // Set initial state
    queue.virtualSatoshisReserve = 1000000;
    queue.virtualTokenReserve = u256.fromU64(1000000);
    queue.lastVirtualUpdateBlock = 0;

    // Reset accumulators
    queue.totalTokensSellActivated = u256.Zero;
    queue.totalTokensExchangedForSatoshis = u256.Zero;
    queue.totalSatoshisExchangedForTokens = 0;

    setBlockchainEnvironment(100);

    return queue;
}

function getTestProvider(): Provider {
    const provider: Provider = createProvider(
        providerAddress1,
        tokenAddress1,
        false,
        false,
        false,
        receiverAddress2CSV,
        u128.Zero,
        u128.fromU64(1000000),
    );
    provider.save();

    return provider;
}

describe('ListTokenForSaleOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        Blockchain.mockValidateBitcoinAddressResult(true);
        TransferHelper.clearMockedResults();
    });

    describe('ListTokenForSaleOperation pre conditions', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            Blockchain.mockValidateBitcoinAddressResult(true);
            TransferHelper.clearMockedResults();
        });

        it('should revert if the receiver address is invalid', () => {
            expect(() => {
                Blockchain.mockValidateBitcoinAddressResult(false);
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();
                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if use priority queue and not enough fees collected', () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();
                const txOut: TransactionOutput[] = [];
                txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
                txOut.push(new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 100));
                Blockchain.mockTransactionOutput(txOut);
                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.markPriority();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    true,
                );

                operation.execute();
            }).toThrow();
        });

        it('should not revert if use priority queue and enough fees collected', () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();

                const txOut: TransactionOutput[] = [];
                txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
                txOut.push(
                    new TransactionOutput(
                        1,
                        0,
                        null,
                        INITIAL_FEE_COLLECT_ADDRESS,
                        FeeManager.priorityQueueBaseFee,
                    ),
                );
                Blockchain.mockTransactionOutput(txOut);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();
                provider.setLiquidityAmount(u128.Zero);

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.setLiquidity(u256.fromU64(1000000000000000));
                queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000);
                queue.liquidityQueue.virtualSatoshisReserve = 1000000000000000;

                expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
                expect(provider.isPriority()).toBeFalsy();

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(10000),
                    receiverAddress1,
                    receiverAddress1CSV,
                    true,
                    false,
                );

                operation.execute();
            }).not.toThrow();
        });

        it('should revert when amount in = 0', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    u256.fromU64(111),
                    u128.Zero,
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert on liquidity overflow', () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.setLiquidityAmount(u128.Max);

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider is priority but not using priority queue', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.markPriority();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider already providing liquidity', () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.allowLiquidityProvision();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if not initialLiquidity and queue.quote = 0', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.virtualTokenReserve = u256.Zero;

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if not initialLiquidity and initial provider already set', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.initialLiquidityProviderId = provider.getId();
                queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000000);
                queue.liquidityQueue.virtualSatoshisReserve = 1000;

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if not initialLiquidity and amount in satoshis < MINIMUM', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.virtualTokenReserve = u256.fromU64(10000000000000);
                queue.liquidityQueue.virtualSatoshisReserve = 1000;

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider has active reservation', () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.addToReservedAmount(u128.fromU32(100000));

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider is in purge queue', () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.markPurged();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider is fulfilled(toreset)', () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.markToReset();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });
    });

    describe('ListTokenForSaleOperation execute', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            Blockchain.mockValidateBitcoinAddressResult(true);
            TransferHelper.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should transfer token from user to contract', () => {
            setBlockchainEnvironment(100);
            FeeManager.onDeploy();

            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
            txOut.push(
                new TransactionOutput(
                    1,
                    0,
                    null,
                    INITIAL_FEE_COLLECT_ADDRESS,
                    FeeManager.priorityQueueBaseFee,
                ),
            );
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.setLiquidity(u256.fromU64(1000000000000000));
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000);
            queue.liquidityQueue.virtualSatoshisReserve = 1000000000000000;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                true,
                false,
            );

            operation.execute();

            expect(TransferHelper.transferFromCalled).toBeTruthy();
        });

        it("should revert if provider don't have liquidity but still marked as priority", () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();

                const txOut: TransactionOutput[] = [];
                txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
                txOut.push(
                    new TransactionOutput(
                        1,
                        0,
                        null,
                        INITIAL_FEE_COLLECT_ADDRESS,
                        FeeManager.priorityQueueBaseFee,
                    ),
                );
                Blockchain.mockTransactionOutput(txOut);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.markPriority();
                provider.setLiquidityAmount(u128.Zero);

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
                queue.liquidityQueue.virtualSatoshisReserve = 100;

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100000000),
                    receiverAddress1,
                    receiverAddress1CSV,
                    true,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should not allow to switch queue if provider still hold liquidity', () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();

                const txOut: TransactionOutput[] = [];
                txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
                txOut.push(
                    new TransactionOutput(
                        1,
                        0,
                        null,
                        INITIAL_FEE_COLLECT_ADDRESS,
                        FeeManager.priorityQueueBaseFee,
                    ),
                );
                Blockchain.mockTransactionOutput(txOut);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
                queue.liquidityQueue.virtualSatoshisReserve = 100;

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100000000),
                    receiverAddress1,
                    receiverAddress1CSV,
                    true,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should activate, add to priority queue and mark as priority when not for initial liquidity', () => {
            setBlockchainEnvironment(100);
            FeeManager.onDeploy();

            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
            txOut.push(
                new TransactionOutput(
                    1,
                    0,
                    null,
                    INITIAL_FEE_COLLECT_ADDRESS,
                    FeeManager.priorityQueueBaseFee,
                ),
            );
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.setLiquidity(u256.fromU64(1000000000000000));
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000);
            queue.liquidityQueue.virtualSatoshisReserve = 1000000000000000;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                true,
                false,
            );

            operation.execute();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeTruthy();
            expect(queue.providerManager.priorityQueueLength).toStrictEqual(1);
        });

        it('should add the liquidity to the existing one and not re-add to the queue when listing tokens and there is already tokens listed in priority queue', () => {
            setBlockchainEnvironment(100);
            FeeManager.onDeploy();

            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
            txOut.push(
                new TransactionOutput(
                    1,
                    0,
                    null,
                    INITIAL_FEE_COLLECT_ADDRESS,
                    FeeManager.priorityQueueBaseFee,
                ),
            );
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.setLiquidity(u256.fromU64(1000000000000000));
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000);
            queue.liquidityQueue.virtualSatoshisReserve = 1000000000000000;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                true,
                false,
            );

            operation.execute();
            provider.save();
            queue.liquidityQueue.save();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeTruthy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(9700));
            expect(queue.providerManager.priorityQueueLength).toStrictEqual(1);
            const queueIndex = provider.getQueueIndex();

            setBlockchainEnvironment(104);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const provider2 = getProvider(provider.getId());

            const operation2 = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                provider2.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                true,
                false,
            );

            operation2.execute();
            provider2.save();
            queue2.liquidityQueue.save();

            expect(provider2.isActive()).toBeTruthy();
            expect(provider2.isPriority()).toBeTruthy();
            expect(provider2.getQueueIndex()).toStrictEqual(queueIndex);
            expect(provider2.getLiquidityAmount()).toStrictEqual(u128.fromU64(19400));
            expect(queue2.providerManager.priorityQueueLength).toStrictEqual(1);
        });

        it('should add the liquidity, re-add to the queue at a new index  when listing from priority queue as been purged', () => {
            setBlockchainEnvironment(100);
            FeeManager.onDeploy();

            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
            txOut.push(
                new TransactionOutput(
                    1,
                    0,
                    null,
                    INITIAL_FEE_COLLECT_ADDRESS,
                    FeeManager.priorityQueueBaseFee,
                ),
            );
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.setLiquidity(u256.fromU64(1000000000000000));
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000);
            queue.liquidityQueue.virtualSatoshisReserve = 1000000000000000;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                true,
                false,
            );

            operation.execute();
            provider.save();
            queue.liquidityQueue.save();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeTruthy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(9700));
            expect(queue.providerManager.priorityQueueLength).toStrictEqual(1);
            const queueIndex = provider.getQueueIndex();

            setBlockchainEnvironment(103);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const provider2 = getProvider(provider.getId());
            provider2.setLiquidityAmount(u128.Zero);
            provider2.clearPriority();
            provider2.save();
            queue2.providerManager.getPriorityQueue.setStartingIndex(3);
            queue2.providerManager.getPriorityQueue.save();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(104);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const provider3 = getProvider(provider.getId());

            const operation2 = new ListTokensForSaleOperation(
                queue3.liquidityQueue,
                provider3.getId(),
                u128.fromU64(1000),
                receiverAddress1,
                receiverAddress1CSV,
                true,
                false,
            );

            operation2.execute();
            provider3.save();

            queue3.liquidityQueue.save();
            expect(provider3.isActive()).toBeTruthy();
            expect(provider3.isPriority()).toBeTruthy();
            expect(provider3.getQueueIndex()).not.toStrictEqual(queueIndex);
            expect(provider3.getLiquidityAmount()).toStrictEqual(u128.fromU64(970));
            expect(queue3.providerManager.priorityQueueLength).toStrictEqual(2);
        });

        it('should add the liquidity to the existing one and not re-add to the queue when listing tokens and there is already tokens listed in normal queue', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.setLiquidity(u256.fromU64(1000000000000000));
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000);
            queue.liquidityQueue.virtualSatoshisReserve = 1000000000000000;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.execute();
            provider.save();
            queue.liquidityQueue.save();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(10000));
            expect(queue.providerManager.normalQueueLength).toStrictEqual(1);
            const queueIndex = provider.getQueueIndex();

            setBlockchainEnvironment(104);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const provider2 = getProvider(provider.getId());

            const operation2 = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                provider2.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation2.execute();
            provider2.save();
            queue2.liquidityQueue.save();

            expect(provider2.isActive()).toBeTruthy();
            expect(provider2.isPriority()).toBeFalsy();
            expect(provider2.getQueueIndex()).toStrictEqual(queueIndex);
            expect(provider2.getLiquidityAmount()).toStrictEqual(u128.fromU64(20000));
            expect(queue2.providerManager.normalQueueLength).toStrictEqual(1);
        });

        it('should add the liquidity, re-add to the queue at a new index when listing has been purged', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.setLiquidity(u256.fromU64(1000000000000000));
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000);
            queue.liquidityQueue.virtualSatoshisReserve = 1000000000000000;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.execute();
            provider.save();
            queue.liquidityQueue.save();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(10000));
            expect(queue.providerManager.normalQueueLength).toStrictEqual(1);
            const queueIndex = provider.getQueueIndex();

            setBlockchainEnvironment(103);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const provider2 = getProvider(provider.getId());
            provider2.setLiquidityAmount(u128.Zero);
            provider2.save();
            queue2.providerManager.getNormalQueue.setStartingIndex(3);
            queue2.providerManager.getNormalQueue.save();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(104);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const provider3 = getProvider(provider.getId());

            const operation2 = new ListTokensForSaleOperation(
                queue3.liquidityQueue,
                provider3.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation2.execute();
            provider3.save();
            queue3.liquidityQueue.save();
            expect(provider3.isActive()).toBeTruthy();
            expect(provider3.isPriority()).toBeFalsy();
            expect(provider3.getQueueIndex()).not.toStrictEqual(queueIndex);
            expect(provider3.getLiquidityAmount()).toStrictEqual(u128.fromU64(10000));
            expect(queue3.providerManager.normalQueueLength).toStrictEqual(2);
        });

        it('should activate, and add to normal queue when not for initial liquidity', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.setLiquidity(u256.fromU64(1000000000000000));
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000);
            queue.liquidityQueue.virtualSatoshisReserve = 1000000000000000;

            expect(queue.providerManager.normalQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.execute();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeFalsy();
            expect(queue.providerManager.normalQueueLength).toStrictEqual(1);
        });

        it('should active and not add to any queue if provider is initial liquidity', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(queue.providerManager.normalQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                true,
            );

            operation.execute();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeFalsy();
            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(queue.providerManager.normalQueueLength).toStrictEqual(0);
        });

        it('should increase provider liquidity with amount in', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU32(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                true,
            );

            operation.execute();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(100010000));
        });

        it('should assign listed at block number', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU32(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                true,
            );

            operation.execute();
            expect(provider.getListedTokenAtBlock()).toStrictEqual(100);
        });

        it('should assign btcReceiver if provider does not have reservation', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU32(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                true,
            );

            operation.execute();

            expect(provider.getBtcReceiver()).toStrictEqual(receiverAddress1CSV);
        });

        it('should revert if provider has reservation and btc receiver addresses differ', () => {
            setBlockchainEnvironment(100);

            expect(() => {
                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.deactivate();
                provider.clearPriority();
                provider.setLiquidityAmount(u128.fromU32(10000));
                provider.setReservedAmount(u128.fromU32(1000));

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
                queue.liquidityQueue.virtualSatoshisReserve = 100;

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100000000),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if btc receiver addresses is invalid', () => {
            setBlockchainEnvironment(100);

            expect(() => {
                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.deactivate();
                provider.clearPriority();
                provider.setLiquidityAmount(u128.fromU32(10000));

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
                queue.liquidityQueue.virtualSatoshisReserve = 100;

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100000000),
                    receiverAddress1,
                    'invalidfakeaddress',
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should update total reserve', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU32(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.Zero);

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                true,
            );

            operation.execute();

            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(100000000));
        });

        it('should deduct tax and apply slashing if priority queue', () => {
            setBlockchainEnvironment(100);
            FeeManager.onDeploy();

            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(0, 0, null, providerAddress1.toString(), 0));
            txOut.push(new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 100000));
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.markPriority();
            provider.setLiquidityAmount(u128.fromU32(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.setLiquidity(u256.fromU64(1000000000000000));
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000);
            queue.liquidityQueue.virtualSatoshisReserve = 1000000000000000;

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                true,
                false,
            );

            operation.execute();

            // Tax should be:300
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromU32(300));
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(19700));
            expect(queue.liquidityQueue.virtualTokenReserve).toStrictEqual(u256.fromU64(100005000));
            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(1000000000009700));
        });

        it('should apply slashing if normal queue', () => {
            setBlockchainEnvironment(100);
            FeeManager.onDeploy();

            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
            txOut.push(new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 100000));
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU32(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.setLiquidity(u256.fromU64(1000000000000000));
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(100000000);
            queue.liquidityQueue.virtualSatoshisReserve = 1000000000000000;

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(10000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.execute();

            expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(20000));
            expect(queue.liquidityQueue.virtualTokenReserve).toStrictEqual(u256.fromU64(100005000));
            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(1000000000010000));
        });

        it('should not apply slashing if initial liquidity', () => {
            setBlockchainEnvironment(100);
            FeeManager.onDeploy();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const initialProvider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                false,
                '3e3223e233e',
                u128.Zero,
                u128.Zero,
                u128.Zero,
                true,
                false,
            );
            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.save();

            queue.liquidityQueue.initializeInitialLiquidity(
                u256.fromU64(66666666666),
                initialProvider.getId(),
                u128.fromString(`1000000000000000000`),
                70,
            );

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                initialProvider.getId(),
                u128.fromString(`1000000000000000000`),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                true,
            );

            operation.execute();

            expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
            expect(initialProvider.getLiquidityAmount()).toStrictEqual(
                u128.fromString(`1000000000000000000`),
            );
            expect(queue.liquidityQueue.virtualTokenReserve).toStrictEqual(
                u256.fromString(`1000000000000000000`),
            );
            expect(queue.liquidityQueue.liquidity).toStrictEqual(
                u256.fromString(`1000000000000000000`),
            );
        });
    });

    describe('ListTokensForSaleOperation activateSlashing', () => {
        describe('Delta calculation and zero handling', () => {
            test('should not activate when deltaHalf is zero', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const provider: Provider = getTestProvider();

                // Set oldLiquidity and amountIn such that deltaHalf becomes zero
                provider.setLiquidityAmount(u128.fromU64(1000000));
                const operation: TestListTokenForSaleOperation = new TestListTokenForSaleOperation(
                    queue,
                    provider.getId(),
                    u128.Zero, // amountIn = 0, so deltaHalf will be 0
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                const initialTokens = queue.totalTokensSellActivated;

                operation.callActivateSlashing();

                expect(queue.totalTokensSellActivated).toBe(initialTokens);
                expect(queue.updateCalled()).toBeFalsy();
                expect(queue.purgeCalled()).toBeFalsy();
            });

            test('should calculate deltaHalf correctly', () => {
                const initialVirtualTokenReserve: u256 = u256.fromU64(100000000);
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                queue.virtualSatoshisReserve = 100000000;
                queue.virtualTokenReserve = initialVirtualTokenReserve;

                const provider: Provider = getTestProvider();
                provider.setLiquidityAmount(u128.fromU64(1000000));
                provider.save();

                const operation = new TestListTokenForSaleOperation(
                    queue,
                    provider.getId(),
                    u128.fromU64(1000000), // amountIn - will double the liquidity
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.callActivateSlashing();

                // oldLiquidity = 1M, newTotal = 2M
                // half(1M) = 500000, half(2M) = 1M
                // deltaHalf = 500000
                // initialVirtualTokenReserve + deltahalf = 100500000
                const expectedDelta = u256.fromU64(500000);
                expect(queue.virtualTokenReserve).toStrictEqual(
                    u256.add(initialVirtualTokenReserve, expectedDelta),
                );
            });

            test('should handle odd numbers in half calculation', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const provider: Provider = getTestProvider();
                const initialVirtualTokenReserve: u256 = queue.virtualTokenReserve;

                provider.setLiquidityAmount(u128.fromU64(999));
                const operation: TestListTokenForSaleOperation = new TestListTokenForSaleOperation(
                    queue,
                    provider.getId(),
                    u128.fromU64(1000),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.callActivateSlashing();

                // half(999) = 500 (499 + 1), half(1999) = 1000 (999 + 1)
                // deltaHalf = 500
                const expectedDelta = u256.fromU64(500);
                expect(queue.virtualTokenReserve).toStrictEqual(
                    u256.add(initialVirtualTokenReserve, expectedDelta),
                );
            });
        });
    });

    describe('Price impact validation', () => {
        test('should throw when immediate price impact exceeds MAX_PRICE_IMPACT_BPS', () => {
            expect(() => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const provider: Provider = getTestProvider();

                queue.virtualSatoshisReserve = 100000; // Small pool
                queue.virtualTokenReserve = u256.fromU64(100000);
                provider.setLiquidityAmount(u128.Zero);

                const operation = new TestListTokenForSaleOperation(
                    queue,
                    provider.getId(),
                    u128.fromU64(100000), // Large addition relative to pool
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.activateSlashing();
            }).toThrow('NATIVE_SWAP: Listing this amount of token would devalue tokens');
        });

        test('should pass when price impact is within limits', () => {
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            const initialVirtualTokenReserve: u256 = u256.fromU64(10000000);
            queue.virtualSatoshisReserve = 10000000; // Large pool
            queue.virtualTokenReserve = initialVirtualTokenReserve;
            provider.setLiquidityAmount(u128.fromU64(1000000));

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(10000), // Small addition
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.callActivateSlashing();

            expect(queue.virtualTokenReserve).toBeGreaterThan(initialVirtualTokenReserve);
            expect(queue.updateCalled()).toBeTruthy();
        });
    });

    describe('Minimum satoshi reserve validation', () => {
        test('should throw when new satoshi reserve would fall below minimum', () => {
            expect(() => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const provider: Provider = getTestProvider();
                const initialVirtualTokenReserve: u256 = u256.fromU64(100100000);
                queue.virtualSatoshisReserve = 100100;
                queue.virtualTokenReserve = initialVirtualTokenReserve;
                provider.setLiquidityAmount(u128.Zero);

                const operation = new TestListTokenForSaleOperation(
                    queue,
                    provider.getId(),
                    u128.fromU64(200202),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.callActivateSlashing();
            }).toThrow(
                'NATIVE_SWAP: Listing this amount of token would push satoshi reserves too low',
            );
        });

        test('should pass when satoshi reserve stays above minimum', () => {
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            const initialVirtualTokenReserve: u256 = u256.fromU64(10000000);
            queue.virtualSatoshisReserve = 10000000; // Well above minimum
            queue.virtualTokenReserve = initialVirtualTokenReserve;

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(500000), // amountIn
                receiverAddress1,
                receiverAddress1CSV,
                false, // usePriorityQueue
                false, // isForInitialLiquidity
            );

            operation.callActivateSlashing();

            expect(queue.virtualTokenReserve).toBeGreaterThan(initialVirtualTokenReserve);
        });
    });

    describe('Cumulative impact with pending operations', () => {
        test('should throw when cumulative impact exceeds MAX_CUMULATIVE_IMPACT_BPS', () => {
            expect(() => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const provider: Provider = getTestProvider();
                const initialVirtualTokenReserve: u256 = u256.fromU64(1000000);
                queue.totalTokensSellActivated = u256.fromU64(5000000); // Existing pending
                queue.virtualSatoshisReserve = 1000000;
                queue.virtualTokenReserve = initialVirtualTokenReserve;
                provider.setLiquidityAmount(u128.Zero);

                const operation = new TestListTokenForSaleOperation(
                    queue,
                    provider.getId(),
                    u128.fromU64(400000),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.callActivateSlashing();
            }).toThrow('NATIVE_SWAP: Cumulative token devaluation too high');
        });

        test('should consider both new and pending sells in cumulative check', () => {
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            const initialVirtualTokenReserve: u256 = u256.fromU64(10000000);
            queue.totalTokensSellActivated = u256.fromU64(100000);
            queue.virtualSatoshisReserve = 10000000;
            queue.virtualTokenReserve = initialVirtualTokenReserve;

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(500000), // amountIn
                receiverAddress1,
                receiverAddress1CSV,
                false, // usePriorityQueue
                false, // isForInitialLiquidity
            );

            operation.callActivateSlashing();

            // Should add to existing pending
            expect(queue.virtualTokenReserve.toU64()).toBeGreaterThan(100000);
        });
    });

    describe('Pool drainage and overflow checks', () => {
        test('should throw when pending buys would drain the pool', () => {
            expect(() => {
                // Set up scenario where pending buys >= future token reserves after sells
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const provider: Provider = getTestProvider();
                const initialVirtualTokenReserve: u256 = u256.fromU64(1000000);
                queue.virtualSatoshisReserve = 1000000; // 0.01 BTC
                queue.virtualTokenReserve = initialVirtualTokenReserve;
                queue.setLiquidity(u256.Zero);

                // Set pending buys that would drain the pool after we add tokens
                queue.totalTokensExchangedForSatoshis = u256.fromU64(1100000); // More than current reserves

                provider.setLiquidityAmount(u128.Zero);

                const operation = new TestListTokenForSaleOperation(
                    queue,
                    provider.getId(),
                    u128.fromU64(200000), // deltaHalf = 100,000
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                // After adding deltaHalf: futureT = 1M + 100k = 1.1M
                // Pending buys = 1.1M, which equals futureT (would drain completely)

                operation.callActivateSlashing();
            }).toThrow('NATIVE_SWAP: Pool would be drained by pending operations');
        });

        test('should throw when operation would cause overflow after pending buys', () => {
            expect(() => {
                // Set up scenario where applying pending buys after sells would cause B > MAX_TOTAL_SATOSHIS
                const maxSatoshis = u256.fromU64(21000000_00000000); // 21M BTC in satoshis

                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const provider: Provider = getTestProvider();
                const initialVirtualTokenReserve: u256 = u256.fromU64(100);

                // Start with high B and low T
                queue.virtualSatoshisReserve = maxSatoshis.toU64() - 100000;
                queue.virtualTokenReserve = initialVirtualTokenReserve;
                queue.setLiquidity(u256.Zero);

                // Set pending buys that would push B over max
                queue.totalTokensExchangedForSatoshis = u256.fromU64(98);

                provider.setLiquidityAmount(u128.Zero);

                const operation = new TestListTokenForSaleOperation(
                    queue,
                    provider.getId(),
                    u128.fromU64(10),
                    receiverAddress1,
                    receiverAddress1CSV,
                    false,
                    false,
                );

                operation.callActivateSlashing();
            }).toThrow('NATIVE_SWAP: Listing this amount of token would cause pool overflow');
        });

        test('should handle pending buys within safe limits', () => {
            // Set up scenario where pending buys are present but safe
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            const initialVirtualTokenReserve: u256 = u256.fromU64(10000000);
            queue.virtualSatoshisReserve = 10000000; // 0.1 BTC
            queue.virtualTokenReserve = initialVirtualTokenReserve;
            queue.setLiquidity(u256.Zero);

            // Moderate pending buys that won't cause issues
            queue.totalTokensExchangedForSatoshis = u256.fromU64(100000); // 1% of pool

            provider.setLiquidityAmount(u128.fromU64(1000000));

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(1000000), // Safe amount
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            // Should complete without throwing
            operation.callActivateSlashing();

            expect(queue.virtualTokenReserve).toBeGreaterThan(u256.Zero);
            expect(queue.updateCalled()).toBeTruthy();
        });
    });

    describe('BTC contribution tracking', () => {
        test('should track BTC contribution when quote is non-zero', () => {
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            const initialContribution = provider.getVirtualBTCContribution();

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(500000), // amountIn
                receiverAddress1,
                receiverAddress1CSV,
                false, // usePriorityQueue
                false, // isForInitialLiquidity
            );

            operation.callActivateSlashing();

            const newContribution = provider.getVirtualBTCContribution();
            expect(newContribution).toBeGreaterThan(initialContribution);
        });

        test('should calculate BTC value correctly based on amountIn', () => {
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            provider.setVirtualBTCContribution(1000);
            provider.setLiquidityAmount(u128.fromU64(500000));
            queue.virtualSatoshisReserve = 10000000;
            queue.virtualTokenReserve = u256.fromU64(10000000);
            queue.setLiquidity(u256.Zero);

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(1000000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.callActivateSlashing();

            const contribution = provider.getVirtualBTCContribution();
            expect(contribution).toStrictEqual(1001001);
        });
    });

    describe('Queue impact calculations', () => {
        test('should calculate queue impact using harmonic mean formula', () => {
            // Set up larger pool to avoid price impact issues with new constants
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            queue.virtualSatoshisReserve = 10000000; // 0.1 BTC
            queue.virtualTokenReserve = u256.fromU64(10000000); // 1:1 ratio
            queue.setLiquidity(u256.fromU64(500000)); // Queue liquidity for impact calculation

            provider.setLiquidityAmount(u128.fromU64(100000));

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(200000), // Small enough to avoid price impact issues
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.callActivateSlashing();

            // Verify operation completed with queue impact considered
            expect(queue.virtualTokenReserve).toBeGreaterThan(u256.fromU64(10000000));
            expect(queue.updateCalled()).toBeTruthy();
        });

        test('should return zero impact when queued tokens is zero', () => {
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            queue.virtualSatoshisReserve = 10000000; // 0.1 BTC
            queue.virtualTokenReserve = u256.fromU64(10000000);
            queue.setLiquidity(u256.Zero);

            provider.setLiquidityAmount(u128.fromU64(100000));

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(200000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.callActivateSlashing();

            // Should complete successfully with no queue impact
            expect(queue.virtualTokenReserve).toBeGreaterThan(u256.fromU64(10000000));
            expect(queue.updateCalled()).toBeTruthy();
        });

        test('should handle large queue liquidity values', () => {
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            queue.virtualSatoshisReserve = 100000000; // 1 BTC (larger pool)
            queue.virtualTokenReserve = u256.fromU64(100000000);
            queue.setLiquidity(u256.fromU64(10000000));

            provider.setLiquidityAmount(u128.fromU64(1000000));

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(2000000), // Moderate amount relative to large pool
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.callActivateSlashing();

            // Should handle large values without overflow or errors
            expect(queue.virtualTokenReserve).toBeGreaterThan(u256.fromU64(100000000));
            expect(queue.updateCalled()).toBeTruthy();
        });
    });

    describe('Integration with queue methods', () => {
        test('should call updateVirtualPoolIfNeeded after adding to sells', () => {
            // Use larger pool to avoid price impact issues
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            queue.virtualSatoshisReserve = 10000000; // 0.1 BTC
            queue.virtualTokenReserve = u256.fromU64(10000000);
            queue.setLiquidity(u256.Zero);

            provider.setLiquidityAmount(u128.fromU64(100000));

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(200000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.callActivateSlashing();

            expect(queue.updateCalled()).toBeTruthy();
        });

        test('should call purgeReservationsAndRestoreProviders with updated quote', () => {
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();

            queue.virtualSatoshisReserve = 10000000; // 0.1 BTC
            queue.virtualTokenReserve = u256.fromU64(10000000);
            queue.setLiquidity(u256.Zero);

            provider.setLiquidityAmount(u128.fromU64(100000));

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(200000),
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.callActivateSlashing();

            expect(queue.purgeCalled()).toBeTruthy();
        });

        test('should increase totalTokensSellActivated by correct amount', () => {
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            queue.virtualSatoshisReserve = 10000000; // 0.1 BTC
            queue.virtualTokenReserve = u256.fromU64(10000000);
            queue.setLiquidity(u256.Zero);

            provider.setLiquidityAmount(u128.fromU64(1000000));

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(1000000), // amountIn = 1M
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            const initialActivated = queue.virtualTokenReserve;
            operation.callActivateSlashing();

            const expected = u256.add(initialActivated, u256.fromU64(500000));
            expect(queue.virtualTokenReserve).toStrictEqual(expected);
        });
    });

    describe('Half function behavior', () => {
        test('should correctly calculate half for even numbers', () => {
            // Use larger pool to avoid price impact issues
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            queue.virtualSatoshisReserve = 10000000; // 0.1 BTC
            queue.virtualTokenReserve = u256.fromU64(10000000);
            queue.setLiquidity(u256.Zero);

            provider.setLiquidityAmount(u128.fromU64(1000));

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(1000), // Total will be 2000 (even)
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.callActivateSlashing();

            // oldLiquidity = 1000, newTotal = 2000
            // half(1000) = 500, half(2000) = 1000
            // deltaHalf = 1000 - 500 = 500
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(10000500));
        });

        test('should correctly calculate half for odd numbers with rounding', () => {
            // Use larger pool to avoid price impact issues
            const queue: ITestLiquidityQueue = getLiquidityQueue();
            const provider: Provider = getTestProvider();
            queue.virtualSatoshisReserve = 10000000; // 0.1 BTC
            queue.virtualTokenReserve = u256.fromU64(10000000);
            queue.setLiquidity(u256.Zero);

            provider.setLiquidityAmount(u128.fromU64(999));

            const operation = new TestListTokenForSaleOperation(
                queue,
                provider.getId(),
                u128.fromU64(1002), // Total will be 2001 (odd)
                receiverAddress1,
                receiverAddress1CSV,
                false,
                false,
            );

            operation.callActivateSlashing();

            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(10000501));
        });
    });
});
