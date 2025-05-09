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
    protected currentIndexOverflow: boolean = false;

    constructor(token: Address, pointer: u16, subPointer: Uint8Array) {
        this.queue = new StoredU256Array(pointer, subPointer);
        this.token = token;
    }

    protected _currentIndex: u64 = 0;

    public get currentIndex(): u64 {
        return this._currentIndex;
    }

    public get length(): u64 {
        return this.queue.getLength();
    }

    public get startingIndex(): u64 {
        return this.queue.startingIndex();
    }

    public add(provider: Provider): u64 {
        if (this.queue.getLength() === MAXIMUM_PROVIDER_COUNT) {
            throw new Revert('Impossible state: Too many providers required for reservation.');
        }

        this.queue.push(provider.getId(), true);
        const index: u64 = this.queue.getLength() - 1;
        provider.setQueueIndex(index);

        return index;
    }

    public cleanUp(previousStartingIndex: u64): u64 {
        const length: u64 = this.length;
        let index: u64 = previousStartingIndex;

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

    public getAt(index: u64): u256 {
        return this.queue.get_physical(index);
    }

    public getNextWithLiquidity(currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;

        //!!!! Revalidate overflow
        this.ensureCurrentIndexNotOverflow();
        this.ensureStartingIndexIsValid();
        this.initializeCurrentIndex();

        const length: u64 = this.length;
        while (this._currentIndex < length && result === null) {
            const candidate: Provider | null = this.tryNextCandidate(currentQuote);
            this.advanceCurrentIndex();

            if (candidate !== null) {
                result = candidate;
            }
        }

        return result;
    }

    public getQueue(): StoredU256Array {
        return this.queue;
    }

    public removeAt(index: u64): void {
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

    public restoreCurrentIndex(previousStartingIndex: u64): void {
        this._currentIndex = previousStartingIndex;
    }

    public save(): void {
        this.queue.save();
    }

    protected advanceCurrentIndex(): void {
        if (this._currentIndex === MAXIMUM_VALID_INDEX) {
            this.currentIndexOverflow = true;
        } else {
            this._currentIndex++;
        }
    }

    protected ensureCurrentIndexNotOverflow(): void {
        if (this.currentIndexOverflow) {
            throw new Revert('Impossible state: Index increment overflow');
        }
    }

    protected ensureStartingIndexIsValid(): void {
        if (this.startingIndex > this.length) {
            throw new Revert('Impossible state: startingIndex exceeds queue length');
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
    private returnProvider(provider: Provider, index: u64, currentQuote: u256): Provider | null {
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
