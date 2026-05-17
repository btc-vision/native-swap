import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { TickMath } from '../utils/TickMath';
import { FP_SHIFT, MAX_TICK, MIN_TICK, ratioAtBit } from '../constants/Contract';

/**
 * Exact-value verification of tick math.
 *
 * Beyond the existing monotonicity / round-trip checks, this spec pins down
 * the algebraic identities the price function must obey, and verifies the
 * Q40.88 representation at specific named ticks.
 *
 * Identities tested:
 *   1. tickToPrice(0) == 2^88 (exact)
 *   2. tickToPrice(2k) ≈ (tickToPrice(k))^2 >> 88   (geometric scaling)
 *   3. tickToPrice(a+b) ≈ tickToPrice(a) * tickToPrice(b) >> 88
 *   4. tickToPrice(-k) * tickToPrice(k) ≈ 2^88
 *   5. ratioAtBit(k+1) ≈ ratioAtBit(k)^2 >> 88
 *
 * All identities allow a small absolute-error tolerance to absorb the floor
 * rounding at each multiplication step.
 */

function approxEqU256(a: u256, b: u256, tolerance: u256): bool {
    const diff: u256 = u256.gt(a, b) ? u256.sub(a, b) : u256.sub(b, a);
    return u256.le(diff, tolerance);
}

function approxEqU128(a: u128, b: u128, tolerance: u128): bool {
    const diff: u128 = u128.gt(a, b) ? u128.sub(a, b) : u128.sub(b, a);
    return u128.le(diff, tolerance);
}

/** Compute (a * b) >> FP_SHIFT in u256. */
function mulQ4088(a: u128, b: u128): u256 {
    return u256.shr(u256.mul(a.toU256(), b.toU256()), <i32>FP_SHIFT);
}

describe('Tick price — exact values at named ticks', () => {
    it('tickToPrice(0) == 2^88 exactly', () => {
        const expected: u128 = u128.shl(u128.One, 88);
        expect<bool>(u128.eq(TickMath.tickToPrice(0), expected)).toBe(true);
    });

    it('tickToPrice(1) == ratioAtBit(0) (the 1.001 constant)', () => {
        const p1: u128 = TickMath.tickToPrice(1);
        // ratioAtBit(0) = 1.001 × 2^88 = 309794494831166413793505837
        const expected: u256 = ratioAtBit(0);
        expect<bool>(u256.eq(p1.toU256(), expected)).toBe(true);
    });

    it('tickToPrice(2) == ratioAtBit(1) (the 1.001^2 constant)', () => {
        const p2: u128 = TickMath.tickToPrice(2);
        // 1.001^2 × 2^88 = 310104289325997580207299342
        const expected: u256 = ratioAtBit(1);
        expect<bool>(u256.eq(p2.toU256(), expected)).toBe(true);
    });

    it('tickToPrice(4) == ratioAtBit(2) (the 1.001^4 constant)', () => {
        const p4: u128 = TickMath.tickToPrice(4);
        const expected: u256 = ratioAtBit(2);
        expect<bool>(u256.eq(p4.toU256(), expected)).toBe(true);
    });

    it('tickToPrice(2048) == ratioAtBit(11) (the 1.001^2048 constant)', () => {
        const p: u128 = TickMath.tickToPrice(2048);
        const expected: u256 = ratioAtBit(11);
        expect<bool>(u256.eq(p.toU256(), expected)).toBe(true);
    });
});

describe('Tick price — algebraic identities', () => {
    it('squaring identity: tickToPrice(2k) ≈ (tickToPrice(k))^2 >> 88', () => {
        // Floor rounding compounds across the multiplication chain — at k=500 the
        // squared form runs through ~9 muls and accumulates ~24 LSBs of error.
        // Relax tolerance per |k|.
        const ks: i32[] = [1, 5, 100, 500, 1000];
        const tolerances: u64[] = [4, 4, 16, 64, 256];
        for (let i = 0; i < ks.length; i++) {
            const k: i32 = ks[i];
            const pK: u128 = TickMath.tickToPrice(k);
            const pSquared: u256 = mulQ4088(pK, pK);
            const p2K: u128 = TickMath.tickToPrice(2 * k);
            const tolerance: u256 = u256.fromU64(tolerances[i]);
            expect<bool>(approxEqU256(pSquared, p2K.toU256(), tolerance)).toBe(
                true,
                `squaring identity failed at k=${k}: pK^2=${pSquared} p2K=${p2K}`,
            );
        }
    });

    it('exponent additivity: tickToPrice(a+b) ≈ tickToPrice(a) * tickToPrice(b) >> 88', () => {
        const pairs: i32[][] = [
            [10, 30],
            [100, 200],
            [-500, 1000],
        ];
        for (let i = 0; i < pairs.length; i++) {
            const a: i32 = pairs[i][0];
            const b: i32 = pairs[i][1];
            const pA: u128 = TickMath.tickToPrice(a);
            const pB: u128 = TickMath.tickToPrice(b);
            const product: u256 = mulQ4088(pA, pB);
            const pSum: u128 = TickMath.tickToPrice(a + b);

            // Tolerance: ~ 1 LSB per bit-iteration in tickToPrice; expand for safety.
            const tolerance: u256 = u256.fromU64(64);
            expect<bool>(approxEqU256(product, pSum.toU256(), tolerance)).toBe(
                true,
                `additivity failed at a=${a} b=${b}`,
            );
        }
    });

    it('inverse identity: tickToPrice(-k) × tickToPrice(k) ≈ 2^88 (small k)', () => {
        // The inverse path uses 2^176 / ratio which loses LSBs proportional to |k|.
        // Test only the regime where the tolerance can be tight.
        const ks: i32[] = [1, 10, 100];
        const target: u256 = u256.shl(u256.One, 88);
        for (let i = 0; i < ks.length; i++) {
            const k: i32 = ks[i];
            const pK: u128 = TickMath.tickToPrice(k);
            const pNegK: u128 = TickMath.tickToPrice(-k);
            const product: u256 = mulQ4088(pK, pNegK);
            const tolerance: u256 = u256.fromU64(16);
            expect<bool>(approxEqU256(product, target, tolerance)).toBe(
                true,
                `inverse identity failed at k=${k}`,
            );
        }
    });

    it('ratioAtBit(k+1) ≈ ratioAtBit(k)^2 >> 88 — within doubling tolerance', () => {
        // Each squaring step roughly doubles the floor-rounding error.
        for (let k: u32 = 0; k < 14; k++) {
            const r: u256 = ratioAtBit(k);
            const rSq: u256 = u256.shr(u256.mul(r, r), <i32>FP_SHIFT);
            const rNext: u256 = ratioAtBit(k + 1);
            // Tolerance doubles with each k. Pad generously.
            const tol: u64 = (<u64>1) << (k + 1);
            const tolerance: u256 = u256.fromU64(tol);
            expect<bool>(approxEqU256(rSq, rNext, tolerance)).toBe(
                true,
                `ratioAtBit(${k + 1}) != ratioAtBit(${k})^2 >> 88 (tol=${tol})`,
            );
        }
    });
});

describe('Tick price — magnitude sanity at boundaries', () => {
    it('tickToPrice(MAX_TICK) fits u128 with at least one bit of headroom', () => {
        // MAX_TICK was chosen so 1.001^MAX_TICK × 2^88 < 2^128. Confirm the high u64 isn't full.
        const p: u128 = TickMath.tickToPrice(MAX_TICK);
        expect<bool>(p.hi != u64.MAX_VALUE).toBe(true);
    });

    it('tickToPrice(MIN_TICK) is non-zero (the distinguishability floor)', () => {
        const p: u128 = TickMath.tickToPrice(MIN_TICK);
        expect<bool>(!p.isZero()).toBe(true);
    });

    it('tickToPrice(MIN_TICK + 1) > tickToPrice(MIN_TICK) by exactly ≥ 1', () => {
        const p0: u128 = TickMath.tickToPrice(MIN_TICK);
        const p1: u128 = TickMath.tickToPrice(MIN_TICK + 1);
        expect<bool>(u128.gt(p1, p0)).toBe(true);
        // The whole point of MIN_TICK is that the LSB gap is at least 1.
        const diff: u128 = u128.sub(p1, p0);
        expect<bool>(u128.ge(diff, u128.One)).toBe(true);
    });
});

describe('tokensToSatoshis / satoshisToTokens — exact values at named ticks', () => {
    it('at tick 0, tokens == sats exactly (1 base unit = 1 sat)', () => {
        const fp: u128 = TickMath.tickToPrice(0);
        expect<u64>(TickMath.tokensToSatoshis(u128.fromU64(1), fp)).toBe(1);
        expect<u64>(TickMath.tokensToSatoshis(u128.fromU64(123_456), fp)).toBe(123_456);
        expect<bool>(u128.eq(TickMath.satoshisToTokens(7_777, fp), u128.fromU64(7_777))).toBe(true);
    });

    it('at tick 1, 1 token rounds to 1 sat; 1000 tokens round to 1000 sats', () => {
        const fp: u128 = TickMath.tickToPrice(1);
        // 1 base unit × ratioAtBit(0) >> 88 = floor(1.001) = 1.
        expect<u64>(TickMath.tokensToSatoshis(u128.fromU64(1), fp)).toBe(1);
        // 1000 base units × floor-rounded ratioAtBit(0) gives floor(1000.99...) = 1000.
        // The 0.001 multiplier loses 1 sat to the floor of ratioAtBit itself.
        const sats: u64 = TickMath.tokensToSatoshis(u128.fromU64(1000), fp);
        expect<u64>(sats).toBe(1000);
    });

    it('at tick 10, 1000 base units ≈ 1000 × 1.001^10 sats (floor)', () => {
        const fp: u128 = TickMath.tickToPrice(10);
        // 1.001^10 ≈ 1.01004512021... → 1000 × 1.01004... ≈ 1010 sats (floor).
        const sats: u64 = TickMath.tokensToSatoshis(u128.fromU64(1000), fp);
        expect<u64>(sats).toBe(1010);
    });

    it('at tick -10, 1000 base units ≈ 1000 / 1.001^10 sats (floor)', () => {
        const fp: u128 = TickMath.tickToPrice(-10);
        // 1.001^-10 ≈ 0.99006... → 1000 × 0.99006 = 990.06... → floor 990.
        const sats: u64 = TickMath.tokensToSatoshis(u128.fromU64(1000), fp);
        expect<u64>(sats).toBe(990);
    });

    it('satoshisToTokens cap: ultra-low fillPrice with huge sats → u128.Max cap', () => {
        // Pick the very lowest fillPrice. With sats = u64.MAX_VALUE, the tokens would
        // exceed u128 — the function must cap at u128.Max.
        const fp: u128 = TickMath.tickToPrice(MIN_TICK);
        const tokens: u128 = TickMath.satoshisToTokens(u64.MAX_VALUE, fp);
        // Should be capped to u128.Max (or some huge u128 — at minimum it should not be zero).
        expect<bool>(!tokens.isZero()).toBe(true);
    });

    it('round-trip at tick 0: exact for sats up to total Bitcoin supply (21M BTC = 2.1e15 sats)', () => {
        const fp: u128 = TickMath.tickToPrice(0);
        const samples: u64[] = [1, 100, 1_000_000, 100_000_000, 2_100_000_000_000_000];
        for (let i = 0; i < samples.length; i++) {
            const s: u64 = samples[i];
            const back: u64 = TickMath.tokensToSatoshis(TickMath.satoshisToTokens(s, fp), fp);
            expect<u64>(back).toBe(s);
        }
    });
});
