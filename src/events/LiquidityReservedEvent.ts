import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityReservedEvent extends NetEvent {
    constructor(depositAddress: string, satoshisAmount: u64, tokenAmount: u128, providerId: u256) {
        const data: BytesWriter = new BytesWriter(
            U64_BYTE_LENGTH +
                U256_BYTE_LENGTH +
                depositAddress.length +
                U32_BYTE_LENGTH +
                U128_BYTE_LENGTH,
        );
        data.writeStringWithLength(depositAddress);
        data.writeU64(satoshisAmount);
        data.writeU256(providerId);
        data.writeU128(tokenAmount);

        super('LiquidityReserved', data);
    }
}
