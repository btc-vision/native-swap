import { Blockchain, BytesReader, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    clearCachedProviders,
    clearPendingStakingContractAmount,
    getPendingStakingContractAmount,
    Provider,
} from '../models/Provider';
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
    TestProviderManager,
    tokenAddress1,
    tokenAddress2,
    tokenIdUint8Array1,
} from './test_helper';
import { ProviderTypes } from '../types/ProviderTypes';
import {
    ENABLE_INDEX_VERIFICATION,
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
} from '../constants/Contract';
import { QuoteManager } from '../managers/QuoteManager';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';

describe('ProviderManager tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('ProviderManager Constructor', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should create a new provider manager and initialize correctly when not exists', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            expect(manager.currentIndexNormal).toStrictEqual(0);
            expect(manager.currentIndexPriority).toStrictEqual(0);
            expect(manager.initialLiquidityProviderId).toStrictEqual(u256.Zero);
            expect(manager.previousNormalStartingIndex).toStrictEqual(0);
            expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
            expect(manager.normalQueueLength).toStrictEqual(0);
            expect(manager.priorityQueueLength).toStrictEqual(0);
            expect(manager.normalQueueStartingIndex).toStrictEqual(0);
            expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
        });

        it('should create a provider manager, load stored values and initialize correctly when currentIndex = 0', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            manager.addToNormalQueue(createProvider(providerAddress1, tokenAddress1));
            manager.addToPriorityQueue(createPriorityProvider(providerAddress1, tokenAddress1));
            manager.initialLiquidityProviderId = u256.fromU64(10000);
            manager.save();

            const manager2: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );
            expect(manager2.currentIndexNormal).toStrictEqual(0);
            expect(manager2.currentIndexPriority).toStrictEqual(0);
            expect(manager2.initialLiquidityProviderId).toStrictEqual(u256.fromU64(10000));
            expect(manager2.previousNormalStartingIndex).toStrictEqual(0);
            expect(manager2.previousPriorityStartingIndex).toStrictEqual(0);
            expect(manager2.normalQueueLength).toStrictEqual(1);
            expect(manager2.priorityQueueLength).toStrictEqual(1);
            expect(manager2.normalQueueStartingIndex).toStrictEqual(0);
            expect(manager2.priorityQueueStartingIndex).toStrictEqual(0);
        });

        it('should create a provider manager, load stored values and initialize correctly when currentIndex > 1', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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

            manager.addToNormalQueue(normalProvider);
            manager.addToNormalQueue(normalProvider2);
            manager.addToPriorityQueue(priorityProvider);
            manager.addToPriorityQueue(priorityProvider2);

            manager.getNextProviderWithLiquidity(u256.fromU32(1000));
            manager.getNextProviderWithLiquidity(u256.fromU32(1000));
            manager.getNextProviderWithLiquidity(u256.fromU32(1000));
            manager.getNextProviderWithLiquidity(u256.fromU32(1000));

            manager.initialLiquidityProviderId = u256.fromU64(10000);
            manager.save();

            const manager2: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );
            expect(manager2.currentIndexNormal).toStrictEqual(0);
            expect(manager2.currentIndexPriority).toStrictEqual(0);
            expect(manager2.initialLiquidityProviderId).toStrictEqual(u256.fromU64(10000));
            expect(manager2.previousNormalStartingIndex).toStrictEqual(1);
            expect(manager2.previousPriorityStartingIndex).toStrictEqual(1);
            expect(manager2.normalQueueLength).toStrictEqual(2);
            expect(manager2.priorityQueueLength).toStrictEqual(2);
            expect(manager2.normalQueueStartingIndex).toStrictEqual(0);
            expect(manager2.priorityQueueStartingIndex).toStrictEqual(0);
        });
    });

    describe('ProviderManager Getters amd Setters', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should get/set the initial liquidity provider correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const initialLiquidityProvider = u256.fromU64(99999);

            manager.initialLiquidityProviderId = initialLiquidityProvider;

            expect(manager.initialLiquidityProviderId).toStrictEqual(initialLiquidityProvider);
        });

        it('should get/set the previous priority starting index correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            manager.previousPriorityStartingIndex = 100;

            expect(manager.previousPriorityStartingIndex).toStrictEqual(100);
        });

        it('should get/set the previous normal starting index correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            manager.previousNormalStartingIndex = 200;

            expect(manager.previousNormalStartingIndex).toStrictEqual(200);
        });

        it('should get the priority queue length correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            expect(manager.priorityQueueLength).toStrictEqual(0);

            manager.addToPriorityQueue(createPriorityProvider(providerAddress1, tokenAddress1));
            manager.addToPriorityQueue(createPriorityProvider(providerAddress2, tokenAddress1));

            expect(manager.priorityQueueLength).toStrictEqual(2);
        });

        it('should get the normal queue length correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            expect(manager.priorityQueueLength).toStrictEqual(0);

            manager.addToNormalQueue(createProvider(providerAddress1, tokenAddress1));
            manager.addToNormalQueue(createProvider(providerAddress2, tokenAddress1));

            expect(manager.normalQueueLength).toStrictEqual(2);
        });

        it('should reset all previous starting index to 0', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            manager.previousNormalStartingIndex = 100;
            manager.previousPriorityStartingIndex = 200;

            manager.resetStartingIndex();

            expect(manager.previousNormalStartingIndex).toStrictEqual(0);
            expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
        });

        it('should reset all previous starting index to corresponding queue starting index', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            manager.previousNormalStartingIndex = 0;
            manager.previousPriorityStartingIndex = 0;

            manager.getNormalQueue.setStartingIndex(10);
            manager.getPriorityQueue.setStartingIndex(20);

            manager.resetStartingIndex();

            expect(manager.previousNormalStartingIndex).toStrictEqual(9);
            expect(manager.previousPriorityStartingIndex).toStrictEqual(19);
        });

        it('should restore all current index to previous value', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            manager.previousNormalStartingIndex = 100;
            manager.previousPriorityStartingIndex = 200;

            manager.restoreCurrentIndex();

            expect(manager.currentIndexNormal).toStrictEqual(100);
            expect(manager.currentIndexPriority).toStrictEqual(200);
        });

        it('should get the queue data', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider1: Provider = createPriorityProvider(providerAddress1, tokenAddress1);
            manager.addToPriorityQueue(provider1);
            manager.addToPriorityPurgedQueue(provider1);
            provider1.save();

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
            manager.addToNormalQueue(provider2);
            manager.addToNormalPurgedQueue(provider2);
            provider2.save();

            const queueData = manager.getQueueData();

            const reader = new BytesReader(queueData);

            const priorityQueueLength = reader.readU32();
            const priorityQueueStartingIndex = reader.readU32();
            const normalQueueLength = reader.readU32();
            const normalQueueStartingIndex = reader.readU32();
            const priorityPurgedQueueLength = reader.readU32();
            const normalPurgedQueueLength = reader.readU32();

            expect(priorityQueueLength).toStrictEqual(1);
            expect(priorityQueueStartingIndex).toStrictEqual(0);
            expect(normalQueueLength).toStrictEqual(1);
            expect(normalQueueStartingIndex).toStrictEqual(0);
            expect(priorityPurgedQueueLength).toStrictEqual(1);
            expect(normalPurgedQueueLength).toStrictEqual(1);
        });
    });

    describe('ProviderManager Add/Get/Remove providers to/from queue', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should add/get providers to/from priority queue correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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

        it('should get providers id by types correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
            manager.addToNormalQueue(provider2);

            const provider3: Provider = createPriorityProvider(providerAddress3, tokenAddress1);
            manager.addToPriorityQueue(provider3);

            expect(manager.normalQueueLength).toStrictEqual(1);
            expect(manager.priorityQueueLength).toStrictEqual(1);

            expect(
                manager.getIdFromQueue(provider2.getQueueIndex(), ProviderTypes.Normal),
            ).toStrictEqual(provider2.getId());

            expect(
                manager.getIdFromQueue(provider3.getQueueIndex(), ProviderTypes.Priority),
            ).toStrictEqual(provider3.getId());
        });

        it('should throws when get initial provider from queue but not set', () => {
            expect(() => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                manager.getProviderFromQueue(
                    INITIAL_LIQUIDITY_PROVIDER_INDEX,
                    ProviderTypes.Normal,
                );
            }).toThrow();
        });

        it('should get initial provider from queue correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                manager.getProviderFromQueue(23, ProviderTypes.Normal);
            }).toThrow();
        });

        it('should get normal provider from queue correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                manager.getProviderFromQueue(23, ProviderTypes.Priority);
            }).toThrow();
        });

        it('should get priority provider from queue correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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

        it('should return 0 when priority queue does not contains the provider index or is empty', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const providerIdOut: u256 = manager.getFromPriorityQueue(22222);

            expect(providerIdOut).toStrictEqual(u256.Zero);
        });

        it('should return 0 when getFromStandardQueue does not contains the provider index or is empty', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const providerIdOut: u256 = manager.getFromNormalQueue(22222);

            expect(providerIdOut).toStrictEqual(u256.Zero);
        });

        it('should remove providers from priority queue correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createPriorityProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.fromU32(1000));
            manager.addToPriorityQueue(provider);

            expect(manager.priorityQueueLength).toStrictEqual(1);

            manager.removeFromPriorityQueue(provider);

            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('should remove providers from normal queue correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.fromU32(1000));
            manager.addToNormalQueue(provider);

            expect(manager.normalQueueLength).toStrictEqual(1);

            manager.removeFromNormalQueue(provider);

            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });
    });

    describe('ProviderManager Add/Get/Remove providers to/from purged queues', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should add/get providers to/from purged priority queue correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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

        it('should add/get providers to/from normal queue correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
            provider1.setLiquidityAmount(u128.fromU32(1000));
            manager.addToNormalQueue(provider1);
            manager.addToNormalPurgedQueue(provider1);

            const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
            provider2.setLiquidityAmount(u128.fromU32(1000));
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

        it('should remove providers from purged priority queue correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createPriorityProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.fromU32(1000));
            manager.addToPriorityQueue(provider);
            manager.addToPriorityPurgedQueue(provider);

            expect(manager.priorityPurgedQueueLength).toStrictEqual(1);

            manager.removeFromPurgeQueue(provider);

            expect(manager.priorityPurgedQueueLength).toStrictEqual(0);
        });

        it('should remove providers from purged normal queue correctly', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.fromU32(1000));
            manager.addToNormalQueue(provider);
            manager.addToNormalPurgedQueue(provider);

            expect(manager.normalPurgedQueueLength).toStrictEqual(1);

            manager.removeFromPurgeQueue(provider);

            expect(manager.normalPurgedQueueLength).toStrictEqual(0);
        });
    });

    describe('ProviderManager Purge/Restore Provider', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should purge and restore normal provider when available liquidity >= Minimum', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.fromU32(20000));
            provider.setReservedAmount(u128.fromU32(10000));

            manager.addToNormalQueue(provider);
            quoteManager.setBlockQuote(100, u256.fromU32(1000000));

            const reservationData: ReservationProviderData = new ReservationProviderData(
                provider.getQueueIndex(),
                u128.fromU32(10000),
                ProviderTypes.Normal,
                100,
            );

            manager.purgeAndRestoreProvider(reservationData, quoteManager.getBlockQuote(100));

            expect(provider.isPurged()).toBeTruthy();
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
        });

        it('should purge and restore priority provider when  available liquidity >= Minimum', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.fromU32(20000));
            provider.setReservedAmount(u128.fromU32(10000));
            provider.markPriority();

            manager.addToPriorityQueue(provider);
            quoteManager.setBlockQuote(100, u256.fromU32(1000000));

            const reservationData: ReservationProviderData = new ReservationProviderData(
                provider.getQueueIndex(),
                u128.fromU32(10000),
                ProviderTypes.Priority,
                100,
            );

            manager.purgeAndRestoreProvider(reservationData, quoteManager.getBlockQuote(100));

            expect(provider.isPurged()).toBeTruthy();
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
        });

        it('should reset provider when not removal,  available liquidity < Minimum and no reserved amount left', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            liquidityQueueReserve.addToTotalReserve(u256.fromU32(100000));
            liquidityQueueReserve.addToVirtualTokenReserve(u256.fromU32(100000));
            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.fromU32(20000));
            provider.setReservedAmount(u128.fromU32(20000));

            manager.addToNormalQueue(provider);
            quoteManager.setBlockQuote(100, u256.fromU64(100000000000000));

            const reservationData: ReservationProviderData = new ReservationProviderData(
                provider.getQueueIndex(),
                u128.fromU32(20000),
                ProviderTypes.Normal,
                100,
            );

            manager.purgeAndRestoreProvider(reservationData, quoteManager.getBlockQuote(100));

            expect(provider.isPurged()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('should not reset provider when not removal,  available liquidity < Minimum and reserved amount left', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.setLiquidityAmount(u128.fromU32(20000));
            provider.setReservedAmount(u128.fromU32(20000));

            manager.addToNormalQueue(provider);
            quoteManager.setBlockQuote(100, u256.fromU64(100000000000000));

            const reservationData: ReservationProviderData = new ReservationProviderData(
                provider.getQueueIndex(),
                u128.fromU32(19999),
                ProviderTypes.Normal,
                100,
            );

            manager.purgeAndRestoreProvider(reservationData, quoteManager.getBlockQuote(100));

            expect(provider.isPurged()).toBeFalsy();
            expect(provider.isActive()).toBeTruthy();
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('should revert when not removal,  available provider reserved amount < reservation amount', () => {
            expect(() => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: TestProviderManager = new TestProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider: Provider = createProvider(providerAddress1, tokenAddress1);
                provider.setLiquidityAmount(u128.fromU32(20000));
                provider.setReservedAmount(u128.fromU32(20000));

                manager.addToNormalQueue(provider);
                quoteManager.setBlockQuote(100, u256.fromU64(100000000000000));

                const reservationData: ReservationProviderData = new ReservationProviderData(
                    provider.getQueueIndex(),
                    u128.fromU32(30000),
                    ProviderTypes.Normal,
                    100,
                );

                manager.purgeAndRestoreProvider(reservationData, quoteManager.getBlockQuote(100));
            }).toThrow();
        });
    });

    describe('ProviderManager Reset', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should burn the provider funds when burnRemainingFunds is true and liquidity is not 0', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            manager.addToNormalQueue(provider);
            liquidityQueueReserve.addToTotalReserve(provider.getLiquidityAmount().toU256());
            liquidityQueueReserve.addToVirtualTokenReserve(u256.fromU32(10000));

            manager.resetProvider(provider, true);

            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromU32(1000));
            expect(liquidityQueueReserve.liquidity).toStrictEqual(u256.Zero);
        });

        it('should not burn the provider funds when burnRemainingFunds is true and liquidity is 0', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            manager.addToNormalQueue(provider);
            provider.setLiquidityAmount(u128.Zero);
            manager.resetProvider(provider, true);

            expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
        });

        it('should not burn the provider funds when burnRemainingFunds is false', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            manager.addToNormalQueue(provider);
            provider.setLiquidityAmount(u128.Zero);
            manager.resetProvider(provider, false);

            expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
        });

        it('should remove the provider from the priority queue and reset it', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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

        it('should only reset listing values when initial liquidity provider', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.markInitialLiquidityProvider();
            provider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);

            manager.resetProvider(provider, false);

            expect(provider.getQueueIndex()).toStrictEqual(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            expect(provider.isInitialLiquidityProvider()).toBeTruthy();
        });
    });

    describe('ProviderManager Save', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should correctly persists the values', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            manager.initialLiquidityProviderId = u256.fromU32(1);
            manager.addToNormalQueue(createProvider(providerAddress1, tokenAddress1));
            manager.addToNormalQueue(createProvider(providerAddress2, tokenAddress1));
            manager.addToNormalQueue(createProvider(providerAddress3, tokenAddress1));

            manager.addToPriorityQueue(createProvider(providerAddress1, tokenAddress2));
            manager.addToPriorityQueue(createProvider(providerAddress2, tokenAddress2));
            manager.addToPriorityQueue(createProvider(providerAddress3, tokenAddress2));

            manager.save();

            const manager2: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            expect(manager.initialLiquidityProviderId).toStrictEqual(u256.fromU32(1));
            expect(manager2.previousPriorityStartingIndex).toStrictEqual(0);
            expect(manager2.previousNormalStartingIndex).toStrictEqual(0);

            expect(manager2.normalQueueLength).toStrictEqual(3);
            expect(manager2.priorityQueueLength).toStrictEqual(3);

            expect(manager2.priorityQueueStartingIndex).toStrictEqual(0);
            expect(manager2.normalQueueStartingIndex).toStrictEqual(0);

            expect(manager2.getFromNormalQueue(0)).toStrictEqual(manager.getFromNormalQueue(0));
            expect(manager2.getFromNormalQueue(1)).toStrictEqual(manager.getFromNormalQueue(1));
            expect(manager2.getFromNormalQueue(2)).toStrictEqual(manager.getFromNormalQueue(2));

            expect(manager2.getFromPriorityQueue(0)).toStrictEqual(manager.getFromPriorityQueue(0));
            expect(manager2.getFromPriorityQueue(1)).toStrictEqual(manager.getFromPriorityQueue(1));
            expect(manager2.getFromPriorityQueue(2)).toStrictEqual(manager.getFromPriorityQueue(2));
        });

        it('should correctly persists the value when save is called and currentIndex > 0', () => {
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );

            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
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

        describe('ProviderManager getNextProviderWithLiquidity with purged providers', () => {
            beforeEach(() => {
                clearCachedProviders();
                Blockchain.clearStorage();
                Blockchain.clearMockedResults();
                TransferHelper.clearMockedResults();
            });

            it('should return a purged provider with liquidity', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: TestProviderManager = new TestProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const providers = createProviders(3, 0);
                for (let i: u8 = 0; i < 3; i++) {
                    manager.addToNormalQueue(providers[i]);
                }

                manager.addToNormalPurgedQueue(providers[0]);

                const currentQuote = u256.fromU32(1000);
                const nextProvider: Provider | null =
                    manager.getNextProviderWithLiquidity(currentQuote);

                expect(nextProvider).not.toBeNull();
                expect(nextProvider).toBe(providers[0]);
            });
        });

        describe('ProviderManager getNextProviderWithLiquidity provider should not be purged', () => {
            beforeEach(() => {
                clearCachedProviders();
                Blockchain.clearStorage();
                Blockchain.clearMockedResults();
                TransferHelper.clearMockedResults();
            });

            it('should revert if initial provider is purged', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: TestProviderManager = new TestProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    const provider = createProvider(providerAddress1, tokenAddress1);
                    provider.markInitialLiquidityProvider();
                    provider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
                    provider.markPurged();

                    manager.initialLiquidityProviderId = provider.getId();
                    manager.getNextProviderWithLiquidity(u256.Zero);
                }).toThrow();
            });

            it('should revert if normal provider is purged', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: TestProviderManager = new TestProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    const provider = createProvider(providerAddress1, tokenAddress1);
                    manager.addToNormalQueue(provider);
                    provider.markPurged();
                    provider.setLiquidityAmount(u128.fromU32(10000));

                    manager.getNextProviderWithLiquidity(u256.fromU32(10));
                }).toThrow();
            });

            it('should revert if priority provider is purged', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: TestProviderManager = new TestProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    const provider = createProvider(providerAddress1, tokenAddress1);
                    provider.markPriority();
                    manager.addToPriorityQueue(provider);
                    provider.markPurged();
                    provider.setLiquidityAmount(u128.fromU32(10000));

                    manager.getNextProviderWithLiquidity(u256.fromU32(10));
                }).toThrow();
            });
        });

        describe('ProviderManager getNextProviderWithLiquidity with only providers in priority queue tests', () => {
            beforeEach(() => {
                clearCachedProviders();
                Blockchain.clearStorage();
                Blockchain.clearMockedResults();
                TransferHelper.clearMockedResults();
            });

            it('should set currentIndexPriority to priorityQueue startingIndex when currentIndexPriority = 0 and provider valid for the test ', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: TestProviderManager = new TestProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                // Add 3 providers that will be deleted. This will move the priorityQueue starting index to 3.
                const providersToDelete = createProviders(
                    3,
                    0,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(1600),
                    u128.fromU32(1600),
                    true,
                    true,
                );
                for (let i: u8 = 0; i < 3; i++) {
                    manager.addToPriorityQueue(providersToDelete[i]);
                }

                const provider: Provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    true,
                    'wdewed23rdwewe',
                    u128.fromU32(10000000),
                    u128.fromU32(200000000),
                    u128.fromU32(10000),
                    true,
                    true,
                );

                manager.addToPriorityQueue(provider);

                for (let i: u8 = 0; i < 3; i++) {
                    manager.removeFromPriorityQueue(providersToDelete[i]);
                }

                // TODO: Check later quote
                const currentQuote: u256 = u256.fromU32(1000);
                manager.cleanUpQueues(currentQuote);

                expect(manager.priorityQueueStartingIndex).toStrictEqual(3);

                const nextProvider: Provider | null =
                    manager.getNextProviderWithLiquidity(currentQuote);

                expect(nextProvider).not.toBeNull();
                expect(nextProvider).toBe(provider);
            });

            it('should use currentIndexPriority when currentIndexPriority <> 0 and provider valid for the test', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                // Add 3 providers that will be deleted. This will move the priorityQueue starting index to 3.
                const providersToDelete = createProviders(
                    3,
                    0,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(1600),
                    u128.fromU32(1600),
                    true,
                    true,
                );
                for (let i: u8 = 0; i < 3; i++) {
                    manager.addToPriorityQueue(providersToDelete[i]);
                }

                // Add 2 more providers that are priority.
                const providersPriority = createProviders(
                    2,
                    3,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(2600),
                    u128.fromU32(1600),
                    true,
                    true,
                );
                for (let i: u8 = 0; i < 2; i++) {
                    manager.addToPriorityQueue(providersPriority[i]);
                }

                for (let i: u8 = 0; i < 3; i++) {
                    manager.removeFromPriorityQueue(providersToDelete[i]);
                }

                // TODO: Check later quote
                const quote: u256 = u256.One;
                // Move priorityQueue starting index to 4
                manager.cleanUpQueues(quote);
                manager.resetProvider(providersPriority[0], false);
                manager.cleanUpQueues(quote);

                expect(manager.priorityQueueStartingIndex).toStrictEqual(4);

                const currentQuote = u256.fromU32(1000);
                const nextProvider: Provider | null =
                    manager.getNextProviderWithLiquidity(currentQuote);

                expect(nextProvider).not.toBeNull();
                expect(nextProvider).toBe(providersPriority[1]);
            });

            it('should skip deleted providers when there are some in the priority queue before the valid provider for the test', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const providersPriority = createProviders(
                    4,
                    0,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(2600),
                    u128.fromU32(1600),
                    true,
                    true,
                );
                for (let i: u8 = 0; i < 4; i++) {
                    manager.addToPriorityQueue(providersPriority[i]);
                }

                manager.resetProvider(providersPriority[0], false);

                const currentQuote = u256.fromU32(1000);
                const nextProvider: Provider | null =
                    manager.getNextProviderWithLiquidity(currentQuote);

                expect(nextProvider).not.toBeNull();
                expect(nextProvider).toBe(providersPriority[1]);
            });

            it('should skip provider when the provider is not active', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const providersPriority = createProviders(
                    4,
                    0,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(2600),
                    u128.fromU32(1600),
                    true,
                    true,
                );
                for (let i: u8 = 0; i < 4; i++) {
                    manager.addToPriorityQueue(providersPriority[i]);
                }

                providersPriority[0].deactivate();
                providersPriority[0].markPriority();
                const currentQuote = u256.fromU32(1000);
                const provider = manager.getNextProviderWithLiquidity(currentQuote);

                expect(provider).not.toBeNull();
                expect(provider).toBe(providersPriority[1]);
            });

            it('should revert when the provider is not a priority provider', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: ProviderManager = new ProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    const providersPriority = createProviders(
                        4,
                        0,
                        false,
                        false,
                        true,
                        '232332d2d3',
                        u128.fromU32(10000),
                        u128.fromU32(2600),
                        u128.fromU32(1600),
                        true,
                        true,
                    );
                    for (let i: u8 = 0; i < 4; i++) {
                        manager.addToPriorityQueue(providersPriority[i]);
                    }

                    providersPriority[0].activate();
                    providersPriority[0].clearPriority();

                    const currentQuote = u256.fromU32(1000);
                    manager.getNextProviderWithLiquidity(currentQuote);
                }).toThrow();
            });

            it('should revert when liquidity < reserved', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: ProviderManager = new ProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    const provider = createProvider(
                        providerAddress1,
                        tokenAddress1,
                        false,
                        false,
                        true,
                        '232332d2d3',
                        u128.fromU32(10000),
                        u128.fromU32(1000),
                        u128.fromU32(1600),
                        true,
                        true,
                    );

                    manager.addToPriorityQueue(provider);

                    const currentQuote = u256.fromU32(1000);
                    manager.getNextProviderWithLiquidity(currentQuote);
                }).toThrow();
            });

            it('should return null when liquidity = reserved', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(1000),
                    u128.fromU32(1000),
                    true,
                    true,
                );

                manager.addToPriorityQueue(provider);

                const currentQuote = u256.fromU32(1000);
                const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
                expect(provider1).toBeNull();
            });

            it('should revert when startingIndex() > getLength()', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: TestProviderManager = new TestProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    const provider: Provider = createProvider(
                        providerAddress1,
                        tokenAddress1,
                        false,
                    );
                    provider.activate();
                    provider.markPriority();
                    manager.addToPriorityQueue(provider);
                    manager.getPriorityQueue.setStartingIndex(2);

                    const currentQuote = u256.fromU32(1000);
                    manager.getNextProviderWithLiquidity(currentQuote);
                }).toThrow();
            });
        });

        describe('ProviderManager getNextProviderWithLiquidity with only providers in normal queue tests', () => {
            beforeEach(() => {
                clearCachedProviders();
                Blockchain.clearStorage();
                Blockchain.clearMockedResults();
                TransferHelper.clearMockedResults();
            });
            it('should set currentIndex to standard queue startingIndex when currentIndex = 0 and provider valid for the test ', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                // Add 3 providers that will be deleted. This will move the queue starting index to 3.
                const providersToDelete = createProviders(
                    3,
                    0,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(1600),
                    u128.fromU32(1600),
                    true,
                    false,
                );
                for (let i: u8 = 0; i < 3; i++) {
                    manager.addToNormalQueue(providersToDelete[i]);
                }

                const provider: Provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    true,
                    'wdewed23rdwewe',
                    u128.fromU32(10000000),
                    u128.fromU32(20000),
                    u128.fromU32(10000),
                    true,
                    false,
                );

                manager.addToNormalQueue(provider);

                for (let i: u8 = 0; i < 3; i++) {
                    manager.removeFromNormalQueue(providersToDelete[i]);
                }

                // TODO: Check later quote
                const quote: u256 = u256.One;
                manager.cleanUpQueues(quote);

                expect(manager.normalQueueStartingIndex).toStrictEqual(3);

                const currentQuote = u256.fromU32(1000);
                const nextProvider: Provider | null =
                    manager.getNextProviderWithLiquidity(currentQuote);

                expect(nextProvider).not.toBeNull();
                expect(nextProvider).toBe(provider);
            });

            it('should use currentIndex when currentIndex <> 0 and provider valid for the test', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                // Add 3 providers that will be deleted. This will move the standard queue starting index to 3.
                const providersToDelete = createProviders(
                    3,
                    0,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(1600),
                    u128.fromU32(1600),
                    true,
                    false,
                );
                for (let i: u8 = 0; i < 3; i++) {
                    manager.addToNormalQueue(providersToDelete[i]);
                }

                // Add 2 more providers that are priority.
                const providers = createProviders(
                    2,
                    3,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(2600),
                    u128.fromU32(1600),
                    true,
                    false,
                );

                for (let i: u8 = 0; i < 2; i++) {
                    manager.addToNormalQueue(providers[i]);
                }

                for (let i: u8 = 0; i < 3; i++) {
                    manager.removeFromNormalQueue(providersToDelete[i]);
                }

                // TODO: Check later quote
                const quote: u256 = u256.One;

                // Move standard queue starting index to 4
                manager.cleanUpQueues(quote);
                manager.resetProvider(providers[0], false);
                manager.cleanUpQueues(quote);

                expect(manager.normalQueueStartingIndex).toStrictEqual(4);

                const currentQuote = u256.fromU32(1000);
                const nextProvider: Provider | null =
                    manager.getNextProviderWithLiquidity(currentQuote);

                expect(nextProvider).not.toBeNull();
                expect(nextProvider).toBe(providers[1]);
            });

            it('should skip deleted providers when there are some in the standard queue before the valid provider for the test', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const providers = createProviders(
                    4,
                    0,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(2600),
                    u128.fromU32(1600),
                    true,
                    false,
                );
                for (let i: u8 = 0; i < 4; i++) {
                    manager.addToNormalQueue(providers[i]);
                }

                manager.resetProvider(providers[0], false);

                const currentQuote = u256.fromU32(1000);
                const nextProvider: Provider | null =
                    manager.getNextProviderWithLiquidity(currentQuote);

                expect(nextProvider).not.toBeNull();
                expect(nextProvider).toBe(providers[1]);
            });

            it('should skip provider when the provider is not active', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const providers = createProviders(
                    4,
                    0,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(2600),
                    u128.fromU32(1600),
                    true,
                    false,
                );
                for (let i: u8 = 0; i < 4; i++) {
                    manager.addToNormalQueue(providers[i]);
                }

                providers[0].deactivate();
                providers[0].clearPriority();
                const currentQuote = u256.fromU32(1000);
                const provider = manager.getNextProviderWithLiquidity(currentQuote);

                expect(provider).not.toBeNull();
                expect(provider).toBe(providers[1]);
            });

            it('should revert when the provider is a priority provider', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: ProviderManager = new ProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    const providers = createProviders(
                        4,
                        0,
                        false,
                        false,
                        true,
                        '232332d2d3',
                        u128.fromU32(10000),
                        u128.fromU32(2600),
                        u128.fromU32(1600),
                        true,
                        false,
                    );
                    for (let i: u8 = 0; i < 4; i++) {
                        manager.addToNormalQueue(providers[i]);
                    }

                    providers[0].activate();
                    providers[0].markPriority();

                    const currentQuote = u256.fromU32(1000);
                    manager.getNextProviderWithLiquidity(currentQuote);
                }).toThrow();
            });

            it('should revert when liquidity < reserved', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: ProviderManager = new ProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    const provider = createProvider(
                        providerAddress1,
                        tokenAddress1,
                        false,
                        false,
                        true,
                        '232332d2d3',
                        u128.fromU32(10000),
                        u128.fromU32(1000),
                        u128.fromU32(1600),
                        true,
                        false,
                    );

                    manager.addToNormalQueue(provider);

                    const currentQuote = u256.fromU32(1000);
                    manager.getNextProviderWithLiquidity(currentQuote);
                }).toThrow();
            });

            it('should return null when liquidity = reserved', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(1000),
                    u128.fromU32(1000),
                    true,
                    false,
                );

                manager.addToNormalQueue(provider);

                const currentQuote = u256.fromU32(1000);
                const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
                expect(provider1).toBeNull();
            });

            it('should revert when startingIndex() > getLength()', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: TestProviderManager = new TestProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    const provider: Provider = createProvider(
                        providerAddress1,
                        tokenAddress1,
                        false,
                    );
                    provider.activate();
                    provider.clearPriority();

                    manager.addToNormalQueue(provider);

                    manager.getNormalQueue.setStartingIndex(2);

                    const currentQuote = u256.fromU32(41000);
                    manager.getNextProviderWithLiquidity(currentQuote);
                }).toThrow();
            });
        });

        describe('ProviderManager getNextProviderWithLiquidity with only initial liquidity provider tests', () => {
            beforeEach(() => {
                clearCachedProviders();
                Blockchain.clearStorage();
                Blockchain.clearMockedResults();
                TransferHelper.clearMockedResults();
            });

            it('should return null when no provider are found', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const currentQuote = u256.fromU32(1000);

                const provider = manager.getNextProviderWithLiquidity(currentQuote);

                expect(provider).toBeNull();
            });

            it('should return null when initial provider is not active', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );
                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.markInitialLiquidityProvider();
                provider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
                provider.deactivate();
                provider.save();

                manager.initialLiquidityProviderId = provider.getId();

                const provider2 = manager.getNextProviderWithLiquidity(u256.Zero);

                expect(provider2).toBeNull();
            });

            it('should return initialprovider when current quote is 0', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(100000),
                    u128.fromU32(1000000),
                    u128.fromU32(0),
                    true,
                    false,
                );

                provider.markInitialLiquidityProvider();
                provider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
                manager.initialLiquidityProviderId = provider.getId();

                const provider1 = manager.getNextProviderWithLiquidity(u256.Zero);
                expect(provider1).toBe(provider);
            });

            it('should return null when no initial liquidity provider', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(1000),
                    u128.fromU32(1600),
                    true,
                    false,
                );

                manager.initialLiquidityProviderId = u256.Zero;

                const currentQuote = u256.fromU32(1000);
                const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
                expect(provider1).toBeNull();
            });

            it('should revert when liquidity < reserved', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: ProviderManager = new ProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    const provider = createProvider(
                        providerAddress1,
                        tokenAddress1,
                        false,
                        false,
                        true,
                        '232332d2d3',
                        u128.fromU32(10000),
                        u128.fromU32(1000),
                        u128.fromU32(1600),
                        true,
                        false,
                    );

                    manager.initialLiquidityProviderId = provider.getId();

                    const currentQuote = u256.fromU32(1000);
                    manager.getNextProviderWithLiquidity(currentQuote);
                }).toThrow();
            });

            it('should return the initial liquidity provider when liquidity > reserved', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(1600),
                    u128.fromU32(1000),
                    true,
                    false,
                );

                manager.initialLiquidityProviderId = provider.getId();

                const currentQuote = u256.fromU32(1000);
                const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
                expect(provider1).not.toBeNull();
                expect(provider1).toBe(provider);

                if (provider1 !== null) {
                    expect(provider1.getQueueIndex()).toStrictEqual(u32.MAX_VALUE);
                }
            });

            it('should return null when liquidity = reserved', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    true,
                    '232332d2d3',
                    u128.fromU32(10000),
                    u128.fromU32(1600),
                    u128.fromU32(1600),
                    true,
                    false,
                );

                manager.initialLiquidityProviderId = provider.getId();

                const currentQuote = u256.fromU32(1000);
                const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
                expect(provider1).toBeNull();
            });

            it('should return null when initial provider availableLiquidity = 0', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.markInitialLiquidityProvider();
                provider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
                provider.setLiquidityAmount(u128.Zero);
                provider.setReservedAmount(u128.Zero);
                provider.save();

                manager.initialLiquidityProviderId = provider.getId();

                const provider2 = manager.getNextProviderWithLiquidity(u256.Zero);

                expect(provider2).toBeNull();
            });

            it('should return null when initial provider does not meet the minimal reservation amount and no reserved amount', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider = createProvider(providerAddress1, tokenAddress1);
                provider.markInitialLiquidityProvider();
                provider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
                provider.setLiquidityAmount(u128.fromU32(1));
                provider.setReservedAmount(u128.Zero);
                provider.save();

                manager.initialLiquidityProviderId = provider.getId();
                liquidityQueueReserve.addToVirtualTokenReserve(u256.fromU32(10000));
                liquidityQueueReserve.addToTotalReserve(provider.getLiquidityAmount().toU256());
                const provider2 = manager.getNextProviderWithLiquidity(u256.fromU32(10000000));

                expect(provider2).toBeNull();
                expect(liquidityQueueReserve.liquidity).toStrictEqual(u256.Zero);
            });
        });

        describe('ProviderManager priority queue cleanUpQueues tests', () => {
            beforeEach(() => {
                clearCachedProviders();
                Blockchain.clearStorage();
                Blockchain.clearMockedResults();
                TransferHelper.clearMockedResults();
            });

            it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 1 provider active', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
                expect(manager.priorityQueueLength).toStrictEqual(0);

                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.activate();
                provider1.markPriority();

                manager.addToPriorityQueue(provider1);

                expect(manager.priorityQueueLength).toStrictEqual(1);

                // TODO: Check later quote
                const quote: u256 = u256.One;

                manager.cleanUpQueues(quote);

                expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
                expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.getId());
                expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
            });

            it('should revert when cleanUpQueues is called and a provider is not active', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: ProviderManager = new ProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
                    expect(manager.priorityQueueLength).toStrictEqual(0);

                    const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                    provider1.deactivate();
                    provider1.markPriority();

                    manager.addToPriorityQueue(provider1);

                    expect(manager.priorityQueueLength).toStrictEqual(1);

                    // TODO: Check later quote
                    const quote: u256 = u256.One;

                    manager.cleanUpQueues(quote);
                }).toThrow();
            });

            it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 2 providers active', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
                expect(manager.priorityQueueLength).toStrictEqual(0);

                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.activate();
                provider1.markPriority();

                const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
                provider2.activate();
                provider2.markPriority();

                manager.addToPriorityQueue(provider1);
                manager.addToPriorityQueue(provider2);

                expect(manager.priorityQueueLength).toStrictEqual(2);

                // TODO: Check later quote
                const quote: u256 = u256.One;

                manager.cleanUpQueues(quote);

                expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
                expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.getId());
                expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.getId());
                expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
            });

            it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 2 providers active', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.markPriority();
                const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
                provider2.markPriority();
                const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
                provider3.markPriority();

                manager.addToPriorityQueue(provider1);
                manager.addToPriorityQueue(provider2);
                manager.addToPriorityQueue(provider3);
                expect(manager.priorityQueueLength).toStrictEqual(3);

                manager.removeFromPriorityQueue(provider1);
                manager.removeFromPriorityQueue(provider2);
                manager.removeFromPriorityQueue(provider3);

                // TODO: Check later quote
                const quote: u256 = u256.One;

                manager.cleanUpQueues(quote);

                expect(manager.previousPriorityStartingIndex).toStrictEqual(2);
                expect(manager.priorityQueueLength).toStrictEqual(3);

                const provider4: Provider = createProvider(providerAddress4, tokenAddress1);
                provider4.activate();
                provider4.markPriority();

                const provider5: Provider = createProvider(providerAddress5, tokenAddress1);
                provider5.activate();
                provider5.markPriority();

                manager.addToPriorityQueue(provider4);
                manager.addToPriorityQueue(provider5);

                expect(manager.priorityQueueLength).toStrictEqual(5);

                manager.cleanUpQueues(quote);

                expect(manager.previousPriorityStartingIndex).toStrictEqual(2);
                expect(manager.getFromPriorityQueue(3)).toStrictEqual(provider4.getId());
                expect(manager.getFromPriorityQueue(4)).toStrictEqual(provider5.getId());
                expect(manager.priorityQueueStartingIndex).toStrictEqual(3);
            });

            it('should skip a deleted provider and correctly set previousReservationStartingIndex', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );
                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.activate();
                provider1.markPriority();

                const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
                provider1.activate();
                provider2.markPriority();

                manager.addToPriorityQueue(provider1);
                manager.addToPriorityQueue(provider2);

                expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.getId());

                manager.resetProvider(provider1, false);

                expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);

                // TODO: Check later quote
                const quote: u256 = u256.One;

                manager.cleanUpQueues(quote);

                expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
                expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
                expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
                expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.getId());
            });
        });

        describe('ProviderManager normal queue cleanUpQueues tests', () => {
            beforeEach(() => {
                clearCachedProviders();
                Blockchain.clearStorage();
                Blockchain.clearMockedResults();
                TransferHelper.clearMockedResults();
            });

            it('should correctly set previousReservationStartingIndex and normal queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 1 provider active', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                expect(manager.previousNormalStartingIndex).toStrictEqual(0);
                expect(manager.normalQueueLength).toStrictEqual(0);

                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.activate();

                manager.addToNormalQueue(provider1);

                expect(manager.normalQueueLength).toStrictEqual(1);

                // TODO: Check later quote
                const quote: u256 = u256.One;

                manager.cleanUpQueues(quote);

                expect(manager.previousNormalStartingIndex).toStrictEqual(0);
                expect(manager.getFromNormalQueue(0)).toStrictEqual(provider1.getId());
                expect(manager.normalQueueStartingIndex).toStrictEqual(0);
            });

            it('should revert when cleanUpQueues is called and a provider is not active', () => {
                expect(() => {
                    const quoteManager = new QuoteManager(tokenIdUint8Array1);
                    const liquidityQueueReserve = new LiquidityQueueReserve(
                        tokenAddress1,
                        tokenIdUint8Array1,
                    );

                    const manager: ProviderManager = new ProviderManager(
                        tokenAddress1,
                        tokenIdUint8Array1,
                        quoteManager,
                        ENABLE_INDEX_VERIFICATION,
                        liquidityQueueReserve,
                        MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                    );

                    expect(manager.previousNormalStartingIndex).toStrictEqual(0);
                    expect(manager.normalQueueLength).toStrictEqual(0);

                    const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                    provider1.deactivate();

                    manager.addToNormalQueue(provider1);

                    expect(manager.normalQueueLength).toStrictEqual(1);

                    // TODO: Check later quote
                    const quote: u256 = u256.One;

                    manager.cleanUpQueues(quote);
                }).toThrow();
            });

            it('should correctly set previousReservationStartingIndex and normal queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 2 providers active', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                expect(manager.previousNormalStartingIndex).toStrictEqual(0);
                expect(manager.normalQueueLength).toStrictEqual(0);

                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.activate();

                const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
                provider2.activate();

                manager.addToNormalQueue(provider1);
                manager.addToNormalQueue(provider2);

                expect(manager.normalQueueLength).toStrictEqual(2);

                // TODO: Check later quote
                const quote: u256 = u256.One;

                manager.cleanUpQueues(quote);

                expect(manager.previousNormalStartingIndex).toStrictEqual(0);
                expect(manager.getFromNormalQueue(0)).toStrictEqual(provider1.getId());
                expect(manager.getFromNormalQueue(1)).toStrictEqual(provider2.getId());
                expect(manager.normalQueueLength).toStrictEqual(2);
            });

            it('should correctly set previousReservationStartingIndex and normal queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 2 providers active', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
                const provider3: Provider = createProvider(providerAddress3, tokenAddress1);

                manager.addToNormalQueue(provider1);
                manager.addToNormalQueue(provider2);
                manager.addToNormalQueue(provider3);
                expect(manager.normalQueueLength).toStrictEqual(3);

                manager.removeFromNormalQueue(provider1);
                manager.removeFromNormalQueue(provider2);
                manager.removeFromNormalQueue(provider3);

                // TODO: Check later quote
                const quote: u256 = u256.One;

                manager.cleanUpQueues(quote);

                expect(manager.previousNormalStartingIndex).toStrictEqual(2);
                expect(manager.normalQueueLength).toStrictEqual(3);

                const provider4: Provider = createProvider(providerAddress4, tokenAddress1);
                provider4.activate();

                const provider5: Provider = createProvider(providerAddress5, tokenAddress1);
                provider5.activate();

                manager.addToNormalQueue(provider4);
                manager.addToNormalQueue(provider5);

                expect(manager.normalQueueLength).toStrictEqual(5);

                manager.cleanUpQueues(quote);

                expect(manager.previousNormalStartingIndex).toStrictEqual(2);
                expect(manager.getFromNormalQueue(3)).toStrictEqual(provider4.getId());
                expect(manager.getFromNormalQueue(4)).toStrictEqual(provider5.getId());
                expect(manager.normalQueueStartingIndex).toStrictEqual(3);
            });

            it('should skip a deleted provider and correctly set previousReservationStartingIndex', () => {
                const quoteManager = new QuoteManager(tokenIdUint8Array1);
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );

                const manager: ProviderManager = new ProviderManager(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    quoteManager,
                    ENABLE_INDEX_VERIFICATION,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );
                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.activate();

                const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
                provider1.activate();

                manager.addToNormalQueue(provider1);
                manager.addToNormalQueue(provider2);

                expect(manager.getFromNormalQueue(0)).toStrictEqual(provider1.getId());

                manager.resetProvider(provider1, false);

                expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);

                // TODO: Check later quote
                const quote: u256 = u256.One;

                manager.cleanUpQueues(quote);

                expect(manager.previousNormalStartingIndex).toStrictEqual(0);
                expect(manager.normalQueueStartingIndex).toStrictEqual(1);
                expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
                expect(manager.getFromNormalQueue(1)).toStrictEqual(provider2.getId());
            });
        });
    });
});
