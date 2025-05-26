import { u256 } from '@btc-vision/as-bignum/assembly';

export interface IOwedBTCManager {
    /**
     * Retrieves the satoshis owed to a provider.
     * @param providerId  the provider’s id
     * @returns the total satoshis owed to that provider
     */
    getSatoshisOwed(providerId: u256): u64;

    /**
     * Sets the satoshis owed to a provider.
     * @param providerId  the provider’s id
     * @param amount the new owed amount
     */
    setSatoshisOwed(providerId: u256, amount: u64): void;

    /**
     * Retrieves the satoshis owed reserved for a provider.
     * @param providerId  the provider’s id
     * @returns the satoshis amount that has been reserved for that provider
     */
    getSatoshisOwedReserved(providerId: u256): u64;

    /**
     * Sets the satoshis owed reserved for a provider.
     * @param providerId  the provider’s id
     * @param amount the new reserved amount
     */
    setSatoshisOwedReserved(providerId: u256, amount: u64): void;

    /**
     * Gets the satoshis owed left for a provider.
     * @param providerId  the provider’s id
     * @returns the difference between owed and reserved satoshis
     */
    getSatoshisOwedLeft(providerId: u256): u64;
}
