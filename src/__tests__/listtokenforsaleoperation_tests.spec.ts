import { clearCachedProviders } from '../models/Provider';
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
import { FEE_COLLECT_SCRIPT_PUBKEY } from '../constants/Contract';

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

        it('should deduct tax if priority queue', () => {
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
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(97010000));
            expect(queue.liquidityQueue.totalSatoshisExchangedForTokens).toStrictEqual(0);
            expect(queue.liquidityQueue.totalTokensExchangedForSatoshis).toStrictEqual(
                u256.fromU64(3000000),
            );
            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(97000000));
        });
    });
});
