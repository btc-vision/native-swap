import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    Potential,
    Revert,
    SafeMath,
    StoredU256,
    StoredU256Array,
    StoredU64,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
    INITIAL_LIQUIDITY,
    LIQUIDITY_PRIORITY_QUEUE_POINTER,
    LIQUIDITY_QUEUE_POINTER,
    LP_BTC_OWED_POINTER,
    LP_BTC_OWED_RESERVED_POINTER,
    REMOVAL_QUEUE_POINTER,
    STARTING_INDEX_POINTER,
} from '../StoredPointers';
import { getProvider, Provider } from '../Provider';
import { StoredMapU256 } from '../../stored/StoredMapU256';
import { tokensToSatoshis } from '../../utils/NativeSwapUtils';
import { LiquidityQueue } from './LiquidityQueue';
import { FulfilledProviderEvent } from '../../events/FulfilledProviderEvent';

const ENABLE_INDEX_VERIFICATION: bool = true;

export class ProviderManager {
    protected readonly _queue: StoredU256Array;
    protected readonly _priorityQueue: StoredU256Array;
    protected readonly _removalQueue: StoredU256Array;

    private readonly _startingIndex: StoredU64;
    private readonly _initialLiquidityProvider: StoredU256;
    private readonly _lpBTCowed: StoredMapU256;
    private readonly _lpBTCowedReserved: StoredMapU256;

    private currentIndex: u64 = 0;
    private currentIndexPriority: u64 = 0;
    private currentIndexRemoval: u64 = 0;

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
        public readonly strictMinimumProviderReservationAmount: u256,
    ) {
        this._queue = new StoredU256Array(LIQUIDITY_QUEUE_POINTER, tokenIdUint8Array);

        this._priorityQueue = new StoredU256Array(
            LIQUIDITY_PRIORITY_QUEUE_POINTER,
            tokenIdUint8Array,
        );

        this._removalQueue = new StoredU256Array(REMOVAL_QUEUE_POINTER, tokenIdUint8Array);

        this._initialLiquidityProvider = new StoredU256(INITIAL_LIQUIDITY, tokenIdUint8Array);
        this._lpBTCowed = new StoredMapU256(LP_BTC_OWED_POINTER);
        this._lpBTCowedReserved = new StoredMapU256(LP_BTC_OWED_RESERVED_POINTER);
        this._startingIndex = new StoredU64(STARTING_INDEX_POINTER, tokenIdUint8Array);
    }

    public get removalQueueLength(): u64 {
        return this._removalQueue.getLength();
    }

    public get removalQueueStartingIndex(): u64 {
        return this._removalQueue.startingIndex();
    }

    public get standardQueueLength(): u64 {
        return this._queue.getLength();
    }

    public get standardQueueStartingIndex(): u64 {
        return this._queue.startingIndex();
    }

    public get previousReservationStandardStartingIndex(): u64 {
        return this._startingIndex.get(0);
    }

    public set previousReservationStandardStartingIndex(value: u64) {
        this._startingIndex.set(0, value);
    }

    public get previousReservationStartingIndex(): u64 {
        return this._startingIndex.get(1);
    }

    public set previousReservationStartingIndex(value: u64) {
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

    public get priorityQueueLength(): u64 {
        return this._priorityQueue.getLength();
    }

    public get priorityQueueStartingIndex(): u64 {
        return this._priorityQueue.startingIndex();
    }

    public getCurrentIndex(): u64 {
        return this.currentIndex;
    }

    public getCurrentIndexPriority(): u64 {
        return this.currentIndexPriority;
    }

    public getCurrentIndexRemoval(): u64 {
        return this.currentIndexRemoval;
    }

    public addToPriorityQueue(providerId: u256): u64 {
        this._priorityQueue.push(providerId, true);

        return this._priorityQueue.getLength() - 1;
    }

    public addToRemovalQueue(providerId: u256): void {
        this._removalQueue.push(providerId, true);
    }

    public addToStandardQueue(providerId: u256): u64 {
        this._queue.push(providerId, true);

        return this._queue.getLength() - 1;
    }

    public getFromPriorityQueue(providerIndex: u64): u256 {
        return this._priorityQueue.get_physical(providerIndex);
    }

    public getFromRemovalQueue(providerIndex: u64): u256 {
        return this._removalQueue.get_physical(providerIndex);
    }

    public getFromStandardQueue(providerIndex: u64): u256 {
        return this._queue.get_physical(providerIndex);
    }

    public getStandardQueue(): StoredU256Array {
        return this._queue;
    }

    public getBTCowed(providerId: u256): u256 {
        return this._lpBTCowed.get(providerId);
    }

    public setBTCowed(providerId: u256, amount: u256): void {
        this._lpBTCowed.set(providerId, amount);
    }

    public getBTCowedReserved(providerId: u256): u256 {
        return this._lpBTCowedReserved.get(providerId);
    }

    public setBTCowedReserved(providerId: u256, amount: u256): void {
        this._lpBTCowedReserved.set(providerId, amount);
    }

    public cleanUpQueues(): void {
        this.cleanUpStandardQueue();
        this.cleanUpPriorityQueue();
        this.cleanUpRemovalQueue();
    }

    public getNextProviderWithLiquidity(currentQuote: u256): Provider | null {
        if (currentQuote.isZero()) {
            return this.getInitialProvider(currentQuote);
        }

        // 1. Removal queue first
        const removalProvider = this.getNextRemovalQueueProvider();
        if (removalProvider !== null) {
            return removalProvider;
        }

        // 2. Then priority queue
        const priorityProvider = this.getNextPriorityListProvider(currentQuote);
        if (priorityProvider !== null) {
            return priorityProvider;
        }

        // 3. Then normal queue
        const provider = this.getNextStandardQueueProvider(currentQuote);
        if (provider !== null) {
            return provider;
        }

        // 4. Fallback to initial liquidity provider
        return this.getInitialProvider(currentQuote);
    }

    public removePendingLiquidityProviderFromRemovalQueue(provider: Provider, i: u64): void {
        this._removalQueue.delete_physical(i);

        provider.pendingRemoval = false;
        provider.isLp = false;

        Blockchain.emit(new FulfilledProviderEvent(provider.providerId, false, true));
    }

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
        this.previousReservationStartingIndex = 0;
        this.previousReservationStandardStartingIndex = 0;
        this.previousRemovalStartingIndex = 0;
    }

    public restoreCurrentIndex(): void {
        this.currentIndex = this.previousReservationStandardStartingIndex;
        this.currentIndexPriority = this.previousReservationStartingIndex;
        this.currentIndexRemoval = this.previousRemovalStartingIndex;
    }

    public save(): void {
        this.previousReservationStandardStartingIndex =
            this.currentIndex === 0 ? this.currentIndex : this.currentIndex - 1;

        this.previousReservationStartingIndex =
            this.currentIndexPriority === 0
                ? this.currentIndexPriority
                : this.currentIndexPriority - 1;

        this.previousRemovalStartingIndex =
            this.currentIndexRemoval === 0
                ? this.currentIndexRemoval
                : this.currentIndexRemoval - 1;

        this._startingIndex.save();
        this._queue.save();
        this._priorityQueue.save();
        this._removalQueue.save();
    }

    private cleanUpRemovalQueue(): void {
        const removalLength: u64 = this._removalQueue.getLength();
        let removalIndex: u64 = this.previousRemovalStartingIndex;

        while (removalIndex < removalLength) {
            const providerId = this._removalQueue.get_physical(removalIndex);
            if (providerId === u256.Zero) {
                removalIndex++;
                continue;
            }

            const provider = getProvider(providerId);
            if (provider.pendingRemoval) {
                this._removalQueue.setStartingIndex(removalIndex);
                break;
            } else {
                this._removalQueue.delete_physical(removalIndex);
            }
            removalIndex++;
        }
        this.previousRemovalStartingIndex = removalIndex;
    }

    private cleanUpPriorityQueue(): void {
        const priorityLength: u64 = this._priorityQueue.getLength();
        let priorityIndex: u64 = this.previousReservationStartingIndex;

        while (priorityIndex < priorityLength) {
            const providerId = this._priorityQueue.get_physical(priorityIndex);
            if (providerId === u256.Zero) {
                priorityIndex++;
                continue;
            }

            const provider = getProvider(providerId);
            if (provider.isActive()) {
                this._priorityQueue.setStartingIndex(priorityIndex);
                break;
            } else {
                this._priorityQueue.delete_physical(priorityIndex);
            }
            priorityIndex++;
        }

        this.previousReservationStartingIndex = priorityIndex;
    }

    private cleanUpStandardQueue(): void {
        const length: u64 = this._queue.getLength();
        let index: u64 = this.previousReservationStandardStartingIndex;

        while (index < length) {
            const providerId = this._queue.get_physical(index);
            if (providerId === u256.Zero) {
                index++;
                continue;
            }

            const provider = getProvider(providerId);
            if (provider.isActive()) {
                this._queue.setStartingIndex(index);
                break;
            } else {
                this._queue.delete_physical(index);
            }
            index++;
        }

        this.previousReservationStandardStartingIndex = index;
    }

    private getNextRemovalQueueProvider(): Provider | null {
        const length: u64 = this._removalQueue.getLength();
        const index: u64 = this._removalQueue.startingIndex();

        if (index > length) {
            throw new Revert('Impossible state: Starting index exceeds queue length');
        }

        // Initialize our pointer if it’s zero
        if (this.currentIndexRemoval === 0) {
            this.currentIndexRemoval = index;
        }

        // Scan forward until we find a valid LP in 'pendingRemoval'
        while (this.currentIndexRemoval < length) {
            const i: u64 = this.currentIndexRemoval;
            const providerId = this._removalQueue.get_physical(i);

            if (providerId.isZero()) {
                // empty slot
                this.currentIndexRemoval++;
                continue;
            }

            const provider = getProvider(providerId);

            // Ensure it's truly in "pendingRemoval" state
            // and is actually an LP who is owed BTC.
            if (provider.pendingRemoval && provider.isLp) {
                const owedBTC = this.getBTCowed(providerId);
                const reservedBTC = this.getBTCowedReserved(providerId);

                if (u256.gt(reservedBTC, owedBTC)) {
                    throw new Revert(`Impossible state: reservedBTC cannot be > owedBTC`);
                }

                const left = SafeMath.sub(owedBTC, reservedBTC);

                if (!left.isZero() && u256.ge(left, this.strictMinimumProviderReservationAmount)) {
                    // This is the next valid removal provider. We do NOT
                    // check provider.liquidity here, because they've already
                    // withdrawn tokens. For the AMM, we treat them as if
                    // they can 'sell' an equivalent portion of tokens for BTC.
                    provider.indexedAt = i;
                    provider.fromRemovalQueue = true;
                    // Advance the pointer
                    this.currentIndexRemoval++;
                    return provider;
                } else {
                    if (u256.lt(owedBTC, this.strictMinimumProviderReservationAmount)) {
                        // If they don't have owed BTC, they can be removed from queue
                        throw new Revert(
                            `Impossible state: Provider should have been removed from queue during swap operation.`,
                        );
                    }
                }
            } else {
                // If not pending removal, remove from queue
                this.removePendingLiquidityProviderFromRemovalQueue(provider, i);
            }

            if (this.currentIndexRemoval == u64.MAX_VALUE) {
                throw new Revert('Impossible state: Index increment overflow');
            }

            this.currentIndexRemoval++;
        }

        return null;
    }

    private getNextPriorityListProvider(currentQuote: u256): Provider | null {
        let provider: Potential<Provider> = null;
        let providerId: u256;

        const length: u64 = this._priorityQueue.getLength();
        const index: u64 = this._priorityQueue.startingIndex();

        if (index > length) {
            throw new Revert('Impossible state: Starting index exceeds queue length');
        }

        if (this.currentIndexPriority === 0) {
            this.currentIndexPriority = index;
        }

        while (this.currentIndexPriority < length) {
            const i: u64 = this.currentIndexPriority;
            providerId = this._priorityQueue.get_physical(i);
            if (providerId === u256.Zero) {
                this.currentIndexPriority++;
                continue;
            }

            provider = getProvider(providerId);
            if (!provider.isActive()) {
                this.currentIndexPriority++;
                continue;
            }

            if (!provider.isPriority()) {
                throw new Revert('Impossible state: provider is not priority in priority queue.');
            }

            if (u128.lt(provider.liquidity, provider.reserved)) {
                throw new Revert(
                    `Impossible state: liquidity < reserved for provider ${providerId}.`,
                );
            }

            const providerToReturn = this.returnProvider(provider, i, currentQuote);
            if (providerToReturn) {
                this.currentIndexPriority++;

                return providerToReturn;
            }

            if (this.currentIndexPriority == u64.MAX_VALUE) {
                throw new Revert('Index increment overflow');
            }

            this.currentIndexPriority++;
        }

        return null;
    }

    private getNextStandardQueueProvider(currentQuote: u256): Provider | null {
        let provider: Potential<Provider> = null;
        let providerId: u256;

        const length: u64 = this._queue.getLength();
        const index: u64 = this._queue.startingIndex();

        if (index > length) {
            throw new Revert('Impossible state: Starting index exceeds queue length');
        }

        if (this.currentIndex === 0) {
            this.currentIndex = index;
        }

        while (this.currentIndex < length) {
            const i: u64 = this.currentIndex;
            providerId = this._queue.get_physical(i);

            if (providerId === u256.Zero) {
                this.currentIndex++;
                continue;
            }

            provider = getProvider(providerId);

            if (!provider.isActive()) {
                this.currentIndex++;
                continue;
            }

            if (provider.isPriority()) {
                throw new Revert(
                    'Impossible state: provider cannot be priority in standard queue.',
                );
            }

            if (u128.lt(provider.liquidity, provider.reserved)) {
                throw new Revert(
                    `Impossible state: liquidity < reserved for provider ${providerId}.`,
                );
            }

            const providerToReturn = this.returnProvider(provider, i, currentQuote);

            if (providerToReturn) {
                this.currentIndex++;

                return providerToReturn;
            }

            if (this.currentIndex == u64.MAX_VALUE) {
                throw new Revert('Index increment overflow');
            }

            this.currentIndex++;
        }

        return null;
    }

    // TODO: we could verify to check if we want to skip an index but this adds complexity, but it could save gas.
    private returnProvider(provider: Provider, i: u64, currentQuote: u256): Provider | null {
        const availableLiquidity: u128 = SafeMath.sub128(provider.liquidity, provider.reserved);
        if (availableLiquidity.isZero()) {
            return null;
        }

        if (ENABLE_INDEX_VERIFICATION) {
            // ASSERT ONLY
            provider.loadIndexedAt();

            if (provider.indexedAt !== i) {
                throw new Revert(
                    `Impossible state: provider.indexedAt (${provider.indexedAt}) does not match index (${i}).`,
                );
            }

            assert(
                provider.providerId !== this._initialLiquidityProvider.value,
                'Impossible state: Initial liquidity provider cannot be returned here.',
            );
        }

        provider.indexedAt = i;
        provider.fromRemovalQueue = false;

        const hasEnoughLiquidity: bool = this.verifyProviderRemainingLiquidity(
            provider,
            availableLiquidity.toU256(),
            currentQuote,
        );

        return hasEnoughLiquidity ? provider : null;
    }

    private verifyProviderRemainingLiquidity(
        provider: Provider,
        availableLiquidity: u256,
        currentQuote: u256,
    ): bool {
        const maxCostInSatoshis = tokensToSatoshis(availableLiquidity, currentQuote);
        if (u256.lt(maxCostInSatoshis, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
            if (!provider.haveReserved()) {
                this.resetProvider(provider);
            }

            return false;
        }

        return true;
    }

    private getInitialProvider(currentQuote: u256): Provider | null {
        if (this._initialLiquidityProvider.value.isZero()) {
            return null;
        }

        const initProvider = getProvider(this._initialLiquidityProvider.value);
        if (!initProvider.isActive()) {
            return null;
        }

        if (initProvider.reserved > initProvider.liquidity) {
            throw new Revert(`Impossible state: reserved cannot be > liquidity.`);
        }

        const availableLiquidity: u128 = SafeMath.sub128(
            initProvider.liquidity,
            initProvider.reserved,
        );

        if (availableLiquidity.isZero()) {
            return null;
        }

        if (!currentQuote.isZero()) {
            const hasEnoughLiquidity = this.verifyProviderRemainingLiquidity(
                initProvider,
                availableLiquidity.toU256(),
                currentQuote,
            );

            if (!hasEnoughLiquidity) {
                return null;
            }
        }

        initProvider.indexedAt = u32.MAX_VALUE;
        return initProvider;
    }
}
