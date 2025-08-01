import {
    clearCachedProviders,
    clearPendingStakingContractAmount,
    getPendingStakingContractAmount,
} from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    providerAddress1,
    setBlockchainEnvironment,
    testStackingContractAddress,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { CancelListingOperation } from '../operations/CancelListingOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

describe('CancelListTokenForSaleOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('CancelListTokenForSaleOperation pre conditions', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should revert if provider does not have listed token at block', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();
                provider.setLiquidityAmount(u128.fromU64(10000));

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CancelListingOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider is not active', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.deactivate();
                provider.clearPriority();
                provider.setListedTokenAtBlock(100);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CancelListingOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider have active reservations on your liquidity', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();
                provider.setReservedAmount(u128.fromU32(100000));
                provider.setListedTokenAtBlock(100);

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CancelListingOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider is in the purge queue', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();
                provider.markPurged();
                provider.setPurgedIndex(1);
                provider.setListedTokenAtBlock(100);

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CancelListingOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider have no liquidity', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();
                provider.setLiquidityAmount(u128.Zero);
                provider.setListedTokenAtBlock(100);

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CancelListingOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if provider is providing liquidity', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.activate();
                provider.clearPriority();
                provider.setLiquidityAmount(u128.fromU64(10000));
                provider.allowLiquidityProvision();
                provider.setListedTokenAtBlock(100);

                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CancelListingOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if initial provider', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    false,
                );
                provider.activate();
                provider.clearPriority();
                provider.setLiquidityAmount(u128.fromU64(10000));
                provider.setListedTokenAtBlock(100);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                queue.liquidityQueue.initialLiquidityProviderId = provider.getId();

                const operation = new CancelListingOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    testStackingContractAddress,
                );

                operation.execute();
            }).toThrow();
        });
    });

    describe('CancelListTokenForSaleOperation execute', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should apply 50% penalty if in grace period', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, false, false);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU64(10000));
            provider.setListedTokenAtBlock(100);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            queue.providerManager.addToNormalQueue(provider);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(10000);
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(10000));

            setBlockchainEnvironment(101);
            const operation = new CancelListingOperation(
                queue.liquidityQueue,
                provider.getId(),
                testStackingContractAddress,
            );

            operation.execute();

            expect(queue.liquidityQueue.virtualTokenReserve).toStrictEqual(u256.fromU64(10000));
            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(0));
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromU32(5000));
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
        });

        it('should apply more than 50 % penalty if outside of grace period', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, false, false);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU64(10000));
            provider.setListedTokenAtBlock(100);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(10000);
            queue.liquidityQueue.decreaseTotalReserve(queue.liquidityQueue.liquidity);
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(100000));

            queue.providerManager.addToNormalQueue(provider);

            setBlockchainEnvironment(107);
            const operation = new CancelListingOperation(
                queue.liquidityQueue,
                provider.getId(),
                testStackingContractAddress,
            );

            operation.execute();

            expect(queue.liquidityQueue.virtualTokenReserve).toStrictEqual(u256.fromU64(10005));
            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(90000));
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromU32(5005));
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
        });

        it('should cap halfToCharge to penaltyAmount', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, false, false);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU64(10001));
            provider.setListedTokenAtBlock(100);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.virtualTokenReserve = u256.fromU64(10000);
            queue.liquidityQueue.decreaseTotalReserve(queue.liquidityQueue.liquidity);
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(100000));

            queue.providerManager.addToNormalQueue(provider);

            setBlockchainEnvironment(101);
            const operation = new CancelListingOperation(
                queue.liquidityQueue,
                provider.getId(),
                testStackingContractAddress,
            );

            operation.execute();

            expect(queue.liquidityQueue.virtualTokenReserve).toStrictEqual(u256.fromU64(10000));
            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(89999));
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromU32(5000));
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
        });

        it('should succeed: set provider liquidity to 0, call resetProvider, safeTransfer, update reserve, cleanUpQueues, emit event', () => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, false, false);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU64(10000));
            provider.setListedTokenAtBlock(100);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.increaseTotalReserve(u256.fromU64(1000000000));
            queue.providerManager.addToNormalQueue(provider);

            setBlockchainEnvironment(101);
            const operation = new CancelListingOperation(
                queue.liquidityQueue,
                provider.getId(),
                testStackingContractAddress,
            );

            operation.execute();

            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.isActive()).toBeFalsy();

            expect(TransferHelper.safeTransferCalled).toBeTruthy();
            expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(999990000));
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromU32(5000));
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
        });
    });
});
