import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { Reservation } from '../models/Reservation';

@final
export class ReservationFallbackEvent extends NetEvent {
    constructor(reservation: Reservation) {
        const data: BytesWriter = new BytesWriter(U128_BYTE_LENGTH + U64_BYTE_LENGTH);
        data.writeU128(reservation.getId());
        data.writeU64(reservation.getExpirationBlock());

        super('ReservationFallback', data);
    }
}
