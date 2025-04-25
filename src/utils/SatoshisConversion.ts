import { u256 } from '@btc-vision/as-bignum';
import { SafeMath } from '../../../btc-runtime/runtime';
import { QUOTE_SCALE } from '../constants/Contract';

export function tokensToSatoshis(tokenAmount: u256, scaledPrice: u256): u256 {
    return SafeMath.div(
        SafeMath.mul(SafeMath.add(tokenAmount, u256.One), QUOTE_SCALE), // We have to do plus one here due to the round down
        scaledPrice,
    );
}

export function satoshisToTokens(satoshis: u256, scaledPrice: u256): u256 {
    return SafeMath.div(SafeMath.mul(satoshis, scaledPrice), QUOTE_SCALE);
}
