import { getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { Address, Blockchain, Potential, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { FulfilledProviderEvent } from '../events/FulfilledProviderEvent';
import {
    INDEX_NOT_SET_VALUE,
    MAXIMUM_PROVIDER_COUNT,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';
import { IOwedBTCManager } from './interfaces/IOwedBTCManager';

export class RemovalProviderQueue extends ProviderQueue {
    private owedBTCManager: IOwedBTCManager;

    constructor(
        owedBTCManager: IOwedBTCManager,
        token: Address,
        pointer: u16,
        subPointer: Uint8Array,
        enableIndexVerification: boolean,
    ) {
        super(token, pointer, subPointer, enableIndexVerification);
        this.owedBTCManager = owedBTCManager;
    }

    public override add(provider: Provider): u32 {
        if (this.queue.getLength() === MAXIMUM_PROVIDER_COUNT) {
            throw new Revert('Impossible state: Too many providers required for reservation.');
        }

        const index: u32 = this.queue.push(provider.getId(), true);
        provider.setRemovalQueueIndex(index);

        return index;
    }

    public override cleanUp(previousStartingIndex: u32): u32 {
        const length: u32 = this.length;
        let index: u32 = previousStartingIndex;

        while (index < length) {
            const providerId: u256 = this.queue.get_physical(index);

            if (!providerId.isZero()) {
                const provider: Provider = getProvider(providerId);

                //!!! When this will happen a non pending???
                if (provider.isPendingRemoval()) {
                    this.queue.setStartingIndex(index);
                    break;
                } else {
                    this.ensureProviderNotAlreadyPurged(provider.isRemovalPurged());
                    this.queue.delete_physical(index); //!!! WHY should never happen
                }
            } else {
                this.queue.setStartingIndex(index);
            }

            index++;
        }

        return index === 0 ? index : index - 1; //!!!! Same as other???
    }

    public removeFromQueue(provider: Provider): void {
        this.ensureProviderNotAlreadyPurged(provider.isRemovalPurged());
        this.queue.delete_physical(provider.getRemovalQueueIndex());

        provider.clearPendingRemoval();
        provider.clearLiquidityProvider();
        provider.setRemovalQueueIndex(INDEX_NOT_SET_VALUE); //!!!!
        provider.clearFromRemovalQueue(); //!!!!
        //!!!! what else to do
        //!!!!purgedIndex, purged????

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
        this.ensureProviderIdIsValid(providerId);

        const provider = getProvider(providerId);

        if (provider.isPendingRemoval() && provider.isLiquidityProvider()) {
            result = this.getProviderIfOwedBTC(providerId, provider);
        } else {
            this.removeFromQueue(provider); //!!! This should not happen???
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

    private getProviderIfOwedBTC(providerId: u256, provider: Provider): Provider | null {
        let result: Potential<Provider> = null;
        const owedBTC: u64 = this.owedBTCManager.getSatoshisOwed(providerId);
        const reservedBTC: u64 = this.owedBTCManager.getSatoshisOwedReserved(providerId);

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
}
