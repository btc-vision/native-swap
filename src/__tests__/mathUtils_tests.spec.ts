import { clearCachedProviders } from '../models/Provider';
import { Blockchain, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { calculateTaylorSeries, min128, min64, preciseLog } from '../utils/MathUtils';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

const SCALE = u256.fromU64(1_000_000);
const LN2_SCALED = u256.fromU64(693147);
const TOL_SMALL = u256.fromU32(2); // ≤ 2 ulp      (≈ 2×10⁻⁶)
const TOL_LARGE = u256.fromU32(250); // ≤ 2.5×10⁻⁴

function pow2(k: u32): u256 {
    return SafeMath.shl(u256.One, <i32>k);
}

function jsLnScaled(x: u64): u256 {
    const val = Math.log(<f64>x) * 1_000_000.0;
    return u256.fromU64(<u64>Math.round(val));
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

    describe('preciseLog – edge behaviour', () => {
        it('ln(0) == 0 by convention', () => {
            expect(preciseLog(u256.Zero, SCALE)).toStrictEqual(u256.Zero);
        });

        it('ln(1) == 0', () => {
            expect(preciseLog(u256.One, SCALE)).toStrictEqual(u256.Zero);
        });

        it('exact output for powers of two up to 2¹⁶', () => {
            for (let k: u32 = 1; k <= 16; k++) {
                const x = pow2(k); // 2^k
                const expected = SafeMath.mul(u256.fromU32(k), LN2_SCALED);
                expect(preciseLog(x, SCALE)).toStrictEqual(
                    expected,
                    `failed for 2**${k.toString()}`,
                );
            }
        });

        it('exact output for a very large power of two (2¹²⁸)', () => {
            const k: u32 = 128;
            const x = pow2(k);
            const expected = SafeMath.mul(u256.fromU32(k), LN2_SCALED);
            expect(preciseLog(x, SCALE)).toStrictEqual(expected);
        });

        it('monotonicity – random ascending triplet', () => {
            const a = u256.fromU32(7); // 7
            const b = u256.fromU32(31); // 31
            const c = u256.fromU32(128); // 128

            const lnA = preciseLog(a, SCALE);
            const lnB = preciseLog(b, SCALE);
            const lnC = preciseLog(c, SCALE);

            expect(lnA < lnB && lnB < lnC).toBeTruthy();
        });

        it('product property ln(x·y) ≈ ln(x)+ln(y) (moderate range)', () => {
            const x = u256.fromU32(37);
            const y = u256.fromU32(59);
            const xy = SafeMath.mul(x, y);

            const lnX = preciseLog(x, SCALE);
            const lnY = preciseLog(y, SCALE);
            const lnXY = preciseLog(xy, SCALE);

            // Absolute error
            const delta = SafeMath.sub(
                lnXY > SafeMath.add(lnX, lnY) ? lnXY : SafeMath.add(lnX, lnY),
                lnXY > SafeMath.add(lnX, lnY) ? SafeMath.add(lnX, lnY) : lnXY,
            );

            // Allow up to 1% relative error (theoretical upper bound with 5 terms)
            const relTol = SafeMath.div(lnXY, u256.fromU32(100)); // 1% of ln(xy)

            expect<bool>(delta <= relTol).toBeTruthy();
        });
    });

    describe('calculateTaylorSeries – local correctness', () => {
        it('returns 0 when rScaled == 0', () => {
            expect<u256>(calculateTaylorSeries(u256.Zero, SCALE)).toStrictEqual(u256.Zero);
        });

        it('matches ln(1+r) for very small r (1e‑4)', () => {
            const rScaled = u256.fromU32(100); // r = 1×10⁻⁴

            const rFloat = <f64>rScaled.toU32() / 1_000_000.0; // 0.0001
            const expF64 = Math.log(1.0 + rFloat); // ln(1+r)
            const expected = u256.fromU64(<u64>Math.round(expF64 * 1_000_000.0));

            const actual = calculateTaylorSeries(rScaled, SCALE);
            const delta = SafeMath.sub(
                expected > actual ? expected : actual,
                expected > actual ? actual : expected,
            );

            expect(delta <= TOL_SMALL).toBeTruthy();
        });

        it('≈ ln(2) when rScaled == SCALE (r = 1)', () => {
            const rScaled = SCALE; // r = 1
            const expected = u256.fromU32(693_147); // ln(2) × 10⁶ exact reference
            const actual = calculateTaylorSeries(rScaled, SCALE);

            // allow 15% relative error
            const delta = SafeMath.sub(
                expected > actual ? expected : actual,
                expected > actual ? actual : expected,
            );
            const relTol = SafeMath.div(
                SafeMath.mul(expected, u256.fromU32(15)),
                u256.fromU32(100),
            ); // 15%
            expect(delta <= relTol).toBeTruthy();
        });
    });
});
