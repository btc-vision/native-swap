import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';

const LN2_SCALED = u256.fromU64(693147); // ln(2)*1e6
const SCALE = u256.fromU64(1_000_000);

export function min64(a: u64, b: u64): u64 {
    return a < b ? a : b;
}

export function min128(a: u128, b: u128): u128 {
    return u128.lt(a, b) ? a : b;
}

export function preciseLog(x: u256): u256 {
    if (x.isZero() || u256.eq(x, u256.One)) {
        return u256.Zero;
    }

    const bitLen = SafeMath.bitLength256(x);
    // Safety check. This condition should never be true
    if (bitLen <= 1) {
        return u256.Zero;
    }

    const k: u32 = bitLen - 1;

    // Base: k * ln(2)
    const base = SafeMath.mul(u256.fromU32(k), LN2_SCALED);

    // Normalize x to range [1, 2) by dividing by 2^k
    const pow2k = SafeMath.shl(u256.One, <i32>k);

    // r = x/2^k - 1 (will be in range [0, 1))
    const xScaled = SafeMath.mul(x, SCALE);
    const rScaled = SafeMath.sub(SafeMath.div(xScaled, pow2k), SCALE);

    // Calculate ln(1+r) using Taylor series
    const taylor = calculateTaylorSeries(rScaled, SCALE);

    return SafeMath.add(base, taylor);
}

export function calculateTaylorSeries(rScaled: u256, scale: u256): u256 {
    // Taylor series: ln(1+r) ≈ r - r²/2 + r³/3 - r⁴/4 + r⁵/5
    // Using 5 terms for better precision

    // r² (scaled down once)
    const r2 = SafeMath.div(SafeMath.mul(rScaled, rScaled), scale);

    // r³ (scaled down twice)
    const r3 = SafeMath.div(SafeMath.mul(r2, rScaled), scale);

    // r⁴ (scaled down three times)
    const r4 = SafeMath.div(SafeMath.mul(r3, rScaled), scale);

    // r⁵ (scaled down four times)
    const r5 = SafeMath.div(SafeMath.mul(r4, rScaled), scale);

    // ln(1+r) ≈ r - r²/2 + r³/3 - r⁴/4 + r⁵/5
    let taylor = rScaled;
    taylor = SafeMath.sub(taylor, SafeMath.div(r2, u256.fromU32(2)));
    taylor = SafeMath.add(taylor, SafeMath.div(r3, u256.fromU32(3)));
    taylor = SafeMath.sub(taylor, SafeMath.div(r4, u256.fromU32(4)));
    taylor = SafeMath.add(taylor, SafeMath.div(r5, u256.fromU32(5)));

    return taylor;
}
