import { clearCachedProviders, getProvider } from '../models/Provider';
import {
    Address,
    Blockchain,
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    providerAddress1,
    receiverAddress1,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../managers/FeeManager';
import { FEE_COLLECT_SCRIPT_PUBKEY, INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';

describe('ListTokenForSaleOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('ListTokenForSaleOperation pre conditions', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should revert if use priority queue and not enough fees collected', () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();
                const txOut: TransactionOutput[] = [];
                txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
                txOut.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 100));
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
                    Address.dead(),
                    true,
                    false,
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
                        FEE_COLLECT_SCRIPT_PUBKEY,
                        FeeManager.priorityQueueBaseFee,
                    ),
                );
                Blockchain.mockTransactionOutput(txOut);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();
                provider.setLiquidityAmount(u128.Zero);
                provider.setLiquidityProvided(u128.Zero);

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
                queue.liquidityQueue.virtualSatoshisReserve = 100;

                expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
                expect(provider.isPriority()).toBeFalsy();

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100000000),
                    receiverAddress1,
                    Address.dead(),
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
                    Address.dead(),
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
                    Address.dead(),
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
                    Address.dead(),
                    false,
                    false,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider is in the removal queue.', () => {
            expect(() => {
                setBlockchainEnvironment(100);
                FeeManager.onDeploy();

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.markPendingRemoval();

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100),
                    receiverAddress1,
                    Address.dead(),
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
                    Address.dead(),
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
                    Address.dead(),
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
                    Address.dead(),
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
                    Address.dead(),
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
            TransferHelper.clearMockedResults();
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
                    FEE_COLLECT_SCRIPT_PUBKEY,
                    FeeManager.priorityQueueBaseFee,
                ),
            );
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);
            provider.setLiquidityProvided(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
                true,
                false,
            );

            operation.execute();

            expect(TransferHelper.safeTransferFromCalled).toBeTruthy();
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
                        FEE_COLLECT_SCRIPT_PUBKEY,
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
                    Address.dead(),
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
                        FEE_COLLECT_SCRIPT_PUBKEY,
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
                    Address.dead(),
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
                    FEE_COLLECT_SCRIPT_PUBKEY,
                    FeeManager.priorityQueueBaseFee,
                ),
            );
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);
            provider.setLiquidityProvided(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
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
                    FEE_COLLECT_SCRIPT_PUBKEY,
                    FeeManager.priorityQueueBaseFee,
                ),
            );
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);
            provider.setLiquidityProvided(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
                true,
                false,
            );

            operation.execute();
            provider.save();
            queue.liquidityQueue.save();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeTruthy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(97000000));
            expect(queue.providerManager.priorityQueueLength).toStrictEqual(1);
            const queueIndex = provider.getQueueIndex();

            setBlockchainEnvironment(104);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const provider2 = getProvider(provider.getId());

            const operation2 = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                provider2.getId(),
                u128.fromU64(10000000000),
                receiverAddress1,
                Address.dead(),
                true,
                false,
            );

            operation2.execute();
            provider2.save();
            queue2.liquidityQueue.save();

            expect(provider2.isActive()).toBeTruthy();
            expect(provider2.isPriority()).toBeTruthy();
            expect(provider2.getQueueIndex()).toStrictEqual(queueIndex);
            expect(provider2.getLiquidityAmount()).toStrictEqual(u128.fromU64(9797000000));
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
                    FEE_COLLECT_SCRIPT_PUBKEY,
                    FeeManager.priorityQueueBaseFee,
                ),
            );
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);
            provider.setLiquidityProvided(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
                true,
                false,
            );

            operation.execute();
            provider.save();
            queue.liquidityQueue.save();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeTruthy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(97000000));
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
                u128.fromU64(10000000000),
                receiverAddress1,
                Address.dead(),
                true,
                false,
            );

            operation2.execute();
            provider3.save();
            queue3.liquidityQueue.save();
            expect(provider3.isActive()).toBeTruthy();
            expect(provider3.isPriority()).toBeTruthy();
            expect(provider3.getQueueIndex()).not.toStrictEqual(queueIndex);
            expect(provider3.getLiquidityAmount()).toStrictEqual(u128.fromU64(9700000000));
            expect(queue3.providerManager.priorityQueueLength).toStrictEqual(2);
        });

        it('should add the liquidity to the existing one and not re-add to the queue when listing tokens and there is already tokens listed in normal queue', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);
            provider.setLiquidityProvided(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
                false,
                false,
            );

            operation.execute();
            provider.save();
            queue.liquidityQueue.save();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(100000000));
            expect(queue.providerManager.normalQueueLength).toStrictEqual(1);
            const queueIndex = provider.getQueueIndex();

            setBlockchainEnvironment(104);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const provider2 = getProvider(provider.getId());

            const operation2 = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                provider2.getId(),
                u128.fromU64(10000000000),
                receiverAddress1,
                Address.dead(),
                false,
                false,
            );

            operation2.execute();
            provider2.save();
            queue2.liquidityQueue.save();

            expect(provider2.isActive()).toBeTruthy();
            expect(provider2.isPriority()).toBeFalsy();
            expect(provider2.getQueueIndex()).toStrictEqual(queueIndex);
            expect(provider2.getLiquidityAmount()).toStrictEqual(u128.fromU64(10100000000));
            expect(queue2.providerManager.normalQueueLength).toStrictEqual(1);
        });

        it('should add the liquidity, re-add to the queue at a new index when listing has been purged', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);
            provider.setLiquidityProvided(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            expect(queue.providerManager.priorityQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
                false,
                false,
            );

            operation.execute();
            provider.save();
            queue.liquidityQueue.save();

            expect(provider.isActive()).toBeTruthy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(100000000));
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
                u128.fromU64(10000000000),
                receiverAddress1,
                Address.dead(),
                false,
                false,
            );

            operation2.execute();
            provider3.save();
            queue3.liquidityQueue.save();
            expect(provider3.isActive()).toBeTruthy();
            expect(provider3.isPriority()).toBeFalsy();
            expect(provider3.getQueueIndex()).not.toStrictEqual(queueIndex);
            expect(provider3.getLiquidityAmount()).toStrictEqual(u128.fromU64(10000000000));
            expect(queue3.providerManager.normalQueueLength).toStrictEqual(2);
        });

        it('should activate, and add to normal queue when not for initial liquidity', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);
            provider.setLiquidityProvided(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            expect(queue.providerManager.normalQueueLength).toStrictEqual(0);
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
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
            provider.setLiquidityProvided(u128.Zero);

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
                Address.dead(),
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
            provider.setLiquidityProvided(u128.fromU32(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
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
            provider.setLiquidityProvided(u128.fromU32(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
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
                Address.dead(),
                false,
                true,
            );

            operation.execute();

            expect(provider.getBtcReceiver()).toStrictEqual(receiverAddress1);
        });

        it('should revert if provider has reservation and btc receiver addresses differ', () => {
            setBlockchainEnvironment(100);

            expect(() => {
                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.deactivate();
                provider.clearPriority();
                provider.setLiquidityAmount(u128.fromU32(10000));
                provider.setLiquidityProvided(u128.fromU32(10000));
                provider.setReservedAmount(u128.fromU32(1000));

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
                queue.liquidityQueue.virtualSatoshisReserve = 100;

                const operation = new ListTokensForSaleOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    u128.fromU64(100000000),
                    receiverAddress1,
                    Address.dead(),
                    false,
                    true,
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
            provider.setLiquidityProvided(u128.fromU32(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.Zero);

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
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
            txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
            txOut.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 100000));
            Blockchain.mockTransactionOutput(txOut);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.markPriority();
            provider.setLiquidityAmount(u128.fromU32(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(1000000);
            queue.liquidityQueue.virtualSatoshisReserve = 100;

            const operation = new ListTokensForSaleOperation(
                queue.liquidityQueue,
                provider.getId(),
                u128.fromU64(100000000),
                receiverAddress1,
                Address.dead(),
                true,
                false,
            );

            operation.execute();

            // Tax should be:3000000
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(97010000));
            expect(queue.liquidityQueue.virtualTokenReserve).toStrictEqual(u256.fromU64(54000000));
            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(97000000));
        });

        it('should apply slashing if normal queue', () => {
            setBlockchainEnvironment(100);
            FeeManager.onDeploy();

            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
            txOut.push(new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 100000));
            Blockchain.mockTransactionOutput(txOut);

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
                Address.dead(),
                false,
                false,
            );

            operation.execute();

            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(100010000));
            expect(queue.liquidityQueue.virtualTokenReserve).toStrictEqual(u256.fromU64(51000000));
            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(100000000));
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
                Address.dead(),
                false,
                true,
            );

            operation.execute();

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
});
