import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U32_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

/**
 * Emitted when a provider moves their listing to a new tick via `updateListing`.
 * `latestReservedUntilBlock` and `liquidityAmount` are preserved across the move.
 */
@final
export class ListingUpdatedEvent extends NetEvent {
    constructor(providerId: u256, oldTick: i32, newTick: i32, liquidityAmount: u128) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + U32_BYTE_LENGTH + U32_BYTE_LENGTH + U128_BYTE_LENGTH,
        );
        data.writeU256(providerId);
        data.writeI32(oldTick);
        data.writeI32(newTick);
        data.writeU128(liquidityAmount);

        super('ListingUpdated', data);
    }
}
