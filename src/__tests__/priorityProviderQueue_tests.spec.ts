import { clearCachedProviders, Provider } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { createProvider, providerAddress1, tokenAddress1, tokenIdUint8Array1 } from './test_helper';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { PriorityProviderQueue } from '../managers/PriorityProviderQueue';
import { PRIORITY_QUEUE_POINTER } from '../constants/StoredPointers';
import { ENABLE_INDEX_VERIFICATION } from '../constants/Contract';

const QUOTE = u256.fromU64(100000000);

describe('PriorityProviderQueue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('PriorityProviderQueue getNextWithLiquidity()', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('throws if provider is not priority', () => {
            expect(() => {
                const queue: PriorityProviderQueue = new PriorityProviderQueue(
                    tokenAddress1,
                    PRIORITY_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    ENABLE_INDEX_VERIFICATION,
                );

                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.clearPriority();
                queue.add(provider1);

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });
    });
});
