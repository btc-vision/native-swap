import {
    Address,
    Blockchain,
    Potential,
    Revert,
    StoredU32Array,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { INDEX_NOT_SET_VALUE } from '../constants/Contract';
import { getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FulfilledProviderEvent } from '../events/FulfilledProviderEvent';

export class PurgedProviderQueue {
    protected readonly token: Address;
    protected readonly queue: StoredU32Array;
    protected readonly enableIndexVerification: boolean;
    protected readonly allowDirty: boolean;

    constructor(
        token: Address,
        pointer: u16,
        subPointer: Uint8Array,
        enableIndexVerification: boolean,
        allowDirty: boolean,
    ) {
        this.token = token;
        this.queue = new StoredU32Array(pointer, subPointer, INDEX_NOT_SET_VALUE - 1);
        this.enableIndexVerification = enableIndexVerification;
        this.allowDirty = allowDirty;
    }

    public get length(): u32 {
        return this.queue.getLength();
    }

    public add(provider: Provider): u32 {
        let index: u32 = INDEX_NOT_SET_VALUE;

        if (!provider.isInitialLiquidityProvider()) {
            this.ensureProviderNotAlreadyPurged(provider.isPurged());
            this.ensureProviderNotPendingRemoval(provider);
            this.ensureProviderNotPriority(provider);
            this.ensureProviderQueueIndexIsValid(provider.getQueueIndex());

            provider.markPurged();

            index = this.queue.push(provider.getQueueIndex(), false);

            provider.setPurgedIndex(index);
        }

        return index;
    }

    public get(associatedQueue: ProviderQueue, quote: u256): Provider | null {
        // !!!! What if we don't use all the liquidity for the reservation
        // provider will never be picked up again
        const providerIndex: u32 = this.queue.next();

        this.ensureProviderQueueIndexIsValid(providerIndex);

        const providerId = associatedQueue.getAt(providerIndex);
        this.ensureProviderIdIsValid(providerId);

        const provider = getProvider(providerId);
        this.ensureProviderPurged(provider);

        if (provider.getPurgedIndex() !== this.queue.previousOffset) {
            throw new Revert('provider.getPurgedIndex() !== this.queue.previousOffset');
        }

        return this.returnProvider(associatedQueue, provider, providerIndex, quote);
    }

    public remove(provider: Provider): void {
        this.ensureProviderQueueIndexIsValid(provider.getPurgedIndex());

        // TODO:!!!! Technically, we don't need to remove the provider from the queue because we should theoretically process
        // TODO: "dirty" states correctly due to wrap around.
        // NOT USING physical flag when adding???? is this good???
        if (!this.allowDirty) {
            this.queue.delete_physical(provider.getPurgedIndex());
        }

        this.queue.removeItemFromLength();
        this.queue.applyNextOffsetToStartingIndex();

        provider.clearPurged();
        provider.setPurgedIndex(INDEX_NOT_SET_VALUE);
    }

    public save(): void {
        this.queue.save();
    }

    protected ensureProviderIdIsValid(id: u256): void {
        if (id.isZero()) {
            throw new Revert(`Impossible state: providerId cannot be zero.`);
        }
    }

    protected ensureProviderNotAlreadyPurged(state: boolean): void {
        if (state) {
            throw new Revert('Impossible state: provider has already been purged.');
        }
    }

    protected ensureProviderQueueIndexIsValid(index: u32): void {
        if (index === INDEX_NOT_SET_VALUE) {
            throw new Revert('Impossible state: provider index is not defined.');
        }
    }

    protected ensureProviderNotPendingRemoval(provider: Provider): void {
        if (provider.isPendingRemoval()) {
            throw new Revert(`Impossible state: provider cannot be in pending removal state.`);
        }
    }

    protected ensureProviderPurged(provider: Provider): void {
        if (!provider.isPurged()) {
            throw new Revert(`Impossible state: provider has not been purged.`);
        }
    }

    private ensureProviderNotPriority(provider: Provider): void {
        if (provider.isPriority()) {
            throw new Revert(
                `Impossible state: only normal provider can be in the normal provider purged queue.`,
            );
        }
    }

    private resetProvider(provider: Provider, associatedQueue: ProviderQueue): void {
        this.ensureProviderPurged(provider);

        if (provider.hasLiquidityAmount()) {
            TransferHelper.safeTransfer(
                this.token,
                Address.dead(),
                provider.getLiquidityAmount().toU256(),
            );
        }

        if (!provider.isInitialLiquidityProvider()) {
            associatedQueue.remove(provider);
        }

        provider.resetListingProviderValues();

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), false, false));
    }

    // TODO:!!! we could verify to check if we want to skip an index but this adds complexity, but it could save gas.
    private returnProvider(
        associatedQueue: ProviderQueue,
        provider: Provider,
        index: u32,
        quote: u256,
    ): Provider | null {
        let result: Potential<Provider> = null;
        const availableLiquidity: u128 = provider.getAvailableLiquidityAmount();

        if (!availableLiquidity.isZero()) {
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

            if (Provider.meetsMinimumReservationAmount(availableLiquidity, quote)) {
                provider.clearFromRemovalQueue();
                result = provider;
            } else if (!provider.hasReservedAmount()) {
                this.resetProvider(provider, associatedQueue);
            }
        }

        return result;
    }
}
