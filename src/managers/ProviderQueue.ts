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
import { MAXIMUM_PROVIDER_COUNT, MAXIMUM_VALID_INDEX } from '../constants/Contract';

const ENABLE_INDEX_VERIFICATION: bool = true;

export class ProviderQueue {
    protected readonly token: Address;
    protected readonly queue: StoredU256Array;

    constructor(token: Address, pointer: u16, subPointer: Uint8Array) {
        this.queue = new StoredU256Array(pointer, subPointer);
        this.token = token;
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
        if (this.queue.getLength() === MAXIMUM_PROVIDER_COUNT) {
            throw new Revert('Impossible state: Too many providers in the queue.');
        }

        this.queue.push(provider.getId(), true);
        const index: u32 = this.queue.getLength() - 1;
        provider.setQueueIndex(index);

        return index;
    }

    // !!! recheck previous.... if all already deleted, maybe loop cause starting index not set???
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
                    this.queue.delete_physical(index);
                }
            }

            index++;
        }

        return index;
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

    public removeAt(index: u32): void {
        this.queue.delete_physical(index);
    }

    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        this.ensureNotInitialLiquidityProvider(provider);

        if (burnRemainingFunds && provider.hasLiquidityAmount()) {
            TransferHelper.safeTransfer(
                this.token,
                Address.dead(),
                provider.getLiquidityAmount().toU256(),
            );
        }

        this.queue.delete_physical(provider.getQueueIndex());

        provider.resetListingValues();

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), canceled, false));
    }

    public restoreCurrentIndex(previousStartingIndex: u32): void {
        this._currentIndex = previousStartingIndex;
    }

    public save(): void {
        this.queue.save();
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

        if (!providerId.isZero()) {
            const provider: Provider = getProvider(providerId);

            if (this.isEligible(provider)) {
                result = this.returnProvider(provider, this._currentIndex, currentQuote);
            }
        }

        return result;
    }

    // TODO:!!! we could verify to check if we want to skip an index but this adds complexity, but it could save gas.
    private returnProvider(provider: Provider, index: u32, currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const availableLiquidity: u128 = provider.getAvailableLiquidityAmount();

        if (!availableLiquidity.isZero()) {
            if (ENABLE_INDEX_VERIFICATION) {
                if (provider.getQueueIndex() !== index) {
                    throw new Revert(
                        `Impossible state: provider.indexedAt (${provider.getQueueIndex()}) does not match index (${index}).`,
                    );
                }

                assert(
                    provider.isInitialLiquidityProvider(),
                    'Impossible state: Initial liquidity provider cannot be returned here.',
                );
            }

            if (Provider.meetsMinimumReservationAmount(availableLiquidity, currentQuote)) {
                provider.clearFromRemovalQueue();
                result = provider;
            } else if (!provider.hasReservedAmount()) {
                this.resetProvider(provider);
            }
        }

        return result;
    }

    private ensureNotInitialLiquidityProvider(provider: Provider): void {
        if (provider.isInitialLiquidityProvider()) {
            throw new Revert('Impossible state: initial liquidity provider cannot be in a queue.');
        }
    }
}
