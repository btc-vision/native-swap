import { BytesWriter, NetEvent, U128_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';

@final
export class ListingCanceledEvent extends NetEvent {
    constructor(amount: u128, penalty: u128) {
        const data: BytesWriter = new BytesWriter(2 * U128_BYTE_LENGTH);
        data.writeU128(amount);
        data.writeU128(penalty);

        super('ListingCanceled', data);
    }
}
