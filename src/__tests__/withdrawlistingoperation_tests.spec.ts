import { clearCachedProviders, getProvider } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    providerAddress1,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128 } from '@btc-vision/as-bignum/assembly';
import { WithdrawListingOperation } from '../operations/WithdrawListingOperation';

describe('WithdrawListingOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('should revert if provider does not have liquidity', () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.Zero);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new WithdrawListingOperation(queue.liquidityQueue, provider.getId());

            operation.execute();
        }).toThrow();
    });

    it('should reset provider data and save new values', () => {
        setBlockchainEnvironment(100);

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setLiquidityAmount(u128.fromU64(100000));

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const operation = new WithdrawListingOperation(queue.liquidityQueue, provider.getId());
        operation.execute();

        expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
        queue.liquidityQueue.save();

        setBlockchainEnvironment(102);

        const provider2 = getProvider(provider.getId());

        expect(provider2.getLiquidityAmount()).toStrictEqual(u128.Zero);
    });

    it('should transfer the token to the liquidity owner', () => {
        setBlockchainEnvironment(100);
        TransferHelper.clearMockedResults();

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.setLiquidityAmount(u128.fromU64(100000));

        const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const operation = new WithdrawListingOperation(queue.liquidityQueue, provider.getId());
        operation.execute();

        expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
        queue.liquidityQueue.save();

        expect(TransferHelper.transferCalled).toBeTruthy();
    });
});
