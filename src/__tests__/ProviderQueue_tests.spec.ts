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
import {
    BLOCK_NOT_SET_VALUE,
    ENABLE_INDEX_VERIFICATION,
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    MAXIMUM_NUMBER_OF_PROVIDERS,
} from '../constants/Contract';

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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            expect(queue.currentIndex).toStrictEqual(0);
        });

        it('length defaults to 0', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            expect(queue.length).toStrictEqual(0);
        });

        it('length returns queue length', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            expect(queue.startingIndex).toStrictEqual(0);
        });

        it('startingIndex return correct value', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            queue.getQueue().setStartingIndex(10);
            expect(queue.startingIndex).toStrictEqual(10);
        });

        it('sets the current index to the correct value when calling restoreCurrentIndex ', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            queue.restoreCurrentIndex(999);
            expect(queue.currentIndex).toStrictEqual(999);
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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
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

        it('reverts when adding more provider than maximum provider count', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
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

    describe('ProviderQueue – getAt and remove', () => {
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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
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

        it('remove deletes the provider and set queue index to INDEX_NOT_SET_VALUE', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            const p2Index: u32 = queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            const p3Index: u32 = queue.add(p3);

            queue.remove(p2);
            queue.remove(p3);

            expect(queue.getAt(p2Index)).toStrictEqual(u256.Zero);
            expect(queue.getAt(p3Index)).toStrictEqual(u256.Zero);
            expect(p2.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(p3.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(queue.length).toStrictEqual(3);
        });
    });

    describe('ProviderQueue – resetProvider', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('reverts if provider is already purged', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    ENABLE_INDEX_VERIFICATION,
                    MAXIMUM_NUMBER_OF_PROVIDERS,
                );

                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                queue.add(provider);

                provider.markPurged();
                queue.resetProvider(provider);
            }).toThrow();
        });

        it('calls resetProvider, burn funds if any, remove from queue if not initial provider and reset the flags', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            const index: u32 = queue.add(provider);
            queue.resetProvider(provider, true, false);

            expect(TransferHelper.safeTransferCalled).toBeTruthy();
            expect(queue.getAt(index)).toStrictEqual(u256.Zero);
            expect(queue.length).toStrictEqual(1);
            expect(provider.isLiquidityProvisionAllowed()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.isActive()).toBeFalsy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isPurged()).toBeFalsy();
            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getListedTokenAtBlock()).toStrictEqual(BLOCK_NOT_SET_VALUE);
        });

        it('calls resetProvider, burn funds if any, do not remove from queue if initial provider and reset the flags', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            provider.markInitialLiquidityProvider();
            queue.resetProvider(provider, true, false);

            expect(TransferHelper.safeTransferCalled).toBeTruthy();
            expect(provider.isLiquidityProvisionAllowed()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.isActive()).toBeFalsy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isPurged()).toBeFalsy();
            expect(provider.getQueueIndex()).toStrictEqual(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getListedTokenAtBlock()).toStrictEqual(BLOCK_NOT_SET_VALUE);
        });

        it('calls resetProvider and do not burn funds if any when burn remaining fund is false', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.add(provider);
            queue.resetProvider(provider, false, false);

            expect(TransferHelper.safeTransferCalled).toBeFalsy();
        });

        it('calls resetProvider and do not burn funds when burn remaining fund is true but no liquidity', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.Zero);
            queue.add(provider);
            queue.resetProvider(provider, true, false);

            expect(TransferHelper.safeTransferCalled).toBeFalsy();
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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const result: u32 = queue.cleanUp(0);
            expect(result).toStrictEqual(0);
        });

        it('skips zero slots', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            queue.add(p3);

            queue.remove(p1);
            queue.remove(p2);
            queue.remove(p3);

            const result: u32 = queue.cleanUp(0);
            expect(result).toStrictEqual(2);
            expect(queue.startingIndex).toStrictEqual(2);
        });

        it('reverts if inactive provider found', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    ENABLE_INDEX_VERIFICATION,
                    MAXIMUM_NUMBER_OF_PROVIDERS,
                );
                const p1: Provider = createProvider(providerAddress1, tokenAddress1);
                p1.deactivate();
                queue.add(p1);

                queue.cleanUp(0);
            }).toThrow();
        });

        it('sets starting index and stop cleaning when an active provider is found', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            queue.add(p3);

            queue.remove(p1);

            const result: u32 = queue.cleanUp(0);

            expect(result).toStrictEqual(0);
            expect(queue.startingIndex).toStrictEqual(1);
        });

        it('return previousStartingIndex - 1 when previousStartingIndex = length', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.add(p1);

            const result = queue.cleanUp(1);
            expect(result).toStrictEqual(0);
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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            expect(queue.getNextWithLiquidity(QUOTE)).toBeNull();
        });

        it('reverts when starting index > queue length', () => {
            expect(() => {
                const queue: TestProviderQueue = new TestProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    ENABLE_INDEX_VERIFICATION,
                    MAXIMUM_NUMBER_OF_PROVIDERS,
                );

                queue.setStartingIndex(100);
                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });

        it('skips deleted providers', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.add(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
            queue.add(provider2);

            queue.remove(provider1);

            expect(queue.getNextWithLiquidity(QUOTE)).toBe(provider2);
        });

        it('reverts if provider is priority', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    ENABLE_INDEX_VERIFICATION,
                    MAXIMUM_NUMBER_OF_PROVIDERS,
                );
                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.markPriority();
                queue.add(provider1);

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });

        it('reverts if queue index does not match', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    true,
                    MAXIMUM_NUMBER_OF_PROVIDERS,
                );
                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                queue.add(provider1);
                provider1.setQueueIndex(2);

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });

        it('reverts if provider is initialLiquidityProvider', () => {
            expect(() => {
                const queue: ProviderQueue = new ProviderQueue(
                    tokenAddress1,
                    NORMAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    true,
                    MAXIMUM_NUMBER_OF_PROVIDERS,
                );
                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                queue.add(provider1);
                provider1.markInitialLiquidityProvider();

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });

        it('returns null if provider liquidity is zero', () => {
            const queue: ProviderQueue = new ProviderQueue(
                tokenAddress1,
                NORMAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            provider1.deactivate();
            queue.add(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            provider1.deactivate();
            queue.add(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            provider1.deactivate();
            queue.add(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );
            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            provider1.deactivate();
            queue.add(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
            provider2.setLiquidityAmount(u128.fromU64(10000));
            queue.add(provider2);

            expect(queue.getNextWithLiquidity(QUOTE)).toBe(provider2);
            expect(queue.currentIndex).toStrictEqual(2);
        });
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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
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
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
            );

            expect(queue2.length).toStrictEqual(queue.length);
            expect(queue2.getAt(index)).toStrictEqual(provider.getId());
            expect(queue2.getAt(index2)).toStrictEqual(provider2.getId());
        });
    });
});
