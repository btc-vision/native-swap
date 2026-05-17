import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import { tokenAddress1, tokenIdUint8Array1 } from './test_helper';
import { u256 } from '@btc-vision/as-bignum/assembly';

/**
 * LiquidityQueueReserve spec — post-refactor.
 *
 * The old reserve tracked four counters in addition to liquidity/reservedLiquidity:
 *   totalTokensSellActivated, totalTokensExchangedForSatoshis,
 *   totalSatoshisExchangedForTokens, virtualTokenReserve, virtualSatoshisReserve.
 *
 * Those existed for the AMM's price discovery (virtual pool + post-hoc volatility).
 * They are all gone. The reserve now only tracks:
 *   - liquidity         (total tokens custodied)
 *   - reservedLiquidity (tokens currently locked by active reservations)
 *   - availableLiquidity = liquidity - reservedLiquidity (derived)
 *
 * The surviving tests below cover overflow/underflow on the two real counters.
 */

describe('LiquidityQueueReserve', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('defaults to zero on construction', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        expect(reserve.liquidity).toStrictEqual(u256.Zero);
        expect(reserve.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(reserve.availableLiquidity).toStrictEqual(u256.Zero);
    });

    // ────────────────────────────────────────────────────────────────────────
    // total liquidity counter
    // ────────────────────────────────────────────────────────────────────────

    it('addToTotalReserve increases liquidity', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const inc: u256 = u256.fromU64(1000);
        reserve.addToTotalReserve(inc);
        expect(reserve.liquidity).toStrictEqual(inc);
    });

    it('subFromTotalReserve decreases liquidity', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        reserve.addToTotalReserve(u256.fromU64(500));
        reserve.subFromTotalReserve(u256.fromU64(200));
        expect(reserve.liquidity).toStrictEqual(u256.fromU64(300));
    });

    it('addToTotalReserve overflows when exceeding u256.MAX', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            reserve.addToTotalReserve(u256.Max);
            reserve.addToTotalReserve(u256.One);
        }).toThrow();
    });

    it('subFromTotalReserve underflows when subtracting more than exists', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            reserve.subFromTotalReserve(u256.One);
        }).toThrow();
    });

    // ────────────────────────────────────────────────────────────────────────
    // reservedLiquidity counter
    // ────────────────────────────────────────────────────────────────────────

    it('addToTotalReserved increases reservedLiquidity', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        reserve.addToTotalReserved(u256.fromU64(400));
        expect(reserve.reservedLiquidity).toStrictEqual(u256.fromU64(400));
    });

    it('subFromTotalReserved decreases reservedLiquidity', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        reserve.addToTotalReserved(u256.fromU64(400));
        reserve.subFromTotalReserved(u256.fromU64(150));
        expect(reserve.reservedLiquidity).toStrictEqual(u256.fromU64(250));
    });

    it('addToTotalReserved overflows when exceeding u256.MAX', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            reserve.addToTotalReserved(u256.Max);
            reserve.addToTotalReserved(u256.One);
        }).toThrow();
    });

    it('subFromTotalReserved underflows when subtracting more than exists', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            reserve.subFromTotalReserved(u256.One);
        }).toThrow();
    });

    // ────────────────────────────────────────────────────────────────────────
    // availableLiquidity (derived)
    // ────────────────────────────────────────────────────────────────────────

    it('availableLiquidity = liquidity − reservedLiquidity', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        reserve.addToTotalReserve(u256.fromU64(1000));
        reserve.addToTotalReserved(u256.fromU64(250));
        expect(reserve.availableLiquidity).toStrictEqual(u256.fromU64(750));
    });

    it('availableLiquidity underflows when reserved exceeds total', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            reserve.addToTotalReserve(u256.fromU64(1000));
            reserve.addToTotalReserved(u256.fromU64(1001));
            const _ = reserve.availableLiquidity;
        }).toThrow();
    });

    it('liquidity setter round-trips', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        reserve.liquidity = u256.fromU64(1000);
        expect(reserve.liquidity).toStrictEqual(u256.fromU64(1000));
    });
});
