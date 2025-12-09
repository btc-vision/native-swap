import { clearCachedProviders } from '../models/Provider';
import { Blockchain, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { min128, min64 } from '../utils/MathUtils';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

const SCALE = u256.fromU64(1_000_000);
const LN2_SCALED = u256.fromU64(693147);
const TOL_SMALL = u256.fromU32(2);

function pow2(k: u32): u256 {
    return SafeMath.shl(u256.One, <i32>k);
}

describe('MathUtils tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('MathUtils tests - min64', () => {
        it('returns the first argument when it is less than the second', () => {
            const a: u64 = 5;
            const b: u64 = 10;
            const result: u64 = min64(a, b);
            expect(result).toStrictEqual(a);
        });

        it('returns the second argument when the first is greater than the second', () => {
            const a: u64 = 20;
            const b: u64 = 15;
            const result: u64 = min64(a, b);
            expect(result).toStrictEqual(b);
        });

        it('returns the argument when both are equal', () => {
            const a: u64 = 7;
            const b: u64 = 7;
            const result: u64 = min64(a, b);
            expect(result).toStrictEqual(a);
        });

        it('handles zero values correctly', () => {
            const a: u64 = 0;
            const b: u64 = 1;
            const result: u64 = min64(a, b);
            expect(result).toStrictEqual(a);
        });

        it('handles u64.MAX boundary correctly', () => {
            const max: u64 = u64.MAX_VALUE;
            const one: u64 = 1;
            const result: u64 = min64(max, one);
            expect(result).toStrictEqual(one);
        });
    });

    describe('MathUtils tests - min128', () => {
        it('returns the first argument when it is less than the second', () => {
            const a: u128 = u128.fromU64(100);
            const b: u128 = u128.fromU64(200);
            const result: u128 = min128(a, b);
            expect(result).toStrictEqual(a);
        });

        it('returns the second argument when the first is greater than the second', () => {
            const a: u128 = u128.fromU64(300);
            const b: u128 = u128.fromU64(250);
            const result: u128 = min128(a, b);
            expect(result).toStrictEqual(b);
        });

        it('returns the argument when both are equal', () => {
            const a: u128 = u128.fromU64(123);
            const b: u128 = u128.fromU64(123);
            const result: u128 = min128(a, b);
            expect(result).toStrictEqual(a);
        });

        it('handles zero values correctly', () => {
            const a: u128 = u128.fromU64(0);
            const b: u128 = u128.fromU64(50);
            const result: u128 = min128(a, b);
            expect(result).toStrictEqual(a);
        });

        it('handles u128.MAX boundary correctly', () => {
            const max: u128 = u128.Max;
            const ten: u128 = u128.fromU64(10);
            const result: u128 = min128(max, ten);
            expect(result).toStrictEqual(ten);
        });
    });

    describe('SafeMath.preciseLogRatio tests', () => {
        it('preciseLogRatio(x, x) == 0 (ln(1) = 0)', () => {
            const x = u256.fromU64(1000000);
            expect(SafeMath.preciseLogRatio(x, x)).toStrictEqual(u256.Zero);
        });

        it('preciseLogRatio(2x, x) ≈ ln(2) * SCALE', () => {
            const x = u256.fromU64(1000000);
            const twoX = SafeMath.mul(x, u256.fromU32(2));
            const result = SafeMath.preciseLogRatio(twoX, x);
            // ln(2) ≈ 0.693147, scaled by 1e6 = 693147
            // Allow 1% tolerance
            const expected = LN2_SCALED;
            const delta = SafeMath.sub(
                result > expected ? result : expected,
                result > expected ? expected : result,
            );
            const tolerance = SafeMath.div(expected, u256.fromU32(100)); // 1%
            expect(delta <= tolerance).toBeTruthy();
        });

        it('monotonicity – larger ratio gives larger result', () => {
            const x = u256.fromU64(1000000);
            const twoX = SafeMath.mul(x, u256.fromU32(2));
            const threeX = SafeMath.mul(x, u256.fromU32(3));
            const fourX = SafeMath.mul(x, u256.fromU32(4));

            const ln2 = SafeMath.preciseLogRatio(twoX, x);
            const ln3 = SafeMath.preciseLogRatio(threeX, x);
            const ln4 = SafeMath.preciseLogRatio(fourX, x);

            expect(u256.lt(ln2, ln3)).toBeTruthy();
            expect(u256.lt(ln3, ln4)).toBeTruthy();
        });

        it('preciseLogRatio(4x, x) ≈ 2 * ln(2) * SCALE', () => {
            const x = u256.fromU64(1000000);
            const fourX = SafeMath.mul(x, u256.fromU32(4));
            const result = SafeMath.preciseLogRatio(fourX, x);
            // ln(4) = 2*ln(2) ≈ 1.386294, scaled by 1e6 = 1386294
            const expected = SafeMath.mul(LN2_SCALED, u256.fromU32(2));
            const delta = SafeMath.sub(
                result > expected ? result : expected,
                result > expected ? expected : result,
            );
            const tolerance = SafeMath.div(expected, u256.fromU32(100)); // 1%
            expect(delta <= tolerance).toBeTruthy();
        });

        it('handles large values correctly', () => {
            const x = u256.fromString('1000000000000000000000000'); // 1e24
            const twoX = SafeMath.mul(x, u256.fromU32(2));
            const result = SafeMath.preciseLogRatio(twoX, x);
            // Should still be approximately ln(2) * SCALE
            const delta = SafeMath.sub(
                result > LN2_SCALED ? result : LN2_SCALED,
                result > LN2_SCALED ? LN2_SCALED : result,
            );
            const tolerance = SafeMath.div(LN2_SCALED, u256.fromU32(100)); // 1%
            expect(delta <= tolerance).toBeTruthy();
        });

        it('handles small fractions (a only slightly larger than b)', () => {
            const x = u256.fromU64(1000000);
            // 1.1x - ln(1.1) ≈ 0.09531
            const onePointOneX = SafeMath.div(SafeMath.mul(x, u256.fromU32(11)), u256.fromU32(10));
            const result = SafeMath.preciseLogRatio(onePointOneX, x);
            // ln(1.1) * 1e6 ≈ 95310
            const expected = u256.fromU64(95310);
            const delta = SafeMath.sub(
                result > expected ? result : expected,
                result > expected ? expected : result,
            );
            // Allow 5% tolerance for small values
            const tolerance = SafeMath.div(expected, u256.fromU32(20)); // 5%
            expect(delta <= tolerance).toBeTruthy();
        });
    });
});
