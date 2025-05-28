import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders, Provider } from '../models/Provider';
import { ProviderManager } from '../managers/ProviderManager';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    createProvider,
    createProviders,
    providerAddress1,
    TestProviderManager,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { OwedBTCManager } from '../managers/OwedBTCManager';
import { ENABLE_INDEX_VERIFICATION, INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';
import { QuoteManager } from '../managers/QuoteManager';

describe('ProviderManager getNextProviderWithLiquidity with only providers in removal queue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('should set currentIndexRemoval to removalQueue startingIndex when currentIndexRemoval = 0 and provider valid for the test ', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        // Add 3 providers that will be deleted. This will move the removalQueue starting index to 3.
        const providersToDelete = createProviders(3, 0);
        for (let i: u8 = 0; i < 3; i++) {
            manager.addToRemovalQueue(providersToDelete[i]);
        }

        const provider: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            true,
            true,
            true,
            'wdewed23rdwewe',
            u128.fromU32(10000000),
            u128.fromU32(10000),
            u128.fromU32(10000),
            true,
            false,
        );

        manager.addToRemovalQueue(provider);
        owedBTCManager.setSatoshisOwed(provider.getId(), 100000);
        owedBTCManager.setSatoshisOwedReserved(provider.getId(), 10000);

        manager.cleanUpQueues();

        expect(manager.removalQueueStartingIndex).toStrictEqual(3);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(provider);
    });

    it('should use currentIndexRemoval when currentIndexRemoval <> 0 and provider valid for the test', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        // Add 3 providers that will be deleted. This will move the removalQueue starting index to 3.
        const providersToDelete = createProviders(3, 0);
        for (let i: u8 = 0; i < 3; i++) {
            manager.addToRemovalQueue(providersToDelete[i]);
        }

        // Add 2 more providers that are pendingRemoval.
        const providersPendingRemoval = createProviders(2, 3, true);
        for (let i: u8 = 0; i < 2; i++) {
            manager.addToRemovalQueue(providersPendingRemoval[i]);
            owedBTCManager.setSatoshisOwed(providersPendingRemoval[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providersPendingRemoval[i].getId(), 10000);
        }

        // Move removalQueue starting index to 4
        manager.cleanUpQueues();
        manager.resetProvider(providersPendingRemoval[0]);
        manager.cleanUpQueues();

        expect(manager.removalQueueStartingIndex).toStrictEqual(4);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providersPendingRemoval[1]);
    });

    it('should skip deleted providers when there are some in the removal queue before the valid provider for the test', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const providersPendingRemoval = createProviders(4, 0, true);
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToRemovalQueue(providersPendingRemoval[i]);
            owedBTCManager.setSatoshisOwed(providersPendingRemoval[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providersPendingRemoval[i].getId(), 10000);
        }

        manager.resetProvider(providersPendingRemoval[0]);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providersPendingRemoval[1]);
    });

    it('should remove provider from the removal queue when the provider is not in pendingRemoval and is a LP', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const providersPendingRemoval = createProviders(4, 0, true);
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToRemovalQueue(providersPendingRemoval[i]);
            owedBTCManager.setSatoshisOwed(providersPendingRemoval[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providersPendingRemoval[i].getId(), 10000);
        }

        providersPendingRemoval[0].clearPendingRemoval();

        const currentQuote = u256.fromU32(1000);
        const provider = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider).not.toBeNull();
        expect(provider).toBe(providersPendingRemoval[1]);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
    });

    it('should remove provider from the removal queue when the provider is not in pendingRemoval and is not a LP', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const providersPendingRemoval = createProviders(4, 0, true);
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToRemovalQueue(providersPendingRemoval[i]);
            owedBTCManager.setSatoshisOwed(providersPendingRemoval[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providersPendingRemoval[i].getId(), 10000);
        }

        providersPendingRemoval[0].clearLiquidityProvider();
        providersPendingRemoval[0].clearPendingRemoval();

        const currentQuote = u256.fromU32(1000);
        const provider = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider).not.toBeNull();
        expect(provider).toBe(providersPendingRemoval[1]);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
    });

    it('should remove provider from the removal queue when the provider is in pendingRemoval and is not a LP', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const providersPendingRemoval = createProviders(4, 0, true);
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToRemovalQueue(providersPendingRemoval[i]);
            owedBTCManager.setSatoshisOwed(providersPendingRemoval[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providersPendingRemoval[i].getId(), 10000);
        }

        providersPendingRemoval[0].clearLiquidityProvider();

        const currentQuote = u256.fromU32(1000);
        const provider = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider).not.toBeNull();
        expect(provider).toBe(providersPendingRemoval[1]);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
    });

    it('should return the provider when the provider states are valid and (owedBTC - reservedBTC) > strictMinimumProviderReservationAmount', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
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
        owedBTCManager.setSatoshisOwedReserved(provider.getId(), 10000);
        owedBTCManager.setSatoshisOwed(provider.getId(), 1000000);

        const currentQuote = u256.fromU32(1000);
        const provider1 = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider1).not.toBeNull();
        expect(provider1).toBe(provider);
    });

    it('should be removed from the removal queue when the provider states are valid but (owedBTC - reservedBTC) < strictMinimumProviderReservationAmount and owedBTC < strictMinimumProviderReservationAmount', () => {
        expect(() => {
            const owedBTCManager: OwedBTCManager = new OwedBTCManager();
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
            owedBTCManager.setSatoshisOwedReserved(provider.getId(), 450);
            owedBTCManager.setSatoshisOwed(provider.getId(), 550);

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });

    it('should return null when startingIndex() > getLength()', () => {
        expect(() => {
            const owedBTCManager: OwedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
            manager.addToRemovalQueue(provider);

            manager.getRemovalQueue.setStartingIndex(2);

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
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
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: TestProviderManager = new TestProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        // Add 3 providers that will be deleted. This will move the priorityQueue starting index to 3.
        const providersToDelete = createProviders(
            3,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u128.fromU32(10000),
            u128.fromU32(1600),
            u128.fromU32(1600),
            false,
            true,
        );
        for (let i: u8 = 0; i < 3; i++) {
            manager.addToPriorityQueue(providersToDelete[i]);
        }

        const provider: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            'wdewed23rdwewe',
            u128.fromU32(10000000),
            u128.fromU32(200000000),
            u128.fromU32(10000),
            true,
            true,
        );

        manager.addToPriorityQueue(provider);

        //owedBTCManager.setSatoshisOwed(provider.getId(), 100000);
        //owedBTCManager.setSatoshisOwedReserved(provider.getId(), 10000);

        manager.cleanUpQueues();

        expect(manager.priorityQueueStartingIndex).toStrictEqual(3);

        const currentQuote: u256 = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(provider);
    });

    it('should use currentIndexPriority when currentIndexPriority <> 0 and provider valid for the test', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        // Add 3 providers that will be deleted. This will move the priorityQueue starting index to 3.
        const providersToDelete = createProviders(
            3,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u128.fromU32(10000),
            u128.fromU32(1600),
            u128.fromU32(1600),
            false,
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
            true,
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
            owedBTCManager.setSatoshisOwed(providersPriority[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providersPriority[i].getId(), 10000);
        }

        // Move priorityQueue starting index to 4
        manager.cleanUpQueues();
        manager.resetProvider(providersPriority[0], false);
        manager.cleanUpQueues();

        expect(manager.priorityQueueStartingIndex).toStrictEqual(4);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providersPriority[1]);
    });

    it('should skip deleted providers when there are some in the priority queue before the valid provider for the test', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const providersPriority = createProviders(
            4,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u128.fromU32(10000),
            u128.fromU32(2600),
            u128.fromU32(1600),
            true,
            true,
        );
        for (let i: u8 = 0; i < 4; i++) {
            const at = manager.addToPriorityQueue(providersPriority[i]);

            owedBTCManager.setSatoshisOwed(providersPriority[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providersPriority[i].getId(), 10000);
        }

        manager.resetProvider(providersPriority[0], false);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providersPriority[1]);
    });

    it('should skip provider when the provider is not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const providersPriority = createProviders(
            4,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u128.fromU32(10000),
            u128.fromU32(2600),
            u128.fromU32(1600),
            true,
            true,
        );
        for (let i: u8 = 0; i < 4; i++) {
            const at = manager.addToPriorityQueue(providersPriority[i]);

            owedBTCManager.setSatoshisOwed(providersPriority[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providersPriority[i].getId(), 10000);
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
            const owedBTCManager: OwedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const providersPriority = createProviders(
                4,
                0,
                false,
                true,
                true,
                '232332d2d3',
                u128.fromU32(10000),
                u128.fromU32(2600),
                u128.fromU32(1600),
                true,
                true,
            );
            for (let i: u8 = 0; i < 4; i++) {
                const at = manager.addToPriorityQueue(providersPriority[i]);

                owedBTCManager.setSatoshisOwed(providersPriority[i].getId(), 100000);
                owedBTCManager.setSatoshisOwedReserved(providersPriority[i].getId(), 10000);
            }

            providersPriority[0].activate();
            providersPriority[0].clearPriority();

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });

    it('should revert when liquidity < reserved', () => {
        expect(() => {
            const owedBTCManager: OwedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                '232332d2d3',
                u128.fromU32(10000),
                u128.fromU32(1000),
                u128.fromU32(1600),
                true,
                true,
            );

            const at = manager.addToPriorityQueue(provider);

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });

    it('should return null when liquidity = reserved', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            '232332d2d3',
            u128.fromU32(10000),
            u128.fromU32(1000),
            u128.fromU32(1000),
            true,
            true,
        );

        const at = manager.addToPriorityQueue(provider);

        const currentQuote = u256.fromU32(1000);
        const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
        expect(provider1).toBeNull();
    });

    it('should revert when startingIndex() > getLength()', () => {
        expect(() => {
            const owedBTCManager: OwedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, false);
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
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        // Add 3 providers that will be deleted. This will move the queue starting index to 3.
        const providersToDelete = createProviders(
            3,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u128.fromU32(10000),
            u128.fromU32(1600),
            u128.fromU32(1600),
            false,
            false,
        );
        for (let i: u8 = 0; i < 3; i++) {
            manager.addToNormalQueue(providersToDelete[i]);
        }

        const provider: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            'wdewed23rdwewe',
            u128.fromU32(10000000),
            u128.fromU32(20000),
            u128.fromU32(10000),
            true,
            false,
        );

        manager.addToNormalQueue(provider);

        owedBTCManager.setSatoshisOwed(provider.getId(), 100000);
        owedBTCManager.setSatoshisOwedReserved(provider.getId(), 10000);

        manager.cleanUpQueues();

        expect(manager.normalQueueStartingIndex).toStrictEqual(3);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(provider);
    });

    it('should use currentIndex when currentIndex <> 0 and provider valid for the test', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        // Add 3 providers that will be deleted. This will move the standard queue starting index to 3.
        const providersToDelete = createProviders(
            3,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u128.fromU32(10000),
            u128.fromU32(1600),
            u128.fromU32(1600),
            false,
            false,
        );
        for (let i: u8 = 0; i < 3; i++) {
            const at = manager.addToNormalQueue(providersToDelete[i]);
        }

        // Add 2 more providers that are priority.
        const providers = createProviders(
            2,
            3,
            false,
            true,
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
            owedBTCManager.setSatoshisOwed(providers[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providers[i].getId(), 10000);
        }

        // Move standard queue starting index to 4
        manager.cleanUpQueues();
        manager.resetProvider(providers[0], false);
        manager.cleanUpQueues();

        expect(manager.normalQueueStartingIndex).toStrictEqual(4);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providers[1]);
    });

    it('should skip deleted providers when there are some in the standard queue before the valid provider for the test', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const providers = createProviders(
            4,
            0,
            false,
            true,
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
            owedBTCManager.setSatoshisOwed(providers[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providers[i].getId(), 10000);
        }

        manager.resetProvider(providers[0], false);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providers[1]);
    });

    it('should skip provider when the provider is not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const providers = createProviders(
            4,
            0,
            false,
            true,
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

            owedBTCManager.setSatoshisOwed(providers[i].getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(providers[i].getId(), 10000);
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
            const owedBTCManager: OwedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const providers = createProviders(
                4,
                0,
                false,
                true,
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
                owedBTCManager.setSatoshisOwed(providers[i].getId(), 100000);
                owedBTCManager.setSatoshisOwedReserved(providers[i].getId(), 10000);
            }

            providers[0].activate();
            providers[0].markPriority();

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });

    it('should revert when liquidity < reserved', () => {
        expect(() => {
            const owedBTCManager: OwedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
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
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
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
            const owedBTCManager: OwedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, false);
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
        const owedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const currentQuote = u256.fromU32(1000);

        const provider = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider).toBeNull();
    });

    it('should return null when initial provider is not active', () => {
        const owedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
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
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
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
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
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
            const owedBTCManager: OwedBTCManager = new OwedBTCManager();
            const quoteManager = new QuoteManager(tokenIdUint8Array1);
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                owedBTCManager,
                quoteManager,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
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
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
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
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
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
        const owedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
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
        const owedBTCManager = new OwedBTCManager();
        const quoteManager = new QuoteManager(tokenIdUint8Array1);
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider = createProvider(providerAddress1, tokenAddress1);
        provider.markInitialLiquidityProvider();
        provider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
        provider.setLiquidityAmount(u128.fromU32(1));
        provider.setReservedAmount(u128.Zero);
        provider.save();

        manager.initialLiquidityProviderId = provider.getId();

        const provider2 = manager.getNextProviderWithLiquidity(u256.fromU32(10000000));

        expect(provider2).toBeNull();
    });
});
