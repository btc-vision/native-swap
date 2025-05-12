import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '../../../btc-runtime/runtime';
import { min128, min64 } from '../utils/MathUtils';
import { u128 } from '@btc-vision/as-bignum/assembly';

describe('MathUtils tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

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
