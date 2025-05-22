import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders, Provider } from '../models/Provider';
import { ProviderManager } from '../managers/ProviderManager';
import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    createProvider,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { OwedBTCManager } from '../managers/OwedBTCManager';
import { ENABLE_INDEX_VERIFICATION } from '../constants/Contract';

describe('ProviderManager removal queue cleanUpQueues tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 1 provider', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);

        manager.addToRemovalQueue(provider1);

        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 1 provider in pending removal', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1, true);

        manager.addToRemovalQueue(provider1);

        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(provider1.getId());
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 1 provider and 1 provider in pendingRemoval state', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1, true);

        manager.addToRemovalQueue(provider1);
        manager.addToRemovalQueue(provider2);

        expect(manager.removalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.removalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 2 provider not in pendingRemoval state', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);

        manager.addToRemovalQueue(provider1);
        manager.addToRemovalQueue(provider2);

        expect(manager.removalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(2);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 1 provider in pendingRemoval state and 1 provider', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1, true);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);

        manager.addToRemovalQueue(provider1);
        manager.addToRemovalQueue(provider2);

        expect(manager.removalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(provider1.getId());
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 2 providers in pendingRemoval state', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1, true);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1, true);

        manager.addToRemovalQueue(provider1);
        manager.addToRemovalQueue(provider2);

        expect(manager.removalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(provider1.getId());
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 1 provider', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);

        manager.addToRemovalQueue(provider2);
        expect(manager.removalQueueLength).toStrictEqual(2);
        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(2);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 1 provider in pending removal', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1, true);

        manager.addToRemovalQueue(provider2);

        expect(manager.removalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider1.getId());
        expect(manager.removalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 1 provider and 1 provider in pendingRemoval state', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        const provider3: Provider = createProvider(providerAddress3, tokenAddress1, true);

        manager.addToRemovalQueue(provider2);
        manager.addToRemovalQueue(provider3);

        expect(manager.removalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(2);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.removalQueueStartingIndex).toStrictEqual(2);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 2 provider not in pendingRemoval state', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);

        manager.addToRemovalQueue(provider2);
        manager.addToRemovalQueue(provider3);

        expect(manager.removalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(3);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(2)).toStrictEqual(u256.Zero);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 1 provider in pendingRemoval state and 1 provider', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1, true);
        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);

        manager.addToRemovalQueue(provider2);
        manager.addToRemovalQueue(provider3);

        expect(manager.removalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.getFromRemovalQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.removalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 2 providers in pendingRemoval state', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1, true);
        const provider3: Provider = createProvider(providerAddress2, tokenAddress1, true);

        manager.addToRemovalQueue(provider2);
        manager.addToRemovalQueue(provider3);

        expect(manager.removalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.getFromRemovalQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.removalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 1 provider in pendingRemoval state and 1 provider', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1, true);
        const provider3: Provider = createProvider(providerAddress2, tokenAddress1);

        manager.addToRemovalQueue(provider2);
        manager.addToRemovalQueue(provider3);

        expect(manager.removalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.getFromRemovalQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.removalQueueStartingIndex).toStrictEqual(1);
    });

    it('should skip a deleted provider and correctly set previousRemovalStartingIndex', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);

        manager.addToRemovalQueue(provider1);
        manager.addToRemovalQueue(provider2);

        manager.removePendingLiquidityProviderFromRemovalQueue(provider1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(2);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(u256.Zero);
    });
});

describe('ProviderManager priority queue cleanUpQueues tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 1 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToPriorityQueue(provider1);

        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 1 provider active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.activate();
        provider1.markPriority();

        manager.addToPriorityQueue(provider1);

        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.getId());
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 1 provider not active and 1 provider active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.activate();
        provider2.markPriority();

        manager.addToPriorityQueue(provider1);
        manager.addToPriorityQueue(provider2);

        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 2 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.deactivate();
        provider2.markPriority();

        manager.addToPriorityQueue(provider1);
        manager.addToPriorityQueue(provider2);

        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(2);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 1 provider active and 1 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.activate();
        provider1.markPriority();

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.deactivate();
        provider2.markPriority();

        manager.addToPriorityQueue(provider1);
        manager.addToPriorityQueue(provider2);

        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.getId());
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 2 providers active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
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

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(0);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.getId());
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 1 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToPriorityQueue(provider1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.deactivate();
        provider2.markPriority();

        manager.addToPriorityQueue(provider2);
        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(2);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 1 provider active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToPriorityQueue(provider1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
        provider2.activate();
        provider2.markPriority();

        manager.addToPriorityQueue(provider2);

        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider1.getId());
        expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 1 provider not active and 1 provider active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToPriorityQueue(provider1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.deactivate();
        provider2.markPriority();

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.activate();
        provider3.markPriority();

        manager.addToPriorityQueue(provider2);
        manager.addToPriorityQueue(provider3);

        expect(manager.priorityQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(2);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.priorityQueueStartingIndex).toStrictEqual(2);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 2 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToPriorityQueue(provider1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.deactivate();
        provider2.markPriority();

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.deactivate();
        provider3.markPriority();

        manager.addToPriorityQueue(provider2);
        manager.addToPriorityQueue(provider3);

        expect(manager.priorityQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(3);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(2)).toStrictEqual(u256.Zero);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 1 provider active and 1 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToPriorityQueue(provider1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.activate();
        provider2.markPriority();

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.deactivate();
        provider3.markPriority();

        manager.addToPriorityQueue(provider2);
        manager.addToPriorityQueue(provider3);

        expect(manager.priorityQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.getFromPriorityQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 2 providers active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToPriorityQueue(provider1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1, true);
        provider2.activate();
        provider2.markPriority();

        const provider3: Provider = createProvider(providerAddress2, tokenAddress1, true);
        provider3.activate();
        provider3.markPriority();

        manager.addToPriorityQueue(provider2);
        manager.addToPriorityQueue(provider3);

        expect(manager.priorityQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.getFromPriorityQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 1 provider active state and 1 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToPriorityQueue(provider1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
        provider2.activate();
        provider2.markPriority();

        const provider3: Provider = createProvider(providerAddress2, tokenAddress1);
        provider3.deactivate();
        provider3.markPriority();

        manager.addToPriorityQueue(provider2);
        manager.addToPriorityQueue(provider3);

        expect(manager.priorityQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.getFromPriorityQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
    });

    it('should skip a deleted provider and correctly set previousReservationStartingIndex', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider1.activate();
        provider1.markPriority();
        provider1.setQueueIndex(0);
        provider2.deactivate();
        provider2.markPriority();
        manager.addToPriorityQueue(provider1);
        manager.addToPriorityQueue(provider2);

        expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.getId());

        manager.resetProvider(provider1, false);

        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);

        manager.cleanUpQueues();

        expect(manager.previousPriorityStartingIndex).toStrictEqual(2);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(u256.Zero);
    });
});

describe('ProviderManager normal queue cleanUpQueues tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex = 0, 1 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousNormalStartingIndex).toStrictEqual(0);
        expect(manager.normalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToNormalQueue(provider1);

        expect(manager.normalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.normalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex = 0, 1 provider active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousNormalStartingIndex).toStrictEqual(0);
        expect(manager.normalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.activate();
        provider1.markPriority();

        manager.addToNormalQueue(provider1);

        expect(manager.normalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(0);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(provider1.getId());
        expect(manager.normalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex = 0, 1 provider not active and 1 provider active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousNormalStartingIndex).toStrictEqual(0);
        expect(manager.normalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.activate();
        provider2.markPriority();

        manager.addToNormalQueue(provider1);
        manager.addToNormalQueue(provider2);

        expect(manager.normalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.normalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex = 0, 2 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousNormalStartingIndex).toStrictEqual(0);
        expect(manager.normalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.deactivate();
        provider2.markPriority();

        manager.addToNormalQueue(provider1);
        manager.addToNormalQueue(provider2);

        expect(manager.normalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(2);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.normalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex = 0, 1 provider active and 1 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousNormalStartingIndex).toStrictEqual(0);
        expect(manager.normalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.activate();
        provider1.markPriority();

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.deactivate();
        provider2.markPriority();

        manager.addToNormalQueue(provider1);
        manager.addToNormalQueue(provider2);

        expect(manager.normalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(0);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(provider1.getId());
        expect(manager.getFromNormalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.normalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex = 0, 2 providers active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        expect(manager.previousNormalStartingIndex).toStrictEqual(0);
        expect(manager.normalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.activate();
        provider1.markPriority();

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.activate();
        provider2.markPriority();

        manager.addToNormalQueue(provider1);
        manager.addToNormalQueue(provider2);

        expect(manager.normalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(0);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(provider1.getId());
        expect(manager.getFromNormalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.normalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex <> 0, 1 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToNormalQueue(provider1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.deactivate();
        provider2.markPriority();

        manager.addToNormalQueue(provider2);
        expect(manager.normalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(2);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.normalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex <> 0, 1 provider active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToNormalQueue(provider1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
        provider2.activate();
        provider2.markPriority();

        manager.addToNormalQueue(provider2);

        expect(manager.normalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(1)).toStrictEqual(provider1.getId());
        expect(manager.normalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex <> 0, 1 provider not active and 1 provider active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToNormalQueue(provider1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.deactivate();
        provider2.markPriority();

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.activate();
        provider3.markPriority();

        manager.addToNormalQueue(provider2);
        manager.addToNormalQueue(provider3);

        expect(manager.normalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(2);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.normalQueueStartingIndex).toStrictEqual(2);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex <> 0, 2 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToNormalQueue(provider1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.deactivate();
        provider2.markPriority();

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.deactivate();
        provider3.markPriority();

        manager.addToNormalQueue(provider2);
        manager.addToNormalQueue(provider3);

        expect(manager.normalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(3);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(2)).toStrictEqual(u256.Zero);
        expect(manager.normalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex <> 0, 1 provider active and 1 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToNormalQueue(provider1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.activate();
        provider2.markPriority();

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.deactivate();
        provider3.markPriority();

        manager.addToNormalQueue(provider2);
        manager.addToNormalQueue(provider3);

        expect(manager.normalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.getFromNormalQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.normalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex <> 0, 2 providers active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToNormalQueue(provider1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1, true);
        provider2.activate();
        provider2.markPriority();

        const provider3: Provider = createProvider(providerAddress2, tokenAddress1, true);
        provider3.activate();
        provider3.markPriority();

        manager.addToNormalQueue(provider2);
        manager.addToNormalQueue(provider3);

        expect(manager.normalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.getFromNormalQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.normalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousNormalStartingIndex and queue state when cleanUpQueues is called, previousNormalStartingIndex <> 0, 1 provider active state and 1 provider not active', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.deactivate();
        provider1.markPriority();

        manager.addToNormalQueue(provider1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.normalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
        provider2.activate();
        provider2.markPriority();

        const provider3: Provider = createProvider(providerAddress2, tokenAddress1);
        provider3.deactivate();
        provider3.markPriority();

        manager.addToNormalQueue(provider2);
        manager.addToNormalQueue(provider3);

        expect(manager.normalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(1);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(1)).toStrictEqual(provider2.getId());
        expect(manager.getFromNormalQueue(2)).toStrictEqual(provider3.getId());
        expect(manager.normalQueueStartingIndex).toStrictEqual(1);
    });

    it('should skip a deleted provider and correctly set previousNormalStartingIndex', () => {
        const owedBTCManager: OwedBTCManager = new OwedBTCManager();
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            owedBTCManager,
            ENABLE_INDEX_VERIFICATION,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider1.activate();
        provider1.clearPriority();
        provider1.setQueueIndex(0);
        provider2.deactivate();
        provider1.clearPriority();
        manager.addToNormalQueue(provider1);
        manager.addToNormalQueue(provider2);

        expect(manager.getFromNormalQueue(0)).toStrictEqual(provider1.getId());

        manager.resetProvider(provider1, false);

        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);

        manager.cleanUpQueues();

        expect(manager.previousNormalStartingIndex).toStrictEqual(2);
        expect(manager.getFromNormalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromNormalQueue(1)).toStrictEqual(u256.Zero);
    });
});
