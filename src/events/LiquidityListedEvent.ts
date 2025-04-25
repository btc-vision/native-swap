import {
    BytesWriter,
    NetEvent,
    U128_BYTE_LENGTH,
    U16_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityListedEvent extends NetEvent {
    constructor(totalLiquidity: u128, provider: string) {
        const data: BytesWriter = new BytesWriter(
            U128_BYTE_LENGTH + U16_BYTE_LENGTH + provider.length,
        );
        data.writeU128(totalLiquidity);
        data.writeStringWithLength(provider); // Write provider as string

        super('LiquidityListed', data);
    }
}
