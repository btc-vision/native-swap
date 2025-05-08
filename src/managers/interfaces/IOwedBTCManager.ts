import { u256 } from '@btc-vision/as-bignum/assembly';

export interface IOwedBTCManager {
    /**
     * Retrieves the BTC owed to a provider.
     * @param providerId  the provider’s id
     * @returns the total BTC owed to that provider
     */
    getBTCowed(providerId: u256): u64;

    /**
     * Sets the BTC owed to a provider.
     * @param providerId  the provider’s id
     * @param amount the new owed amount
     */
    setBTCowed(providerId: u256, amount: u64): void;

    /**
     * Retrieves the BTC owed reserved for a provider.
     * @param providerId  the provider’s id
     * @returns the BTC amount that has been reserved for that provider
     */
    getBTCowedReserved(providerId: u256): u64;

    /**
     * Sets the BTC owed reserved for a provider.
     * @param providerId  the provider’s id
     * @param amount the new reserved amount
     */
    setBTCowedReserved(providerId: u256, amount: u64): void;

    /**
     * Gets the BTC owed left for a provider.
     * @param providerId  the provider’s id
     * @returns the difference between owed and reserved BTC
     */
    getBTCOwedLeft(providerId: u256): u64;
}
