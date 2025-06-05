import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    providerAddress1,
    setBlockchainEnvironment,
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

    it('should revert if provider does not have listed token at block', () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU64(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it('should revert if provider does not have liquidity', () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);
            provider.setListedTokenAtBlock(100);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

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

            const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider has reserved !=0 => 'Someone have active reservations on your liquidity'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.clearPriority();
            provider.setReservedAmount(u128.fromU32(100000));
            provider.setListedTokenAtBlock(100);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider.canProvideLiquidity => 'cannot cancel listing'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU64(10000));
            provider.allowLiquidityProvision();
            provider.setListedTokenAtBlock(100);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it('should revert if initial provider', () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, true, false);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU64(10000));
            provider.setListedTokenAtBlock(100);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.initialLiquidityProviderId = provider.getId();

            const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider.pendingRemoval => 'cannot cancel listing'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU64(10000));
            provider.markPendingRemoval();
            provider.setListedTokenAtBlock(100);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it('should succeed: set provider.liquidity=0, call resetProvider, safeTransfer to user, update reserve, cleanUpQueues, emit event', () => {
        setBlockchainEnvironment(100);

        const provider = createProvider(providerAddress1, tokenAddress1, false, true, false);
        provider.activate();
        provider.clearPriority();
        provider.setLiquidityAmount(u128.fromU64(10000));
        provider.setListedTokenAtBlock(100);

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(1000000000));
        queue.providerManager.addToNormalQueue(provider);

        setBlockchainEnvironment(101);
        const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

        operation.execute();

        expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(provider.getLiquidityProvided()).toStrictEqual(u128.fromU32(1000));
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
        expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(1000005000));
    });

    it('should apply 50% penalty if in grace period', () => {
        setBlockchainEnvironment(100);

        const provider = createProvider(providerAddress1, tokenAddress1, false, true, false);
        provider.activate();
        provider.clearPriority();
        provider.setLiquidityAmount(u128.fromU64(10000));
        provider.setListedTokenAtBlock(100);

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        queue.providerManager.addToNormalQueue(provider);

        setBlockchainEnvironment(101);
        const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

        operation.execute();

        expect(queue.liquidityQueue.virtualTokenReserve).toStrictEqual(u256.fromU64(5001));
        expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(5000));
    });

    it('should apply more than 50 % penalty if outside of grace period', () => {
        setBlockchainEnvironment(100);

        const provider = createProvider(providerAddress1, tokenAddress1, false, true, false);
        provider.activate();
        provider.clearPriority();
        provider.setLiquidityAmount(u128.fromU64(10000));
        provider.setListedTokenAtBlock(100);

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        queue.providerManager.addToNormalQueue(provider);

        setBlockchainEnvironment(107);
        const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

        operation.execute();

        expect(queue.liquidityQueue.virtualTokenReserve).toStrictEqual(u256.fromU64(5006));
        expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(5005));
    });
});
