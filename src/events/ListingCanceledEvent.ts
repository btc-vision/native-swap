import { BytesWriter, NetEvent, U128_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';

@final
export class ListingCanceledEvent extends NetEvent {
    constructor(amount: u128) {
        const data: BytesWriter = new BytesWriter(U128_BYTE_LENGTH);
        data.writeU128(amount);

        super('ListingCanceled', data);
    }
}
