import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders, Provider } from '../models/Provider';
import { ProviderManager } from '../managers/ProviderManager';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    createPriorityProvider,
    createProvider,
    createProviders,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    providerAddress4,
    providerAddress5,
    providerAddress6,
    TestProviderManager,
    tokenAddress1,
    tokenAddress2,
    tokenIdUint8Array1,
} from './test_helper';
import { OwedBTCManager } from '../managers/OwedBTCManager';
import { ProviderTypes } from '../types/ProviderTypes';
import {
    ENABLE_INDEX_VERIFICATION,
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
} from '../constants/Contract';
import { QuoteManager } from '../managers/QuoteManager';

describe('ProviderManager tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('Constructor', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should create a new provider manager and initialize correctly when not exists', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            expect(manager.currentIndexNormal).toStrictEqual(0);
            expect(manager.currentIndexPriority).toStrictEqual(0);
            expect(manager.currentIndexRemoval).toStrictEqual(0);
            expect(manager.initialLiquidityProviderId).toStrictEqual(u256.Zero);
            expect(manager.previousNormalStartingIndex).toStrictEqual(0);
            expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
            expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
            expect(manager.normalQueueLength).toStrictEqual(0);
            expect(manager.priorityQueueLength).toStrictEqual(0);
            expect(manager.removalQueueLength).toStrictEqual(0);
            expect(manager.normalQueueStartingIndex).toStrictEqual(0);
            expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
            expect(manager.removalQueueStartingIndex).toStrictEqual(0);
        });

        it('should create a provider manager, load stored values and initialize correctly when currentIndex = 0', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            manager.addToNormalQueue(createProvider(providerAddress1, tokenAddress1));
            manager.addToPriorityQueue(createPriorityProvider(providerAddress1, tokenAddress1));
            manager.addToRemovalQueue(createProvider(providerAddress1, tokenAddress1, true));
            manager.initialLiquidityProviderId = u256.fromU64(10000);
            manager.save();

            const manager2: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );
            expect(manager2.currentIndexNormal).toStrictEqual(0);
            expect(manager2.currentIndexPriority).toStrictEqual(0);
            expect(manager2.currentIndexRemoval).toStrictEqual(0);
            expect(manager2.initialLiquidityProviderId).toStrictEqual(u256.fromU64(10000));
            expect(manager2.previousNormalStartingIndex).toStrictEqual(0);
            expect(manager2.previousPriorityStartingIndex).toStrictEqual(0);
            expect(manager2.previousRemovalStartingIndex).toStrictEqual(0);
            expect(manager2.normalQueueLength).toStrictEqual(1);
            expect(manager2.priorityQueueLength).toStrictEqual(1);
            expect(manager2.removalQueueLength).toStrictEqual(1);
            expect(manager2.normalQueueStartingIndex).toStrictEqual(0);
            expect(manager2.priorityQueueStartingIndex).toStrictEqual(0);
            expect(manager2.removalQueueStartingIndex).toStrictEqual(0);
        });

        it('should create a provider manager, load stored values and initialize correctly when currentIndex > 1', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const normalProvider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                false,
                true,
                'eeee',
                u128.fromU32(200000),
                u128.fromU32(200000),
                u128.Zero,
                true,
            );

            const normalProvider2 = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                false,
                true,
                'eeee',
                u128.fromU32(200000),
                u128.fromU32(200000),
                u128.Zero,
                true,
            );

            const priorityProvider = createProvider(
                providerAddress3,
                tokenAddress1,
                false,
                false,
                true,
                'eeee',
                u128.fromU32(200000),
                u128.fromU32(200000),
                u128.Zero,
                true,
                true,
            );

            const priorityProvider2 = createProvider(
                providerAddress4,
                tokenAddress1,
                false,
                false,
                true,
                'eeee',
                u128.fromU32(200000),
                u128.fromU32(200000),
                u128.Zero,
                true,
                true,
            );

            const removalProvider = createProvider(
                providerAddress5,
                tokenAddress1,
                true,
                true,
                true,
                'eeee',
                u128.fromU32(200000),
                u128.fromU32(200000),
                u128.Zero,
            );

            const removalProvider2 = createProvider(
                providerAddress6,
                tokenAddress1,
                true,
                true,
                true,
                'eeee',
                u128.fromU32(200000),
                u128.fromU32(200000),
                u128.Zero,
            );

            manager.addToNormalQueue(normalProvider);
            manager.addToNormalQueue(normalProvider2);
            manager.addToPriorityQueue(priorityProvider);
            manager.addToPriorityQueue(priorityProvider2);
            manager.addToRemovalQueue(removalProvider);
            manager.addToRemovalQueue(removalProvider2);

            owedBTCManager.setSatoshisOwed(removalProvider.getId(), 20000);
            owedBTCManager.setSatoshisOwed(removalProvider2.getId(), 20000);

            manager.getNextProviderWithLiquidity(u256.fromU32(1000));
            manager.getNextProviderWithLiquidity(u256.fromU32(1000));
            manager.getNextProviderWithLiquidity(u256.fromU32(1000));
            manager.getNextProviderWithLiquidity(u256.fromU32(1000));
            manager.getNextProviderWithLiquidity(u256.fromU32(1000));
            manager.getNextProviderWithLiquidity(u256.fromU32(1000));

            manager.initialLiquidityProviderId = u256.fromU64(10000);
            manager.save();

            const manager2: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );
            expect(manager2.currentIndexNormal).toStrictEqual(0);
            expect(manager2.currentIndexPriority).toStrictEqual(0);
            expect(manager2.currentIndexRemoval).toStrictEqual(0);
            expect(manager2.initialLiquidityProviderId).toStrictEqual(u256.fromU64(10000));
            expect(manager2.previousNormalStartingIndex).toStrictEqual(1);
            expect(manager2.previousPriorityStartingIndex).toStrictEqual(1);
            expect(manager2.previousRemovalStartingIndex).toStrictEqual(1);
            expect(manager2.normalQueueLength).toStrictEqual(2);
            expect(manager2.priorityQueueLength).toStrictEqual(2);
            expect(manager2.removalQueueLength).toStrictEqual(2);
            expect(manager2.normalQueueStartingIndex).toStrictEqual(0);
            expect(manager2.priorityQueueStartingIndex).toStrictEqual(0);
            expect(manager2.removalQueueStartingIndex).toStrictEqual(0);
        });
    });

    describe('Getters amd Setters', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should get/set the initial liquidity provider correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const initialLiquidityProvider = u256.fromU64(99999);

            manager.initialLiquidityProviderId = initialLiquidityProvider;

            expect(manager.initialLiquidityProviderId).toStrictEqual(initialLiquidityProvider);
        });

        it('should get/set the previous priority starting index correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            manager.previousPriorityStartingIndex = 100;

            expect(manager.previousPriorityStartingIndex).toStrictEqual(100);
        });

        it('should get/set the previous normal starting index correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            manager.previousNormalStartingIndex = 200;

            expect(manager.previousNormalStartingIndex).toStrictEqual(200);
        });

        it('should get/set the previous removal starting index correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            manager.previousRemovalStartingIndex = 300;

            expect(manager.previousRemovalStartingIndex).toStrictEqual(300);
        });

        it('should get the priority queue length correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            expect(manager.priorityQueueLength).toStrictEqual(0);

            manager.addToPriorityQueue(createPriorityProvider(providerAddress1, tokenAddress1));
            manager.addToPriorityQueue(createPriorityProvider(providerAddress2, tokenAddress1));

            expect(manager.priorityQueueLength).toStrictEqual(2);
        });

        it('should get the normal queue length correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            expect(manager.priorityQueueLength).toStrictEqual(0);

            manager.addToNormalQueue(createProvider(providerAddress1, tokenAddress1));
            manager.addToNormalQueue(createProvider(providerAddress2, tokenAddress1));

            expect(manager.normalQueueLength).toStrictEqual(2);
        });

        it('should get the removal queue length correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            expect(manager.priorityQueueLength).toStrictEqual(0);

            manager.addToRemovalQueue(createProvider(providerAddress1, tokenAddress1, true));
            manager.addToRemovalQueue(createProvider(providerAddress2, tokenAddress1, true));

            expect(manager.removalQueueLength).toStrictEqual(2);
        });

        it('should reset all previous starting index to 0', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            manager.previousNormalStartingIndex = 100;
            manager.previousPriorityStartingIndex = 200;
            manager.previousRemovalStartingIndex = 300;

            manager.resetStartingIndex();

            expect(manager.previousNormalStartingIndex).toStrictEqual(0);
            expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
            expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        });

        it('should return true when a provider has enough remaining liquidity', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            manager.previousNormalStartingIndex = 100;
            manager.previousPriorityStartingIndex = 200;
            manager.previousRemovalStartingIndex = 300;

            manager.restoreCurrentIndex();

            expect(manager.currentIndexNormal).toStrictEqual(100);
            expect(manager.currentIndexPriority).toStrictEqual(200);
            expect(manager.currentIndexRemoval).toStrictEqual(300);
        });

        it('should return false and reset the provider when a provider do not have enough remaining liquidity and do not have reserved amount', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            manager.previousNormalStartingIndex = 100;
            manager.previousPriorityStartingIndex = 200;
            manager.previousRemovalStartingIndex = 300;

            manager.restoreCurrentIndex();

            expect(manager.currentIndexNormal).toStrictEqual(100);
            expect(manager.currentIndexPriority).toStrictEqual(200);
            expect(manager.currentIndexRemoval).toStrictEqual(300);
        });

        it('should return false and not reset the provider when a provider do not have enough remaining liquidity but have reserved amount', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            manager.previousNormalStartingIndex = 100;
            manager.previousPriorityStartingIndex = 200;
            manager.previousRemovalStartingIndex = 300;

            manager.restoreCurrentIndex();

            expect(manager.currentIndexNormal).toStrictEqual(100);
            expect(manager.currentIndexPriority).toStrictEqual(200);
            expect(manager.currentIndexRemoval).toStrictEqual(300);
        });
    });

    describe('Add/Get providers to/from queue', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should add/get providers to/from priority queue correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            expect(manager.priorityQueueLength).toStrictEqual(0);

            const provider1: Provider = createPriorityProvider(providerAddress1, tokenAddress1);
            manager.addToPriorityQueue(provider1);

            const provider2: Provider = createPriorityProvider(providerAddress2, tokenAddress1);
            manager.addToPriorityQueue(provider2);

            expect(manager.priorityQueueLength).toStrictEqual(2);
            expect(manager.getFromPriorityQueue(provider1.getQueueIndex())).toStrictEqual(
                provider1.getId(),
            );

            expect(manager.getFromPriorityQueue(provider2.getQueueIndex())).toStrictEqual(
                provider2.getId(),
            );
        });

        it('should add/get providers to/from normal queue correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            expect(manager.normalQueueLength).toStrictEqual(0);

            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            manager.addToNormalQueue(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
            manager.addToNormalQueue(provider2);

            expect(manager.normalQueueLength).toStrictEqual(2);
            expect(manager.getFromNormalQueue(provider1.getQueueIndex())).toStrictEqual(
                provider1.getId(),
            );

            expect(manager.getFromNormalQueue(provider2.getQueueIndex())).toStrictEqual(
                provider2.getId(),
            );
        });

        it('should add/get providers to/from removal queue correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            expect(manager.normalQueueLength).toStrictEqual(0);

            const provider1: Provider = createProvider(providerAddress1, tokenAddress1, true);
            manager.addToRemovalQueue(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1, true);
            manager.addToRemovalQueue(provider2);

            expect(manager.removalQueueLength).toStrictEqual(2);
            expect(manager.getFromRemovalQueue(provider1.getQueueIndex())).toStrictEqual(
                provider1.getId(),
            );

            expect(manager.getFromRemovalQueue(provider2.getQueueIndex())).toStrictEqual(
                provider2.getId(),
            );
        });

        it('should get providers id by types correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider1: Provider = createProvider(providerAddress1, tokenAddress1, true);
            manager.addToRemovalQueue(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
            manager.addToNormalQueue(provider2);

            const provider3: Provider = createPriorityProvider(providerAddress3, tokenAddress1);
            manager.addToPriorityQueue(provider3);

            expect(manager.removalQueueLength).toStrictEqual(1);
            expect(manager.normalQueueLength).toStrictEqual(1);
            expect(manager.priorityQueueLength).toStrictEqual(1);

            expect(
                manager.getIdFromQueue(provider1.getQueueIndex(), ProviderTypes.LiquidityRemoval),
            ).toStrictEqual(provider1.getId());

            expect(
                manager.getIdFromQueue(provider2.getQueueIndex(), ProviderTypes.Normal),
            ).toStrictEqual(provider2.getId());

            expect(
                manager.getIdFromQueue(provider3.getQueueIndex(), ProviderTypes.Priority),
            ).toStrictEqual(provider3.getId());
        });

        it('should throws when get initial provider from queue but not set', () => {
            expect(() => {
                const owedBTCManager = new OwedBTCManager();
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    owedBTCManager,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                );

                manager.getProviderFromQueue(
                    INITIAL_LIQUIDITY_PROVIDER_INDEX,
                    ProviderTypes.Normal,
                );
            }).toThrow();
        });

        it('should get initial provider from queue correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const initialProvider: Provider = createProvider(providerAddress1, tokenAddress1);
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            initialProvider.markInitialLiquidityProvider();

            manager.initialLiquidityProviderId = initialProvider.getId();

            const resultProvider: Provider = manager.getProviderFromQueue(
                INITIAL_LIQUIDITY_PROVIDER_INDEX,
                ProviderTypes.Normal,
            );

            expect(resultProvider.getId()).toStrictEqual(initialProvider.getId());
            expect(resultProvider.getQueueIndex()).toStrictEqual(initialProvider.getQueueIndex());
        });

        it('should throws when get normal provider from queue but not in the list', () => {
            expect(() => {
                const owedBTCManager = new OwedBTCManager();
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    owedBTCManager,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                );

                manager.getProviderFromQueue(23, ProviderTypes.Normal);
            }).toThrow();
        });

        it('should get normal provider from queue correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            manager.addToNormalQueue(provider);

            const resultProvider: Provider = manager.getProviderFromQueue(
                provider.getQueueIndex(),
                ProviderTypes.Normal,
            );

            expect(resultProvider.getId()).toStrictEqual(provider.getId());
            expect(resultProvider.getQueueIndex()).toStrictEqual(provider.getQueueIndex());
        });

        it('should throws when get priority provider from queue but not in the list', () => {
            expect(() => {
                const owedBTCManager = new OwedBTCManager();
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    owedBTCManager,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                );

                manager.getProviderFromQueue(23, ProviderTypes.Priority);
            }).toThrow();
        });

        it('should get priority provider from queue correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createPriorityProvider(providerAddress1, tokenAddress1);
            manager.addToPriorityQueue(provider);

            const resultProvider: Provider = manager.getProviderFromQueue(
                provider.getQueueIndex(),
                ProviderTypes.Priority,
            );

            expect(resultProvider.getId()).toStrictEqual(provider.getId());
            expect(resultProvider.getQueueIndex()).toStrictEqual(provider.getQueueIndex());
        });

        it('should throws when get removal provider from queue but not in the list', () => {
            expect(() => {
                const owedBTCManager = new OwedBTCManager();
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    owedBTCManager,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                );

                manager.getProviderFromQueue(23, ProviderTypes.LiquidityRemoval);
            }).toThrow();
        });

        it('should get removal provider from queue correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
            manager.addToRemovalQueue(provider);

            const resultProvider: Provider = manager.getProviderFromQueue(
                provider.getQueueIndex(),
                ProviderTypes.LiquidityRemoval,
            );

            expect(resultProvider.getId()).toStrictEqual(provider.getId());
            expect(resultProvider.getQueueIndex()).toStrictEqual(provider.getQueueIndex());
        });

        it('should return 0 when priority queue does not contains the provider index or is empty', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const providerIdOut: u256 = manager.getFromPriorityQueue(22222);

            expect(providerIdOut).toStrictEqual(u256.Zero);
        });

        it('should return 0 when removal queue does not contains the provider index or is empty', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );
            const providerIdOut: u256 = manager.getFromRemovalQueue(22222);

            expect(providerIdOut).toStrictEqual(u256.Zero);
        });

        it('should return 0 when getFromStandardQueue does not contains the provider index or is empty', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const providerIdOut: u256 = manager.getFromNormalQueue(22222);

            expect(providerIdOut).toStrictEqual(u256.Zero);
        });
    });

    describe('Add/Get providers to/from  purged queues', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });
        it('should add/get providers to/from purged priority queue correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider1: Provider = createPriorityProvider(providerAddress1, tokenAddress1);
            provider1.setLiquidityAmount(u128.fromU32(1000));
            manager.addToPriorityQueue(provider1);
            manager.addToPriorityPurgedQueue(provider1);

            const provider2: Provider = createPriorityProvider(providerAddress2, tokenAddress1);
            provider2.setLiquidityAmount(u128.fromU32(1000));
            manager.addToPriorityQueue(provider2);
            manager.addToPriorityPurgedQueue(provider2);

            expect(manager.priorityPurgedQueueLength).toStrictEqual(2);

            const result1 = manager.getNextFromPurgedProvider(u256.fromU32(1000));
            const result2 = manager.getNextFromPurgedProvider(u256.fromU32(1000));

            expect(result1).not.toBeNull();
            expect(result2).not.toBeNull();
            expect(result1).toBe(provider1);
            expect(result2).toBe(provider2);
            if (result1 !== null) {
                expect(result1.isPurged()).toBeTruthy();
            }

            if (result2 !== null) {
                expect(result2.isPurged()).toBeTruthy();
            }
        });

        it('should add/get providers to/from purged normal queue correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            manager.addToNormalQueue(provider1);
            manager.addToNormalPurgedQueue(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
            manager.addToNormalQueue(provider2);
            manager.addToNormalPurgedQueue(provider2);

            expect(manager.normalPurgedQueueLength).toStrictEqual(2);

            const result1 = manager.getNextFromPurgedProvider(u256.fromU32(1000));
            const result2 = manager.getNextFromPurgedProvider(u256.fromU32(1000));

            expect(result1).not.toBeNull();
            expect(result2).not.toBeNull();
            expect(result1).toBe(provider1);
            expect(result2).toBe(provider2);

            if (result1 !== null) {
                expect(result1.isPurged()).toBeTruthy();
            }

            if (result2 !== null) {
                expect(result2.isPurged()).toBeTruthy();
            }
        });

        it('should add/get providers to/from purged removal queue correctly', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider1: Provider = createProvider(providerAddress1, tokenAddress1, true);
            manager.addToRemovalQueue(provider1);
            manager.addToRemovalPurgedQueue(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1, true);
            manager.addToRemovalQueue(provider2);
            manager.addToRemovalPurgedQueue(provider2);

            expect(manager.removalPurgedQueueLength).toStrictEqual(2);

            const result1 = manager.getNextFromPurgedProvider(u256.fromU32(1000));
            const result2 = manager.getNextFromPurgedProvider(u256.fromU32(1000));

            expect(result1).not.toBeNull();
            expect(result2).not.toBeNull();
            expect(result1).toBe(provider1);
            expect(result2).toBe(provider2);
            if (result1 !== null) {
                expect(result1.isPurged()).toBeTruthy();
            }

            if (result2 !== null) {
                expect(result2.isPurged()).toBeTruthy();
            }
        });
    });

    describe('Reset', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should burn the provider funds when burnRemainingFunds is true and liquidity is not 0', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            manager.resetProvider(provider, true);

            expect(TransferHelper.safeTransferCalled).toBeTruthy();
        });

        it('should not burn the provider funds when burnRemainingFunds is true and liquidity is 0', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.Zero);
            manager.resetProvider(provider, true);

            expect(TransferHelper.safeTransferCalled).toBeFalsy();
        });

        it('should not burn the provider funds when burnRemainingFunds is false', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.Zero);
            manager.resetProvider(provider, false);

            expect(TransferHelper.safeTransferCalled).toBeFalsy();
        });

        it('should remove the provider from the priority queue and reset it', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.markPriority();
            const index: u32 = manager.addToPriorityQueue(provider);

            const currentQuote = u256.fromU32(1000);
            const provider2 = manager.getNextProviderWithLiquidity(currentQuote);

            expect(provider2).not.toBeNull();

            if (provider2 !== null) {
                manager.resetProvider(provider2, false);

                expect(provider2.isActive()).toBeFalsy();
                expect(provider2.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
                expect(manager.getFromPriorityQueue(index)).toStrictEqual(u256.Zero);
            }
        });

        it('should remove the provider from the normal queue and reset it', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.activate();
            provider.clearPriority();
            const index: u32 = manager.addToNormalQueue(provider);

            const currentQuote = u256.fromU32(1000);
            const provider2 = manager.getNextProviderWithLiquidity(currentQuote);

            expect(provider2).not.toBeNull();
            if (provider2 !== null) {
                manager.resetProvider(provider2, false);

                expect(provider2.isActive()).toBeFalsy();
                expect(provider2.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
                expect(manager.getFromNormalQueue(index)).toStrictEqual(u256.Zero);
            }
        });

        it('should remove the provider from the removal queue and reset it', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
            const index: u32 = manager.addToRemovalQueue(provider);

            manager.resetProvider(provider, false);
            expect(provider.isPendingRemoval()).toBeFalsy();
            expect(provider.isLiquidityProvider()).toBeFalsy();
            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(manager.getFromRemovalQueue(index)).toStrictEqual(u256.Zero);
        });

        it('should only reset listing values when initial liquidity provider', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.markInitialLiquidityProvider();
            provider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);

            manager.resetProvider(provider, false);

            expect(provider.getQueueIndex()).toStrictEqual(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            expect(provider.isInitialLiquidityProvider()).toBeTruthy();
        });
    });

    describe('Save', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should correctly persists the values', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            manager.initialLiquidityProviderId = u256.fromU32(1);
            manager.addToNormalQueue(createProvider(providerAddress1, tokenAddress1));
            manager.addToNormalQueue(createProvider(providerAddress2, tokenAddress1));
            manager.addToNormalQueue(createProvider(providerAddress3, tokenAddress1));

            manager.addToPriorityQueue(createProvider(providerAddress1, tokenAddress2));
            manager.addToPriorityQueue(createProvider(providerAddress2, tokenAddress2));
            manager.addToPriorityQueue(createProvider(providerAddress3, tokenAddress2));

            manager.addToRemovalQueue(createProvider(providerAddress4, tokenAddress1, true));
            manager.addToRemovalQueue(createProvider(providerAddress5, tokenAddress1, true));
            manager.addToRemovalQueue(createProvider(providerAddress6, tokenAddress1, true));

            manager.save();

            const manager2: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            expect(manager.initialLiquidityProviderId).toStrictEqual(u256.fromU32(1));
            expect(manager2.previousPriorityStartingIndex).toStrictEqual(0);
            expect(manager2.previousNormalStartingIndex).toStrictEqual(0);
            expect(manager2.previousRemovalStartingIndex).toStrictEqual(0);

            expect(manager2.normalQueueLength).toStrictEqual(3);
            expect(manager2.priorityQueueLength).toStrictEqual(3);
            expect(manager2.removalQueueLength).toStrictEqual(3);

            expect(manager2.priorityQueueStartingIndex).toStrictEqual(0);
            expect(manager2.removalQueueStartingIndex).toStrictEqual(0);
            expect(manager2.normalQueueStartingIndex).toStrictEqual(0);

            expect(manager2.getFromNormalQueue(0)).toStrictEqual(manager.getFromNormalQueue(0));
            expect(manager2.getFromNormalQueue(1)).toStrictEqual(manager.getFromNormalQueue(1));
            expect(manager2.getFromNormalQueue(2)).toStrictEqual(manager.getFromNormalQueue(2));

            expect(manager2.getFromPriorityQueue(0)).toStrictEqual(manager.getFromPriorityQueue(0));
            expect(manager2.getFromPriorityQueue(1)).toStrictEqual(manager.getFromPriorityQueue(1));
            expect(manager2.getFromPriorityQueue(2)).toStrictEqual(manager.getFromPriorityQueue(2));

            expect(manager2.getFromRemovalQueue(0)).toStrictEqual(manager.getFromRemovalQueue(0));
            expect(manager2.getFromRemovalQueue(1)).toStrictEqual(manager.getFromRemovalQueue(1));
            expect(manager2.getFromRemovalQueue(2)).toStrictEqual(manager.getFromRemovalQueue(2));
        });

        it('should correctly persists the value when save is called and currentIndex > 0', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const providers = createProviders(4, 0);

            for (let i: u8 = 0; i < 4; i++) {
                providers[i].setLiquidityAmount(u128.fromU32(1000));
                providers[i].setReservedAmount(u128.fromU32(999));
                manager.addToNormalQueue(providers[i]);
            }

            const currentQuote = u256.fromU32(1000);
            // Should set currentIndex to 2
            const p1 = manager.getNextProviderWithLiquidity(currentQuote);
            const p2 = manager.getNextProviderWithLiquidity(currentQuote);
            expect(p1).toBe(providers[0]);
            expect(p2).toBe(providers[1]);

            manager.save();
            expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        });

        it('should correctly persists the value when save is called and currentIndexPriority > 0', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const providers = createProviders(4, 0);

            for (let i: u8 = 0; i < 4; i++) {
                providers[i].activate();
                providers[i].markPriority();
                providers[i].setLiquidityAmount(u128.fromU32(20000));
                providers[i].setReservedAmount(u128.fromU32(999));
                manager.addToPriorityQueue(providers[i]);
            }

            const currentQuote = u256.fromU32(1000);
            // Should set currentIndex to 2
            const p1 = manager.getNextProviderWithLiquidity(currentQuote);
            const p2 = manager.getNextProviderWithLiquidity(currentQuote);
            const p3 = manager.getNextProviderWithLiquidity(currentQuote);

            expect(p1).toBe(providers[0]);
            expect(p2).toBe(providers[1]);
            expect(p3).toBe(providers[2]);

            manager.save();

            expect(manager.previousPriorityStartingIndex).toStrictEqual(2);
        });

        it('should correctly persists the value when save is called and currentIndexRemoval > 0', () => {
            const owedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const providers = createProviders(4, 0, true);

            for (let i: u8 = 0; i < 4; i++) {
                manager.addToRemovalQueue(providers[i]);
                owedBTCManager.setSatoshisOwed(providers[i].getId(), 20000);
            }

            const currentQuote = u256.fromU32(1000);
            // Should set currentIndex to 2
            const p1 = manager.getNextProviderWithLiquidity(currentQuote);
            const p2 = manager.getNextProviderWithLiquidity(currentQuote);
            const p3 = manager.getNextProviderWithLiquidity(currentQuote);

            expect(p1).toBe(providers[0]);
            expect(p2).toBe(providers[1]);
            expect(p3).toBe(providers[2]);

            manager.save();

            expect(manager.previousRemovalStartingIndex).toStrictEqual(2);
        });
    });
});
