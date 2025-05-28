import { Provider } from '../models/Provider';
import { PurgedProviderQueue } from './PurgedProviderQueue';
import { Revert } from '../../../btc-runtime/runtime';
import { INDEX_NOT_SET_VALUE } from '../constants/Contract';

export class PriorityPurgedProviderQueue extends PurgedProviderQueue {
    public override add(provider: Provider): u32 {
        let index: u32 = INDEX_NOT_SET_VALUE;

        if (!provider.isInitialLiquidityProvider()) {
            this.ensureProviderNotAlreadyPurged(provider.isPurged());
            this.ensureProviderNotPendingRemoval(provider);
            this.ensureProviderQueueIndexIsValid(provider.getQueueIndex());
            this.ensureProviderIsPriority(provider);

            provider.markPurged();

            index = this.queue.push(provider.getQueueIndex(), false);

            provider.setPurgedIndex(index);
        }

        return index;
    }

    private ensureProviderIsPriority(provider: Provider): void {
        if (!provider.isPriority()) {
            throw new Revert(
                `Impossible state: only priority provider can be in the priority provider purged queue.`,
            );
        }
    }
}
