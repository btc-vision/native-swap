import { u256 } from '@btc-vision/as-bignum/assembly';
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

    public get startingIndex(): u64 {
        return this.queue.startingIndex();
    }

    public get length(): u64 {
        return this.queue.getLength();
    }

    public add(provider: Provider): u64 {
        this.queue.push(provider.getId(), true);

        const index = this.queue.getLength() - 1;
        provider.setQueueIndex(index);

        return index;
    }

    public getAt(index: u64): u256 {
        return this.queue.get_physical(index);
    }

    public removeAt(index: u64): void {
        this.queue.delete_physical(index);
    }

    public getQueue(): StoredU256Array {
        return this.queue;
    }

    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        if (provider.isInitialLiquidityProvider()) {
            throw new Revert('Impossible state: initial liquidity provider cannot be in a queue.');
        }

        if (burnRemainingFunds && provider.hasLiquidityAmount()) {
            TransferHelper.safeTransfer(this.token, Address.dead(), provider.getLiquidityAmount());
        }

        this.queue.delete_physical(provider.getQueueIndex());

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), canceled, false));

        provider.resetListingValues();
    }

    public restoreCurrentIndex(previousStartingIndex: u64): void {
        this._currentIndex = previousStartingIndex;
    }

    public save(): void {
        this.queue.save();
    }

    public getNextWithLiquidity(currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;

        //!!!! Revalidate
        this.ensureCurrentIndexNotOverflow();
        this.ensureStartingIndexIsValid();
        this.initializeCurrentIndex();

        const end = this.length;
        while (this._currentIndex < end && result === null) {
            const candidate = this.tryNextCandidate(currentQuote);
            this.advanceCurrentIndex();

            if (candidate !== null) {
                result = candidate;
            }
        }

        return result;
    }

    public cleanUp(previousStartingIndex: u64): u64 {
        const length: u64 = this.length;
        let index: u64 = previousStartingIndex;

        while (index < length) {
            const providerId = this.queue.get_physical(index);
            if (providerId !== u256.Zero) {
                const provider = getProvider(providerId);
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

    protected isEligible(provider: Provider): boolean {
        if (!provider.isActive()) {
            return false;
        }

        if (provider.isPriority()) {
            throw new Revert(
                `Impossible state: priority provider in standard queue (${provider.getId()}).`,
            );
        }

        if (!provider.isReservedAmountValid()) {
            throw new Revert(
                `Impossible state: liquidity < reserved for provider ${provider.getId()}.`,
            );
        }

        return true;
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

    protected advanceCurrentIndex(): void {
        if (this._currentIndex === u64.MAX_VALUE) {
            this.currentIndexOverflow = true;
        } else {
            this._currentIndex++;
        }
    }

    protected tryNextCandidate(currentQuote: u256): Provider | null {
        const providerId = this.queue.get_physical(this._currentIndex);

        if (providerId === u256.Zero) {
            return null;
        }

        const provider = getProvider(providerId);
        if (!this.isEligible(provider)) {
            return null;
        }

        return this.returnProvider(provider, this._currentIndex, currentQuote);
    }

    // TODO: we could verify to check if we want to skip an index but this adds complexity, but it could save gas.
    private returnProvider(provider: Provider, index: u64, currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const availableLiquidity: u256 = provider.getAvailableLiquidityAmount();

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

            if (
                Provider.checkTokenAmountGEMinimumReservationAmount(
                    availableLiquidity,
                    currentQuote,
                )
            ) {
                provider.clearFromRemovalQueue();
                result = provider;
            } else if (!provider.hasReservedAmount()) {
                this.resetProvider(provider);
            }
        }

        return result;
    }
}
