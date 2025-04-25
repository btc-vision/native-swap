import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U16_BYTE_LENGTH,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityReservedEvent extends NetEvent {
    constructor(depositAddress: string, amount: u128, providerId: u256) {
        const data: BytesWriter = new BytesWriter(
            U128_BYTE_LENGTH + U256_BYTE_LENGTH + depositAddress.length + U16_BYTE_LENGTH,
        );
        data.writeStringWithLength(depositAddress);
        data.writeU128(amount);
        data.writeU256(providerId);

        super('LiquidityReserved', data);
    }
}
