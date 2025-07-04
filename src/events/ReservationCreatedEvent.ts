import {
    BytesWriter,
    NetEvent,
    U256_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class ReservationCreatedEvent extends NetEvent {
    constructor(expectedAmountOut: u256, totalSatoshis: u64) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH + U64_BYTE_LENGTH);
        data.writeU256(expectedAmountOut);
        data.writeU64(totalSatoshis);

        super('ReservationCreated', data);
    }
}
