import { Revert } from '@btc-vision/btc-runtime/runtime';
import { Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';

export class PriorityProviderQueue extends ProviderQueue {
    public add(provider: Provider): u32 {
        this.ensureMaximumProviderCountNotReached(`priority`);

        const index: u32 = this.queue.push(provider.getId(), true);
        provider.setQueueIndex(index);

        return index;
    }

    protected override isEligible(provider: Provider): boolean {
        this.ensureIsPriority(provider);

        return provider.isActive();
    }

    private ensureIsPriority(provider: Provider): void {
        if (!provider.isPriority()) {
            throw new Revert(
                `Impossible state: Provider is not priority but is in priority queue. ProviderId: ${provider.getId()}`,
            );
        }
    }
}
