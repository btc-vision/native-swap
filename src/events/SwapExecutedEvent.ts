import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
    U256_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum';

@final
export class SwapExecutedEvent extends NetEvent {
    constructor(buyer: Address, amountIn: u64, amountOut: u256) {
        const data: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH + U64_BYTE_LENGTH,
        );

        data.writeAddress(buyer);
        data.writeU64(amountIn);
        data.writeU256(amountOut);

        super('SwapExecuted', data);
    }
}
