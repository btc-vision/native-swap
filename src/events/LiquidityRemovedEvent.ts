import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityRemovedEvent extends NetEvent {
    constructor(providerId: u256, SatoshisOwed: u64, tokenAmount: u128) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + U128_BYTE_LENGTH + U64_BYTE_LENGTH,
        );
        data.writeU256(providerId);
        data.writeU64(SatoshisOwed);
        data.writeU128(tokenAmount);

        super('LiquidityRemoved', data);
    }
}
