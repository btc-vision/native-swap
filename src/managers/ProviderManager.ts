import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    Revert,
    StoredU256,
    StoredU64,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
    INITIAL_LIQUIDITY_PROVIDER_POINTER,
    PRIORITY_QUEUE_POINTER,
    REMOVAL_QUEUE_POINTER,
    STANDARD_QUEUE_POINTER,
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

export class ProviderManager implements IProviderManager {
    protected readonly token: Address;
    protected readonly tokenIdUint8Array: Uint8Array;
    protected readonly standardQueue: ProviderQueue;
    protected readonly priorityQueue: PriorityProviderQueue;
    protected readonly removalQueue: RemovalProviderQueue;
    protected readonly owedBTCManager: IOwedBTCManager;

    private readonly _startingIndex: StoredU64;
    private readonly _initialLiquidityProviderId: StoredU256;

    constructor(token: Address, tokenIdUint8Array: Uint8Array, owedBTCManager: IOwedBTCManager) {
        this.token = token;
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.owedBTCManager = owedBTCManager;
        this.standardQueue = new ProviderQueue(token, STANDARD_QUEUE_POINTER, tokenIdUint8Array);
        this.priorityQueue = new PriorityProviderQueue(
            token,
            PRIORITY_QUEUE_POINTER,
            tokenIdUint8Array,
        );
        this.removalQueue = new RemovalProviderQueue(
            this.owedBTCManager,
            token,
            REMOVAL_QUEUE_POINTER,
            tokenIdUint8Array,
        );
        this._initialLiquidityProviderId = new StoredU256(
            INITIAL_LIQUIDITY_PROVIDER_POINTER,
            tokenIdUint8Array,
        );
        this._startingIndex = new StoredU64(STARTING_INDEX_POINTER, tokenIdUint8Array);
    }

    public get standardQueueLength(): u64 {
        return this.standardQueue.length;
    }

    public get standardQueueStartingIndex(): u64 {
        return this.standardQueue.startingIndex;
    }

    public get priorityQueueLength(): u64 {
        return this.priorityQueue.length;
    }

    public get priorityQueueStartingIndex(): u64 {
        return this.priorityQueue.startingIndex;
    }

    public get removalQueueLength(): u64 {
        return this.removalQueue.length;
    }

    public get removalQueueStartingIndex(): u64 {
        return this.removalQueue.startingIndex;
    }

    public get previousStandardStartingIndex(): u64 {
        return this._startingIndex.get(0);
    }

    public set previousStandardStartingIndex(value: u64) {
        this._startingIndex.set(0, value);
    }

    public get previousPriorityStartingIndex(): u64 {
        return this._startingIndex.get(1);
    }

    public set previousPriorityStartingIndex(value: u64) {
        this._startingIndex.set(1, value);
    }

    public get previousRemovalStartingIndex(): u64 {
        return this._startingIndex.get(2);
    }

    public set previousRemovalStartingIndex(value: u64) {
        this._startingIndex.set(2, value);
    }

    public get initialLiquidityProviderId(): u256 {
        return this._initialLiquidityProviderId.value;
    }

    public set initialLiquidityProviderId(value: u256) {
        this._initialLiquidityProviderId.value = value;
    }

    public get currentIndexStandard(): u64 {
        return this.standardQueue.currentIndex;
    }

    public get currentIndexPriority(): u64 {
        return this.priorityQueue.currentIndex;
    }

    public get currentIndexRemoval(): u64 {
        return this.removalQueue.currentIndex;
    }

    public addToStandardQueue(provider: Provider): u64 {
        return this.standardQueue.add(provider);
    }

    public addToPriorityQueue(provider: Provider): u64 {
        return this.priorityQueue.add(provider);
    }

    public addToRemovalQueue(provider: Provider): u64 {
        return this.removalQueue.add(provider);
    }

    public getIdFromQueue(index: u64, type: ProviderTypes): u256 {
        switch (type) {
            case ProviderTypes.Normal: {
                return this.standardQueue.getAt(index);
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

    public getProviderFromQueue(index: u64, type: ProviderTypes): Provider {
        let providerId: u256 = u256.Zero;

        if (index === INITIAL_LIQUIDITY_PROVIDER_INDEX) {
            providerId = this.initialLiquidityProviderId;
        } else {
            providerId = this.getIdFromQueue(index, type);
        }

        this.ensureProviderExists(providerId, index, type);

        return getProvider(providerId);
    }

    public getFromStandardQueue(index: u64): u256 {
        return this.standardQueue.getAt(index);
    }

    public getFromPriorityQueue(index: u64): u256 {
        return this.priorityQueue.getAt(index);
    }

    public getFromRemovalQueue(index: u64): u256 {
        return this.removalQueue.getAt(index);
    }

    public getStandardQueue(): ProviderQueue {
        return this.standardQueue;
    }

    public getBTCowed(providerId: u256): u256 {
        return this.owedBTCManager.getBTCowed(providerId);
    }

    public setBTCowed(providerId: u256, amount: u256): void {
        this.owedBTCManager.setBTCowed(providerId, amount);
    }

    public getBTCOwedLeft(providerId: u256): u256 {
        return this.owedBTCManager.getBTCOwedLeft(providerId);
    }

    public getBTCowedReserved(providerId: u256): u256 {
        return this.owedBTCManager.getBTCowedReserved(providerId);
    }

    public setBTCowedReserved(providerId: u256, amount: u256): void {
        this.owedBTCManager.setBTCowedReserved(providerId, amount);
    }

    public cleanUpQueues(): void {
        this.previousStandardStartingIndex = this.standardQueue.cleanUp(
            this.previousStandardStartingIndex,
        );
        this.previousPriorityStartingIndex = this.priorityQueue.cleanUp(
            this.previousPriorityStartingIndex,
        );
        this.previousRemovalStartingIndex = this.removalQueue.cleanUp(
            this.previousRemovalStartingIndex,
        );
    }

    public getNextProviderWithLiquidity(currentQuote: u256): Provider | null {
        if (currentQuote.isZero()) {
            return this.getInitialProvider(currentQuote);
        }

        const removalProvider = this.removalQueue.getNextWithLiquidity(currentQuote);
        if (removalProvider !== null) {
            return removalProvider;
        }

        const priorityProvider = this.priorityQueue.getNextWithLiquidity(currentQuote);
        if (priorityProvider !== null) {
            return priorityProvider;
        }

        const provider = this.standardQueue.getNextWithLiquidity(currentQuote);
        if (provider !== null) {
            return provider;
        }

        return this.getInitialProvider(currentQuote);
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
                this.standardQueue.removeAt(provider.getQueueIndex());
            }
        }

        provider.resetListingValues();

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), canceled, false));
    }

    public resetStartingIndex(): void {
        this.previousStandardStartingIndex = 0;
        this.previousPriorityStartingIndex = 0;
        this.previousRemovalStartingIndex = 0;
    }

    public restoreCurrentIndex(): void {
        this.standardQueue.restoreCurrentIndex(this.previousStandardStartingIndex);
        this.priorityQueue.restoreCurrentIndex(this.previousPriorityStartingIndex);
        this.removalQueue.restoreCurrentIndex(this.previousRemovalStartingIndex);
    }

    public save(): void {
        this.previousStandardStartingIndex =
            this.currentIndexStandard === 0
                ? this.currentIndexStandard
                : this.currentIndexStandard - 1;

        this.previousPriorityStartingIndex =
            this.currentIndexPriority === 0
                ? this.currentIndexPriority
                : this.currentIndexPriority - 1;

        this.previousRemovalStartingIndex =
            this.currentIndexRemoval === 0
                ? this.currentIndexRemoval
                : this.currentIndexRemoval - 1;

        this._startingIndex.save();
        this.standardQueue.save();
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

        initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);

        return initialProvider;
    }

    private ensureProviderExists(providerId: u256, index: u64, type: ProviderTypes): void {
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
