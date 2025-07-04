import { clearCachedProviders, Provider } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createProvider,
    createProviders,
    providerAddress1,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { PriorityProviderQueue } from '../managers/PriorityProviderQueue';
import { PRIORITY_QUEUE_POINTER } from '../constants/StoredPointers';
import { ENABLE_INDEX_VERIFICATION, MAXIMUM_NUMBER_OF_PROVIDERS } from '../constants/Contract';

const QUOTE = u256.fromU64(100000000);

describe('PriorityProviderQueue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('PriorityProviderQueue – add()', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('adds provider and sets queueIndex', () => {
            const queue: PriorityProviderQueue = new PriorityProviderQueue(
                tokenAddress1,
                PRIORITY_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.markPurged();

            const index: u32 = queue.add(provider);
            expect(provider.getQueueIndex()).toStrictEqual(index);
        });

        it('reverts when adding more provider than maximum provider count', () => {
            expect(() => {
                const queue: PriorityProviderQueue = new PriorityProviderQueue(
                    tokenAddress1,
                    PRIORITY_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    ENABLE_INDEX_VERIFICATION,
                    5,
                );

                const providers: Provider[] = createProviders(6, 0);

                for (let i: i32 = 0; i < providers.length; i++) {
                    providers[i].markPriority();
                    queue.add(providers[i]);
                }
            }).toThrow();
        });
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
                    MAXIMUM_NUMBER_OF_PROVIDERS,
                );

                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.clearPriority();
                queue.add(provider1);

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });
    });
});
