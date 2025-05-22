import {
    Address,
    Blockchain,
    Potential,
    Revert,
    StoredU32Array,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { ALLOW_DIRTY, INDEX_NOT_SET_VALUE, MAXIMUM_PROVIDER_COUNT } from '../constants/Contract';
import { getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FulfilledProviderEvent } from '../events/FulfilledProviderEvent';

export class PurgedProviderQueue {
    protected readonly token: Address;
    protected readonly queue: StoredU32Array;
    protected readonly enableIndexVerification: boolean;

    constructor(
        token: Address,
        pointer: u16,
        subPointer: Uint8Array,
        enableIndexVerification: boolean,
    ) {
        this.token = token;
        this.queue = new StoredU32Array(pointer, subPointer, <u64>MAXIMUM_PROVIDER_COUNT);
        this.enableIndexVerification = enableIndexVerification;
    }

    public add(provider: Provider): void {
        if (!provider.isInitialLiquidityProvider()) {
            this.ensureProviderNotAlreadyPurged(provider.isPurged());
            this.ensureProviderQueueIndexIsValid(provider.getQueueIndex());

            provider.markPurged();

            const index: u32 = this.queue.push(provider.getQueueIndex(), false);

            provider.setPurgedIndex(index);
        }
    }

    public get(associatedQueue: ProviderQueue, quote: u256): Provider | null {
        const providerIndex = this.queue.next();
        this.ensureProviderQueueIndexIsValid(providerIndex);

        const providerId = associatedQueue.getAt(providerIndex);
        this.ensureProviderIdIsValid(providerId);

        const provider = getProvider(providerId);
        this.ensureProviderPurged(provider);

        provider.setPurgedIndex(this.queue.previousOffset);

        return this.returnProvider(provider, providerIndex, quote);
    }

    public remove(provider: Provider): void {
        this.ensureProviderIdIsValid(provider.getId());

        // TODO: Technically, we don't need to remove the provider from the queue because we should theoretically process
        // TODO: "dirty" states correctly due to wrap around.
        if (!ALLOW_DIRTY) {
            this.queue.delete_physical(provider.getPurgedIndex());
        }

        this.queue.removeItemFromLength();
        this.queue.applyNextOffsetToStartingIndex();

        provider.clearPurged();
        provider.setPurgedIndex(INDEX_NOT_SET_VALUE);
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

        provider.resetListingValues();

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), canceled, false));
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

    protected ensureProviderIdIsValid(id: u256): void {
        if (id.isZero()) {
            throw new Revert(`Impossible state: providerId cannot be zero.`);
        }
    }

    private ensureProviderPurged(provider: Provider): void {
        if (!provider.isPurged()) {
            throw new Revert(`Impossible state: provider has not been purged.`);
        }
    }

    // TODO:!!! we could verify to check if we want to skip an index but this adds complexity, but it could save gas.
    private returnProvider(provider: Provider, index: u32, quote: u256): Provider | null {
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
                this.resetProvider(provider);
            }
        }

        return result;
    }
}
