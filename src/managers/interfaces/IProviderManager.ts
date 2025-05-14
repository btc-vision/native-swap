import { u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../../models/Provider';
import { ProviderTypes } from '../../types/ProviderTypes';

export interface IProviderManager {
    readonly normalQueueLength: u32;
    readonly normalQueueStartingIndex: u32;
    readonly priorityQueueLength: u32;
    readonly priorityQueueStartingIndex: u32;
    readonly removalQueueLength: u32;
    readonly removalQueueStartingIndex: u32;
    previousNormalStartingIndex: u32;
    previousPriorityStartingIndex: u32;
    previousRemovalStartingIndex: u32;
    initialLiquidityProviderId: u256;
    readonly currentIndexNormal: u32;
    readonly currentIndexPriority: u32;
    readonly currentIndexRemoval: u32;

    addToNormalQueue(provider: Provider): u32;

    addToPriorityQueue(provider: Provider): u32;

    addToRemovalQueue(provider: Provider): u32;

    getIdFromQueue(index: u32, type: ProviderTypes): u256;

    getProviderFromQueue(index: u32, type: ProviderTypes): Provider;

    getFromNormalQueue(index: u32): u256;

    getFromPriorityQueue(index: u32): u256;

    getFromRemovalQueue(index: u32): u256;

    cleanUpQueues(): void;

    getNextProviderWithLiquidity(quote: u256): Provider | null;

    removePendingLiquidityProviderFromRemovalQueue(provider: Provider): void;

    resetProvider(provider: Provider, burnRemainingFunds: boolean, canceled: boolean): void;

    resetStartingIndex(): void;

    restoreCurrentIndex(): void;

    save(): void;
}
