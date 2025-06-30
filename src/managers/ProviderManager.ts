import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address, Blockchain,
    BytesWriter,
    Revert,
    SafeMath,
    StoredU256,
    StoredU32, U256_BYTE_LENGTH,
    U32_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import {
    INITIAL_LIQUIDITY_PROVIDER_POINTER,
    NORMAL_QUEUE_POINTER,
    NORMAL_QUEUE_PURGED_RESERVATION,
    PRIORITY_QUEUE_POINTER,
    PRIORITY_QUEUE_PURGED_RESERVATION,
    REMOVAL_QUEUE_POINTER,
    REMOVAL_QUEUE_PURGED_RESERVATION,
    STARTING_INDEX_POINTER,
} from '../constants/StoredPointers';
import { getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { PriorityProviderQueue } from './PriorityProviderQueue';
import { RemovalProviderQueue } from './RemovalProviderQueue';
import { IOwedBTCManager } from './interfaces/IOwedBTCManager';
import {
    ALLOW_DIRTY,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    MAXIMUM_NUMBER_OF_PROVIDERS,
} from '../constants/Contract';
import { ProviderTypes } from '../types/ProviderTypes';
import { IProviderManager } from './interfaces/IProviderManager';
import { PurgedProviderQueue } from './PurgedProviderQueue';
import { PriorityPurgedProviderQueue } from './PriorityPurgedProviderQueue';
import { RemovalPurgedProviderQueue } from './RemovalPurgedProviderQueue';
import { tokensToSatoshis128 } from '../utils/SatoshisConversion';
import { min64 } from '../utils/MathUtils';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { IQuoteManager } from './interfaces/IQuoteManager';

export class ProviderManager implements IProviderManager {
    protected readonly token: Address;
    protected readonly tokenIdUint8Array: Uint8Array;
    protected readonly normalQueue: ProviderQueue;
    protected readonly priorityQueue: PriorityProviderQueue;
    protected readonly removalQueue: RemovalProviderQueue;
    protected readonly normalPurgedQueue: PurgedProviderQueue;
    protected readonly priorityPurgedQueue: PriorityPurgedProviderQueue;
    protected readonly removalPurgedQueue: RemovalPurgedProviderQueue;
    protected readonly owedBTCManager: IOwedBTCManager;
    protected readonly quoteManager: IQuoteManager;
    private readonly _startingIndex: StoredU32;
    private readonly _initialLiquidityProviderId: StoredU256;

    constructor(
        token: Address,
        tokenIdUint8Array: Uint8Array,
        owedBTCManager: IOwedBTCManager,
        quoteManager: IQuoteManager,
        enableIndexVerification: boolean,
    ) {
        this.token = token;
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.owedBTCManager = owedBTCManager;
        this.quoteManager = quoteManager;
        this.normalQueue = new ProviderQueue(
            token,
            NORMAL_QUEUE_POINTER,
            tokenIdUint8Array,
            enableIndexVerification,
            MAXIMUM_NUMBER_OF_PROVIDERS,
        );
        this.priorityQueue = new PriorityProviderQueue(
            token,
            PRIORITY_QUEUE_POINTER,
            tokenIdUint8Array,
            enableIndexVerification,
            MAXIMUM_NUMBER_OF_PROVIDERS,
        );
        this.removalQueue = new RemovalProviderQueue(
            owedBTCManager,
            token,
            REMOVAL_QUEUE_POINTER,
            tokenIdUint8Array,
            enableIndexVerification,
            MAXIMUM_NUMBER_OF_PROVIDERS,
        );
        this.normalPurgedQueue = new PurgedProviderQueue(
            token,
            NORMAL_QUEUE_PURGED_RESERVATION,
            tokenIdUint8Array,
            enableIndexVerification,
            ALLOW_DIRTY,
        );
        this.priorityPurgedQueue = new PriorityPurgedProviderQueue(
            token,
            PRIORITY_QUEUE_PURGED_RESERVATION,
            tokenIdUint8Array,
            enableIndexVerification,
            ALLOW_DIRTY,
        );
        this.removalPurgedQueue = new RemovalPurgedProviderQueue(
            token,
            REMOVAL_QUEUE_PURGED_RESERVATION,
            tokenIdUint8Array,
            enableIndexVerification,
            ALLOW_DIRTY,
        );
        this._initialLiquidityProviderId = new StoredU256(
            INITIAL_LIQUIDITY_PROVIDER_POINTER,
            tokenIdUint8Array,
        );
        this._startingIndex = new StoredU32(STARTING_INDEX_POINTER, tokenIdUint8Array);
    }

    public get currentIndexNormal(): u32 {
        return this.normalQueue.currentIndex;
    }

    public get currentIndexPriority(): u32 {
        return this.priorityQueue.currentIndex;
    }

    public get currentIndexRemoval(): u32 {
        return this.removalQueue.currentIndex;
    }

    public get initialLiquidityProviderId(): u256 {
        return this._initialLiquidityProviderId.value;
    }

    public set initialLiquidityProviderId(value: u256) {
        this._initialLiquidityProviderId.value = value;
    }

    public get normalQueueLength(): u32 {
        return this.normalQueue.length;
    }

    public get normalQueueStartingIndex(): u32 {
        return this.normalQueue.startingIndex;
    }

    public get previousNormalStartingIndex(): u32 {
        return this._startingIndex.get(0);
    }

    public set previousNormalStartingIndex(value: u32) {
        this._startingIndex.set(0, value);
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

    public addToNormalQueue(provider: Provider): u32 {
        return this.normalQueue.add(provider);
    }

    public addToPriorityQueue(provider: Provider): u32 {
        return this.priorityQueue.add(provider);
    }

    public addToRemovalQueue(provider: Provider): u32 {
        return this.removalQueue.add(provider);
    }

    public addToNormalPurgedQueue(provider: Provider): u32 {
        return this.normalPurgedQueue.add(provider);
    }

    public addToPriorityPurgedQueue(provider: Provider): u32 {
        return this.priorityPurgedQueue.add(provider);
    }

    public addToRemovalPurgedQueue(provider: Provider): u32 {
        return this.removalPurgedQueue.add(provider);
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

    public getFromNormalQueue(index: u32): u256 {
        return this.normalQueue.getAt(index);
    }

    public getFromPriorityQueue(index: u32): u256 {
        return this.priorityQueue.getAt(index);
    }

    public getFromRemovalQueue(index: u32): u256 {
        return this.removalQueue.getAt(index);
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

    public getNextFromPurgedProvider(currentQuote: u256): Provider | null {
        let result: Provider | null = null;

        if (this.removalPurgedQueue.length > 0) {
            result = this.removalPurgedQueue.get(this.removalQueue, currentQuote);
        }

        if (result === null && this.priorityPurgedQueue.length > 0) {
            result = this.priorityPurgedQueue.get(this.priorityQueue, currentQuote);
        }

        if (result === null && this.normalPurgedQueue.length > 0) {
            result = this.normalPurgedQueue.get(this.normalQueue, currentQuote);
        }

        return result;
    }

    public getNextProviderWithLiquidity(currentQuote: u256): Provider | null {
        if (currentQuote.isZero()) {
            return this.getInitialProvider(currentQuote);
        }

        const purgedProvider: Provider | null = this.getNextFromPurgedProvider(currentQuote);
        if (purgedProvider !== null) {
            return purgedProvider;
        }

        const removalProvider: Provider | null =
            this.removalQueue.getNextWithLiquidity(currentQuote);

        if (removalProvider !== null) {
            this.previousRemovalStartingIndex =
                this.currentIndexRemoval === 0
                    ? this.currentIndexRemoval
                    : this.currentIndexRemoval - 1;

            return removalProvider;
        }

        const priorityProvider: Provider | null =
            this.priorityQueue.getNextWithLiquidity(currentQuote);

        if (priorityProvider !== null) {
            this.previousPriorityStartingIndex =
                this.currentIndexPriority === 0
                    ? this.currentIndexPriority
                    : this.currentIndexPriority - 1;

            return priorityProvider;
        }

        const provider: Provider | null = this.normalQueue.getNextWithLiquidity(currentQuote);

        if (provider !== null) {
            this.previousNormalStartingIndex =
                this.currentIndexNormal === 0
                    ? this.currentIndexNormal
                    : this.currentIndexNormal - 1;

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

    public getQueueData(): Uint8Array {
        const writer = new BytesWriter(
            U32_BYTE_LENGTH * 9 /*+
            (this.priorityPurgedQueue.length + this.normalPurgedQueue.length) *
               U32_BYTE_LENGTH +
            (this.priorityQueue.length + this.normalQueue.length) * U256_BYTE_LENGTH,*/
        );

        writer.writeU32(this.removalQueue.length);
        writer.writeU32(this.removalQueue.startingIndex);

        writer.writeU32(this.priorityQueue.length);
        writer.writeU32(this.priorityQueue.startingIndex);

        writer.writeU32(this.normalQueue.length);
        writer.writeU32(this.normalQueue.startingIndex);

        writer.writeU32(this.priorityPurgedQueue.length);
        writer.writeU32(this.normalPurgedQueue.length);
        writer.writeU32(this.removalPurgedQueue.length);
/*
        for (let i: u32 = 0; i < this.priorityPurgedQueue.length; i++) {
            writer.writeU32(this.priorityPurgedQueue.getAt(i));
        }

        for (let i: u32 = 0; i < this.normalPurgedQueue.length; i++) {
            writer.writeU32(this.normalPurgedQueue.getAt(i));
        }

        for (let i: u32 = 0; i < this.priorityQueue.length; i++) {
            writer.writeU256(this.priorityQueue.getAt(i));
        }

        for (let i: u32 = 0; i < this.normalQueue.length; i++) {
            writer.writeU256(this.normalQueue.getAt(i));
        }
*/
        return writer.getBuffer();
    }

    public hasEnoughLiquidityLeftProvider(provider: Provider, quote: u256): boolean {
        let result: boolean = false;
        const availableLiquidity: u128 = provider.getAvailableLiquidityAmount();

        if (!availableLiquidity.isZero()) {
            result = this.verifyProviderRemainingLiquidityAndReset(
                provider,
                availableLiquidity,
                quote,
            );
        }

        return result;
    }

    public purgeAndRestoreProvider(data: ReservationProviderData): void {
        const provider: Provider = this.getProviderFromQueue(data.providerIndex, data.providerType);

        this.ensureRemovalTypeIsValid(data.providerType, provider);

        if (provider.isPendingRemoval()) {
            this.purgeAndRestoreProviderRemovalQueue(provider, data);
        } else {
            this.ensureReservedAmountValid(provider, data.providedAmount);
            this.purgeAndRestoreNormalPriorityProvider(provider, data);
        }
    }

    public removeFromNormalQueue(provider: Provider): void {
        this.normalQueue.remove(provider);
    }

    public removeFromPriorityQueue(provider: Provider): void {
        this.priorityQueue.remove(provider);
    }

    public removeFromPurgeQueue(provider: Provider): void {
        if (!provider.isPriority()) {
            this.normalPurgedQueue.remove(provider);
        } else {
            this.priorityPurgedQueue.remove(provider);
        }
    }

    public removeFromRemovalPurgeQueue(provider: Provider): void {
        if (provider.isPendingRemoval()) {
            this.removalPurgedQueue.remove(provider);
        }
    }

    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        if (provider.isPendingRemoval()) {
            this.removalQueue.resetProvider(provider);
        } else if (provider.isPriority()) {
            this.priorityQueue.resetProvider(provider, burnRemainingFunds, canceled);
        } else {
            this.normalQueue.resetProvider(provider, burnRemainingFunds, canceled);
        }
    }

    public resetStartingIndex(): void {
        const startIndexNormal: u32 = this.normalQueue.startingIndex;
        const startIndexPriority: u32 = this.priorityQueue.startingIndex;
        const startIndexRemoval: u32 = this.removalQueue.startingIndex;

        // Always 1 index behind to be 100% sure we didn't miss a provider
        this.previousPriorityStartingIndex = startIndexPriority === 0 ? 0 : startIndexPriority - 1;
        this.previousNormalStartingIndex = startIndexNormal === 0 ? 0 : startIndexNormal - 1;
        this.previousRemovalStartingIndex = startIndexRemoval === 0 ? 0 : startIndexRemoval - 1;
    }

    public restoreCurrentIndex(): void {
        this.normalQueue.restoreCurrentIndex(this.previousNormalStartingIndex);
        this.priorityQueue.restoreCurrentIndex(this.previousPriorityStartingIndex);
        this.removalQueue.restoreCurrentIndex(this.previousRemovalStartingIndex);
    }

    public save(): void {
        this._startingIndex.save();
        this.normalQueue.save();
        this.priorityQueue.save();
        this.removalQueue.save();
        this.normalPurgedQueue.save();
        this.priorityPurgedQueue.save();
        this.removalPurgedQueue.save();
    }

    private ensureInitialProviderIsNotPurged(provider: Provider): void {
        if (provider.isPurged()) {
            throw new Revert(
                `Impossible state: Initial liquidity provider is present in purge queue.`,
            );
        }
    }

    private ensureProviderExists(providerId: u256, index: u32, type: ProviderTypes): void {
        if (providerId.isZero()) {
            throw new Revert(
                `Impossible state: Cannot load provider. Index: ${index} Type: ${type}. Pool corrupted.`,
            );
        }
    }

    private ensureRemovalTypeIsValid(queueType: ProviderTypes, provider: Provider): void {
        if (queueType === ProviderTypes.LiquidityRemoval && !provider.isPendingRemoval()) {
            throw new Revert(
                'Impossible state: provider is in removal queue but is not flagged pendingRemoval.',
            );
        }

        if (queueType !== ProviderTypes.LiquidityRemoval && provider.isPendingRemoval()) {
            throw new Revert(
                'Impossible state: provider is flagged pendingRemoval but is not in removal queue',
            );
        }
    }

    private ensureReservedAmountValid(provider: Provider, reservedAmount: u128): void {
        if (u128.lt(provider.getReservedAmount(), reservedAmount)) {
            throw new Revert('Impossible state: reserved amount bigger than provider reserved.');
        }
    }

    private getInitialProvider(currentQuote: u256): Provider | null {
        if (this._initialLiquidityProviderId.value.isZero()) {
            return null;
        }

        const initialProvider = getProvider(this._initialLiquidityProviderId.value);
        if (!initialProvider.isActive()) {
            return null;
        }

        this.ensureInitialProviderIsNotPurged(initialProvider);

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

        return initialProvider;
    }

    private purgeAndRestoreProviderRemovalQueue(
        provider: Provider,
        data: ReservationProviderData,
    ): void {
        const quote: u256 = this.quoteManager.getValidBlockQuote(data.creationBlock);
        const reservedAmountSatoshis: u64 = tokensToSatoshis128(data.providedAmount, quote);
        const actualReservedSatoshis: u64 = this.owedBTCManager.getSatoshisOwedReserved(
            provider.getId(),
        );
        const revertSatoshis: u64 = min64(reservedAmountSatoshis, actualReservedSatoshis);
        const newOwedReserved: u64 = SafeMath.sub64(actualReservedSatoshis, revertSatoshis);

        this.owedBTCManager.setSatoshisOwedReserved(provider.getId(), newOwedReserved);

        // This is very important that a provider with active liquidity CAN NOT BE A REMOVAL PROVIDER AT THE SAME TIME. OR THIS CHECK WILL FAIL.
        if (!provider.isPurged()) {
            this.addToRemovalPurgedQueue(provider);
        }
    }

    private purgeAndRestoreNormalPriorityProvider(
        provider: Provider,
        data: ReservationProviderData,
    ): void {
        provider.subtractFromReservedAmount(data.providedAmount);

        const quote: u256 = this.quoteManager.getValidBlockQuote(data.creationBlock);

        if (
            !Provider.meetsMinimumReservationAmount(provider.getAvailableLiquidityAmount(), quote)
        ) {
            if (!provider.hasReservedAmount()) {
                this.resetProvider(provider, false, false);
            }
        } else if (!provider.isPurged()) {
            if (provider.getProviderType() === ProviderTypes.Normal) {
                this.addToNormalPurgedQueue(provider);
            } else {
                this.addToPriorityPurgedQueue(provider);
            }
        }
    }

    private verifyProviderRemainingLiquidityAndReset(
        provider: Provider,
        availableLiquidity: u128,
        quote: u256,
    ): boolean {
        let result: boolean = true;

        if (!Provider.meetsMinimumReservationAmount(availableLiquidity, quote)) {
            if (!provider.hasReservedAmount()) {
                this.resetProvider(provider);
            }

            result = false;
        }

        return result;
    }
}
