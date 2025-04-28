import { Revert } from '@btc-vision/btc-runtime/runtime';
import { Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';

export class PriorityProviderQueue extends ProviderQueue {
    protected override isEligible(provider: Provider): boolean {
        if (!provider.isActive()) {
            return false;
        }

        if (!provider.isPriority()) {
            throw new Revert(
                `Impossible state: provider {provider.getId()} is not priority but is in priority queue.`,
            );
        }

        if (!provider.isReservedAmountValid()) {
            throw new Revert(
                `Impossible state: liquidity < reserved for provider ${provider.getId()}.`,
            );
        }

        return true;
    }
}
