import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

@final
export class ActivateProviderEvent extends NetEvent {
    constructor(providerId: u256, listingAmount: u128) {
        const data: BytesWriter = new BytesWriter(64);
        data.writeU256(providerId);
        data.writeU128(listingAmount);

        super('ActivateProvider', data);
    }
}
