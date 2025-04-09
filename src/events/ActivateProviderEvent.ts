import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

@final
export class ActivateProviderEvent extends NetEvent {
    constructor(providerId: u256, listingAmount: u128, btcToRemove: u128) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH + 2 * U128_BYTE_LENGTH);
        data.writeU256(providerId);
        data.writeU128(listingAmount);
        data.writeU128(btcToRemove);

        super('ActivateProvider', data);
    }
}
