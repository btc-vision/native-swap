import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityReservedEvent extends NetEvent {
    constructor(depositAddress: string, amount: u128, providerId: u256) {
        const data: BytesWriter = new BytesWriter(48 + depositAddress.length + 2);
        data.writeStringWithLength(depositAddress);
        data.writeU128(amount);
        data.writeU256(providerId);

        super('LiquidityReserved', data);
    }
}
