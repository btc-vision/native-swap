import { BytesWriter, NetEvent, U256_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityAddedEvent extends NetEvent {
    constructor(
        totalTokensContributed: u256,
        virtualTokenExchanged: u256,
        totalSatoshisSpent: u256,
    ) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 3);
        data.writeU256(totalTokensContributed);
        data.writeU256(virtualTokenExchanged);
        data.writeU256(totalSatoshisSpent);

        super('LiquidityAdded', data);
    }
}
