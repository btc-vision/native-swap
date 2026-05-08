import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { TickMath } from '../utils/TickMath';
import {
    BITMAP_WORD_COUNT,
    FP_SHIFT,
    MAX_TICK,
    MIN_TICK,
    TICK_OFFSET,
} from '../constants/Contract';

describe('TickMath constants', (): void => {
    it('FP_SHIFT == 88', (): void => {
        expect<u32>(FP_SHIFT).toBe(88);
    });
    it('MIN_TICK / MAX_TICK / TICK_OFFSET match script-verified values', (): void => {
        expect<i32>(MIN_TICK).toBe(-54_116);
        expect<i32>(MAX_TICK).toBe(27_739);
        expect<i32>(TICK_OFFSET).toBe(54_116);
        expect<u32>(BITMAP_WORD_COUNT).toBe(320);
    });
});

describe('TickMath.tickToPrice', (): void => {
    it('tick 0 → 1.0 in Q40.88 = 2^88', (): void => {
        const price: u128 = TickMath.tickToPrice(0);
        const expected: u128 = u128.shl(u128.One, 88);
        expect<bool>(u128.eq(price, expected)).toBe(true);
    });

    it('tick 1 ≈ 1.001 × 2^88 (within 1 LSB)', (): void => {
        const price: u128 = TickMath.tickToPrice(1);
        // 1.001 × 2^88 = 309794494831166413793505837
        const expected: u128 = u128.fromString('309794494831166413793505837');
        // Allow up to 1 LSB difference from rounding
        const diff: u128 = u128.gt(price, expected)
            ? u128.sub(price, expected)
            : u128.sub(expected, price);
        expect<bool>(u128.le(diff, u128.fromU32(1))).toBe(true);
    });

    it('tick -1 = inverse of tick 1', (): void => {
        const pPos: u128 = TickMath.tickToPrice(1);
        const pNeg: u128 = TickMath.tickToPrice(-1);
        // p(1) * p(-1) ≈ 1.0 in Q40.88, so the product shifted right 88 ≈ 2^88.
        const product: u256 = u256.mul(pPos.toU256(), pNeg.toU256());
        const shifted: u256 = u256.shr(product, 88);
        const one_q4088: u256 = u256.shl(u256.One, 88);
        // Allow a few LSBs of rounding
        const tolerance: u256 = u256.fromU64(8);
        const diff: u256 = u256.gt(shifted, one_q4088)
            ? u256.sub(shifted, one_q4088)
            : u256.sub(one_q4088, shifted);
        expect<bool>(u256.le(diff, tolerance)).toBe(true);
    });

    it('reverts on tick > MAX_TICK', (): void => {
        expect((): void => {
            TickMath.tickToPrice(MAX_TICK + 1);
        }).toThrow();
    });

    it('reverts on tick < MIN_TICK', (): void => {
        expect((): void => {
            TickMath.tickToPrice(MIN_TICK - 1);
        }).toThrow();
    });

    it('boundary ticks fit u128', (): void => {
        // No overflow at MAX_TICK
        const pMax: u128 = TickMath.tickToPrice(MAX_TICK);
        expect<bool>(!pMax.isZero()).toBe(true);
        // Non-zero floor at MIN_TICK
        const pMin: u128 = TickMath.tickToPrice(MIN_TICK);
        expect<bool>(!pMin.isZero()).toBe(true);
    });
});

describe('TickMath.countTrailingZeros', (): void => {
    it('zero word → 256', (): void => {
        expect<u32>(TickMath.countTrailingZeros(u256.Zero)).toBe(256);
    });
    it('lowest bit set → 0', (): void => {
        expect<u32>(TickMath.countTrailingZeros(u256.One)).toBe(0);
    });
    it('bit 64 set → 64', (): void => {
        const w: u256 = u256.shl(u256.One, 64);
        expect<u32>(TickMath.countTrailingZeros(w)).toBe(64);
    });
    it('bit 200 set → 200', (): void => {
        const w: u256 = u256.shl(u256.One, 200);
        expect<u32>(TickMath.countTrailingZeros(w)).toBe(200);
    });
});

describe('TickMath bitmap helpers', (): void => {
    it('wordIdx/bitIdx round-trip for tick 0', (): void => {
        const w: u32 = TickMath.wordIdx(0);
        const b: u8 = TickMath.bitIdx(0);
        const back: i32 = TickMath.tickFromBitmap(w, <u32>b);
        expect<i32>(back).toBe(0);
    });
    it('wordIdx/bitIdx round-trip for MIN_TICK', (): void => {
        const w: u32 = TickMath.wordIdx(MIN_TICK);
        const b: u8 = TickMath.bitIdx(MIN_TICK);
        const back: i32 = TickMath.tickFromBitmap(w, <u32>b);
        expect<i32>(back).toBe(MIN_TICK);
    });
    it('wordIdx/bitIdx round-trip for MAX_TICK', (): void => {
        const w: u32 = TickMath.wordIdx(MAX_TICK);
        const b: u8 = TickMath.bitIdx(MAX_TICK);
        const back: i32 = TickMath.tickFromBitmap(w, <u32>b);
        expect<i32>(back).toBe(MAX_TICK);
    });

    it('setBit / isBitSet / clearBit at MIN_TICK', (): void => {
        const wordEmpty: u256 = u256.Zero;
        const wordSet: u256 = TickMath.setBit(wordEmpty, MIN_TICK);
        expect<bool>(TickMath.isBitSet(wordSet, MIN_TICK)).toBe(true);
        const wordCleared: u256 = TickMath.clearBit(wordSet, MIN_TICK);
        expect<bool>(TickMath.isBitSet(wordCleared, MIN_TICK)).toBe(false);
    });
});

describe('TickMath settlement math', (): void => {
    it('tokensToSatoshis(0, _) → 0', (): void => {
        expect<u64>(TickMath.tokensToSatoshis(u128.Zero, TickMath.tickToPrice(0))).toBe(0);
    });

    it('round-trip identity at tick 0', (): void => {
        // At tick 0 (1 sat per base unit), 1000 base units = 1000 sats; 1000 sats = 1000 base units.
        const fillPrice: u128 = TickMath.tickToPrice(0);
        const tokens: u128 = u128.fromU64(1000);
        const sats: u64 = TickMath.tokensToSatoshis(tokens, fillPrice);
        expect<u64>(sats).toBe(1000);
        const back: u128 = TickMath.satoshisToTokens(1000, fillPrice);
        expect<bool>(u128.eq(back, tokens)).toBe(true);
    });

    it('worst-case multiplication does not overflow at MIN_TICK', (): void => {
        // The plan asserts: worst-case product 1.001^54116 × 2^176 ≈ 2^254.03 fits u256.
        // We exercise this via tickToPrice itself; if it didn't fit, the call would revert.
        const p: u128 = TickMath.tickToPrice(MIN_TICK);
        expect<bool>(!p.isZero()).toBe(true);
    });
});
