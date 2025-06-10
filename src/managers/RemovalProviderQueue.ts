import { getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { Address, Blockchain, Potential, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { FulfilledProviderEvent } from '../events/FulfilledProviderEvent';
import { STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT } from '../constants/Contract';
import { IOwedBTCManager } from './interfaces/IOwedBTCManager';
import { ProviderTypes } from '../types/ProviderTypes';

export class RemovalProviderQueue extends ProviderQueue {
    private owedBTCManager: IOwedBTCManager;

    constructor(
        owedBTCManager: IOwedBTCManager,
        token: Address,
        pointer: u16,
        subPointer: Uint8Array,
        enableIndexVerification: boolean,
        maximumNumberOfProvider: u32,
    ) {
        super(token, pointer, subPointer, enableIndexVerification, maximumNumberOfProvider);
        this.owedBTCManager = owedBTCManager;
    }

    public override add(provider: Provider): u32 {
        this.ensureMaximumProviderCountNotReached(ProviderTypes.LiquidityRemoval);

        const index: u32 = this.queue.push(provider.getId(), true);
        provider.setQueueIndex(index);

        return index;
    }

    public override cleanUp(previousStartingIndex: u32): u32 {
        const length: u32 = this.length;
        let index: u32 = previousStartingIndex;

        while (index < length) {
            const providerId: u256 = this.queue.get_physical(index);

            if (!providerId.isZero()) {
                const provider: Provider = getProvider(providerId);

                if (provider.isPendingRemoval()) {
                    this.queue.setStartingIndex(index);
                    break;
                } else {
                    throw new Revert(
                        `Impossible state: provider no longer pending. Should have been removed from removal queue.`,
                    );
                }
            } else {
                this.queue.setStartingIndex(index);
            }

            index++;
        }

        return index === 0 ? index : index - 1;
    }

    public override resetProvider(
        provider: Provider,
        _burnRemainingFunds: boolean = true,
        _canceled: boolean = false,
    ): void {
        this.ensureProviderNotAlreadyPurged(provider);
        this.queue.delete_physical(provider.getQueueIndex());
        provider.resetLiquidityProviderValues();

        Blockchain.emit(new FulfilledProviderEvent(provider.getId(), false, true));
    }

    protected override tryNextCandidate(_currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const providerId: u256 = this.queue.get_physical(this._currentIndex);

        if (!providerId.isZero()) {
            const provider = getProvider(providerId);

            if (provider.isPendingRemoval() && provider.isLiquidityProvider()) {
                result = this.getProviderIfOwedSatoshis(providerId, provider);
            } else {
                this.resetProvider(provider);
            }
        }

        return result;
    }

    private ensureReservedSatoshisIsValid(
        reservedSatoshis: u64,
        owedSatoshis: u64,
        providerId: u256,
    ): void {
        if (reservedSatoshis > owedSatoshis) {
            throw new Revert(
                `Impossible state: Reserved satoshis is greater than owed satoshis. ProviderId: ${providerId}.`,
            );
        }
    }

    private getProviderIfOwedSatoshis(providerId: u256, provider: Provider): Provider | null {
        let result: Potential<Provider> = null;
        const owedSatoshis: u64 = this.owedBTCManager.getSatoshisOwed(providerId);
        const reservedSatoshis: u64 = this.owedBTCManager.getSatoshisOwedReserved(providerId);

        this.ensureReservedSatoshisIsValid(reservedSatoshis, owedSatoshis, providerId);

        const left = SafeMath.sub64(owedSatoshis, reservedSatoshis);

        if (left !== 0 && left >= STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT) {
            this.ensureProviderIsNotInPurgeQueue(provider);
            provider.markFromRemovalQueue();
            result = provider;
        } else if (reservedSatoshis === 0) {
            throw new Revert(
                `Impossible state: Provider should have been removed from removal queue. ProviderId: ${providerId}`,
            );
        }

        return result;
    }
}
