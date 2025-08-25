import {
    BOOLEAN_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class ProviderFulfilledEvent extends NetEvent {
    constructor(
        providerId: u256,
        canceled: boolean,
        removalCompleted: boolean,
        stakedAmount: u256,
    ) {
        const data: BytesWriter = new BytesWriter(2 * U256_BYTE_LENGTH + 2 * BOOLEAN_BYTE_LENGTH);
        data.writeU256(providerId);
        data.writeBoolean(canceled);
        data.writeBoolean(removalCompleted);
        data.writeU256(stakedAmount);

        super('ProviderFulfilled', data);
    }
}
