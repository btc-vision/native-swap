import { u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../../models/Provider';
import { ProviderTypes } from '../../types/ProviderTypes';
import { ReservationProviderData } from '../../models/ReservationProdiverData';

export interface IProviderManager {
    readonly currentIndexNormal: u32;
    readonly currentIndexPriority: u32;
    initialLiquidityProviderId: u256;
    readonly normalQueueLength: u32;
    readonly normalQueueStartingIndex: u32;
    readonly priorityQueueLength: u32;
    readonly priorityQueueStartingIndex: u32;
    previousNormalStartingIndex: u32;
    previousPriorityStartingIndex: u32;

    addToNormalQueue(provider: Provider): u32;

    addToNormalPurgedQueue(provider: Provider): u32;

    addToPriorityQueue(provider: Provider): u32;

    addToPriorityPurgedQueue(provider: Provider): u32;

    cleanUpQueues(): void;

    getIdFromQueue(index: u32, type: ProviderTypes): u256;

    getFromNormalQueue(index: u32): u256;

    getFromPriorityQueue(index: u32): u256;

    getProviderFromQueue(index: u32, type: ProviderTypes): Provider;

    getNextProviderWithLiquidity(quote: u256): Provider | null;

    getQueueData(): Uint8Array;

    purgeAndRestoreProvider(data: ReservationProviderData): void;

    removeFromNormalQueue(provider: Provider): void;

    removeFromPriorityQueue(provider: Provider): void;

    removeFromPurgeQueue(provider: Provider): void;

    resetProvider(provider: Provider, burnRemainingFunds: boolean, canceled: boolean): void;

    resetStartingIndex(): void;

    restoreCurrentIndex(): void;

    save(): void;
}
