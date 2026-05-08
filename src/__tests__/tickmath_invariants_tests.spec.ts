import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { TickMath } from '../utils/TickMath';
import {
    BITMAP_WORD_COUNT,
    FP_SHIFT,
    MAX_TICK,
    MIN_TICK,
    TICK_OFFSET,
    ratioAtBit,
} from '../constants/Contract';

/**
 * Pure-math invariants for TickMath. None of these tests touch storage or any
 * host import, so they run cleanly under as-pect's minimal env.
 */

describe('TickMath — monotonicity', (): void => {
    it('tickToPrice is strictly increasing across a sample of ticks', (): void => {
        // Sample ticks across the full range; not exhaustive but enough to catch
        // any direction-flip bug in the multiplication path.
        const samples: i32[] = [
            MIN_TICK,
            -50_000,
            -30_000,
            -10_000,
            -1_000,
            -10,
            -1,
            0,
            1,
            10,
            1_000,
            10_000,
            20_000,
            MAX_TICK,
        ];
        for (let i = 1; i < samples.length; i++) {
            const lower: u128 = TickMath.tickToPrice(samples[i - 1]);
            const upper: u128 = TickMath.tickToPrice(samples[i]);
            expect<bool>(u128.lt(lower, upper)).toBe(
                true,
                `tickToPrice non-monotonic between ticks ${samples[i - 1]} and ${samples[i]}`,
            );
        }
    });

    it('adjacent ticks differ by approximately 0.1% (the tick-base step)', (): void => {
        // At tick 1000: ratio ≈ 1.001^1000 ≈ 2.7167; tick 1001 ≈ 2.7194. Δ/p ≈ 0.001.
        const p1000: u256 = TickMath.tickToPrice(1_000).toU256();
        const p1001: u256 = TickMath.tickToPrice(1_001).toU256();
        const diff: u256 = u256.sub(p1001, p1000);
        // diff * 1000 should approximate p1000 (within 0.5%).
        const diffScaled: u256 = u256.mul(diff, u256.fromU64(1_000));
        // Compute |diffScaled - p1000| and verify it is < p1000 * 5 / 1000 (= 0.5%).
        const lo: u256 = u256.lt(diffScaled, p1000) ? diffScaled : p1000;
        const hi: u256 = u256.lt(diffScaled, p1000) ? p1000 : diffScaled;
        const absErr: u256 = u256.sub(hi, lo);
        const tolerance: u256 = u256.div(
            u256.mul(p1000, u256.fromU64(5)),
            u256.fromU64(1_000),
        );
        expect<bool>(u256.le(absErr, tolerance)).toBe(true);
    });
});

describe('TickMath — round-trip identities', (): void => {
    it('round-trip drops at most one base unit at low ticks', (): void => {
        // Round-trip = sats → tokens (floor) → sats (floor). The maximum drop is
        // one base unit's worth of sats — bounded by `fillPrice >> 88`. At tick 0
        // that's 1 sat; at tick 1000 (~1.001^1000 ≈ 2.72 sats/base unit) it's 2.
        // Beyond ~tick 1000 the drop scales geometrically and the property breaks
        // down to "at most one full base unit" rather than "at most 1 sat".
        const ticks: i32[] = [-1_000, -100, 0, 100, 1_000];
        for (let i = 0; i < ticks.length; i++) {
            const tick: i32 = ticks[i];
            const fp: u128 = TickMath.tickToPrice(tick);
            const tokens: u128 = TickMath.satoshisToTokens(1_000_000, fp);
            if (tokens.isZero()) continue;
            const sats: u64 = TickMath.tokensToSatoshis(tokens, fp);
            const drop: u64 = 1_000_000 - sats;
            // One base-unit worth of sats = ceil(fp / 2^88). Tick 1000 → ~3.
            expect<bool>(drop <= 4).toBe(
                true,
                `round-trip drop too large at tick ${tick}: 1_000_000 → ${sats}`,
            );
        }
    });

    it('satoshisToTokens(0, _) is zero at every in-range tick', (): void => {
        const ticks: i32[] = [-50_000, -100, 0, 100, 25_000];
        for (let i = 0; i < ticks.length; i++) {
            const fp: u128 = TickMath.tickToPrice(ticks[i]);
            expect<bool>(TickMath.satoshisToTokens(0, fp).isZero()).toBe(true);
        }
    });
});

describe('TickMath — boundary ratio table', (): void => {
    it('ratioAtBit(0) ≈ 1.001 × 2^88 (within 1 LSB)', (): void => {
        const expected: u256 = u256.fromString('309794494831166413793505837');
        const actual: u256 = ratioAtBit(0);
        const diff: u256 = u256.gt(actual, expected)
            ? u256.sub(actual, expected)
            : u256.sub(expected, actual);
        expect<bool>(u256.le(diff, u256.fromU64(1))).toBe(true);
    });

    it('ratioAtBit(15) ≈ 1.001^32768 × 2^88 (the largest stored constant)', (): void => {
        const expected: u256 = u256.fromString(
            '51819170982739684170545163151439426777124',
        );
        const actual: u256 = ratioAtBit(15);
        expect<bool>(u256.eq(actual, expected)).toBe(true);
    });

    it('ratioAtBit(k) for k in [0..15] is strictly increasing', (): void => {
        for (let k: u32 = 0; k < 15; k++) {
            const lower: u256 = ratioAtBit(k);
            const upper: u256 = ratioAtBit(k + 1);
            expect<bool>(u256.lt(lower, upper)).toBe(true);
        }
    });
});

describe('TickMath — overflow margins', (): void => {
    it('tickToPrice(MAX_TICK) fits u128 without overflow', (): void => {
        // If this overflowed u128, the function would revert. Asserting non-zero
        // is the simplest health check.
        const p: u128 = TickMath.tickToPrice(MAX_TICK);
        expect<bool>(!p.isZero()).toBe(true);
    });

    it('tickToPrice(MIN_TICK) is non-zero (1 LSB minimum)', (): void => {
        const p: u128 = TickMath.tickToPrice(MIN_TICK);
        expect<bool>(!p.isZero()).toBe(true);
    });

    it('tickToPrice(MIN_TICK + 1) > tickToPrice(MIN_TICK) (distinguishability)', (): void => {
        const lo: u128 = TickMath.tickToPrice(MIN_TICK);
        const next: u128 = TickMath.tickToPrice(MIN_TICK + 1);
        expect<bool>(u128.lt(lo, next)).toBe(true);
    });
});

describe('TickMath — bitmap address mapping', (): void => {
    it('every tick in [MIN_TICK, MAX_TICK] maps within BITMAP_WORD_COUNT words', (): void => {
        const wMin: u32 = TickMath.wordIdx(MIN_TICK);
        const wMax: u32 = TickMath.wordIdx(MAX_TICK);
        expect<bool>(wMin < BITMAP_WORD_COUNT).toBe(true);
        expect<bool>(wMax < BITMAP_WORD_COUNT).toBe(true);
    });

    it('tickFromBitmap is inverse of (wordIdx, bitIdx) at random ticks', (): void => {
        const samples: i32[] = [MIN_TICK, -1, 0, 1, 100, 1_000, MAX_TICK];
        for (let i = 0; i < samples.length; i++) {
            const t: i32 = samples[i];
            const w: u32 = TickMath.wordIdx(t);
            const b: u8 = TickMath.bitIdx(t);
            expect<i32>(TickMath.tickFromBitmap(w, <u32>b)).toBe(t);
        }
    });

    it('TICK_OFFSET aligns MIN_TICK to bitmap origin (unsigned == 0)', (): void => {
        const w: u32 = TickMath.wordIdx(MIN_TICK);
        const b: u8 = TickMath.bitIdx(MIN_TICK);
        expect<u32>(w).toBe(0);
        expect<u8>(b).toBe(0);
    });
});

describe('TickMath — Q40.88 representation invariants', (): void => {
    it('FP_SHIFT == 88 keeps tickToPrice(0) == 2^88', (): void => {
        const one: u128 = TickMath.tickToPrice(0);
        expect<bool>(u128.eq(one, u128.shl(u128.One, <i32>FP_SHIFT))).toBe(true);
    });

    it('TickMath.countTrailingZeros matches u64 ctz on the lowest non-zero limb', (): void => {
        // Bit 5 set in lo1
        const w1: u256 = u256.shl(u256.One, 5);
        expect<u32>(TickMath.countTrailingZeros(w1)).toBe(5);
        // Bit 130 set in lo2
        const w2: u256 = u256.shl(u256.One, 130);
        expect<u32>(TickMath.countTrailingZeros(w2)).toBe(130);
        // Bit 200 set in hi1
        const w3: u256 = u256.shl(u256.One, 200);
        expect<u32>(TickMath.countTrailingZeros(w3)).toBe(200);
        // Bit 250 set in hi2
        const w4: u256 = u256.shl(u256.One, 250);
        expect<u32>(TickMath.countTrailingZeros(w4)).toBe(250);
    });
});
