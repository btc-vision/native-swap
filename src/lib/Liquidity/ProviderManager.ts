import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Potential,
    Revert,
    SafeMath,
    StoredU256,
    StoredU256Array,
    StoredU32Array,
    StoredU64,
    TransferHelper,
    U32_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import {
    INITIAL_LIQUIDITY,
    LIQUIDITY_PRIORITY_QUEUE_POINTER,
    LIQUIDITY_QUEUE_POINTER,
    LP_BTC_OWED_POINTER,
    LP_BTC_OWED_RESERVED_POINTER,
    QUEUE_PURGED_RESERVATION_PRIORITY,
    QUEUE_PURGED_RESERVATION_REMOVAL,
    QUEUE_PURGED_RESERVATION_STANDARD,
    REMOVAL_QUEUE_POINTER,
    STARTING_INDEX_POINTER,
} from '../StoredPointers';
import { getProvider, Provider } from '../Provider';
import { StoredMapU256 } from '../../stored/StoredMapU256';
import { tokensToSatoshis } from '../../utils/NativeSwapUtils';
import { LiquidityQueue } from './LiquidityQueue';
import { FulfilledProviderEvent } from '../../events/FulfilledProviderEvent';
import { LIQUIDITY_REMOVAL_TYPE, NORMAL_TYPE, PRIORITY_TYPE } from '../Reservation';
import {
    ALLOW_DIRTY,
    ENABLE_INDEX_VERIFICATION,
    IMPOSSIBLE_PURGE_INDEX,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    NOT_DEFINED_PROVIDER_INDEX,
} from '../../data-types/Constants';

export class ProviderManager {
    protected readonly _queue: StoredU256Array;
    protected readonly _priorityQueue: StoredU256Array;
    protected readonly _removalQueue: StoredU256Array;

    private readonly _startingIndex: StoredU64;
    private readonly _initialLiquidityProvider: StoredU256;
    private readonly _lpBTCowed: StoredMapU256;
    private readonly _lpBTCowedReserved: StoredMapU256;

    private readonly _purgedProviderQueueStandard: StoredU32Array;
    private readonly _purgedProviderQueuePriority: StoredU32Array;
    private readonly _purgedProviderQueueRemoval: StoredU32Array;

    private currentIndex: u64 = 0;
    private currentIndexPriority: u64 = 0;
    private currentIndexRemoval: u64 = 0;

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
        public readonly strictMinimumProviderReservationAmount: u256,
    ) {
        // A provider can not have the same id as the initial liquidity provider.
        const maxQueueDepth: u64 = INITIAL_LIQUIDITY_PROVIDER_INDEX - 1;
        const maxPurgeQueueDepth: u64 = <u64>IMPOSSIBLE_PURGE_INDEX - 1;

        this._queue = new StoredU256Array(
            LIQUIDITY_QUEUE_POINTER,
            tokenIdUint8Array,
            maxQueueDepth,
        );

        this._priorityQueue = new StoredU256Array(
            LIQUIDITY_PRIORITY_QUEUE_POINTER,
            tokenIdUint8Array,
            maxQueueDepth,
        );

        this._removalQueue = new StoredU256Array(
            REMOVAL_QUEUE_POINTER,
            tokenIdUint8Array,
            maxQueueDepth,
        );

        this._purgedProviderQueueStandard = new StoredU32Array(
            QUEUE_PURGED_RESERVATION_STANDARD,
            tokenIdUint8Array,
            maxPurgeQueueDepth,
        );

        this._purgedProviderQueuePriority = new StoredU32Array(
            QUEUE_PURGED_RESERVATION_PRIORITY,
            tokenIdUint8Array,
            maxPurgeQueueDepth,
        );

        this._purgedProviderQueueRemoval = new StoredU32Array(
            QUEUE_PURGED_RESERVATION_REMOVAL,
            tokenIdUint8Array,
            maxPurgeQueueDepth,
        );

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

    public queueData(): Uint8Array {
        const writer = new BytesWriter(U32_BYTE_LENGTH * 6 + 3 * U32_BYTE_LENGTH);

        writer.writeU32(<u32>this._removalQueue.getLength());
        writer.writeU32(<u32>this._removalQueue.startingIndex());

        writer.writeU32(<u32>this._priorityQueue.getLength());
        writer.writeU32(<u32>this._priorityQueue.startingIndex());

        writer.writeU32(<u32>this._queue.getLength());
        writer.writeU32(<u32>this._queue.startingIndex());

        writer.writeU32(<u32>this._purgedProviderQueuePriority.getLength());
        writer.writeU32(<u32>this._purgedProviderQueueStandard.getLength());
        writer.writeU32(<u32>this._purgedProviderQueueRemoval.getLength());

        return writer.getBuffer();
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

    public pushToPurgeRemovalQueue(_provider: Provider): void {
        // DO NOT PUSH THE INITIAL LIQUIDITY PROVIDER TO THE PURGE QUEUE
        /*if (provider.indexedAt === INITIAL_LIQUIDITY_PROVIDER_INDEX) {
            return;
        }

        if (!provider.pendingRemoval) {
            throw new Revert('OP_NET: Impossible state. Provider is not pending removal.');
        }

        this.onProviderPurge(provider);

        // TODO: Verify if indexedAt is valid for removal queue?
        const index = this._purgedProviderQueueRemoval.push(<u32>provider.indexedAt, false);
        Blockchain.log(
            `Pushing to removal purge queue: ${index} - ${provider.indexedAt} - ${provider.providerId}`,
        );*/
    }

    public pushToPurgeStandardQueue(provider: Provider): void {
        // DO NOT PUSH THE INITIAL LIQUIDITY PROVIDER TO THE PURGE QUEUE
        if (provider.indexedAt === INITIAL_LIQUIDITY_PROVIDER_INDEX) {
            return;
        }

        this.onProviderPurge(provider);

        provider.purgedAt = <u32>(
            this._purgedProviderQueueStandard.push(<u32>provider.indexedAt, false)
        );

        /*Blockchain.log(
            `Pushing to purge standard queue: ${provider.purgedAt} - ${provider.indexedAt}`,
        );*/
    }

    public pushToPurgePriorityQueue(provider: Provider): void {
        // DO NOT PUSH THE INITIAL LIQUIDITY PROVIDER TO THE PURGE QUEUE
        if (provider.indexedAt === INITIAL_LIQUIDITY_PROVIDER_INDEX) {
            return;
        }

        this.onProviderPurge(provider);

        provider.purgedAt = <u32>(
            this._purgedProviderQueuePriority.push(<u32>provider.indexedAt, false)
        );

        /*Blockchain.log(
            `Pushing to purge priority queue: ${provider.purgedAt} - ${provider.indexedAt}`,
        );*/
    }

    public getFromPurgedProvider(currentQuote: u256): Provider | null {
        const lengthRemovalQueue = this._purgedProviderQueueRemoval.getLength();
        const lengthStandardQueue = this._purgedProviderQueueStandard.getLength();
        const lengthPriorityQueue = this._purgedProviderQueuePriority.getLength();

        if (lengthRemovalQueue > 0) {
            return this.getProviderFromPurgedQueue(
                this._purgedProviderQueueRemoval,
                this._removalQueue,
                currentQuote,
                LIQUIDITY_REMOVAL_TYPE,
            );
        }

        if (lengthPriorityQueue > 0) {
            return this.getProviderFromPurgedQueue(
                this._purgedProviderQueuePriority,
                this._priorityQueue,
                currentQuote,
                PRIORITY_TYPE,
            );
        }

        if (lengthStandardQueue > 0) {
            return this.getProviderFromPurgedQueue(
                this._purgedProviderQueueStandard,
                this._queue,
                currentQuote,
                NORMAL_TYPE,
            );
        }

        return null;
    }

    public getNextProviderWithLiquidity(currentQuote: u256): Provider | null {
        if (currentQuote.isZero()) {
            return this.getInitialProvider(currentQuote);
        }

        // Look in the purged provide queue first
        const purgedProvider = this.getFromPurgedProvider(currentQuote);
        if (purgedProvider !== null) {
            return purgedProvider;
        }

        // 1. Removal queue first
        const removalProvider = this.getNextRemovalQueueProvider();
        if (removalProvider !== null) {
            this.ensureNotInPurgeQueue(removalProvider);

            this.previousRemovalStartingIndex =
                this.currentIndexRemoval === 0
                    ? this.currentIndexRemoval
                    : this.currentIndexRemoval - 1;

            return removalProvider;
        }

        // 2. Then priority queue
        const priorityProvider = this.getNextPriorityListProvider(currentQuote);
        if (priorityProvider !== null) {
            this.previousReservationStartingIndex =
                this.currentIndexPriority === 0
                    ? this.currentIndexPriority
                    : this.currentIndexPriority - 1;

            return priorityProvider;
        }

        // 3. Then normal queue
        const provider = this.getNextStandardQueueProvider(currentQuote);
        if (provider !== null) {
            this.previousReservationStandardStartingIndex =
                this.currentIndex === 0 ? this.currentIndex : this.currentIndex - 1;

            return provider;
        }

        // 4. Fallback to initial liquidity provider
        return this.getInitialProvider(currentQuote);
    }

    public removePendingLiquidityProviderFromRemovalQueue(provider: Provider, i: u64): void {
        this.purgeSafetyCheck(provider);
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
        this.purgeSafetyCheck(provider);

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
        /*const startIndexStandard: u64 = this.binarySearchFirstLive(this._queue, 0);
        const startIndexPriority: u64 = this.binarySearchFirstLive(this._priorityQueue, 0);
        const startIndexRemoval: u64 = this.binarySearchFirstLive(this._removalQueue, 0);*/

        const startIndexStandard: u64 = this._queue.startingIndex();
        const startIndexPriority: u64 = this._priorityQueue.startingIndex();
        const startIndexRemoval: u64 = this._removalQueue.startingIndex();

        // Always 1 index behind to be 100% sure we didn't miss a provider

        this.previousReservationStartingIndex =
            startIndexPriority === 0 ? 0 : startIndexPriority - 1;

        this.previousReservationStandardStartingIndex =
            startIndexStandard === 0 ? 0 : startIndexStandard - 1;

        this.previousRemovalStartingIndex = startIndexRemoval === 0 ? 0 : startIndexRemoval - 1;
    }

    public restoreCurrentIndex(): void {
        this.currentIndex = this.previousReservationStandardStartingIndex;
        this.currentIndexPriority = this.previousReservationStartingIndex;
        this.currentIndexRemoval = this.previousRemovalStartingIndex;
    }

    public save(): void {
        this._startingIndex.save();
        this._queue.save();
        this._priorityQueue.save();
        this._removalQueue.save();

        this._purgedProviderQueuePriority.save();
        this._purgedProviderQueueStandard.save();
        this._purgedProviderQueueRemoval.save();
    }

    public hasEnoughLiquidityLeftProvider(provider: Provider, currentQuote: u256): bool {
        const availableLiquidity: u128 = SafeMath.sub128(provider.liquidity, provider.reserved);
        if (availableLiquidity.isZero()) {
            return false;
        }

        return this.verifyProviderRemainingLiquidity(
            provider,
            availableLiquidity.toU256(),
            currentQuote,
        );
    }

    public removeFromPurgeQueue(provider: Provider): void {
        if (provider.purgedAt === IMPOSSIBLE_PURGE_INDEX) {
            throw new Revert(
                'Impossible state: provider.purgedAt cannot be IMPOSSIBLE_PURGE_INDEX',
            );
        }

        const queue: StoredU32Array = this.getPurgeQueueByType(provider.queueType);

        // TODO: Technically, we don't need to remove the provider from the queue because we should theoretically process
        // TODO: "dirty" states correctly due to wrap around.
        if (!ALLOW_DIRTY) {
            queue.delete_physical(provider.purgedAt); // provider.purgedAt already include the start index of the array.
        }

        queue.removeItemFromLength();
        queue.applyNextOffsetToStartingIndex();

        /*Blockchain.log(
            `Removed from purge queue: ${provider.indexedAt} - ${provider.purgedAt} - ${queue.getLength()}`,
        );*/

        provider.setPurged(false);
        provider.purgedAt = IMPOSSIBLE_PURGE_INDEX;
    }

    public verifyProviderRemainingLiquidity(
        provider: Provider,
        availableLiquidity: u256,
        currentQuote: u256,
        purge: boolean = true,
    ): bool {
        const maxCostInSatoshis = tokensToSatoshis(availableLiquidity, currentQuote);
        if (u256.lt(maxCostInSatoshis, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
            if (!provider.haveReserved()) {
                this.resetProvider(provider, purge);
            }

            return false;
        }

        return true;
    }

    @inline
    private purgeSafetyCheck(provider: Provider): void {
        if (provider.hasBeenPurged()) {
            throw new Error(
                `Impossible state: Provider is still in the reservation purge queue and is getting deleted.`,
            );
        }
    }

    private getPurgeQueueByType(type: u8): StoredU32Array {
        if (type === LIQUIDITY_REMOVAL_TYPE) {
            return this._purgedProviderQueueRemoval;
        } else if (type === PRIORITY_TYPE) {
            return this._purgedProviderQueuePriority;
        } else if (type === NORMAL_TYPE) {
            return this._purgedProviderQueueStandard;
        }

        throw new Revert('Impossible state: queue type is not valid');
    }

    private getProviderFromPurgedQueue(
        queue: StoredU32Array,
        realQueue: StoredU256Array,
        currentQuote: u256,
        queueId: u8,
    ): Provider | null {
        /*Blockchain.log(
            `Getting provider from purged queue: ${queue.getLength()} - ${queue.startingIndex()} - ${queue.previousOffset}`,
        );*/

        const providerIndex = queue.next();
        if (providerIndex === IMPOSSIBLE_PURGE_INDEX) {
            throw new Revert(
                'Impossible state: Purge providerIndex cannot be IMPOSSIBLE_PURGE_INDEX',
            );
        }

        const id = realQueue.get_physical(providerIndex);
        if (id.isZero()) {
            throw new Revert(
                `Impossible state: providerId cannot be zero (purged queue #${providerIndex} - ${queue.previousOffset})`,
            );
        }

        const provider = getProvider(id);
        if (!provider.hasBeenPurged()) {
            throw new Revert(
                `Impossible state: provider has not been purged (attempted to load provider at index ${providerIndex} - ${id})`,
            );
        }

        //const availableLiquidity = SafeMath.sub128(provider.liquidity, provider.reserved);
        /*Blockchain.log(
            `Loading purged provider at index ${providerIndex} - ${queue.getLength()} - ${queue.startingIndex()} - ${availableLiquidity} - ${queue.previousOffset})`,
        );*/

        // previous element
        provider.purgedAt = <u32>queue.previousOffset; // we need to include the index of the array so we can purge the right element later.
        provider.queueType = queueId;

        return this.returnProvider(provider, providerIndex, currentQuote);
    }

    private onProviderPurge(provider: Provider): void {
        if (provider.hasBeenPurged()) {
            throw new Revert('Impossible state: provider has already been purged');
        }

        provider.setPurged(true);

        if (provider.indexedAt === NOT_DEFINED_PROVIDER_INDEX) {
            throw new Revert('Impossible state: provider.indexedAt is not defined.');
        }
    }

    private cleanUpRemovalQueue(): void {
        const removalLength: u64 = this._removalQueue.getLength();
        let removalIndex: u64 = this.previousRemovalStartingIndex;

        while (removalIndex < removalLength) {
            const providerId = this._removalQueue.get_physical(removalIndex);
            if (providerId === u256.Zero) {
                this._removalQueue.setStartingIndex(removalIndex);
                removalIndex++;
                continue;
            }

            const provider = getProvider(providerId);
            if (provider.pendingRemoval) {
                this._removalQueue.setStartingIndex(removalIndex);
                break;
            } else {
                this.purgeSafetyCheck(provider);
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
                this._priorityQueue.setStartingIndex(priorityIndex);
                priorityIndex++;
                continue;
            }

            const provider = getProvider(providerId);
            if (provider.isActive()) {
                this._priorityQueue.setStartingIndex(priorityIndex);
                break;
            } else {
                this.purgeSafetyCheck(provider);
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
                this._queue.setStartingIndex(index);
                index++;
                continue;
            }

            const provider = getProvider(providerId);
            if (provider.isActive()) {
                this._queue.setStartingIndex(index);
                break;
            } else {
                this.purgeSafetyCheck(provider);
                this._queue.delete_physical(index);
            }
            index++;
        }

        //Blockchain.log(`Standard queue clean up completed. New starting index: ${index}`);

        this.previousReservationStandardStartingIndex = index === 0 ? index : index - 1;
    }

    private ensureNotInPurgeQueue(provider: Provider): void {
        if (provider.hasBeenPurged()) {
            throw new Revert(
                `Impossible state: provider ${provider.providerId} (indexed at ${provider.indexedAt}, purgedAt: ${provider.purgedAt}) is in purge queue but purge queue is empty.`,
            );
        }
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
                this.ensureNotInPurgeQueue(providerToReturn); // TODO: Check if we really need this check?
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

    /*private binarySearchFirstLive(queue: StoredU256Array, start: u64 = queue.startingIndex()): u64 {
        let lo: u64 = start;
        let hi: u64 = queue.getLength();

        while (lo < hi) {
            const mid: u64 = lo + ((hi - lo) >> 1);

            const pid: u256 = queue.get_physical(mid);
            const live: bool = !pid.isZero() && getProvider(pid).isActive();

            if (live) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }

        return lo;
    }*/

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
                this.ensureNotInPurgeQueue(providerToReturn); // TODO: Check if we really need this check?
                this.currentIndex++;

                return providerToReturn;
            }

            if (this.currentIndex == <u64>u32.MAX_VALUE) {
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

    private getInitialProvider(currentQuote: u256): Provider | null {
        if (this._initialLiquidityProvider.value.isZero()) {
            return null;
        }

        const initProvider = getProvider(this._initialLiquidityProvider.value);
        if (!initProvider.isActive()) {
            return null;
        }

        if (initProvider.hasBeenPurged()) {
            throw new Revert(
                `Impossible state: Initial liquidity provider is present in purge queue.`,
            );
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

        initProvider.indexedAt = INITIAL_LIQUIDITY_PROVIDER_INDEX;
        return initProvider;
    }
}
