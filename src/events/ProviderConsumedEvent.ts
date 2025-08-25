import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

@final
export class ProviderConsumedEvent extends NetEvent {
    constructor(providerId: u256, amountUsed: u128) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH + U128_BYTE_LENGTH);
        data.writeU256(providerId);
        data.writeU128(amountUsed);

        super('ProviderConsumed', data);
    }
}
