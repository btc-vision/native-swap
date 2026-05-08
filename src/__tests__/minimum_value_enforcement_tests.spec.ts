import { u128 } from '@btc-vision/as-bignum/assembly';
import { TickMath } from '../utils/TickMath';
import {
    MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT,
    MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
    MINIMUM_TRADE_SIZE_IN_SAT,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';

/**
 * Boundary tests for the four sat-minimums (NON-NEGOTIABLE):
 *   - 20,000 sats : MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT (listing floor)
 *   - 10,000 sats : MINIMUM_TRADE_SIZE_IN_SAT (buyer-side reservation budget floor)
 *   - 1,000  sats : STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT (per-entry floor)
 *   - 1,000  sats : MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT (dust-snap threshold)
 */

describe('Minimum-value constants', (): void => {
    it('MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT == 20_000', (): void => {
        expect<u64>(MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT).toBe(20_000);
    });
    it('STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT == 1_000', (): void => {
        expect<u64>(STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT).toBe(1_000);
    });
    it('MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT == 1_000', (): void => {
        expect<u64>(MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT).toBe(1_000);
    });
    it('MINIMUM_TRADE_SIZE_IN_SAT == 10_000', (): void => {
        expect<u64>(MINIMUM_TRADE_SIZE_IN_SAT).toBe(10_000);
    });
});

describe('Listing minimum (20k sats) at various ticks', (): void => {
    it('at tick 0 (1 sat/base-unit), 20_000 base units = 20_000 sats → meets minimum', (): void => {
        const fillPrice: u128 = TickMath.tickToPrice(0);
        const sats: u64 = TickMath.tokensToSatoshis(u128.fromU64(20_000), fillPrice);
        expect<u64>(sats).toBe(20_000);
        expect<bool>(sats >= MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT).toBe(true);
    });

    it('at tick 0, 19_999 base units = 19_999 sats → below minimum', (): void => {
        const fillPrice: u128 = TickMath.tickToPrice(0);
        const sats: u64 = TickMath.tokensToSatoshis(u128.fromU64(19_999), fillPrice);
        expect<bool>(sats < MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT).toBe(true);
    });
});

describe('Per-provider reservation minimum (1k sats) at tick 0', (): void => {
    it('1000 base units at tick 0 = 1000 sats → meets minimum', (): void => {
        const fillPrice: u128 = TickMath.tickToPrice(0);
        const sats: u64 = TickMath.tokensToSatoshis(u128.fromU64(1000), fillPrice);
        expect<u64>(sats).toBe(1000);
        expect<bool>(sats >= STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT).toBe(true);
    });

    it('999 base units at tick 0 = 999 sats → below minimum', (): void => {
        const fillPrice: u128 = TickMath.tickToPrice(0);
        const sats: u64 = TickMath.tokensToSatoshis(u128.fromU64(999), fillPrice);
        expect<bool>(sats < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT).toBe(true);
    });
});
