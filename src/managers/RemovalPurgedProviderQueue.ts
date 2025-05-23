import { Revert } from '../../../btc-runtime/runtime';
import { PurgedProviderQueue } from './PurgedProviderQueue';
import { Provider } from '../models/Provider';
import { ALLOW_DIRTY, INDEX_NOT_SET_VALUE } from '../constants/Contract';

export class RemovalPurgedProviderQueue extends PurgedProviderQueue {
    public override add(provider: Provider): void {
        if (!provider.isInitialLiquidityProvider()) {
            this.ensureProviderIsPendingRemoval(provider);
            this.ensureProviderNotAlreadyPurged(provider.isRemovalPurged());
            this.ensureProviderQueueIndexIsValid(provider.getRemovalQueueIndex());

            provider.markRemovalPurged();

            const index: u32 = this.queue.push(provider.getRemovalQueueIndex(), false);

            provider.setRemovalPurgedIndex(index);
        }
    }

    /*public override get(associatedQueue: RemovalProviderQueue, quote: u256): Provider | null {
        const providerIndex = this.queue.next();
        this.ensureProviderQueueIndexIsValid(providerIndex);

        const providerId = associatedQueue.getAt(providerIndex);
        this.ensureProviderIdIsValid(providerId);

        const provider = getProvider(providerId);
        this.ensureProviderPurged(provider);

        provider.setPurgedIndex(this.queue.previousOffset);

        return this.returnProvider(provider, providerIndex, quote);
    }*/

    public remove(provider: Provider): void {
        this.ensureProviderQueueIndexIsValid(provider.getRemovalPurgedIndex());

        // TODO: Technically, we don't need to remove the provider from the queue because we should theoretically process
        // TODO: "dirty" states correctly due to wrap around.
        if (!ALLOW_DIRTY) {
            this.queue.delete_physical(provider.getRemovalPurgedIndex());
        }

        this.queue.removeItemFromLength();
        this.queue.applyNextOffsetToStartingIndex();

        provider.clearPurged();
        provider.setRemovalPurgedIndex(INDEX_NOT_SET_VALUE);
    }

    private ensureProviderIsPendingRemoval(provider: Provider): void {
        if (!provider.isPendingRemoval()) {
            throw new Revert('Impossible state: Provider is not pending removal.');
        }
    }

    /*
        private ensureProviderPurged(provider: Provider): void {
            if (!provider.isRemovalPurged()) {
                throw new Revert(`Impossible state: provider has not been purged.`);
            }
        }*/
}
