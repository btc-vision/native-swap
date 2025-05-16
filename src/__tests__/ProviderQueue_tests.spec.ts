import { clearCachedProviders, Provider } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { ProviderQueue } from '../managers/ProviderQueue';
import { NORMAL_QUEUE_POINTER } from '../constants/StoredPointers';
import {
    createProvider,
    createProviders,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    TestProviderQueue,
    tokenAddress1,
    tokenAddress2,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { INDEX_NOT_SET_VALUE, INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';

const QUOTE = u256.fromU64(100000000);

describe('ProviderQueue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('ProviderQueue – getters', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('currentIndex defaults to 0', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            expect(queue.currentIndex).toStrictEqual(0);
        });

        it('length defaults to 0', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            expect(queue.length).toStrictEqual(0);
        });

        it('length returns queue length', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            queue.add(createProvider(providerAddress1, tokenAddress1));
            queue.add(createProvider(providerAddress2, tokenAddress1));
            expect(queue.length).toStrictEqual(2);
        });

        it('startingIndex defaults to 0', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            expect(queue.startingIndex).toStrictEqual(0);
        });

        it('startingIndex return correct value', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            queue.getQueue().setStartingIndex(10);
            expect(queue.startingIndex).toStrictEqual(10);
        });
    });

    describe('ProviderQueue – add', () => {
        let queue: ProviderQueue;

        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('adds a provider and sets queue index', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            const index: u32 = queue.add(provider);
            expect(index).toStrictEqual(0);
            expect(provider.getQueueIndex()).toStrictEqual(index);
            expect(queue.getQueue().get_physical(index)).toStrictEqual(provider.getId());

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
            const index2: u32 = queue.add(provider2);
            expect(index2).toStrictEqual(1);
            expect(provider2.getQueueIndex()).toStrictEqual(index2);
            expect(queue.getQueue().get_physical(index2)).toStrictEqual(provider2.getId());
        });

        /*!!!
        it('throws when queue is full', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                );
                const providers = createMaxProviders();
                for (let i = 0; i < providers.length; i++) {
                    queue.add(providers[i]);
                }

                const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
                queue.add(provider2);
            }).toThrow();
        });
        
         */
    });

    describe('ProviderQueue – getAt and removeAt', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('getAt returns correct provider ID', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            const p1Index: u32 = queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            const p2Index: u32 = queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            const p3Index: u32 = queue.add(p3);

            expect(queue.getAt(p1Index)).toStrictEqual(p1.getId());
            expect(queue.getAt(p2Index)).toStrictEqual(p2.getId());
            expect(queue.getAt(p3Index)).toStrictEqual(p3.getId());
            expect(queue.length).toStrictEqual(3);
        });

        it('removeAt deletes the provider', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            const p1Index: u32 = queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            const p2Index: u32 = queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            const p3Index: u32 = queue.add(p3);

            queue.removeAt(p2Index);
            queue.removeAt(p3Index);

            expect(queue.getAt(p2Index)).toStrictEqual(u256.Zero);
            expect(queue.getAt(p3Index)).toStrictEqual(u256.Zero);
            expect(queue.length).toStrictEqual(0);
        });
    });

    describe('ProviderQueue – resetProvider', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('throws if provider is initial liquidity provider', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                );
                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                queue.add(provider);
                provider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
                provider.markInitialLiquidityProvider();
                queue.resetProvider(provider);
            }).toThrow();
        });

        it('calls resetProvider, burn funds, if not initial provider', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            const index: u32 = queue.add(provider);
            queue.resetProvider(provider, true, false);

            expect(TransferHelper.safeTransferCalled).toBeTruthy();
            expect(queue.getAt(index)).toStrictEqual(u256.Zero);
            expect(queue.length).toStrictEqual(0);
            expect(provider.isLiquidityProvisionAllowed()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.isActive()).toBeFalsy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('calls resetProvider, do not burn funds, if not initial provider', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            const index: u32 = queue.add(provider);
            queue.resetProvider(provider, false, false);

            expect(TransferHelper.safeTransferCalled).toBeFalsy();
            expect(queue.getAt(index)).toStrictEqual(u256.Zero);
            expect(queue.length).toStrictEqual(0);
            expect(provider.isLiquidityProvisionAllowed()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.isActive()).toBeFalsy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });
    });

    describe('ProviderQueue – cleanUp', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('does nothing when queue is empty', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const result: u32 = queue.cleanUp(0);
            expect(result).toStrictEqual(0);
        });

        it('skips zero slots and continues', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            const p1Index: u32 = queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            const p2Index: u32 = queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            const p3Index: u32 = queue.add(p3);

            queue.removeAt(p1Index);
            queue.removeAt(p2Index);
            queue.removeAt(p3Index);

            const result: u32 = queue.cleanUp(0);
            expect(result).toStrictEqual(2);
            expect(queue.startingIndex).toStrictEqual(0);
        });

        it('deletes inactive providers', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            p1.deactivate();
            const p1Index: u32 = queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            p2.deactivate();
            const p2Index: u32 = queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            p3.deactivate();
            const p3Index: u32 = queue.add(p3);

            const result: u32 = queue.cleanUp(0);
            expect(result).toStrictEqual(3);
            expect(queue.getAt(0)).toStrictEqual(u256.Zero);
            expect(queue.getAt(1)).toStrictEqual(u256.Zero);
            expect(queue.getAt(2)).toStrictEqual(u256.Zero);
            expect(queue.startingIndex).toStrictEqual(0);
        });

        it('sets starting index when an active provider is found', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            p1.deactivate();
            const p1Index: u32 = queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            p2.deactivate();
            const p2Index: u32 = queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            const p3Index: u32 = queue.add(p3);

            queue.removeAt(p1Index);

            const result: u32 = queue.cleanUp(0);

            expect(result).toStrictEqual(2);
            expect(queue.startingIndex).toStrictEqual(2);
        });

        it('returns index = length if no active providers found', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const providers: Provider[] = createProviders(5, 0);

            for (let i = 0; i < providers.length; i++) {
                providers[i].deactivate();
                queue.add(providers[i]);
            }

            const result: u32 = queue.cleanUp(0);
            expect(result).toStrictEqual(providers.length);
        });

        it('stops cleanup early at first active provider', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            p1.deactivate();
            const p1Index: u32 = queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            p2.activate();
            const p2Index: u32 = queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            const p3Index: u32 = queue.add(p3);

            const result: u32 = queue.cleanUp(0);

            expect(result).toStrictEqual(1);
            expect(queue.startingIndex).toStrictEqual(1);
        });

        it('cleanUp startingIndex = length returns length', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            const p1Index: u32 = queue.add(p1);

            const result = queue.cleanUp(1);
            expect(result).toStrictEqual(1);
        });
    });

    describe('ProviderQueue – validation and iteration', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('ensureStartingIndexIsValid throws if invalid', () => {
            expect(() => {
                const queue: TestProviderQueue = new TestProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                );
                queue.getQueue().setStartingIndex(10);
                queue.callEnsureStartingIndexIsValid();
            }).toThrow();
        });

        it('initializeCurrentIndex sets current index to startingIndex', () => {
            const queue: TestProviderQueue = new TestProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            queue.getQueue().setStartingIndex(10);
            queue.callInitializeCurrentIndex();

            expect(queue.currentIndex).toStrictEqual(10);
        });

        it('restoreCurrentIndex sets _currentIndex', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            queue.restoreCurrentIndex(9999);
            expect(queue.currentIndex).toStrictEqual(9999);
        });
    });

    describe('ProviderQueue getNextWithLiquidity()', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('returns null if empty queue', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            expect(queue.getNextWithLiquidity(QUOTE)).toBeNull();
        });

        it('skips inactive providers', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            provider1.deactivate();
            queue.add(provider1);

            const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
            provider2.deactivate();
            queue.add(provider2);

            expect(queue.getNextWithLiquidity(QUOTE)).toBeNull();
        });

        it('throws if provider is priority', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                );
                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.markPriority();
                queue.add(provider1);

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });

        it('throws if queue index does not match', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                );
                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                queue.add(provider1);
                provider1.setQueueIndex(2);

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });

        it('throws if provider is initialLiquidityProvider', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                );
                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                queue.add(provider1);
                provider1.markInitialLiquidityProvider();
                provider1.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });

        it('returns null if provider liquidity is zero', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            provider1.deactivate();
            queue.add(provider1);

            const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
            provider2.setLiquidityAmount(u128.fromU64(100));
            provider2.setReservedAmount(u128.fromU64(100));
            queue.add(provider2);

            expect(queue.getNextWithLiquidity(QUOTE)).toBeNull();
        });

        it('returns null if provider fails min reservation and has reserved amount', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            provider1.deactivate();
            queue.add(provider1);

            const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
            provider2.setLiquidityAmount(u128.fromU64(100));
            provider2.setReservedAmount(u128.fromU64(50));
            queue.add(provider2);

            expect(queue.getNextWithLiquidity(QUOTE)).toBeNull();
        });

        it('return null and resets provider if under min reservation and no reserved', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            provider1.deactivate();
            queue.add(provider1);

            const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
            provider2.setLiquidityAmount(u128.fromU64(100));
            const index2: u32 = queue.add(provider2);

            expect(queue.getNextWithLiquidity(QUOTE)).toBeNull();
            expect(provider2.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider2.isActive()).toBeFalsy();
            expect(provider2.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(queue.getAt(index2)).toStrictEqual(u256.Zero);
        });

        it('returns provider if all conditions met', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            provider1.deactivate();
            queue.add(provider1);

            const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
            provider2.setLiquidityAmount(u128.fromU64(10000));
            const index2: u32 = queue.add(provider2);

            expect(queue.getNextWithLiquidity(QUOTE)).toBe(provider2);
            expect(queue.currentIndex).toStrictEqual(1);
        });

        /*!!!
        it('throws if index reaches MAXIMUM_VALID_INDEX without match', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                );
                const providers: Provider[] = createMaxProviders(
                    false,
                    false,
                    false,
                    'abcdef',
                    u128.Zero,
                    u128.Zero,
                    u128.Zero,
                    false,
                    false,
                );
                for (let i = 0; i < providers.length; i++) {
                    queue.add(providers[i]);
                }

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });*/

        /*!!!
        it('returns valid provider at MAXIMUM_VALID_INDEX without throwing', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const providers: Provider[] = createMaxProviders(
                false,
                false,
                false,
                'abcdef',
                u128.Zero,
                u128.Zero,
                u128.Zero,
                false,
                false,
            );
            providers[MAXIMUM_VALID_INDEX].activate();

            for (let i = 0; i < providers.length; i++) {
                queue.add(providers[i]);
            }

            const result: Provider | null = queue.getNextWithLiquidity(QUOTE);

            expect(result).not.toBeNull();
            expect(result).toBe(providers[MAXIMUM_VALID_INDEX]);
            expect(queue.currentIndex).toStrictEqual(MAXIMUM_VALID_INDEX);
        });*/
    });

    describe('ProviderQueue – save', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('saves the queue correctly', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            const index: u32 = queue.add(provider);
            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
            const index2: u32 = queue.add(provider2);

            queue.save();

            const queue2: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
            );

            expect(queue2.length).toStrictEqual(queue.length);
            expect(queue2.getAt(index)).toStrictEqual(provider.getId());
            expect(queue2.getAt(index2)).toStrictEqual(provider2.getId());
        });
    });
});
