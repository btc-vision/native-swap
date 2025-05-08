import { getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { Address, Blockchain, Potential, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { FulfilledProviderEvent } from '../events/FulfilledProviderEvent';
import { STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT } from '../constants/Contract';
import { IOwedBTCManager } from './interfaces/IOwedBTCManager';

export class RemovalProviderQueue extends ProviderQueue {
    private owedBTCManager: IOwedBTCManager;

    constructor(
        owedBTCManager: IOwedBTCManager,
        token: Address,
        pointer: u16,
        subPointer: Uint8Array,
    ) {
        super(token, pointer, subPointer);
        this.owedBTCManager = owedBTCManager;
    }

    public override add(provider: Provider): u64 {
        this.queue.push(provider.getId(), true);

        const index: u64 = this.queue.getLength() - 1;
        provider.setRemovalQueueIndex(index);

        return index;
    }

    public override cleanUp(previousStartingIndex: u64): u64 {
        const length: u64 = this.length;
        let index: u64 = previousStartingIndex;

        while (index < length) {
            const providerId: u256 = this.queue.get_physical(index);

            if (!providerId.isZero()) {
                const provider: Provider = getProvider(providerId);

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

    public removeFromQueue(provider: Provider): void {
        this.queue.delete_physical(provider.getRemovalQueueIndex());

        provider.clearPendingRemoval();
        provider.clearLiquidityProvider();

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), false, true));
    }

    public override resetProvider(
        _provider: Provider,
        _burnRemainingFunds: boolean = true,
        _canceled: boolean = false,
    ): void {
        throw new Revert('Impossible state: removal provider cannot be reset.');
    }

    protected tryNextCandidate(_currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const providerId: u256 = this.queue.get_physical(this._currentIndex);

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
        const owedBTC: u64 = this.owedBTCManager.getBTCowed(providerId);
        const reservedBTC: u64 = this.owedBTCManager.getBTCowedReserved(providerId);

        this.ensureReservedBTCIsValid(reservedBTC, owedBTC);

        const left = SafeMath.sub64(owedBTC, reservedBTC);

        if (left !== 0 && left >= STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT) {
            provider.markFromRemovalQueue();
            result = provider;
        } else {
            this.ensureOwedAboveMinimum(owedBTC);
        }

        return result;
    }

    private ensureOwedAboveMinimum(owedBTC: u64): void {
        if (owedBTC < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT) {
            throw new Revert(
                `Impossible state: Provider should have been removed from queue during swap operation.`,
            );
        }
    }

    private ensureReservedBTCIsValid(reservedBTC: u64, owedBTC: u64): void {
        if (reservedBTC > owedBTC) {
            throw new Revert(`Impossible state: reservedBTC cannot be > owedBTC.`);
        }
    }
}
