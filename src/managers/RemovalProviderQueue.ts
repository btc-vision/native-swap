import { getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { u256 } from '@btc-vision/as-bignum';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { FulfilledProviderEvent } from '../events/FulfilledProviderEvent';

export class RemovalProviderQueue extends ProviderQueue {
    public override cleanUp(previousStartingIndex: u64): u64 {
        const length: u64 = this.length;
        let index: u64 = previousStartingIndex;

        while (index < length) {
            const providerId = this.queue.get_physical(index);
            if (providerId !== u256.Zero) {
                const provider = getProvider(providerId);
                if (provider.isPendingRemoval()) {
                    this.queue.setStartingIndex(index);
                    break;
                } else {
                    this.queue.delete_physical(index);
                }
            }

            index++;
        }

        return index;
    }

    protected tryNextCandidate(currentQuote: u256): Provider | null {
        const providerId = this.queue.get_physical(this._currentIndex);

        if (providerId === u256.Zero) {
            return null;
        }

        const provider = getProvider(providerId);
        if (provider.isPendingRemoval() && provider.isLiquidityProvider()) {
        } else {
            this.removeFromQueue(provider);
        }
    }

    private removeFromQueue(provider: Provider): void {
        this.queue.delete_physical(provider.getQueueIndex());

        provider.clearPendingRemoval();
        provider.clearLiquidityProvider();

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), false, true));
    }
}
