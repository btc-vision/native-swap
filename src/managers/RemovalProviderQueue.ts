import { getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { u256 } from '@btc-vision/as-bignum';
import { Address, Blockchain, Potential, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { FulfilledProviderEvent } from '../events/FulfilledProviderEvent';
import { OwedBTCManager } from './OwedBTCManager';
import { STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT } from '../constants/Contract';

export class RemovalProviderQueue extends ProviderQueue {
    private owedBTCManager: OwedBTCManager;

    constructor(
        owedBTCManager: OwedBTCManager,
        token: Address,
        pointer: u16,
        subPointer: Uint8Array,
    ) {
        super(token, pointer, subPointer);
        this.owedBTCManager = owedBTCManager;
    }

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

    protected tryNextCandidate(_currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const providerId = this.queue.get_physical(this._currentIndex);

        if (providerId !== u256.Zero) {
            const provider = getProvider(providerId);

            if (provider.isPendingRemoval() && provider.isLiquidityProvider()) {
                result = this.getProviderIfOwedBTC(providerId, provider);
            } else {
                this.removeFromQueue(provider);
            }
        }

        return result;
    }

    private getProviderIfOwedBTC(providerId: u256, provider: Provider): Provider | null {
        let result: Potential<Provider> = null;
        
        const owedBTC = this.owedBTCManager.getBTCowed(providerId);
        const reservedBTC = this.owedBTCManager.getBTCowedReserved(providerId);

        this.ensureReservedBTCValid(reservedBTC, owedBTC);

        const left = SafeMath.sub(owedBTC, reservedBTC);

        if (!left.isZero() && u256.ge(left, STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)) {
            provider.markFromRemovalQueue();
            result = provider;
        } else {
            if (u256.lt(owedBTC, STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)) {
                throw new Revert(
                    `Impossible state: Provider should have been removed from queue during swap operation.`,
                );
            }
        }
        return result;
    }

    private removeFromQueue(provider: Provider): void {
        this.queue.delete_physical(provider.getQueueIndex());

        provider.clearPendingRemoval();
        provider.clearLiquidityProvider();

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), false, true));
    }

    private ensureReservedBTCValid(reservedBTC: u256, owedBTC: u256): void {
        if (u256.gt(reservedBTC, owedBTC)) {
            throw new Revert(`Impossible state: reservedBTC cannot be > owedBTC.`);
        }
    }
}
