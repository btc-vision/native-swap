import {
    clearCachedProviders,
    clearPendingStakingContractAmount,
    getPendingStakingContractAmount,
    Provider,
} from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    PRIORITY_QUEUE_POINTER,
    PRIORITY_QUEUE_PURGED_RESERVATION,
} from '../constants/StoredPointers';
import {
    createProvider,
    createProviders,
    providerAddress1,
    testStackingContractAddress,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { PriorityPurgedProviderQueue } from '../managers/PriorityPurgedProviderQueue';
import {
    ENABLE_INDEX_VERIFICATION,
    INDEX_NOT_SET_VALUE,
    MAXIMUM_NUMBER_OF_PROVIDERS,
} from '../constants/Contract';
import { PriorityProviderQueue } from '../managers/PriorityProviderQueue';

const QUOTE = u256.fromU64(100000000);

function createPriorityPurgedQueue(): PriorityPurgedProviderQueue {
    const queue: PriorityPurgedProviderQueue = new PriorityPurgedProviderQueue(
        tokenAddress1,
        PRIORITY_QUEUE_PURGED_RESERVATION,
        tokenIdUint8Array1,
        ENABLE_INDEX_VERIFICATION,
        testStackingContractAddress,
    );

    return queue;
}

function createPriorityQueue(): PriorityProviderQueue {
    const queue: PriorityProviderQueue = new PriorityProviderQueue(
        tokenAddress1,
        PRIORITY_QUEUE_POINTER,
        tokenIdUint8Array1,
        ENABLE_INDEX_VERIFICATION,
        MAXIMUM_NUMBER_OF_PROVIDERS,
        testStackingContractAddress,
    );

    return queue;
}

describe('PriorityPurgedProviderQueue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
        clearPendingStakingContractAmount();
    });

    describe('PriorityPurgedProviderQueue – getters', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should have a 0 length after creation', () => {
            const queue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();

            expect(queue.length).toStrictEqual(0);
        });
    });

    describe('PriorityPurgedProviderQueue – add', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should return INDEX_NOT_SET_VALUE if initial provider', () => {
            const queue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.markInitialLiquidityProvider();

            const index = queue.add(provider);

            expect(index).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('should revert if provider is already purged', () => {
            expect(() => {
                const queue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                provider.markPurged();

                queue.add(provider);
            }).toThrow();
        });

        it('should revert if provider is pending removal', () => {
            expect(() => {
                const queue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);

                queue.add(provider);
            }).toThrow();
        });

        it('should revert if provider is not priority', () => {
            expect(() => {
                const queue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                provider.setQueueIndex(0);
                queue.add(provider);
            }).toThrow();
        });

        it('should revert if provider queue index is not set', () => {
            expect(() => {
                const queue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                provider.setQueueIndex(INDEX_NOT_SET_VALUE);
                queue.add(provider);
            }).toThrow();
        });

        it('should mark the provider as purged, add to the queue and set purged index', () => {
            const queue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.markPriority();
            provider.setQueueIndex(0);

            const index = queue.add(provider);

            expect(provider.getPurgedIndex()).toStrictEqual(0);
            expect(provider.isPurged()).toBeTruthy();
            expect(queue.length).toStrictEqual(1);
            expect(provider.getPurgedIndex()).toStrictEqual(index);
        });
    });

    describe('PriorityPurgedProviderQueue – get', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should revert if provider queue index is not set', () => {
            expect(() => {
                const queue: PriorityProviderQueue = createPriorityQueue();
                const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                provider.markPriority();
                const index = purgedQueue.add(provider);

                provider.setQueueIndex(INDEX_NOT_SET_VALUE);

                purgedQueue.get(queue, u256.Zero);
            }).toThrow();
        });

        it('should revert if provider id is not valid', () => {
            expect(() => {
                const queue: PriorityProviderQueue = createPriorityQueue();
                const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                provider.markPriority();
                queue.add(provider);
                const index = purgedQueue.add(provider);

                queue.remove(provider);

                purgedQueue.get(queue, u256.Zero);
            }).toThrow();
        });

        it('should revert if provider is not purged', () => {
            expect(() => {
                const queue: PriorityProviderQueue = createPriorityQueue();
                const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                provider.markPriority();
                queue.add(provider);
                purgedQueue.add(provider);
                provider.clearPurged();

                purgedQueue.get(queue, u256.Zero);
            }).toThrow();
        });

        it('should return the provider when available liquidity meet minimum amount', () => {
            const queue: PriorityProviderQueue = createPriorityQueue();
            const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();

            const providers = createProviders(10);
            for (let i = 0; i < providers.length; i++) {
                providers[i].markPriority();
                queue.add(providers[i]);
                purgedQueue.add(providers[i]);
            }

            const provider1 = purgedQueue.get(queue, u256.fromU32(10000));
            expect(provider1).not.toBeNull();
            if (provider1 !== null) {
                expect(provider1.getPurgedIndex()).toStrictEqual(0);
            }
        });

        it('should return null when available liquidity is 0', () => {
            const queue: PriorityProviderQueue = createPriorityQueue();
            const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();

            const providers = createProviders(10);
            for (let i = 0; i < providers.length; i++) {
                providers[i].markPriority();
                providers[i].setLiquidityAmount(u128.Zero);
                queue.add(providers[i]);
                purgedQueue.add(providers[i]);
            }

            const provider1 = purgedQueue.get(queue, u256.fromU32(10000));
            expect(provider1).toBeNull();
        });

        it('should return null and not reset the provider when available liquidity < minimum required but have reserved amount', () => {
            const queue: PriorityProviderQueue = createPriorityQueue();
            const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();

            const providers = createProviders(10);
            for (let i = 0; i < providers.length; i++) {
                providers[i].markPriority();
                providers[i].setLiquidityAmount(u128.fromU32(110));
                providers[i].setReservedAmount(u128.fromU32(100));
                queue.add(providers[i]);
                purgedQueue.add(providers[i]);
            }

            const provider1 = purgedQueue.get(queue, u256.fromU32(100000000));
            expect(provider1).toBeNull();
            expect(providers[0].isPurged()).toBeTruthy();
            expect(providers[0].isActive()).toBeTruthy();
        });

        it('should return null and reset the provider when available liquidity < minimum required and no reserved amount', () => {
            const queue: PriorityProviderQueue = createPriorityQueue();
            const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();

            const providers = createProviders(10);
            for (let i = 0; i < providers.length; i++) {
                providers[i].markPriority();
                providers[i].setLiquidityAmount(u128.fromU32(110));
                queue.add(providers[i]);
                purgedQueue.add(providers[i]);
            }

            const provider1 = purgedQueue.get(queue, u256.fromU32(100000000));
            expect(provider1).toBeNull();
            expect(providers[0].isPurged()).toBeFalsy();
            expect(providers[0].isActive()).toBeFalsy();
        });

        it('should return null, reset the provider, transfer remaining liquidity when available liquidity < minimum required and no reserved amount', () => {
            const queue: PriorityProviderQueue = createPriorityQueue();
            const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();

            const providers = createProviders(10);
            for (let i = 0; i < providers.length; i++) {
                providers[i].markPriority();
                providers[i].setLiquidityAmount(u128.fromU32(110));
                queue.add(providers[i]);
                purgedQueue.add(providers[i]);
            }

            const provider = purgedQueue.get(queue, u256.fromU32(100000000));
            expect(provider).toBeNull();

            for (let i = 0; i < providers.length; i++) {
                expect(providers[i].isPurged()).toBeFalsy();
                expect(providers[i].isActive()).toBeFalsy();
                expect(queue.getAt(i)).toStrictEqual(u256.Zero);
            }

            expect(getPendingStakingContractAmount()).toStrictEqual(
                u256.fromU32(providers.length * 110),
            );
        });

        it('should revert when provider not purged, available liquidity < minimum required and no reserved amount', () => {
            expect(() => {
                const queue: PriorityProviderQueue = createPriorityQueue();
                const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();

                const providers = createProviders(10);
                for (let i = 0; i < providers.length; i++) {
                    providers[i].markPriority();
                    providers[i].setLiquidityAmount(u128.fromU32(110));
                    queue.add(providers[i]);
                    purgedQueue.add(providers[i]);
                }

                providers[0].clearPurged();
                purgedQueue.get(queue, u256.fromU32(100000000));
            }).toThrow();
        });
    });

    describe('PriorityPurgedProviderQueue – remove', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should revert if purger provider queue index is not set', () => {
            expect(() => {
                const queue: PriorityProviderQueue = createPriorityQueue();
                const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                provider.markPriority();
                purgedQueue.add(provider);
                provider.setPurgedIndex(INDEX_NOT_SET_VALUE);

                purgedQueue.remove(provider);
            }).toThrow();
        });

        it('should properly remove the provider', () => {
            const queue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setQueueIndex(0);
            provider.markPriority();
            const index = queue.add(provider);

            queue.remove(provider);

            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.isPurged()).toBeFalsy();
            expect(queue.length).toStrictEqual(0);
        });
    });

    describe('PriorityPurgedProviderQueue – save', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should save correctly', () => {
            const queue: PriorityProviderQueue = createPriorityQueue();
            const purgedQueue: PriorityPurgedProviderQueue = createPriorityPurgedQueue();

            const providers = createProviders(10);
            for (let i = 0; i < providers.length; i++) {
                providers[i].markPriority();
                queue.add(providers[i]);
                purgedQueue.add(providers[i]);
            }

            purgedQueue.save();
            clearCachedProviders();

            const queue2: PriorityProviderQueue = createPriorityQueue();
            const purgedQueue2: PriorityPurgedProviderQueue = createPriorityPurgedQueue();

            expect(purgedQueue2.length).toStrictEqual(purgedQueue.length);
        });
    });
});
