import { clearCachedProviders, Provider } from '../models/Provider';
import { Blockchain, TransferHelper } from '../../../btc-runtime/runtime';
import { createProvider, providerAddress1, tokenAddress1, tokenIdUint8Array1 } from './test_helper';
import { u256 } from '@btc-vision/as-bignum';
import { PRIORITY_QUEUE_POINTER } from '../constants/StoredPointers';
import { PriorityProviderQueue } from '../managers/PriorityProviderQueue';

describe('PriorityProviderQueue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('PriorityProviderQueue getNextWithLiquidity()', () => {
        let queue: PriorityProviderQueue;
        const QUOTE = u256.fromU64(100000000);

        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            queue = new PriorityProviderQueue(
                tokenAddress1,
                PRIORITY_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
        });

        it('throws if provider is not priority', () => {
            expect<() => void>(() => {
                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.clearPriority();
                queue.add(provider1);

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });
    });
});
