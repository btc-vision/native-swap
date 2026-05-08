import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    AT_LEAST_PROVIDERS_TO_PURGE,
    BITMAP_WORD_COUNT,
    CSV_BLOCKS_REQUIRED,
    EMIT_PURGE_EVENTS,
    FP_SHIFT,
    INDEX_NOT_SET_VALUE,
    MAX_ACTIVATION_DELAY,
    MAX_TICK,
    MAX_TOTAL_SATOSHIS,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
    MAXIMUM_VALID_INDEX,
    MIN_TICK,
    MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT,
    MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
    MINIMUM_TRADE_SIZE_IN_SAT,
    RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
    SWAP_FEE_BPS,
    SWAP_FEE_DENOM,
    TICK_OFFSET,
    TIMEOUT_AFTER_EXPIRATION_BLOCKS,
} from '../constants/Contract';

/**
 * Locks in every load-bearing constant. If a value drifts, this suite fails
 * and the diff makes it obvious. Pure constant comparison — no host imports.
 */

describe('Contract constants — minimum-value floors (NON-NEGOTIABLE)', (): void => {
    it('listing floor is 20_000 sats', (): void => {
        expect<u64>(MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT).toBe(20_000);
    });
    it('strict per-provider reservation floor is 1_000 sats', (): void => {
        expect<u64>(STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT).toBe(1_000);
    });
    it('loose dust-snap threshold is 1_000 sats (same as strict in this revision)', (): void => {
        expect<u64>(MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT).toBe(1_000);
        expect<bool>(
            MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT ==
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
        ).toBe(true);
    });
    it('buyer-side trade-size floor is 10_000 sats', (): void => {
        expect<u64>(MINIMUM_TRADE_SIZE_IN_SAT).toBe(10_000);
    });
});

describe('Contract constants — swap fee', (): void => {
    it('SWAP_FEE_BPS / SWAP_FEE_DENOM == 0.30%', (): void => {
        expect<u64>(SWAP_FEE_BPS).toBe(30);
        expect<u64>(SWAP_FEE_DENOM).toBe(10_000);
        // Sanity: 30/10_000 = 0.003 = 0.3%
        expect<u64>((SWAP_FEE_BPS * 100_000) / SWAP_FEE_DENOM).toBe(300);
    });
});

describe('Contract constants — tick layout (Q40.88, script-verified)', (): void => {
    it('FP_SHIFT == 88', (): void => {
        expect<u32>(FP_SHIFT).toBe(88);
    });
    it('MIN_TICK == -54_116', (): void => {
        expect<i32>(MIN_TICK).toBe(-54_116);
    });
    it('MAX_TICK == +27_739', (): void => {
        expect<i32>(MAX_TICK).toBe(27_739);
    });
    it('TICK_OFFSET cancels MIN_TICK to zero', (): void => {
        expect<i32>(TICK_OFFSET + MIN_TICK).toBe(0);
    });
    it('BITMAP_WORD_COUNT covers the full unsigned tick range', (): void => {
        // unsigned range = MAX_TICK + TICK_OFFSET + 1
        const span: u32 = <u32>(MAX_TICK + TICK_OFFSET + 1);
        // ceil(span / 256)
        const need: u32 = (span + 255) / 256;
        expect<u32>(BITMAP_WORD_COUNT).toBe(need);
    });
});

describe('Contract constants — execution & gas bounds', (): void => {
    it('MAXIMUM_PROVIDER_PER_RESERVATIONS == 150 (250-input UTXO budget − 10 margin)', (): void => {
        expect<u8>(MAXIMUM_PROVIDER_PER_RESERVATIONS).toBe(150);
    });
    it('AT_LEAST_PROVIDERS_TO_PURGE == 100', (): void => {
        expect<u32>(AT_LEAST_PROVIDERS_TO_PURGE).toBe(100);
    });
    it('RESERVATION_EXPIRE_AFTER_IN_BLOCKS == 8', (): void => {
        expect<u64>(RESERVATION_EXPIRE_AFTER_IN_BLOCKS).toBe(8);
    });
    it('TIMEOUT_AFTER_EXPIRATION_BLOCKS == 2', (): void => {
        expect<u8>(TIMEOUT_AFTER_EXPIRATION_BLOCKS).toBe(2);
    });
    it('MAX_ACTIVATION_DELAY == 3', (): void => {
        expect<u8>(MAX_ACTIVATION_DELAY).toBe(3);
    });
    it('CSV_BLOCKS_REQUIRED == 1', (): void => {
        expect<i32>(CSV_BLOCKS_REQUIRED).toBe(1);
    });
});

describe('Contract constants — sentinels & caps', (): void => {
    it('INDEX_NOT_SET_VALUE == U32.MAX', (): void => {
        expect<u32>(INDEX_NOT_SET_VALUE).toBe(u32.MAX_VALUE);
    });
    it('MAXIMUM_VALID_INDEX == U32.MAX − 2', (): void => {
        expect<u32>(MAXIMUM_VALID_INDEX).toBe(u32.MAX_VALUE - 2);
    });
    it('MAX_TOTAL_SATOSHIS == 21M BTC × 1e8', (): void => {
        const expected: u256 = u256.fromU64(21_000_000 * 100_000_000);
        expect<bool>(u256.eq(MAX_TOTAL_SATOSHIS, expected)).toBe(true);
    });
});

describe('Contract constants — feature flags', (): void => {
    it('EMIT_PURGE_EVENTS is on by default', (): void => {
        expect<bool>(EMIT_PURGE_EVENTS).toBe(true);
    });
});

describe('Contract constants — invariants', (): void => {
    it('listing floor is at least 20× per-entry strict minimum', (): void => {
        // A listing must cover at least 20 separate per-provider entries at
        // the minimum reservation size. This is the basic spam-resistance
        // invariant of the system.
        expect<bool>(
            MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT >=
                STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT * 20,
        ).toBe(true);
    });

    it('trade-size floor is a clean multiple of per-entry strict minimum', (): void => {
        expect<u64>(MINIMUM_TRADE_SIZE_IN_SAT % STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)
            .toBe(0);
    });
});
