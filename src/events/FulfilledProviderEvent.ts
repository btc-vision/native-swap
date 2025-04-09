import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class FulfilledProviderEvent extends NetEvent {
    constructor(providerId: u256, canceled: boolean, removalCompleted: boolean) {
        const data: BytesWriter = new BytesWriter(33);
        data.writeU256(providerId);
        data.writeBoolean(canceled);
        data.writeBoolean(removalCompleted);

        super('FulfilledProvider', data);
    }
}
