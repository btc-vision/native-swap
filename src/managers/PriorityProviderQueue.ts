import { Revert } from '@btc-vision/btc-runtime/runtime';
import { Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { ProviderTypes } from '../types/ProviderTypes';

export class PriorityProviderQueue extends ProviderQueue {
    public add(provider: Provider): u32 {
        this.ensureMaximumProviderCountNotReached(ProviderTypes.Priority);

        const index: u32 = this.queue.push(provider.getId(), true);
        provider.setQueueIndex(index);

        return index;
    }

    protected override isEligible(provider: Provider): boolean {
        const isActive: boolean = provider.isActive();

        if (isActive) {
            this.ensureIsPriority(provider);
            this.ensureProviderLiquidityIsValid(provider);
        }

        return isActive;
    }

    private ensureIsPriority(provider: Provider): void {
        if (!provider.isPriority()) {
            throw new Revert(
                `Impossible state: Provider is not priority but is in priority queue. ProviderId: ${provider.getId()}`,
            );
        }
    }
}
