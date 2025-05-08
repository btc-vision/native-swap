import { u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../../models/Provider';
import { ProviderTypes } from '../../types/ProviderTypes';
import { ProviderQueue } from '../ProviderQueue';

export interface IProviderManager {
    readonly normalQueueLength: u64;
    readonly normalQueueStartingIndex: u64;
    readonly priorityQueueLength: u64;
    readonly priorityQueueStartingIndex: u64;
    readonly removalQueueLength: u64;
    readonly removalQueueStartingIndex: u64;
    previousNormalStartingIndex: u64;
    previousPriorityStartingIndex: u64;
    previousRemovalStartingIndex: u64;
    initialLiquidityProviderId: u256;
    readonly currentIndexNormal: u64;
    readonly currentIndexPriority: u64;
    readonly currentIndexRemoval: u64;

    addToNormalQueue(provider: Provider): u64;

    addToPriorityQueue(provider: Provider): u64;

    addToRemovalQueue(provider: Provider): u64;

    getIdFromQueue(index: u64, type: ProviderTypes): u256;

    getProviderFromQueue(index: u64, type: ProviderTypes): Provider;

    getFromNormalQueue(index: u64): u256;

    getFromPriorityQueue(index: u64): u256;

    getFromRemovalQueue(index: u64): u256;

    getNormalQueue(): ProviderQueue;

    getBTCowed(providerId: u256): u64;

    setBTCowed(providerId: u256, amount: u64): void;

    getBTCOwedLeft(providerId: u256): u64;

    getBTCowedReserved(providerId: u256): u64;

    setBTCowedReserved(providerId: u256, amount: u64): void;

    cleanUpQueues(): void;

    getNextProviderWithLiquidity(currentQuote: u256): Provider | null;

    removePendingLiquidityProviderFromRemovalQueue(provider: Provider): void;

    resetProvider(provider: Provider, burnRemainingFunds?: boolean, canceled?: boolean): void;

    resetStartingIndex(): void;

    restoreCurrentIndex(): void;

    save(): void;
}
