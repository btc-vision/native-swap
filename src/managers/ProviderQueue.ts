import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    Potential,
    Revert,
    StoredU256Array,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { getProvider, Provider } from '../models/Provider';
import { FulfilledProviderEvent } from '../events/FulfilledProviderEvent';
import { INDEX_NOT_SET_VALUE, MAXIMUM_VALID_INDEX } from '../constants/Contract';

export class ProviderQueue {
    protected readonly token: Address;
    protected readonly queue: StoredU256Array;
    protected readonly enableIndexVerification: boolean;

    constructor(
        token: Address,
        pointer: u16,
        subPointer: Uint8Array,
        enableIndexVerification: boolean,
    ) {
        this.queue = new StoredU256Array(pointer, subPointer, MAXIMUM_VALID_INDEX);
        this.token = token;
        this.enableIndexVerification = enableIndexVerification;
    }

    protected _currentIndex: u32 = 0;

    public get currentIndex(): u32 {
        return this._currentIndex;
    }

    public get length(): u32 {
        return this.queue.getLength();
    }

    public get startingIndex(): u32 {
        return this.queue.startingIndex();
    }

    public add(provider: Provider): u32 {
        const index: u32 = this.queue.push(provider.getId(), true);
        provider.setQueueIndex(index);

        return index;
    }

    public cleanUp(previousStartingIndex: u32): u32 {
        const length: u32 = this.length;
        let index: u32 = previousStartingIndex;

        while (index < length) {
            const providerId: u256 = this.queue.get_physical(index);

            if (!providerId.isZero()) {
                const provider: Provider = getProvider(providerId);

                if (provider.isActive()) {
                    this.queue.setStartingIndex(index);
                    break;
                } else {
                    this.ensureProviderNotAlreadyPurged(provider.isPurged());
                    this.queue.delete_physical(index);
                }
            } else {
                this.queue.setStartingIndex(index);
            }

            index++;
        }

        return index === 0 ? index : index - 1;
    }

    public getAt(index: u32): u256 {
        return this.queue.get_physical(index);
    }

    public getNextWithLiquidity(currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;

        this.initializeCurrentIndex();
        this.ensureStartingIndexIsValid();

        const length: u32 = this.length;

        while (this._currentIndex < length && result === null) {
            const candidate: Provider | null = this.tryNextCandidate(currentQuote);

            if (candidate !== null) {
                result = candidate;
            }

            if (this._currentIndex === MAXIMUM_VALID_INDEX) {
                if (result !== null) {
                    break;
                } else {
                    throw new Revert('Impossible state: Index increment overflow.');
                }
            } else {
                this._currentIndex++;
            }
        }

        return result;
    }

    public getQueue(): StoredU256Array {
        return this.queue;
    }

    public remove(provider: Provider): void {
        this.queue.delete_physical(provider.getQueueIndex());
        provider.setQueueIndex(INDEX_NOT_SET_VALUE);
    }

    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        this.ensureProviderNotAlreadyPurged(provider.isPurged());

        if (burnRemainingFunds && provider.hasLiquidityAmount()) {
            TransferHelper.safeTransfer(
                this.token,
                Address.dead(),
                provider.getLiquidityAmount().toU256(),
            );
        }

        if (!provider.isInitialLiquidityProvider()) {
            this.queue.delete_physical(provider.getQueueIndex());
        }

        provider.resetListingProviderValues();

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), canceled, false));
    }

    public restoreCurrentIndex(previousStartingIndex: u32): void {
        this._currentIndex = previousStartingIndex;
    }

    public save(): void {
        this.queue.save();
    }

    protected ensureProviderIdIsValid(providerId: u256): void {
        if (providerId.isZero()) {
            throw new Revert(`Impossible state: A provider id cannot be zero.`);
        }
    }

    protected ensureProviderNotAlreadyPurged(state: boolean): void {
        if (state) {
            throw new Revert('Impossible state: provider has already been purged.');
        }
    }

    protected ensureStartingIndexIsValid(): void {
        if (this.startingIndex > this.length) {
            throw new Revert('Impossible state: startingIndex exceeds queue length.');
        }
    }

    protected initializeCurrentIndex(): void {
        if (this._currentIndex === 0) {
            this._currentIndex = this.startingIndex;
        }
    }

    protected isEligible(provider: Provider): boolean {
        if (!provider.isActive()) {
            return false;
        }

        if (provider.isPriority()) {
            throw new Revert(
                `Impossible state: priority provider in normal queue (${provider.getId()}).`,
            );
        }

        return true;
    }

    protected tryNextCandidate(currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const providerId: u256 = this.queue.get_physical(this._currentIndex);
        this.ensureProviderIdIsValid(providerId);

        const provider: Provider = getProvider(providerId);

        if (this.isEligible(provider)) {
            result = this.returnProvider(provider, this._currentIndex, currentQuote);
        }

        return result;
    }

    // TODO:!!! we could verify to check if we want to skip an index but this adds complexity, but it could save gas.
    private returnProvider(provider: Provider, index: u32, currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const availableLiquidity: u128 = provider.getAvailableLiquidityAmount();

        if (availableLiquidity.isZero()) {
            return null;
        }

        if (this.enableIndexVerification) {
            if (provider.getQueueIndex() !== index) {
                throw new Revert(
                    `Impossible state: provider.getQueueIndex (${provider.getQueueIndex()}) does not match index (${index}).`,
                );
            }

            if (provider.isInitialLiquidityProvider()) {
                throw new Revert(
                    'Impossible state: Initial liquidity provider cannot be returned here.',
                );
            }
        }

        if (Provider.meetsMinimumReservationAmount(availableLiquidity, currentQuote)) {
            provider.clearFromRemovalQueue();
            result = provider;
        } else if (!provider.hasReservedAmount()) {
            this.resetProvider(provider);
        }

        return result;
    }
}
