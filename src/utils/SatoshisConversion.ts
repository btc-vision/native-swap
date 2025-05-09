import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '../../../btc-runtime/runtime';
import { MAX_TOTAL_SATOSHIS, QUOTE_SCALE } from '../constants/Contract';
import { Revert } from '@btc-vision/btc-runtime/runtime';

export class CappedTokensResult {
    public tokens: u128 = u128.Zero;
    public satoshis: u64 = 0;
    public isCapped: boolean = false;
}

export function tokensToSatoshis(tokenAmount: u256, scaledPrice: u256): u64 {
    const satoshis = SafeMath.div(
        SafeMath.mul(SafeMath.add(tokenAmount, u256.One), QUOTE_SCALE), // We have to do plus one here due to the round down
        scaledPrice,
    );

    if (satoshis > MAX_TOTAL_SATOSHIS) {
        throw new Revert(`Impossible state: The total number of satoshis is out of range.`);
    }

    return satoshis.toU64();
}

export function tokensToSatoshis128(tokenAmount: u128, scaledPrice: u256): u64 {
    return tokensToSatoshis(tokenAmount.toU256(), scaledPrice);
}

export function satoshisToTokens(satoshis: u64, scaledPrice: u256): u256 {
    return SafeMath.div(SafeMath.mul(u256.fromU64(satoshis), scaledPrice), QUOTE_SCALE);
}

export function satoshisToTokens128(
    satoshis: u64,
    scaledPrice: u256,
    throwOnOverflow: boolean = false,
): CappedTokensResult {
    const tokens: u256 = SafeMath.div(
        SafeMath.mul(u256.fromU64(satoshis), scaledPrice),
        QUOTE_SCALE,
    );

    const result: CappedTokensResult = new CappedTokensResult();

    if (u256.gt(tokens, u128.Max.toU256())) {
        if (throwOnOverflow) {
            throw new Revert(`Impossible state: The total number of tokens is out of range.`);
        }

        result.tokens = u128.Max;
        result.satoshis = tokensToSatoshis128(result.tokens, scaledPrice);
        result.isCapped = true;
    } else {
        result.tokens = tokens.toU128();
        result.satoshis = satoshis;
    }

    return result;
}

export function capTokensU256ToU128(
    tokensIn: u256,
    satoshisIn: u64,
    scaledPrice: u256,
): CappedTokensResult {
    const result: CappedTokensResult = new CappedTokensResult();

    if (!tokensIn.isZero()) {
        const u128Max256: u256 = u128.Max.toU256();
        if (u256.gt(tokensIn, u128Max256)) {
            result.tokens = u128.Max;
            result.satoshis = tokensToSatoshis(u128Max256, scaledPrice);
        } else {
            result.tokens = tokensIn.toU128();
            result.satoshis = satoshisIn;
        }
    }

    return result;
}
