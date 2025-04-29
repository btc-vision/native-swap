import { SafeMath, StoredMapU256 } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum';

export class OwedBTCManager {
    private readonly BTCowed: StoredMapU256;
    private readonly BTCowedReserved: StoredMapU256;

    constructor(BTCOwedPointer: u16, BTCOwedReservedPointer: u16) {
        this.BTCowed = new StoredMapU256(BTCOwedPointer);
        this.BTCowedReserved = new StoredMapU256(BTCOwedReservedPointer);
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
