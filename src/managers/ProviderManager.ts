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
    BTC_OWED_POINTER,
    BTC_OWED_RESERVED_POINTER,
    INITIAL_LIQUIDITY_PROVIDER_POINTER,
    PRIORITY_QUEUE_POINTER,
    REMOVAL_QUEUE_POINTER,
    STANDARD_QUEUE_POINTER,
    STARTING_INDEX_POINTER,
} from '../constants/StoredPointers';
import { getProvider, Provider } from '../models/Provider';
import { FulfilledProviderEvent } from '../events/FulfilledProviderEvent';
import { ProviderQueue } from './ProviderQueue';
import { PriorityProviderQueue } from './PriorityProviderQueue';
import { RemovalProviderQueue } from './RemovalProviderQueue';
import { OwedBTCManager } from './OwedBTCManager';

const ENABLE_INDEX_VERIFICATION: bool = true;

export class ProviderManager {
    protected readonly standardQueue: ProviderQueue;
    protected readonly priorityQueue: PriorityProviderQueue;
    protected readonly removalQueue: RemovalProviderQueue;
    protected readonly owedBTCManager: OwedBTCManager;

    private readonly _startingIndex: StoredU64;
    private readonly _initialLiquidityProvider: StoredU256;

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
    ) {
        this.owedBTCManager = new OwedBTCManager(BTC_OWED_POINTER, BTC_OWED_RESERVED_POINTER);
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
        this._initialLiquidityProvider = new StoredU256(
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

    public get initialLiquidityProvider(): u256 {
        return this._initialLiquidityProvider.value;
    }

    public set initialLiquidityProvider(value: u256) {
        this._initialLiquidityProvider.value = value;
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

    public addToStandardQueue(providerId: u256): u64 {
        return this.standardQueue.add(providerId);
    }

    public addToPriorityQueue(providerId: u256): u64 {
        return this.priorityQueue.add(providerId);
    }

    public addToRemovalQueue(providerId: u256): u64 {
        return this.removalQueue.add(providerId);
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

    /*
    public removePendingLiquidityProviderFromRemovalQueue(provider: Provider, i: u64): void {
        this._removalQueue.delete_physical(i);

        provider.pendingRemoval = false;
        provider.isLp = false;

        Blockchain.emit(new FulfilledProviderEvent(provider.providerId, false, true));
    }
*/
    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        if (burnRemainingFunds && provider.haveLiquidity()) {
            TransferHelper.safeTransfer(this.token, Address.dead(), provider.liquidity.toU256());
        }

        if (!u256.eq(provider.providerId, this._initialLiquidityProvider.value)) {
            if (provider.isPriority()) {
                this._priorityQueue.delete_physical(provider.indexedAt);
            } else {
                this._queue.delete_physical(provider.indexedAt);
            }
        }

        Blockchain.emit(new FulfilledProviderEvent(provider.providerId, canceled, false));

        provider.resetListingValues();
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
        if (this._initialLiquidityProvider.value.isZero()) {
            return null;
        }

        const initialProvider = getProvider(this._initialLiquidityProvider.value);
        if (!initialProvider.isActive()) {
            return null;
        }

        if (!initialProvider.isReservedAmountValid()) {
            throw new Revert(`Impossible state: reserved cannot be > liquidity.`);
        }

        const availableLiquidity: u256 = initialProvider.getAvailableLiquidityAmount();

        if (availableLiquidity.isZero()) {
            return null;
        }

        if (!currentQuote.isZero()) {
            const hasEnoughLiquidity = this.verifyProviderRemainingLiquidity(
                initialProvider,
                availableLiquidity.toU256(),
                currentQuote,
            );

            if (!hasEnoughLiquidity) {
                return null;
            }
        }
        ///!!!! WHAT WHEN current quote is 0

        initialProvider.indexedAt = u32.MAX_VALUE;
        return initialProvider;
    }
}
