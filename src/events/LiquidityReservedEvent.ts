import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

/**
 * Emitted once per provider entry inside a reservation walk. Carries the FROZEN
 * per-provider price quote — buyers and indexers use this to know exact fill cost.
 *
 * Payload:
 *   - depositAddress  : provider's CSV P2WSH receiver (where buyer sends sats)
 *   - satoshisAmount  : sats this entry costs the buyer
 *   - tokenAmount     : token base units reserved from this provider
 *   - providerId      : direct u256 provider identifier
 *   - tick            : the tick at fill time (implies fillPrice)
 *   - fillPrice       : Q40.88 sats per base unit, frozen at reservation time
 */
@final
export class LiquidityReservedEvent extends NetEvent {
    constructor(
        depositAddress: string,
        satoshisAmount: u64,
        tokenAmount: u128,
        providerId: u256,
        tick: i32,
        fillPrice: u128,
    ) {
        const data: BytesWriter = new BytesWriter(
            U32_BYTE_LENGTH +
                depositAddress.length +
                U64_BYTE_LENGTH +
                U256_BYTE_LENGTH +
                U128_BYTE_LENGTH +
                U32_BYTE_LENGTH +
                U128_BYTE_LENGTH,
        );
        data.writeStringWithLength(depositAddress);
        data.writeU64(satoshisAmount);
        data.writeU256(providerId);
        data.writeU128(tokenAmount);
        data.writeI32(tick);
        data.writeU128(fillPrice);

        super('LiquidityReserved', data);
    }
}
