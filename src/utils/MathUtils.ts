import { u128 } from '@btc-vision/as-bignum/assembly';

export function min64(a: u64, b: u64): u64 {
    return a < b ? a : b;
}

export function min128(a: u128, b: u128): u128 {
    return u128.lt(a, b) ? a : b;
}
