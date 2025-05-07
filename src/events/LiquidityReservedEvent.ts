import {
    BytesWriter,
    NetEvent,
    U16_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum';

@final
export class LiquidityReservedEvent extends NetEvent {
    constructor(depositAddress: string, amount: u64, providerId: u256) {
        const data: BytesWriter = new BytesWriter(
            U64_BYTE_LENGTH + U256_BYTE_LENGTH + depositAddress.length + U16_BYTE_LENGTH,
        );
        data.writeStringWithLength(depositAddress);
        data.writeU64(amount);
        data.writeU256(providerId);

        super('LiquidityReserved', data);
    }
}
