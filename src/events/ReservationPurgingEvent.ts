import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U32_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';

@final
export class ReservationPurgingEvent extends NetEvent {
    constructor(reservationId: u128, purgeIndex: u32, purgeQueueLength: u32) {
        const data: BytesWriter = new BytesWriter(U128_BYTE_LENGTH + 2 * U32_BYTE_LENGTH);

        data.writeU128(reservationId);
        data.writeU32(purgeIndex);
        data.writeU32(purgeQueueLength);

        super('ReservationPurging', data);
    }
}
