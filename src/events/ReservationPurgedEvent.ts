import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';

@final
export class ReservationPurgedEvent extends NetEvent {
    constructor(
        reservationId: u128,
        purgeIndex: u32,
        currentBlock: u64,
        purgingBlock: u64,
        providerCount: u32,
    ) {
        const data: BytesWriter = new BytesWriter(
            U128_BYTE_LENGTH + 2 * U32_BYTE_LENGTH + 2 * U64_BYTE_LENGTH,
        );

        data.writeU128(reservationId);
        data.writeU64(currentBlock);
        data.writeU64(purgingBlock);
        data.writeU32(purgeIndex);
        data.writeU32(providerCount);

        super('ReservationPurged', data);
    }
}
