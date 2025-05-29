import { Revert } from '@btc-vision/btc-runtime/runtime';
import { Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { MAXIMUM_NUMBER_OF_PROVIDERS } from '../constants/Contract';

export class PriorityProviderQueue extends ProviderQueue {
    public add(provider: Provider): u32 {
        if (this.queue.getLength() === MAXIMUM_NUMBER_OF_PROVIDERS) {
            throw new Revert(
                `Impossible state: maximum number of providers reached for priority queue.`,
            );
        }

        const index: u32 = this.queue.push(provider.getId(), true);
        provider.setQueueIndex(index);

        return index;
    }

    protected override isEligible(provider: Provider): boolean {
        let result: boolean = false;

        if (provider.isActive()) {
            this.ensureIsPriority(provider);

            result = true;
        }

        return result;
    }

    private ensureIsPriority(provider: Provider): void {
        if (!provider.isPriority()) {
            throw new Revert(
                `Impossible state: provider ${provider.getId()} is not priority but is in priority queue.`,
            );
        }
    }
}
