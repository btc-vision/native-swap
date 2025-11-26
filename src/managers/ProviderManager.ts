import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    BytesWriter,
    Revert,
    StoredU256,
    StoredU32,
    U32_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import {
    INITIAL_LIQUIDITY_PROVIDER_POINTER,
    NORMAL_QUEUE_FULFILLED,
    NORMAL_QUEUE_POINTER,
    NORMAL_QUEUE_PURGED_RESERVATION,
    PRIORITY_QUEUE_FULFILLED,
    PRIORITY_QUEUE_POINTER,
    PRIORITY_QUEUE_PURGED_RESERVATION,
    STARTING_INDEX_POINTER,
} from '../constants/StoredPointers';
import { getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { PriorityProviderQueue } from './PriorityProviderQueue';

import {
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    MAXIMUM_NUMBER_OF_PROVIDERS,
} from '../constants/Contract';
import { ProviderTypes } from '../types/ProviderTypes';
import { IProviderManager } from './interfaces/IProviderManager';
import { PurgedProviderQueue } from './PurgedProviderQueue';
import { PriorityPurgedProviderQueue } from './PriorityPurgedProviderQueue';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { FulfilledProviderQueue } from './FulfilledProviderQueue';

export class ProviderManager implements IProviderManager {
    protected readonly token: Address;
    protected readonly tokenIdUint8Array: Uint8Array;
    protected readonly normalQueue: ProviderQueue;
    protected readonly priorityQueue: PriorityProviderQueue;
    protected readonly normalPurgedQueue: PurgedProviderQueue;
    protected readonly priorityPurgedQueue: PriorityPurgedProviderQueue;
    protected readonly normalFulfilledQueue: FulfilledProviderQueue;
    protected readonly priorityFulfilledQueue: FulfilledProviderQueue;

    protected readonly quoteManager: IQuoteManager;
    private readonly _startingIndex: StoredU32;
    private readonly _initialLiquidityProviderId: StoredU256;

    constructor(
        token: Address,
        tokenIdUint8Array: Uint8Array,
        quoteManager: IQuoteManager,
        enableIndexVerification: boolean,
        liquidityQueueReserve: ILiquidityQueueReserve,
        maximumResetsBeforeQueuing: u8,
    ) {
        this.token = token;
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.quoteManager = quoteManager;
        this.normalQueue = new ProviderQueue(
            token,
            NORMAL_QUEUE_POINTER,
            tokenIdUint8Array,
            enableIndexVerification,
            MAXIMUM_NUMBER_OF_PROVIDERS,
            liquidityQueueReserve,
            maximumResetsBeforeQueuing,
        );

        this.priorityQueue = new PriorityProviderQueue(
            token,
            PRIORITY_QUEUE_POINTER,
            tokenIdUint8Array,
            enableIndexVerification,
            MAXIMUM_NUMBER_OF_PROVIDERS,
            liquidityQueueReserve,
            maximumResetsBeforeQueuing,
        );

        this.normalPurgedQueue = new PurgedProviderQueue(
            token,
            NORMAL_QUEUE_PURGED_RESERVATION,
            tokenIdUint8Array,
            enableIndexVerification,
            liquidityQueueReserve,
            maximumResetsBeforeQueuing,
        );

        this.priorityPurgedQueue = new PriorityPurgedProviderQueue(
            token,
            PRIORITY_QUEUE_PURGED_RESERVATION,
            tokenIdUint8Array,
            enableIndexVerification,
            liquidityQueueReserve,
            maximumResetsBeforeQueuing,
        );

        this.normalFulfilledQueue = new FulfilledProviderQueue(
            NORMAL_QUEUE_FULFILLED,
            tokenIdUint8Array,
            liquidityQueueReserve,
        );

        this.priorityFulfilledQueue = new FulfilledProviderQueue(
            PRIORITY_QUEUE_FULFILLED,
            tokenIdUint8Array,
            liquidityQueueReserve,
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

    public get priorityQueueLength(): u32 {
        return this.priorityQueue.length;
    }

    public get priorityQueueStartingIndex(): u32 {
        return this.priorityQueue.startingIndex;
    }

    public addToNormalQueue(provider: Provider): u32 {
        return this.normalQueue.add(provider);
    }

    public addToPriorityQueue(provider: Provider): u32 {
        return this.priorityQueue.add(provider);
    }

    public addToNormalPurgedQueue(provider: Provider): u32 {
        return this.normalPurgedQueue.add(provider);
    }

    public addToPriorityPurgedQueue(provider: Provider): u32 {
        return this.priorityPurgedQueue.add(provider);
    }

    public cleanUpQueues(currentQuote: u256): void {
        this.previousPriorityStartingIndex = this.priorityQueue.cleanUp(
            this.priorityFulfilledQueue,
            this.previousPriorityStartingIndex,
            currentQuote,
        );

        this.previousNormalStartingIndex = this.normalQueue.cleanUp(
            this.normalFulfilledQueue,
            this.previousNormalStartingIndex,
            currentQuote,
        );
    }

    public getFromNormalQueue(index: u32): u256 {
        return this.normalQueue.getAt(index);
    }

    public getFromPriorityQueue(index: u32): u256 {
        return this.priorityQueue.getAt(index);
    }

    public getIdFromQueue(index: u32, type: ProviderTypes): u256 {
        switch (type) {
            case ProviderTypes.Normal: {
                return this.normalQueue.getAt(index);
            }
            case ProviderTypes.Priority: {
                return this.priorityQueue.getAt(index);
            }
            default: {
                throw new Revert('Impossible state: Invalid provider type');
            }
        }
    }

    public getNextFromPurgedProvider(currentQuote: u256): Provider | null {
        let result: Provider | null = null;

        if (this.priorityPurgedQueue.length > 0) {
            result = this.priorityPurgedQueue.get(
                this.priorityQueue,
                this.priorityFulfilledQueue,
                currentQuote,
            );
        }

        if (result === null && this.normalPurgedQueue.length > 0) {
            result = this.normalPurgedQueue.get(
                this.normalQueue,
                this.normalFulfilledQueue,
                currentQuote,
            );
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

        const priorityProvider: Provider | null = this.priorityQueue.getNextWithLiquidity(
            this.priorityFulfilledQueue,
            currentQuote,
        );

        if (priorityProvider !== null) {
            this.previousPriorityStartingIndex =
                this.currentIndexPriority === 0
                    ? this.currentIndexPriority
                    : this.currentIndexPriority - 1;

            return priorityProvider;
        }

        const provider: Provider | null = this.normalQueue.getNextWithLiquidity(
            this.normalFulfilledQueue,
            currentQuote,
        );

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
        const writer = new BytesWriter(U32_BYTE_LENGTH * 6);

        writer.writeU32(this.priorityQueue.length);
        writer.writeU32(this.priorityQueue.startingIndex);

        writer.writeU32(this.normalQueue.length);
        writer.writeU32(this.normalQueue.startingIndex);

        writer.writeU32(this.priorityPurgedQueue.length);
        writer.writeU32(this.normalPurgedQueue.length);

        return writer.getBuffer();
    }

    public purgeAndRestoreProvider(data: ReservationProviderData, quote: u256): void {
        const provider: Provider = this.getProviderFromQueue(data.providerIndex, data.providerType);

        this.ensureReservedAmountValid(provider, data.providedAmount);
        this.purgeAndRestoreNormalPriorityProvider(provider, data, quote);
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

    public resetFulfilledProviders(count: u32): u32 {
        let totalResets: u32 = this.priorityFulfilledQueue.reset(count, this.priorityQueue);

        if (totalResets < count) {
            const remaining: u32 = count - totalResets;
            if (remaining > 0) {
                totalResets += this.normalFulfilledQueue.reset(remaining, this.normalQueue);
            }
        }

        return totalResets;
    }

    public resetProvider(provider: Provider, burnRemainingFunds: boolean = true): void {
        if (provider.isPriority()) {
            this.priorityQueue.resetProvider(provider, burnRemainingFunds);
        } else {
            this.normalQueue.resetProvider(provider, burnRemainingFunds);
        }
    }

    public resetStartingIndex(): void {
        const startIndexNormal: u32 = this.normalQueue.startingIndex;
        const startIndexPriority: u32 = this.priorityQueue.startingIndex;

        // Always 1 index behind to be 100% sure we didn't miss a provider
        this.previousPriorityStartingIndex = startIndexPriority === 0 ? 0 : startIndexPriority - 1;
        this.previousNormalStartingIndex = startIndexNormal === 0 ? 0 : startIndexNormal - 1;
    }

    public restoreCurrentIndex(): void {
        this.normalQueue.restoreCurrentIndex(this.previousNormalStartingIndex);
        this.priorityQueue.restoreCurrentIndex(this.previousPriorityStartingIndex);
    }

    public save(): void {
        this._startingIndex.save();
        this.normalQueue.save();
        this.priorityQueue.save();
        this.normalPurgedQueue.save();
        this.priorityPurgedQueue.save();
        this.normalFulfilledQueue.save();
        this.priorityFulfilledQueue.save();
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

    private purgeAndRestoreNormalPriorityProvider(
        provider: Provider,
        data: ReservationProviderData,
        quote: u256,
    ): void {
        provider.subtractFromReservedAmount(data.providedAmount);

        if (
            !Provider.meetsMinimumReservationAmount(provider.getAvailableLiquidityAmount(), quote)
        ) {
            if (!provider.hasReservedAmount()) {
                this.resetProvider(provider);
            }
        } else if (!provider.isPurged()) {
            if (provider.getProviderType() === ProviderTypes.Normal) {
                this.addToNormalPurgedQueue(provider);
            } else {
                this.addToPriorityPurgedQueue(provider);
            }
        }
    }
}
