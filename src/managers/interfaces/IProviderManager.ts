import { u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../../models/Provider';
import { ProviderTypes } from '../../types/ProviderTypes';
import { ProviderQueue } from '../ProviderQueue';

export interface IProviderManager {
    readonly standardQueueLength: u64;
    readonly standardQueueStartingIndex: u64;
    readonly priorityQueueLength: u64;
    readonly priorityQueueStartingIndex: u64;
    readonly removalQueueLength: u64;
    readonly removalQueueStartingIndex: u64;
    previousStandardStartingIndex: u64;
    previousPriorityStartingIndex: u64;
    previousRemovalStartingIndex: u64;
    initialLiquidityProviderId: u256;
    readonly currentIndexStandard: u64;
    readonly currentIndexPriority: u64;
    readonly currentIndexRemoval: u64;

    addToStandardQueue(provider: Provider): u64;

    addToPriorityQueue(provider: Provider): u64;

    addToRemovalQueue(provider: Provider): u64;

    getIdFromQueue(index: u64, type: ProviderTypes): u256;

    getProviderFromQueue(index: u64, type: ProviderTypes): Provider;

    getFromStandardQueue(index: u64): u256;

    getFromPriorityQueue(index: u64): u256;

    getFromRemovalQueue(index: u64): u256;

    getStandardQueue(): ProviderQueue;

    getBTCowed(providerId: u256): u256;

    setBTCowed(providerId: u256, amount: u256): void;

    getBTCOwedLeft(providerId: u256): u256;

    getBTCowedReserved(providerId: u256): u256;

    setBTCowedReserved(providerId: u256, amount: u256): void;

    cleanUpQueues(): void;

    getNextProviderWithLiquidity(currentQuote: u256): Provider | null;

    removePendingLiquidityProviderFromRemovalQueue(provider: Provider): void;

    resetProvider(provider: Provider, burnRemainingFunds?: boolean, canceled?: boolean): void;

    resetStartingIndex(): void;

    restoreCurrentIndex(): void;

    save(): void;
}
