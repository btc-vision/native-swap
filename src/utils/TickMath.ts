import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { FP_SHIFT, MAX_TICK, MIN_TICK, ratioAtBit, TICK_OFFSET } from '../constants/Contract';

/**
 * Tick math for NativeSwap.
 *
 * Format: Q40.88 fixed-point sats per token base unit.
 *   stored = realPrice * 2^88
 *   final result fits u128 (40 integer bits + 88 fractional bits = 128 bits)
 *
 * Computation uses u256 intermediates because:
 *   - RATIO_AT_BIT[15] = 1.001^32768 * 2^88 ≈ 5.18e40 exceeds u128 max (3.4e38)
 *   - worst-case running product at |tick|=54116 ≈ 2^254 (fits u256 with margin)
 *
 * Why Q40.88: with only `__mul256` (no u512), every intermediate
 *   `ratio * RATIO[k]` must be < 2^256. That gives:
 *      |tick| < (256 - 2*FP_SHIFT) / log2(1.001)
 *   Combined with distinguishability (step >= 1 LSB), the analytical
 *   optimum is FP_SHIFT = (256 + log2(1000)) / 3 ≈ 88.66 → 88.
 *
 * Direction: tick rising = price rising. Lowest tick = cheapest = best for the buyer.
 */
export class TickMath {
    /**
     * Convert a tick to its Q40.88 sats-per-base-unit price.
     *
     * Algorithm:
     *   1. Bounds-check: revert if tick outside [MIN_TICK, MAX_TICK].
     *   2. Start ratio = 2^88 (= 1.0 in Q40.88, kept in u256).
     *   3. For each set bit k in |tick|, multiply by RATIO_AT_BIT[k] and shift right 88.
     *   4. If tick < 0, invert: ratio = 2^176 / ratio (gives Q40.88 of 1/positive_value).
     *   5. Cast to u128 and return.
     *
     * @param tick i32 in [MIN_TICK, MAX_TICK]
     * @returns Q40.88 sats per base unit, fits u128
     */
    public static tickToPrice(tick: i32): u128 {
        if (tick < MIN_TICK || tick > MAX_TICK) {
            throw new Revert(
                `TickMath: tick ${tick} out of range [${MIN_TICK}, ${MAX_TICK}].`,
            );
        }

        const absTick: u32 = tick < 0 ? <u32>-tick : <u32>tick;

        // ratio starts at 2^88 (Q40.88 representation of 1.0), kept as u256.
        let ratio: u256 = u256.shl(u256.One, <i32>FP_SHIFT);

        // Multiply by 1.001^(2^k) for each set bit k. Each step:
        //   ratio = (ratio * RATIO_AT_BIT[k]) >> FP_SHIFT
        // Worst-case product at |tick|=54116 is ~2^254, fits u256.
        for (let k: u32 = 0; k < 16; k++) {
            if ((absTick & (<u32>1 << k)) != 0) {
                const product: u256 = SafeMath.mul(ratio, ratioAtBit(k));
                ratio = u256.shr(product, <i32>FP_SHIFT);
            }
        }

        if (tick < 0) {
            // Invert: realPrice(-T) = 1 / realPrice(T)
            // In Q40.88: stored(-T) = 2^88 / realPrice(T) = 2^88 * 2^88 / stored(T) = 2^176 / stored(T)
            const numerator: u256 = u256.shl(u256.One, <i32>(2 * FP_SHIFT));
            ratio = SafeMath.div(numerator, ratio);
        }

        // Final result must fit u128. For positive ticks at MAX_TICK = +27739,
        // ratio ≈ 2^128 exactly (the boundary). For negative ticks the inverted
        // value is much smaller. SafeMath in u256 just truncates the high limbs,
        // so we explicitly check that the high limbs are zero.
        if (ratio.hi1 != 0 || ratio.hi2 != 0) {
            throw new Revert(
                `TickMath: tickToPrice overflow at tick ${tick} — result exceeds u128.`,
            );
        }
        return ratio.toU128();
    }

    /**
     * Count trailing zeros in a u256 word (number of low zero bits before the lowest set bit).
     * Used by the bitmap walk to find the lowest occupied tick within a non-zero word.
     *
     * Returns 256 if the word is entirely zero.
     */
    public static countTrailingZeros(word: u256): u32 {
        if (word.lo1 != 0) return <u32>(ctz<u64>(word.lo1));
        if (word.lo2 != 0) return 64 + <u32>(ctz<u64>(word.lo2));
        if (word.hi1 != 0) return 128 + <u32>(ctz<u64>(word.hi1));
        if (word.hi2 != 0) return 192 + <u32>(ctz<u64>(word.hi2));
        return 256;
    }

    /**
     * Map a signed tick to its bitmap (wordIdx, bitIdx) coordinates.
     *   unsigned = tick + TICK_OFFSET   (so MIN_TICK maps to 0, MAX_TICK maps to 81855)
     *   wordIdx  = unsigned / 256       (which u256 word in the bitmap)
     *   bitIdx   = unsigned % 256       (which bit within that word)
     */
    public static wordIdx(tick: i32): u32 {
        const unsigned: u32 = <u32>(tick + TICK_OFFSET);
        return unsigned >> 8;
    }

    public static bitIdx(tick: i32): u8 {
        const unsigned: u32 = <u32>(tick + TICK_OFFSET);
        return <u8>(unsigned & 0xff);
    }

    /**
     * Inverse of (wordIdx, bitIdx) → tick. The lowest set bit in word W at bit B
     * corresponds to: tick = W*256 + B - TICK_OFFSET.
     */
    public static tickFromBitmap(wordIdx: u32, bitIdx: u32): i32 {
        const unsigned: u32 = (wordIdx << 8) | bitIdx;
        return <i32>unsigned - TICK_OFFSET;
    }

    /**
     * Set the bit corresponding to `tick` in `word` (mutating the word value semantically — caller stores the new value).
     */
    public static setBit(word: u256, tick: i32): u256 {
        const bit: u32 = <u32>TickMath.bitIdx(tick);
        const mask: u256 = u256.shl(u256.One, <i32>bit);
        return u256.or(word, mask);
    }

    /**
     * Clear the bit corresponding to `tick` in `word`.
     */
    public static clearBit(word: u256, tick: i32): u256 {
        const bit: u32 = <u32>TickMath.bitIdx(tick);
        const mask: u256 = u256.shl(u256.One, <i32>bit);
        // ~mask via u256.sub(Max, mask) since AssemblyScript u256 doesn't have a `not` method
        const notMask: u256 = u256.sub(u256.Max, mask);
        return u256.and(word, notMask);
    }

    /**
     * Check whether the bit at `tick` is set in `word`.
     */
    public static isBitSet(word: u256, tick: i32): bool {
        const bit: u32 = <u32>TickMath.bitIdx(tick);
        const mask: u256 = u256.shl(u256.One, <i32>bit);
        return !u256.and(word, mask).isZero();
    }

    /**
     * Compute satoshis owed for `tokens` (u128 base units) at a given Q40.88 fillPrice.
     *   sats = (tokens * fillPrice) >> 88
     * The product fits u256; the shifted result fits u64 in any realistic configuration
     * (we cap by `MAX_TOTAL_SATOSHIS` upstream when needed).
     */
    public static tokensToSatoshis(tokens: u128, fillPrice: u128): u64 {
        if (tokens.isZero() || fillPrice.isZero()) return 0;
        const product: u256 = SafeMath.mul(tokens.toU256(), fillPrice.toU256());
        const shifted: u256 = u256.shr(product, <i32>FP_SHIFT);
        // Final result must fit u64 (sats are bounded by 21M BTC = 2.1e15 sats < 2^64).
        if (shifted.lo2 != 0 || shifted.hi1 != 0 || shifted.hi2 != 0) {
            throw new Revert(`TickMath: tokensToSatoshis overflows u64.`);
        }
        return shifted.lo1;
    }

    /**
     * Compute the maximum tokens (u128 base units) buyable for `sats` at a Q40.88 fillPrice.
     *   tokens = (sats << 88) / fillPrice
     * Intermediate (sats(u64) << 88) max = 2^64 * 2^88 = 2^152, fits u256.
     * Result is capped to u128.Max if the division would overflow u128.
     */
    public static satoshisToTokens(sats: u64, fillPrice: u128): u128 {
        if (sats == 0) return u128.Zero;
        if (fillPrice.isZero()) {
            throw new Revert(`TickMath: satoshisToTokens with fillPrice=0 (impossible state).`);
        }
        const numerator: u256 = u256.shl(u256.fromU64(sats), <i32>FP_SHIFT);
        const tokens: u256 = SafeMath.div(numerator, fillPrice.toU256());
        // Cap at u128.Max — for ultra-low fillPrice + ultra-high sats this can exceed u128.
        const u128MaxAsU256: u256 = u128.Max.toU256();
        if (u256.gt(tokens, u128MaxAsU256)) {
            return u128.Max;
        }
        return tokens.toU128();
    }
}
