import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

@final
export class WithdrawListingEvent extends NetEvent {
    constructor(amount: u128, tokenAddress: Address, providerId: u256, sender: Address) {
        const data: BytesWriter = new BytesWriter(
            U128_BYTE_LENGTH + 2 * ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH,
        );
        data.writeU128(amount);
        data.writeAddress(tokenAddress);
        data.writeU256(providerId);
        data.writeAddress(sender);

        super('WithdrawListing', data);
    }
}
