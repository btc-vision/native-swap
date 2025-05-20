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

    it('should revert if provider is not active', () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.deactivate();
            provider.clearPriority();

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

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider.liquidity=0 => 'Provider has no liquidity'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.Zero);

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

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it("should revert if providerId= lq.initialLiquidityProvider => 'Initial provider cannot cancel listing'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, true, false);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU64(10000));

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.liquidityQueue.initialLiquidityProviderId = provider.getId();

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

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.liquidityQueue.increaseTotalReserve(u256.fromU64(1000000000));

        const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

        operation.execute();

        expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(provider.getLiquidityProvided()).toStrictEqual(u128.fromU32(1000));
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
        expect(queue.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(1000000000));
    });

    it("should revert if provider.pendingRemoval => 'cannot cancel listing'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.clearPriority();
            provider.setLiquidityAmount(u128.fromU64(10000));
            provider.markPendingRemoval();

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });
});
