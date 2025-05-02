import { Revert } from '@btc-vision/btc-runtime/runtime';
import { Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';

export class PriorityProviderQueue extends ProviderQueue {
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
