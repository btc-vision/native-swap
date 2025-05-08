import { clearCachedProviders } from '../lib/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createProvider,
    providerAddress1,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import { CancelListingOperation } from '../lib/Liquidity/operations/CancelListingOperation';
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
            provider.setActive(false, false);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue, provider.providerId);

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider has reserved !=0 => 'Someone have active reservations on your liquidity'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(true, false);
            provider.reserved = u128.fromU32(100000);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue, provider.providerId);

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider.liquidity=0 => 'Provider has no liquidity'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(true, false);
            provider.liquidity = u128.Zero;

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue, provider.providerId);

            operation.execute();
        }).toThrow();
    });

    it("should revert if provider.canProvideLiquidity => 'cannot cancel listing'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(true, false);
            provider.liquidity = u128.fromU64(10000);
            provider.enableLiquidityProvision();

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue, provider.providerId);

            operation.execute();
        }).toThrow();
    });

    it("should revert if providerId= lq.initialLiquidityProvider => 'Initial provider cannot cancel listing'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, false, true, false);
            provider.setActive(true, false);
            provider.liquidity = u128.fromU64(10000);

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            queue.initialLiquidityProvider = provider.providerId;

            const operation = new CancelListingOperation(queue, provider.providerId);

            operation.execute();
        }).toThrow();
    });

    it('should succeed: set provider.liquidity=0, call resetProvider, safeTransfer to user, update reserve, cleanUpQueues, emit event', () => {
        setBlockchainEnvironment(100);

        const provider = createProvider(providerAddress1, tokenAddress1, false, true, false);
        provider.setActive(true, false);
        provider.liquidity = u128.fromU64(10000);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        queue.increaseTotalReserve(u256.fromU64(1000000000));

        const operation = new CancelListingOperation(queue, provider.providerId);

        operation.execute();

        expect(provider.liquidity).toStrictEqual(u128.Zero);
        expect(provider.reserved).toStrictEqual(u128.Zero);
        expect(provider.liquidityProvided).toStrictEqual(u256.fromU32(1000));
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
        expect(queue.liquidity).toStrictEqual(u256.fromU64(1000000000));
    });

    it("should revert if provider.pendingRemoval => 'cannot cancel listing'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setActive(true, false);
            provider.liquidity = u128.fromU64(10000);
            provider.pendingRemoval = true;

            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CancelListingOperation(queue, provider.providerId);

            operation.execute();
        }).toThrow();
    });
});
