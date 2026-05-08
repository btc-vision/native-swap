import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U32_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';

/**
 * Emitted when `createPool` succeeds. One per pool, ever (pools are one-time-per-token).
 *
 * Payload:
 *   - token            : the OP20 token this pool is for
 *   - creator          : the EOA that called createPool (also the original LP if initialLiquidity > 0)
 *   - initialLiquidity : 0 if no bootstrap, else token base units listed by the creator at initialTick
 *   - initialTick      : tick chosen by the creator (only meaningful when initialLiquidity > 0)
 */
@final
export class PoolCreatedEvent extends NetEvent {
    constructor(token: Address, creator: Address, initialLiquidity: u128, initialTick: i32) {
        const data: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH * 2 + U128_BYTE_LENGTH + U32_BYTE_LENGTH,
        );
        data.writeAddress(token);
        data.writeAddress(creator);
        data.writeU128(initialLiquidity);
        data.writeI32(initialTick);

        super('PoolCreated', data);
    }
}
