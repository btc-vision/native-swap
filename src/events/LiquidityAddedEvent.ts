import {
    BytesWriter,
    NetEvent,
    U256_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum';

@final
export class LiquidityAddedEvent extends NetEvent {
    constructor(
        totalTokensContributed: u256,
        virtualTokenExchanged: u256,
        totalSatoshisSpent: u64,
    ) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 2 + U64_BYTE_LENGTH);
        data.writeU256(totalTokensContributed);
        data.writeU256(virtualTokenExchanged);
        data.writeU64(totalSatoshisSpent);

        super('LiquidityAdded', data);
    }
}
