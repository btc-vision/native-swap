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
import { RemovalPurgedProviderQueue } from '../managers/RemovalPurgedProviderQueue';
import {
    ALLOW_DIRTY,
    ENABLE_INDEX_VERIFICATION,
    INDEX_NOT_SET_VALUE,
    MAXIMUM_NUMBER_OF_PROVIDERS,
} from '../constants/Contract';
import { RemovalProviderQueue } from '../managers/RemovalProviderQueue';
import {
    NORMAL_QUEUE_POINTER,
    REMOVAL_QUEUE_POINTER,
    REMOVAL_QUEUE_PURGED_RESERVATION,
} from '../constants/StoredPointers';
import { IOwedBTCManager } from '../managers/interfaces/IOwedBTCManager';
import { OwedBTCManager } from '../managers/OwedBTCManager';
import { ProviderQueue } from '../managers/ProviderQueue';

const QUOTE = u256.fromU64(100000000);

function createRemovalPurgedQueue(allowDirty: boolean = ALLOW_DIRTY): RemovalPurgedProviderQueue {
    const queue: RemovalPurgedProviderQueue = new RemovalPurgedProviderQueue(
        tokenAddress1,
        REMOVAL_QUEUE_PURGED_RESERVATION,
        tokenIdUint8Array1,
        ENABLE_INDEX_VERIFICATION,
        allowDirty,
    );

    return queue;
}

function createNormalQueue(): ProviderQueue {
    const queue: ProviderQueue = new ProviderQueue(
        tokenAddress1,
        NORMAL_QUEUE_POINTER,
        tokenIdUint8Array1,
        ENABLE_INDEX_VERIFICATION,
        MAXIMUM_NUMBER_OF_PROVIDERS,
    );

    return queue;
}

function createRemovalQueue(): RemovalProviderQueue {
    const owedBTCManager: IOwedBTCManager = new OwedBTCManager();
    const queue: RemovalProviderQueue = new RemovalProviderQueue(
        owedBTCManager,
        tokenAddress1,
        REMOVAL_QUEUE_POINTER,
        tokenIdUint8Array1,
        ENABLE_INDEX_VERIFICATION,
        MAXIMUM_NUMBER_OF_PROVIDERS,
    );

    return queue;
}

describe('RemovalPurgedProviderQueue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('RemovalPurgedProviderQueue – getters', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should have a 0 length after creation', () => {
            const queue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();

            expect(queue.length).toStrictEqual(0);
        });
    });

    describe('RemovalPurgedProviderQueue – add', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should return INDEX_NOT_SET_VALUE if initial provider', () => {
            const queue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.markInitialLiquidityProvider();

            const index = queue.add(provider);

            expect(index).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('should revert if provider is already purged', () => {
            expect(() => {
                const queue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                provider.markPurged();

                queue.add(provider);
            }).toThrow();
        });

        it('should revert if provider is not pending removal', () => {
            expect(() => {
                const queue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);

                queue.add(provider);
            }).toThrow();
        });

        it('should revert if provider queue index is not set', () => {
            expect(() => {
                const queue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                provider.setQueueIndex(INDEX_NOT_SET_VALUE);
                queue.add(provider);
            }).toThrow();
        });

        it('should mark the provider as purged, add to the queue and set purged index', () => {
            const queue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
            provider.setQueueIndex(0);

            const index = queue.add(provider);

            expect(provider.getPurgedIndex()).toStrictEqual(0);
            expect(provider.isPurged()).toBeTruthy();
            expect(queue.length).toStrictEqual(1);
            expect(provider.getPurgedIndex()).toStrictEqual(index);
        });
    });

    describe('RemovalPurgedProviderQueue – get', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should revert if associated queue is not of RemovalProviderQueue type', () => {
            expect(() => {
                const queue: ProviderQueue = createNormalQueue();
                const purgedQueue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
                provider.setQueueIndex(0);

                purgedQueue.get(queue, u256.Zero);
            }).toThrow();
        });

        it('should revert if provider queue index is not set', () => {
            expect(() => {
                const queue: RemovalProviderQueue = createRemovalQueue();
                const purgedQueue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
                const index = purgedQueue.add(provider);

                provider.setQueueIndex(INDEX_NOT_SET_VALUE);

                purgedQueue.get(queue, u256.Zero);
            }).toThrow();
        });

        it('should revert if provider id is not valid', () => {
            expect(() => {
                const queue: RemovalProviderQueue = createRemovalQueue();
                const purgedQueue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);

                queue.add(provider);
                const index = purgedQueue.add(provider);

                queue.remove(provider);

                purgedQueue.get(queue, u256.Zero);
            }).toThrow();
        });

        it('should revert if provider is not purged', () => {
            expect(() => {
                const queue: RemovalProviderQueue = createRemovalQueue();
                const purgedQueue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
                queue.add(provider);
                purgedQueue.add(provider);
                provider.clearPurged();

                purgedQueue.get(queue, u256.Zero);
            }).toThrow();
        });

        it('should return the provider and mark it from removal queue', () => {
            const queue: RemovalProviderQueue = createRemovalQueue();
            const purgedQueue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();

            const providers = createProviders(10, 0, true);
            for (let i = 0; i < providers.length; i++) {
                queue.add(providers[i]);
                purgedQueue.add(providers[i]);
            }

            const provider1 = purgedQueue.get(queue, u256.fromU32(10000));
            expect(provider1).not.toBeNull();
            if (provider1 !== null) {
                expect(provider1.getPurgedIndex()).toStrictEqual(0);
                expect(provider1.isFromRemovalQueue()).toBeTruthy();
            }
        });
    });

    describe('RemovalPurgedProviderQueue – remove', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should revert if purged provider queue index is not set', () => {
            expect(() => {
                const queue: RemovalProviderQueue = createRemovalQueue();
                const purgedQueue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
                purgedQueue.add(provider);
                provider.setPurgedIndex(INDEX_NOT_SET_VALUE);

                purgedQueue.remove(provider);
            }).toThrow();
        });

        it('should properly remove the provider', () => {
            const queue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();
            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
            provider.setQueueIndex(0);
            const index = queue.add(provider);

            queue.remove(provider);

            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.isPurged()).toBeFalsy();
            expect(queue.length).toStrictEqual(0);
        });

        it('should properly remove the provider and delete it from the queue if dirty not allowed', () => {
            /*
            const queue: RemovalPurgedProviderQueue = createRemovalPurgedQueue(false);
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setQueueIndex(0);
provider.markRemoval();
            const index = queue.add(provider);

            queue.remove(provider);

            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.isPurged()).toBeFalsy();
            expect(queue.length).toStrictEqual(0);


             */
        });
    });

    describe('RemovalPurgedProviderQueue – save', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should save correctly', () => {
            const queue: RemovalProviderQueue = createRemovalQueue();
            const purgedQueue: RemovalPurgedProviderQueue = createRemovalPurgedQueue();

            const providers = createProviders(10, 0, true);
            for (let i = 0; i < providers.length; i++) {
                queue.add(providers[i]);
                purgedQueue.add(providers[i]);
            }

            purgedQueue.save();
            clearCachedProviders();

            const queue2: RemovalProviderQueue = createRemovalQueue();
            const purgedQueue2: RemovalPurgedProviderQueue = createRemovalPurgedQueue();

            expect(purgedQueue2.length).toStrictEqual(purgedQueue.length);
        });
    });
});
