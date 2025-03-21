import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class FulfilledProviderEvent extends NetEvent {
    constructor(providerId: u256) {
        const data: BytesWriter = new BytesWriter(32);
        data.writeU256(providerId);

        super('FulfilledProvider', data);
    }
}
