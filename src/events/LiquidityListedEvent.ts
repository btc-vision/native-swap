import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U32_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';

/**
 * Emitted on every successful `listLiquidity` (and on the initial-LP path inside `createPool`).
 *
 * Payload:
 *   - totalLiquidity : provider's total liquidity in token base units after this list/top-up
 *   - receiver       : the provider's CSV P2WSH receiver address (where buyers send sats)
 *   - tick           : the tick at which the listing sits — implies fillPrice via TickMath
 */
@final
export class LiquidityListedEvent extends NetEvent {
    constructor(totalLiquidity: u128, receiver: string, tick: i32) {
        const data: BytesWriter = new BytesWriter(
            U128_BYTE_LENGTH + U32_BYTE_LENGTH + receiver.length + U32_BYTE_LENGTH,
        );
        data.writeU128(totalLiquidity);
        data.writeStringWithLength(receiver);
        data.writeI32(tick);

        super('LiquidityListed', data);
    }
}
