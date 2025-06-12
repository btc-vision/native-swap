import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';

@final
export class ListingCanceledEvent extends NetEvent {
    constructor(amount: u128, penality: u128) {
        const data: BytesWriter = new BytesWriter(32);
        data.writeU128(amount);
        data.writeU128(penality);

        super('ListingCanceled', data);
    }
}
