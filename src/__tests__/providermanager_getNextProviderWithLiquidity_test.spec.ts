import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders, Provider } from '../lib/Provider';
import { ProviderManager } from '../lib/Liquidity/ProviderManager';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    createProvider,
    createProviders,
    providerAddress1,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
    TestProviderManager,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';

describe('ProviderManager getNextProviderWithLiquidity with only providers in removal queue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('should set currentIndexRemoval to removalQueue startingIndex when currentIndexRemoval = 0 and provider valid for the test ', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        // Add 3 providers that will be deleted. This will move the removalQueue starting index to 3.
        const providersToDelete = createProviders(3, 0);
        for (let i: u8 = 0; i < 3; i++) {
            manager.addToRemovalQueue(providersToDelete[i].providerId);
        }

        const provider: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            true,
            true,
            true,
            'wdewed23rdwewe',
            u256.fromU32(10000000),
            u128.fromU32(10000),
            u128.fromU32(10000),
            true,
            false,
        );

        manager.addToRemovalQueue(provider.providerId);
        manager.setBTCowed(provider.providerId, u256.fromU32(100000));
        manager.setBTCowedReserved(provider.providerId, u256.fromU32(10000));

        manager.cleanUpQueues();

        expect(manager.removalQueueStartingIndex).toStrictEqual(3);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(provider);
    });

    it('should use currentIndexRemoval when currentIndexRemoval <> 0 and provider valid for the test', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        // Add 3 providers that will be deleted. This will move the removalQueue starting index to 3.
        const providersToDelete = createProviders(3, 0);
        for (let i: u8 = 0; i < 3; i++) {
            manager.addToRemovalQueue(providersToDelete[i].providerId);
        }

        // Add 2 more providers that are pendingRemoval.
        const providersPendingRemoval = createProviders(2, 3, true);
        for (let i: u8 = 0; i < 2; i++) {
            manager.addToRemovalQueue(providersPendingRemoval[i].providerId);
            manager.setBTCowed(providersPendingRemoval[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providersPendingRemoval[i].providerId, u256.fromU32(10000));
        }

        // Move removalQueue starting index to 4
        manager.cleanUpQueues();
        manager.removePendingLiquidityProviderFromRemovalQueue(providersPendingRemoval[0], 3);
        manager.cleanUpQueues();

        expect(manager.removalQueueStartingIndex).toStrictEqual(4);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providersPendingRemoval[1]);
    });

    it('should skip deleted providers when there are some in the removal queue before the valid provider for the test', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providersPendingRemoval = createProviders(4, 0, true);
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToRemovalQueue(providersPendingRemoval[i].providerId);
            manager.setBTCowed(providersPendingRemoval[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providersPendingRemoval[i].providerId, u256.fromU32(10000));
        }

        manager.removePendingLiquidityProviderFromRemovalQueue(providersPendingRemoval[0], 0);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providersPendingRemoval[1]);
    });

    it('should remove provider from the removal queue when the provider is not in pendingRemoval and is a LP', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providersPendingRemoval = createProviders(4, 0, true);
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToRemovalQueue(providersPendingRemoval[i].providerId);
            manager.setBTCowed(providersPendingRemoval[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providersPendingRemoval[i].providerId, u256.fromU32(10000));
        }

        providersPendingRemoval[0].pendingRemoval = false;

        const currentQuote = u256.fromU32(1000);
        const provider = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider).not.toBeNull();
        expect(provider).toBe(providersPendingRemoval[1]);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
    });

    it('should remove provider from the removal queue when the provider is not in pendingRemoval and is not a LP', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providersPendingRemoval = createProviders(4, 0, true);
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToRemovalQueue(providersPendingRemoval[i].providerId);
            manager.setBTCowed(providersPendingRemoval[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providersPendingRemoval[i].providerId, u256.fromU32(10000));
        }

        providersPendingRemoval[0].isLp = false;
        providersPendingRemoval[0].pendingRemoval = false;

        const currentQuote = u256.fromU32(1000);
        const provider = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider).not.toBeNull();
        expect(provider).toBe(providersPendingRemoval[1]);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
    });

    it('should remove provider from the removal queue when the provider is in pendingRemoval and is not a LP', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providersPendingRemoval = createProviders(4, 0, true);
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToRemovalQueue(providersPendingRemoval[i].providerId);
            manager.setBTCowed(providersPendingRemoval[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providersPendingRemoval[i].providerId, u256.fromU32(10000));
        }

        providersPendingRemoval[0].isLp = false;

        const currentQuote = u256.fromU32(1000);
        const provider = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider).not.toBeNull();
        expect(provider).toBe(providersPendingRemoval[1]);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
    });

    it('should return the provider when the provider states are valid and (owedBTC - reservedBTC) > strictMinimumProviderReservationAmount', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
        manager.addToRemovalQueue(provider.providerId);
        manager.setBTCowedReserved(provider.providerId, u256.fromU32(10000));
        manager.setBTCowed(provider.providerId, u256.fromU32(1000000));

        const currentQuote = u256.fromU32(1000);
        const provider1 = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider1).not.toBeNull();
        expect(provider1).toBe(provider);
    });

    it('should be removed from the removal queue when the provider states are valid but (owedBTC - reservedBTC) < strictMinimumProviderReservationAmount and owedBTC < strictMinimumProviderReservationAmount', () => {
        expect(() => {
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
            manager.addToRemovalQueue(provider.providerId);
            manager.setBTCowedReserved(provider.providerId, u256.fromU32(450));
            manager.setBTCowed(provider.providerId, u256.fromU32(550));

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });

    it('should return null when startingIndex() > getLength()', () => {
        expect(() => {
            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
            manager.addToRemovalQueue(provider.providerId);

            manager.getRemovalQueue.setStartingIndex(2);

            const currentQuote = u256.fromU32(1000);
            const provider2 = manager.getNextProviderWithLiquidity(currentQuote);
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
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        // Add 3 providers that will be deleted. This will move the priorityQueue starting index to 3.
        const providersToDelete = createProviders(
            3,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(1600),
            u128.fromU32(1600),
            false,
            true,
        );
        for (let i: u8 = 0; i < 3; i++) {
            manager.addToPriorityQueue(providersToDelete[i].providerId);
        }

        const provider: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            'wdewed23rdwewe',
            u256.fromU32(10000000),
            u128.fromU32(20000),
            u128.fromU32(10000),
            true,
            true,
        );

        manager.addToPriorityQueue(provider.providerId);
        manager.setBTCowed(provider.providerId, u256.fromU32(100000));
        manager.setBTCowedReserved(provider.providerId, u256.fromU32(10000));

        manager.cleanUpQueues();

        expect(manager.priorityQueueStartingIndex).toStrictEqual(3);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(provider);
    });

    it('should use currentIndexPriority when currentIndexPriority <> 0 and provider valid for the test', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        // Add 3 providers that will be deleted. This will move the priorityQueue starting index to 3.
        const providersToDelete = createProviders(
            3,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(1600),
            u128.fromU32(1600),
            false,
            true,
        );
        for (let i: u8 = 0; i < 3; i++) {
            manager.addToPriorityQueue(providersToDelete[i].providerId);
        }

        // Add 2 more providers that are priority.
        const providersPriority = createProviders(
            2,
            3,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(2600),
            u128.fromU32(1600),
            true,
            true,
        );
        for (let i: u8 = 0; i < 2; i++) {
            manager.addToPriorityQueue(providersPriority[i].providerId);
            manager.setBTCowed(providersPriority[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providersPriority[i].providerId, u256.fromU32(10000));
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
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providersPriority = createProviders(
            4,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(2600),
            u128.fromU32(1600),
            true,
            true,
        );
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToPriorityQueue(providersPriority[i].providerId);
            manager.setBTCowed(providersPriority[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providersPriority[i].providerId, u256.fromU32(10000));
        }

        manager.resetProvider(providersPriority[0], false);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providersPriority[1]);
    });

    it('should skip provider when the provider is not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providersPriority = createProviders(
            4,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(2600),
            u128.fromU32(1600),
            true,
            true,
        );
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToPriorityQueue(providersPriority[i].providerId);
            manager.setBTCowed(providersPriority[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providersPriority[i].providerId, u256.fromU32(10000));
        }

        providersPriority[0].setActive(false, true);

        const currentQuote = u256.fromU32(1000);
        const provider = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider).not.toBeNull();
        expect(provider).toBe(providersPriority[1]);
    });

    it('should revert when the provider is not a priority provider', () => {
        expect(() => {
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
            );

            const providersPriority = createProviders(
                4,
                0,
                false,
                true,
                true,
                '232332d2d3',
                u256.fromU32(10000),
                u128.fromU32(2600),
                u128.fromU32(1600),
                true,
                true,
            );
            for (let i: u8 = 0; i < 4; i++) {
                manager.addToPriorityQueue(providersPriority[i].providerId);
                manager.setBTCowed(providersPriority[i].providerId, u256.fromU32(100000));
                manager.setBTCowedReserved(providersPriority[i].providerId, u256.fromU32(10000));
            }

            providersPriority[0].setActive(true, false);

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });

    it('should revert when liquidity < reserved', () => {
        expect(() => {
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
            );

            const provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                '232332d2d3',
                u256.fromU32(10000),
                u128.fromU32(1000),
                u128.fromU32(1600),
                true,
                true,
            );

            manager.addToPriorityQueue(provider.providerId);

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });

    it('should return null when liquidity = reserved', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(1000),
            u128.fromU32(1000),
            true,
            true,
        );

        manager.addToPriorityQueue(provider.providerId);

        const currentQuote = u256.fromU32(1000);
        const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
        expect(provider1).toBeNull();
    });

    it('should revert when startingIndex() > getLength()', () => {
        expect(() => {
            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, false);
            provider.setActive(true, true);
            manager.addToPriorityQueue(provider.providerId);

            manager.getPriorityQueue.setStartingIndex(2);

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });
});

describe('ProviderManager getNextProviderWithLiquidity with only providers in standard queue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });
    it('should set currentIndex to standard queue startingIndex when currentIndex = 0 and provider valid for the test ', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        // Add 3 providers that will be deleted. This will move the queue starting index to 3.
        const providersToDelete = createProviders(
            3,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(1600),
            u128.fromU32(1600),
            false,
            false,
        );
        for (let i: u8 = 0; i < 3; i++) {
            manager.addToStandardQueue(providersToDelete[i].providerId);
        }

        const provider: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            'wdewed23rdwewe',
            u256.fromU32(10000000),
            u128.fromU32(20000),
            u128.fromU32(10000),
            true,
            false,
        );

        manager.addToStandardQueue(provider.providerId);
        manager.setBTCowed(provider.providerId, u256.fromU32(100000));
        manager.setBTCowedReserved(provider.providerId, u256.fromU32(10000));

        manager.cleanUpQueues();

        expect(manager.standardQueueStartingIndex).toStrictEqual(3);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(provider);
    });

    it('should use currentIndex when currentIndex <> 0 and provider valid for the test', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        // Add 3 providers that will be deleted. This will move the standard queue starting index to 3.
        const providersToDelete = createProviders(
            3,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(1600),
            u128.fromU32(1600),
            false,
            false,
        );
        for (let i: u8 = 0; i < 3; i++) {
            manager.addToStandardQueue(providersToDelete[i].providerId);
        }

        // Add 2 more providers that are priority.
        const providers = createProviders(
            2,
            3,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(2600),
            u128.fromU32(1600),
            true,
            false,
        );
        for (let i: u8 = 0; i < 2; i++) {
            manager.addToStandardQueue(providers[i].providerId);
            manager.setBTCowed(providers[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providers[i].providerId, u256.fromU32(10000));
        }

        // Move standard queue starting index to 4
        manager.cleanUpQueues();
        manager.resetProvider(providers[0], false);
        manager.cleanUpQueues();

        expect(manager.standardQueueStartingIndex).toStrictEqual(4);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providers[1]);
    });

    it('should skip deleted providers when there are some in the standard queue before the valid provider for the test', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providers = createProviders(
            4,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(2600),
            u128.fromU32(1600),
            true,
            false,
        );
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToStandardQueue(providers[i].providerId);
            manager.setBTCowed(providers[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providers[i].providerId, u256.fromU32(10000));
        }

        manager.resetProvider(providers[0], false);

        const currentQuote = u256.fromU32(1000);
        const nextProvider: Provider | null = manager.getNextProviderWithLiquidity(currentQuote);

        expect(nextProvider).not.toBeNull();
        expect(nextProvider).toBe(providers[1]);
    });

    it('should skip provider when the provider is not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providers = createProviders(
            4,
            0,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(2600),
            u128.fromU32(1600),
            true,
            false,
        );
        for (let i: u8 = 0; i < 4; i++) {
            manager.addToStandardQueue(providers[i].providerId);
            manager.setBTCowed(providers[i].providerId, u256.fromU32(100000));
            manager.setBTCowedReserved(providers[i].providerId, u256.fromU32(10000));
        }

        providers[0].setActive(false, false);

        const currentQuote = u256.fromU32(1000);
        const provider = manager.getNextProviderWithLiquidity(currentQuote);

        expect(provider).not.toBeNull();
        expect(provider).toBe(providers[1]);
    });

    it('should revert when the provider is a priority provider', () => {
        expect(() => {
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
            );

            const providers = createProviders(
                4,
                0,
                false,
                true,
                true,
                '232332d2d3',
                u256.fromU32(10000),
                u128.fromU32(2600),
                u128.fromU32(1600),
                true,
                false,
            );
            for (let i: u8 = 0; i < 4; i++) {
                manager.addToStandardQueue(providers[i].providerId);
                manager.setBTCowed(providers[i].providerId, u256.fromU32(100000));
                manager.setBTCowedReserved(providers[i].providerId, u256.fromU32(10000));
            }

            providers[0].setActive(true, true);

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });

    it('should revert when liquidity < reserved', () => {
        expect(() => {
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
            );

            const provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                '232332d2d3',
                u256.fromU32(10000),
                u128.fromU32(1000),
                u128.fromU32(1600),
                true,
                false,
            );

            manager.addToStandardQueue(provider.providerId);

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });

    it('should return null when liquidity = reserved', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(1000),
            u128.fromU32(1000),
            true,
            false,
        );

        manager.addToStandardQueue(provider.providerId);

        const currentQuote = u256.fromU32(1000);
        const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
        expect(provider1).toBeNull();
    });

    it('should revert when startingIndex() > getLength()', () => {
        expect(() => {
            const manager: TestProviderManager = new TestProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, false);
            provider.setActive(true, false);
            manager.addToStandardQueue(provider.providerId);

            manager.getStandardQueue.setStartingIndex(2);

            const currentQuote = u256.fromU32(1000);
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

    it('should return initialprovider when current quote is 0', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(1000),
            u128.fromU32(0),
            true,
            false,
        );

        manager.initialLiquidityProvider = provider.providerId;

        const provider1 = manager.getNextProviderWithLiquidity(u256.Zero);
        expect(provider1).toBe(provider);
    });

    it('should return null when no initial liquidity provider', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(1000),
            u128.fromU32(1600),
            true,
            false,
        );

        manager.initialLiquidityProvider = u256.Zero;

        const currentQuote = u256.fromU32(1000);
        const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
        expect(provider1).toBeNull();
    });

    it('should revert when liquidity < reserved', () => {
        expect(() => {
            const manager: ProviderManager = new ProviderManager(
                tokenAddress1,
                tokenIdUint8Array1,
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
            );

            const provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                '232332d2d3',
                u256.fromU32(10000),
                u128.fromU32(1000),
                u128.fromU32(1600),
                true,
                false,
            );

            manager.initialLiquidityProvider = provider.providerId;

            const currentQuote = u256.fromU32(1000);
            manager.getNextProviderWithLiquidity(currentQuote);
        }).toThrow();
    });

    it('should return the initial liquidity provider when liquidity > reserved', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(1600),
            u128.fromU32(1000),
            true,
            false,
        );

        manager.initialLiquidityProvider = provider.providerId;

        const currentQuote = u256.fromU32(1000);
        const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
        expect(provider1).not.toBeNull();
        expect(provider1).toBe(provider);

        if (provider1 !== null) {
            expect(provider1.indexedAt).toStrictEqual(u32.MAX_VALUE);
        }
    });

    it('should return null when liquidity = reserved', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            '232332d2d3',
            u256.fromU32(10000),
            u128.fromU32(1600),
            u128.fromU32(1600),
            true,
            false,
        );

        manager.initialLiquidityProvider = provider.providerId;

        const currentQuote = u256.fromU32(1000);
        const provider1 = manager.getNextProviderWithLiquidity(currentQuote);
        expect(provider1).toBeNull();
    });
});
