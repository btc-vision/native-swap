import { Provider } from '../models/Provider';
import { PurgedProviderQueue } from './PurgedProviderQueue';
import { Revert } from '../../../btc-runtime/runtime';

export class PriorityPurgedProviderQueue extends PurgedProviderQueue {
    public override add(provider: Provider): void {
        if (!provider.isInitialLiquidityProvider()) {
            this.ensureProviderNotAlreadyPurged(provider.isPurged());
            this.ensureProviderQueueIndexIsValid(provider.getQueueIndex());
            this.ensureProviderIsPriority(provider);

            provider.markPurged();

            const index: u32 = this.queue.push(provider.getQueueIndex(), false);

            provider.setPurgedIndex(index);
        }
    }

    private ensureProviderIsPriority(provider: Provider): void {
        if (!provider.isPriority()) {
            throw new Revert(
                `Impossible state: only priority provider can be in the priority provider purged queue.`,
            );
        }
    }
}
