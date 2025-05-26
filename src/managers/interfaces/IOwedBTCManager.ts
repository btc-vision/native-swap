import { u256 } from '@btc-vision/as-bignum/assembly';

export interface IOwedBTCManager {
    getSatoshisOwed(providerId: u256): u64;

    getSatoshisOwedLeft(providerId: u256): u64;

    getSatoshisOwedReserved(providerId: u256): u64;

    setSatoshisOwed(providerId: u256, amount: u64): void;

    setSatoshisOwedReserved(providerId: u256, amount: u64): void;
}
