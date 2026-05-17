import { u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../managers/FeeManager';
import { SWAP_FEE_BPS, SWAP_FEE_DENOM } from '../constants/Contract';

/**
 * Exact fee math at boundary amounts.
 *
 * The fee formula:
 *   fee = floor(N * SWAP_FEE_BPS / SWAP_FEE_DENOM)
 *       = floor(N * 30 / 10_000)
 *       = floor(N * 3 / 1_000)
 *
 * Concrete sub-fee boundaries (where the floor increments):
 *   N=1..333         → fee=0
 *   N=334            → fee=1  (334*30/10000 = 1.002 → 1)
 *   N=667            → fee=2  (667*30/10000 = 2.001 → 2)
 *   N=1000           → fee=3  (1000*30/10000 = 3 exactly)
 *   N=3333           → fee=9
 *   N=3334           → fee=10
 *   N=10000          → fee=30
 *   N=100000         → fee=300
 *   N=10_000_000     → fee=30_000
 *   N=1_000_000_000  → fee=3_000_000
 *
 * Also: the floor truncation must NEVER refund more than `floor(0.3%)` —
 * specifically, never round UP.
 */

describe('Fee math — exact values at boundary amounts', () => {
    it('SWAP_FEE_BPS == 30 and SWAP_FEE_DENOM == 10_000', () => {
        expect<u64>(SWAP_FEE_BPS).toBe(30);
        expect<u64>(SWAP_FEE_DENOM).toBe(10_000);
    });

    it('fee(0) = 0', () => {
        expect<bool>(FeeManager.computeSwapFee(u256.Zero).isZero()).toBe(true);
    });

    it('fee(N) = 0 for N in [1, 333]', () => {
        const ns: u64[] = [1, 100, 200, 300, 333];
        for (let i = 0; i < ns.length; i++) {
            const fee: u256 = FeeManager.computeSwapFee(u256.fromU64(ns[i]));
            expect<bool>(fee.isZero()).toBe(true, `fee(${ns[i]}) expected 0, got ${fee}`);
        }
    });

    it('fee(334) = 1 (first non-zero — boundary at 334 * 30 / 10000 = 1.002)', () => {
        expect<bool>(u256.eq(FeeManager.computeSwapFee(u256.fromU64(334)), u256.fromU64(1))).toBe(
            true,
        );
    });

    it('fee(666) = 1; fee(667) = 2 (second boundary)', () => {
        expect<bool>(u256.eq(FeeManager.computeSwapFee(u256.fromU64(666)), u256.fromU64(1))).toBe(
            true,
        );
        expect<bool>(u256.eq(FeeManager.computeSwapFee(u256.fromU64(667)), u256.fromU64(2))).toBe(
            true,
        );
    });

    it('fee(1000) = 3 (exact integer point)', () => {
        expect<bool>(u256.eq(FeeManager.computeSwapFee(u256.fromU64(1000)), u256.fromU64(3))).toBe(
            true,
        );
    });

    it('fee(3333) = 9; fee(3334) = 10', () => {
        expect<bool>(u256.eq(FeeManager.computeSwapFee(u256.fromU64(3333)), u256.fromU64(9))).toBe(
            true,
        );
        expect<bool>(u256.eq(FeeManager.computeSwapFee(u256.fromU64(3334)), u256.fromU64(10))).toBe(
            true,
        );
    });

    it('fee(10_000) = 30 (= SWAP_FEE_BPS exactly)', () => {
        expect<bool>(
            u256.eq(FeeManager.computeSwapFee(u256.fromU64(10_000)), u256.fromU64(30)),
        ).toBe(true);
    });

    it('fee(100_000) = 300', () => {
        expect<bool>(
            u256.eq(FeeManager.computeSwapFee(u256.fromU64(100_000)), u256.fromU64(300)),
        ).toBe(true);
    });

    it('fee(10_000_000) = 30_000', () => {
        expect<bool>(
            u256.eq(FeeManager.computeSwapFee(u256.fromU64(10_000_000)), u256.fromU64(30_000)),
        ).toBe(true);
    });

    it('fee(1_000_000_000) = 3_000_000', () => {
        expect<bool>(
            u256.eq(
                FeeManager.computeSwapFee(u256.fromU64(1_000_000_000)),
                u256.fromU64(3_000_000),
            ),
        ).toBe(true);
    });
});

describe('Fee math — invariants', () => {
    it('fee is always ≤ floor(N * 30 / 10_000) and ≥ 0', () => {
        const ns: u64[] = [1, 7, 50, 100, 999, 1_000_000];
        for (let i = 0; i < ns.length; i++) {
            const fee: u256 = FeeManager.computeSwapFee(u256.fromU64(ns[i]));
            // 0 ≤ fee
            expect<bool>(u256.ge(fee, u256.Zero)).toBe(true);
            // fee ≤ N * 30 / 10000 (floor): equivalent to fee * 10000 ≤ N * 30
            const lhs: u256 = u256.mul(fee, u256.fromU64(10_000));
            const rhs: u256 = u256.mul(u256.fromU64(ns[i]), u256.fromU64(30));
            expect<bool>(u256.le(lhs, rhs)).toBe(true, `fee(${ns[i]}) too large: ${fee}`);
        }
    });

    it('fee(N+1) - fee(N) is either 0 or 1 (monotone, single-step increments)', () => {
        // Walk past two known boundary points (333→334 and 666→667).
        let prev: u256 = u256.Zero;
        for (let n: u64 = 0; n < 700; n++) {
            const f: u256 = FeeManager.computeSwapFee(u256.fromU64(n));
            const step: u256 = u256.sub(f, prev);
            expect<bool>(u256.le(step, u256.One)).toBe(
                true,
                `fee step > 1 at N=${n}: ${prev} → ${f}`,
            );
            prev = f;
        }
    });

    it('fee scales linearly with N at clean multiples', () => {
        // fee(N) / N == 0.003 (give or take floor), so fee(k * N) ≈ k * fee(N) for clean N.
        const baseN: u64 = 10_000; // fee = 30
        const baseFee: u256 = u256.fromU64(30);
        const ks: u64[] = [1, 2, 5, 10, 100, 1_000];
        for (let i = 0; i < ks.length; i++) {
            const k: u64 = ks[i];
            const f: u256 = FeeManager.computeSwapFee(u256.fromU64(baseN * k));
            expect<bool>(u256.eq(f, u256.mul(baseFee, u256.fromU64(k)))).toBe(true);
        }
    });

    it('fee on u256.Max reverts cleanly via SafeMath.mul overflow check', () => {
        // u256.Max * 30 overflows before the /10_000 division can apply. SafeMath
        // guards against this — the call must revert rather than silently wrap.
        expect(() => {
            FeeManager.computeSwapFee(u256.Max);
        }).toThrow();
    });
});
