import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';

const BPS_SCALE: u64 = 10_000;
const GRACE_PENALTY_BPS: u64 = 5_000;
const MAX_PENALTY_BPS: u64 = 9_000;
const two: u256 = u256.fromU64(2);

/**
 * Linear-piecewise, float-free slashing curve:
 *
 *   penalty = 50 %                        (δ < δ₀)
 *           = 50 % + (δ − δ₀) * 40 % / R  (δ ≥ δ₀, capped at 90 %)
 *
 * R = SLASH_RAMP_UP_BLOCKS  (14 days worth of blocks)
 */
// TODO use u128 instead?
export function slash(amount: u256, delta: u64, delta0: u64, rampUp: u64): u256 {
    if (delta < delta0) {
        return SafeMath.div(amount, two);
    }

    const d: u64 = delta - delta0;
    let penaltyBps: u64;

    if (d >= rampUp) {
        penaltyBps = MAX_PENALTY_BPS;
    } else {
        const incr: u64 = (4_000 * d) / rampUp;
        penaltyBps = GRACE_PENALTY_BPS + incr;
    }

    const num: u256 = SafeMath.mul(amount.toU256(), u256.fromU64(penaltyBps));
    return SafeMath.div(num, u256.fromU64(BPS_SCALE));
}
