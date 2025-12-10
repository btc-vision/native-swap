import { clearCachedProviders } from '../models/Provider';
import { Blockchain, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { QUOTE_SCALE } from '../constants/Contract';
import {
    CappedTokensResult,
    capTokensU256ToU128,
    satoshisToTokens,
    satoshisToTokens128,
    tokensToSatoshis,
    tokensToSatoshis128,
} from '../utils/SatoshisConversion';

describe('SatoshisConversions tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });
    describe('tokensToSatoshis()', () => {
        it('converts tokenAmount to satoshis', () => {
            const tokenAmount: u256 = u256.fromU64(5);
            const scaledPrice: u256 = QUOTE_SCALE;
            const result: u64 = tokensToSatoshis(tokenAmount, scaledPrice);
            expect(result).toStrictEqual(5);
        });

        it('converts with scaledPrice double QUOTE_SCALE', () => {
            const tokenAmount: u256 = u256.fromU64(5);
            const scaledPrice: u256 = SafeMath.mul(QUOTE_SCALE, u256.fromU64(2));
            const result: u64 = tokensToSatoshis(tokenAmount, scaledPrice);
            expect(result).toStrictEqual(3);
        });

        it('throws if result exceeds MAX_TOTAL_SATOSHIS', () => {
            expect(() => {
                const big: u256 = u256.fromString('99999999999999999999');
                const scaledPrice: u256 = u256.fromU64(1);

                tokensToSatoshis(big, scaledPrice);
            }).toThrow();
        });

        it('should return 0 if number of token is 0', () => {
            const satoshis = tokensToSatoshis(u256.Zero, u256.fromU32(1000));
            expect(satoshis).toStrictEqual(0);
        });
    });

    describe('tokensToSatoshis128()', () => {
        it('delegates to tokensToSatoshis correctly', () => {
            const tokenAmount128: u128 = u128.fromU64(10);
            const scaledPrice: u256 = QUOTE_SCALE;
            const result: u64 = tokensToSatoshis128(tokenAmount128, scaledPrice);
            expect(result).toStrictEqual(10);
        });
    });

    describe('satoshisToTokens()', () => {
        it('converts satoshis to tokens: sats*QUOTE_SCALE/QUOTE_SCALE', () => {
            const sats: u64 = 7;
            const scaledPrice: u256 = QUOTE_SCALE;
            const result: u256 = satoshisToTokens(sats, scaledPrice);
            expect(result).toStrictEqual(u256.fromU64(7));
        });

        it('converts with scaledPrice half QUOTE_SCALE', () => {
            const sats: u64 = 7;
            const scaledPrice: u256 = SafeMath.div(QUOTE_SCALE, u256.fromU64(2));
            const result: u256 = satoshisToTokens(sats, scaledPrice);
            expect(result).toStrictEqual(u256.fromU64(3));
        });

        it('converts with scaledPrice double QUOTE_SCALE', () => {
            const sats: u64 = 7;
            const scaledPrice: u256 = SafeMath.mul(QUOTE_SCALE, u256.fromU64(2));
            const result: u256 = satoshisToTokens(sats, scaledPrice);
            expect(result).toStrictEqual(u256.fromU64(14));
        });
    });

    describe('satoshisToTokens128()', () => {
        it('within u128 range yields tokens and satoshis, not capped', () => {
            const sats: u64 = 3;
            const scaledPrice: u256 = QUOTE_SCALE;
            const res: CappedTokensResult = satoshisToTokens128(sats, scaledPrice);
            expect(res.tokens).toStrictEqual(u128.fromU64(3));
            expect(res.satoshis).toBe(sats);
            expect(res.isCapped).toBeFalsy();
        });

        it('caps result when tokens exceed u128.Max without throwing by default', () => {
            const oneSat: u64 = 1;
            const overflowPrice: u256 = SafeMath.mul(
                SafeMath.add(u128.Max.toU256(), u256.One),
                QUOTE_SCALE,
            );
            const res: CappedTokensResult = satoshisToTokens128(oneSat, overflowPrice);
            expect(res.tokens).toStrictEqual(u128.Max);
            expect(res.satoshis).toStrictEqual(1);
            expect(res.isCapped).toBeTruthy();
        });

        it('throws when overflow and throwOnOverflow=true', () => {
            expect(() => {
                const oneSat: u64 = 1;
                const overflowPrice: u256 = SafeMath.mul(
                    SafeMath.add(u128.Max.toU256(), u256.One),
                    QUOTE_SCALE,
                );

                satoshisToTokens128(oneSat, overflowPrice, true);
            }).toThrow();
        });
    });

    describe('capTokensU256ToU128()', () => {
        it('zero tokensIn yields zero result', () => {
            const tokensIn: u256 = u256.Zero;
            const satsIn: u64 = 5;
            const scaledPrice: u256 = QUOTE_SCALE;
            const res: CappedTokensResult = capTokensU256ToU128(tokensIn, satsIn, scaledPrice);
            expect(res.tokens).toStrictEqual(u128.Zero);
            expect(res.satoshis).toStrictEqual(0);
            expect(res.isCapped).toBeFalsy();
        });

        it('tokensIn within u128 range returns same values', () => {
            const tokensIn: u256 = u128.Max.toU256();
            const satsIn: u64 = 9;
            const scaledPrice: u256 = QUOTE_SCALE;
            const res: CappedTokensResult = capTokensU256ToU128(tokensIn, satsIn, scaledPrice);
            expect(res.tokens).toStrictEqual(u128.Max);
            expect(res.satoshis).toStrictEqual(satsIn);
            expect(res.isCapped).toBeFalsy();
        });

        it('caps tokensIn above u128 range and recalculates satoshis', () => {
            const tokensIn: u256 = SafeMath.add(u128.Max.toU256(), u256.One);
            const satsIn: u64 = 9;
            const scaledPrice: u256 = SafeMath.mul(
                QUOTE_SCALE,
                u256.fromString('99999999999999999999999999999'),
            );
            const res: CappedTokensResult = capTokensU256ToU128(tokensIn, satsIn, scaledPrice);
            expect(res.tokens).toStrictEqual(u128.Max);
            const expectedSats: u64 = tokensToSatoshis128(u128.Max, scaledPrice);
            expect(res.satoshis).toStrictEqual(expectedSats);
            expect(res.isCapped).toBeFalsy();
        });
    });
});
