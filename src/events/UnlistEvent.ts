import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final

//!!! Not used????
export class UnlistEvent extends NetEvent {
    constructor(token: Address, amount: u256, remainingLiquidity: u256) {
        const data = new BytesWriter(ADDRESS_BYTE_LENGTH + 2 * U256_BYTE_LENGTH);
        data.writeAddress(token);
        data.writeU256(amount);
        data.writeU256(remainingLiquidity);

        super('Unlist', data);
    }
}
