import { Revert } from '@btc-vision/btc-runtime/runtime';
import { PurgedProviderQueue } from './PurgedProviderQueue';
import { getProvider, Provider } from '../models/Provider';
import { INDEX_NOT_SET_VALUE } from '../constants/Contract';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { ProviderQueue } from './ProviderQueue';
import { RemovalProviderQueue } from './RemovalProviderQueue';

export class RemovalPurgedProviderQueue extends PurgedProviderQueue {
    public override add(provider: Provider): u32 {
        let index: u32 = INDEX_NOT_SET_VALUE;

        if (!provider.isInitialLiquidityProvider()) {
            this.ensureProviderIsPendingRemoval(provider);
            this.ensureProviderNotAlreadyPurged(provider.isPurged());
            this.ensureProviderQueueIndexIsValid(provider.getQueueIndex());

            provider.markPurged();

            index = this.queue.push(provider.getQueueIndex(), false);

            provider.setPurgedIndex(index);
        }

        return index;
    }

    public get(associatedQueue: ProviderQueue, _quote: u256): Provider | null {
        if (!(associatedQueue instanceof RemovalProviderQueue)) {
            throw new Revert(`Impossible state: Wrong queue type used.`);
        }

        const associatedRemovalQueue: RemovalProviderQueue =
            associatedQueue as RemovalProviderQueue;

        const providerIndex = this.queue.next();
        this.ensureProviderQueueIndexIsValid(providerIndex);

        const providerId = associatedRemovalQueue.getAt(providerIndex);
        this.ensureProviderIdIsValid(providerId);

        const provider = getProvider(providerId);
        this.ensureProviderPurged(provider);

        provider.setPurgedIndex(this.queue.previousOffset);
        provider.markFromRemovalQueue();

        return provider;
    }

    private ensureProviderIsPendingRemoval(provider: Provider): void {
        if (!provider.isPendingRemoval()) {
            throw new Revert('Impossible state: Provider is not pending removal.');
        }
    }
}
