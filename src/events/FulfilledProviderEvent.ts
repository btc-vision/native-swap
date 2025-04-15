import { BytesWriter, NetEvent, U256_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class FulfilledProviderEvent extends NetEvent {
    constructor(providerId: u256, canceled: boolean, removalCompleted: boolean) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH + 2);
        data.writeU256(providerId);
        data.writeBoolean(canceled);
        data.writeBoolean(removalCompleted);

        super('FulfilledProvider', data);
    }
}
