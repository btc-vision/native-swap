import { SafeMath, StoredMapU256 } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { IOwedBTCManager } from './interfaces/IOwedBTCManager';
import { BTC_OWED_POINTER, BTC_OWED_RESERVED_POINTER } from '../constants/StoredPointers';

export class OwedBTCManager implements IOwedBTCManager {
    private readonly SatoshisOwed: StoredMapU256;
    private readonly SatoshisOwedReserved: StoredMapU256;

    constructor() {
        this.SatoshisOwed = new StoredMapU256(BTC_OWED_POINTER);
        this.SatoshisOwedReserved = new StoredMapU256(BTC_OWED_RESERVED_POINTER);
    }

    /**
     * Retrieves the satoshis owed to a provider.
     * @param providerId  the provider’s id
     * @returns the total satoshis owed to that provider
     */
    public getSatoshisOwed(providerId: u256): u64 {
        return this.SatoshisOwed.get(providerId).toU64();
    }

    /**
     * Retrieves the satoshis owed reserved for a provider.
     * @param providerId  the provider’s id
     * @returns the satoshis amount that has been reserved for that provider
     */
    public getSatoshisOwedReserved(providerId: u256): u64 {
        return this.SatoshisOwedReserved.get(providerId).toU64();
    }

    /**
     * Gets the satoshis owed left for a provider.
     * @param providerId  the provider’s id
     * @returns the difference between owed and reserved satoshis
     */
    public getSatoshisOwedLeft(providerId: u256): u64 {
        return SafeMath.sub64(
            this.getSatoshisOwed(providerId),
            this.getSatoshisOwedReserved(providerId),
        );
    }

    /**
     * Sets the satoshis owed to a provider.
     * @param providerId  the provider’s id
     * @param amount the new owed amount
     */
    public setSatoshisOwed(providerId: u256, amount: u64): void {
        this.SatoshisOwed.set(providerId, u256.fromU64(amount));
    }

    /**
     * Sets the satoshis owed reserved for a provider.
     * @param providerId  the provider’s id
     * @param amount the new reserved amount
     */
    public setSatoshisOwedReserved(providerId: u256, amount: u64): void {
        this.SatoshisOwedReserved.set(providerId, u256.fromU64(amount));
    }
}
