import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    Revert,
    StoredU256,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
    INITIAL_LIQUIDITY_PROVIDER_POINTER,
    NORMAL_QUEUE_POINTER,
    PRIORITY_QUEUE_POINTER,
    REMOVAL_QUEUE_POINTER,
    STARTING_INDEX_POINTER,
} from '../constants/StoredPointers';
import { getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { PriorityProviderQueue } from './PriorityProviderQueue';
import { RemovalProviderQueue } from './RemovalProviderQueue';
import { IOwedBTCManager } from './interfaces/IOwedBTCManager';
import { INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';
import { FulfilledProviderEvent } from '../events/FulfilledProviderEvent';
import { ProviderTypes } from '../types/ProviderTypes';
import { IProviderManager } from './interfaces/IProviderManager';
import { StoredU32 } from '../../../btc-runtime/runtime/storage/StoredU32';

export class ProviderManager implements IProviderManager {
    protected readonly token: Address;
    protected readonly tokenIdUint8Array: Uint8Array;
    protected readonly normalQueue: ProviderQueue;
    protected readonly priorityQueue: PriorityProviderQueue;
    protected readonly removalQueue: RemovalProviderQueue;
    protected readonly owedBTCManager: IOwedBTCManager;

    private readonly _startingIndex: StoredU32;
    private readonly _initialLiquidityProviderId: StoredU256;

    constructor(token: Address, tokenIdUint8Array: Uint8Array, owedBTCManager: IOwedBTCManager) {
        this.token = token;
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.owedBTCManager = owedBTCManager;
        this.normalQueue = new ProviderQueue(token, NORMAL_QUEUE_POINTER, tokenIdUint8Array);
        this.priorityQueue = new PriorityProviderQueue(
            token,
            PRIORITY_QUEUE_POINTER,
            tokenIdUint8Array,
        );
        this.removalQueue = new RemovalProviderQueue(
            owedBTCManager,
            token,
            REMOVAL_QUEUE_POINTER,
            tokenIdUint8Array,
        );
        this._initialLiquidityProviderId = new StoredU256(
            INITIAL_LIQUIDITY_PROVIDER_POINTER,
            tokenIdUint8Array,
        );
        this._startingIndex = new StoredU32(STARTING_INDEX_POINTER, tokenIdUint8Array);
    }

    public get currentIndexPriority(): u32 {
        return this.priorityQueue.currentIndex;
    }

    public get currentIndexRemoval(): u32 {
        return this.removalQueue.currentIndex;
    }

    public get currentIndexNormal(): u32 {
        return this.normalQueue.currentIndex;
    }

    public get initialLiquidityProviderId(): u256 {
        return this._initialLiquidityProviderId.value;
    }

    public set initialLiquidityProviderId(value: u256) {
        this._initialLiquidityProviderId.value = value;
    }

    public get previousPriorityStartingIndex(): u32 {
        return this._startingIndex.get(1);
    }

    public set previousPriorityStartingIndex(value: u32) {
        this._startingIndex.set(1, value);
    }

    public get previousRemovalStartingIndex(): u32 {
        return this._startingIndex.get(2);
    }

    public set previousRemovalStartingIndex(value: u32) {
        this._startingIndex.set(2, value);
    }

    public get previousNormalStartingIndex(): u32 {
        return this._startingIndex.get(0);
    }

    public set previousNormalStartingIndex(value: u32) {
        this._startingIndex.set(0, value);
    }

    public get priorityQueueLength(): u32 {
        return this.priorityQueue.length;
    }

    public get priorityQueueStartingIndex(): u32 {
        return this.priorityQueue.startingIndex;
    }

    public get removalQueueLength(): u32 {
        return this.removalQueue.length;
    }

    public get removalQueueStartingIndex(): u32 {
        return this.removalQueue.startingIndex;
    }

    public get normalQueueLength(): u32 {
        return this.normalQueue.length;
    }

    public get normalQueueStartingIndex(): u32 {
        return this.normalQueue.startingIndex;
    }

    public addToNormalQueue(provider: Provider): u32 {
        return this.normalQueue.add(provider);
    }

    public addToPriorityQueue(provider: Provider): u32 {
        return this.priorityQueue.add(provider);
    }

    public addToRemovalQueue(provider: Provider): u32 {
        return this.removalQueue.add(provider);
    }

    public cleanUpQueues(): void {
        this.previousNormalStartingIndex = this.normalQueue.cleanUp(
            this.previousNormalStartingIndex,
        );
        this.previousPriorityStartingIndex = this.priorityQueue.cleanUp(
            this.previousPriorityStartingIndex,
        );
        this.previousRemovalStartingIndex = this.removalQueue.cleanUp(
            this.previousRemovalStartingIndex,
        );
    }

    public getFromPriorityQueue(index: u32): u256 {
        return this.priorityQueue.getAt(index);
    }

    public getFromRemovalQueue(index: u32): u256 {
        return this.removalQueue.getAt(index);
    }

    public getFromNormalQueue(index: u32): u256 {
        return this.normalQueue.getAt(index);
    }

    public getIdFromQueue(index: u32, type: ProviderTypes): u256 {
        switch (type) {
            case ProviderTypes.Normal: {
                return this.normalQueue.getAt(index);
            }
            case ProviderTypes.Priority: {
                return this.priorityQueue.getAt(index);
            }
            case ProviderTypes.LiquidityRemoval: {
                return this.removalQueue.getAt(index);
            }
            default: {
                throw new Revert('Impossible state: Invalid provider type');
            }
        }
    }

    public getNextProviderWithLiquidity(currentQuote: u256): Provider | null {
        if (currentQuote.isZero()) {
            return this.getInitialProvider(currentQuote);
        }

        const removalProvider: Provider | null =
            this.removalQueue.getNextWithLiquidity(currentQuote);

        if (removalProvider !== null) {
            return removalProvider;
        }

        const priorityProvider: Provider | null =
            this.priorityQueue.getNextWithLiquidity(currentQuote);

        if (priorityProvider !== null) {
            return priorityProvider;
        }

        const provider: Provider | null = this.normalQueue.getNextWithLiquidity(currentQuote);

        if (provider !== null) {
            return provider;
        }

        return this.getInitialProvider(currentQuote);
    }

    public getProviderFromQueue(index: u32, type: ProviderTypes): Provider {
        let providerId: u256;

        if (index === INITIAL_LIQUIDITY_PROVIDER_INDEX) {
            providerId = this.initialLiquidityProviderId;
        } else {
            providerId = this.getIdFromQueue(index, type);
        }

        this.ensureProviderExists(providerId, index, type);

        return getProvider(providerId);
    }

    public getNormalQueue(): ProviderQueue {
        return this.normalQueue;
    }

    public removePendingLiquidityProviderFromRemovalQueue(provider: Provider): void {
        this.removalQueue.removeFromQueue(provider);
    }

    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        this.ensureProviderIsNotPendingRemoval(provider);

        if (burnRemainingFunds && provider.hasLiquidityAmount()) {
            TransferHelper.safeTransfer(
                this.token,
                Address.dead(),
                provider.getLiquidityAmount().toU256(),
            );
        }

        if (!provider.isInitialLiquidityProvider()) {
            if (provider.isPriority()) {
                this.priorityQueue.removeAt(provider.getQueueIndex());
            } else {
                this.normalQueue.removeAt(provider.getQueueIndex());
            }
        }

        provider.resetListingValues();

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), canceled, false));
    }

    public resetStartingIndex(): void {
        this.previousNormalStartingIndex = 0;
        this.previousPriorityStartingIndex = 0;
        this.previousRemovalStartingIndex = 0;
    }

    public restoreCurrentIndex(): void {
        this.normalQueue.restoreCurrentIndex(this.previousNormalStartingIndex);
        this.priorityQueue.restoreCurrentIndex(this.previousPriorityStartingIndex);
        this.removalQueue.restoreCurrentIndex(this.previousRemovalStartingIndex);
    }

    public save(): void {
        this.previousNormalStartingIndex =
            this.currentIndexNormal === 0 ? this.currentIndexNormal : this.currentIndexNormal - 1;

        this.previousPriorityStartingIndex =
            this.currentIndexPriority === 0
                ? this.currentIndexPriority
                : this.currentIndexPriority - 1;

        this.previousRemovalStartingIndex =
            this.currentIndexRemoval === 0
                ? this.currentIndexRemoval
                : this.currentIndexRemoval - 1;

        this._startingIndex.save();
        this.normalQueue.save();
        this.priorityQueue.save();
        this.removalQueue.save();
    }

    private getInitialProvider(currentQuote: u256): Provider | null {
        if (this._initialLiquidityProviderId.value.isZero()) {
            return null;
        }

        const initialProvider = getProvider(this._initialLiquidityProviderId.value);
        if (!initialProvider.isActive()) {
            return null;
        }

        const availableLiquidity = initialProvider.getAvailableLiquidityAmount();

        if (availableLiquidity.isZero()) {
            return null;
        }

        if (
            !currentQuote.isZero() &&
            !Provider.meetsMinimumReservationAmount(availableLiquidity, currentQuote)
        ) {
            if (!initialProvider.hasReservedAmount()) {
                this.resetProvider(initialProvider);
            }

            return null;
        }

        //!!!initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
        //!!!initialProvider.markInitialProvider();

        return initialProvider;
    }

    private ensureProviderExists(providerId: u256, index: u32, type: ProviderTypes): void {
        if (providerId.isZero()) {
            throw new Revert(
                `Impossible state: Cannot load provider. Index: ${index} Type: ${type}. Pool corrupted.`,
            );
        }
    }

    private ensureProviderIsNotPendingRemoval(provider: Provider): void {
        if (provider.isPendingRemoval()) {
            throw new Revert('Impossible state: removal provider cannot be reset.');
        }
    }
}
