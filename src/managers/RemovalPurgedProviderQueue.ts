import { Revert } from '../../../btc-runtime/runtime';
import { PurgedProviderQueue } from './PurgedProviderQueue';
import { Provider } from '../models/Provider';
import { INDEX_NOT_SET_VALUE } from '../constants/Contract';

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
