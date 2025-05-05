import { SafeMath, StoredMapU256 } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum';
import { IOwedBTCManager } from './interfaces/IOwedBTCManager';
import { BTC_OWED_POINTER, BTC_OWED_RESERVED_POINTER } from '../constants/StoredPointers';

export class OwedBTCManager implements IOwedBTCManager {
    private readonly BTCowed: StoredMapU256;
    private readonly BTCowedReserved: StoredMapU256;

    constructor() {
        this.BTCowed = new StoredMapU256(BTC_OWED_POINTER);
        this.BTCowedReserved = new StoredMapU256(BTC_OWED_RESERVED_POINTER);
    }

    public getBTCowed(providerId: u256): u256 {
        return this.BTCowed.get(providerId);
    }

    public setBTCowed(providerId: u256, amount: u256): void {
        this.BTCowed.set(providerId, amount);
    }

    public getBTCowedReserved(providerId: u256): u256 {
        return this.BTCowedReserved.get(providerId);
    }

    public setBTCowedReserved(providerId: u256, amount: u256): void {
        this.BTCowedReserved.set(providerId, amount);
    }

    public getBTCOwedLeft(providerId: u256): u256 {
        return SafeMath.sub(this.getBTCowed(providerId), this.getBTCowedReserved(providerId));
    }
}
