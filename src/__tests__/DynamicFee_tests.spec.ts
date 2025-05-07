import { clearCachedProviders } from '../lib/Provider';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { DynamicFee } from '../lib/DynamicFee';
import { u256 } from '@btc-vision/as-bignum';

describe('DynamicFee tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('constructor should set default values', () => {
        const tokenId = u256.fromU64(123).toUint8Array(true).slice(0, 30);
        const df = new DynamicFee(tokenId);

        expect(df.baseFeeBP).toStrictEqual(20);
        expect(df.minFeeBP).toStrictEqual(15);
        expect(df.maxFeeBP).toStrictEqual(150);

        expect(df.alpha).toStrictEqual(20);
        expect(df.beta).toStrictEqual(15);
        expect(df.gamma).toStrictEqual(3);

        expect(df.volatility).toStrictEqual(u256.Zero);
    });

    it('should allow setting and getting volatility', () => {
        const df = new DynamicFee(u256.fromU64(999).toUint8Array(true).slice(0, 30));
        expect(df.volatility).toStrictEqual(u256.Zero);

        df.volatility = u256.fromU64(500);
        expect(df.volatility).toStrictEqual(u256.fromU32(500));
    });

    describe('getDynamicFeeBP()', () => {
        it('should fallback ratio to 1 if tradeSize<REF_TRADE_SIZE => ratio=0 => set ratio=1 => no alpha comp', () => {
            const df = new DynamicFee(u256.Zero.toUint8Array(true).slice(0, 30));

            const fee = df.getDynamicFeeBP(u256.fromU64(100_000), u256.fromU64(10));
            expect(fee).toStrictEqual(23);
        });

        it('should add alpha component if tradeSize>REF_TRADE_SIZE => ratio>1 => alpha>0', () => {
            const df = new DynamicFee(u256.Zero.toUint8Array(true).slice(0, 30));
            df.volatility = u256.Zero;

            const tradeSize = u256.fromU64(400_000);
            const fee = df.getDynamicFeeBP(tradeSize, u256.Zero);

            expect<bool>(fee > 20).toBeTruthy();
            expect<bool>(fee <= df.maxFeeBP).toBeTruthy();
        });

        it('should incorporate volatility => beta*(vol)/10000', () => {
            const df = new DynamicFee(u256.Zero.toUint8Array(true).slice(0, 30));
            const tradeSize = u256.fromU64(200_000);
            const util = u256.Zero;
            df.volatility = u256.fromU64(2000);

            const fee = df.getDynamicFeeBP(tradeSize, util);
            expect(fee).toStrictEqual(23);
        });

        it('should incorporate gamma*(util)/10', () => {
            const df = new DynamicFee(u256.Zero.toUint8Array(true).slice(0, 30));
            const util = u256.fromU64(25);
            const tradeSize = u256.fromU64(200_000);
            df.volatility = u256.Zero;

            const fee = df.getDynamicFeeBP(tradeSize, util);
            expect(fee).toStrictEqual(27);
        });

        it('should clamp to minFee if result < minFee', () => {
            const df = new DynamicFee(u256.Zero.toUint8Array(true).slice(0, 30));
            df.baseFeeBP = 5;
            df.minFeeBP = 15;
            df.maxFeeBP = 150;

            const fee = df.getDynamicFeeBP(u256.fromU64(100_000), u256.fromU64(0));
            expect(fee).toStrictEqual(15);
        });

        it('should clamp to maxFee if result> maxFee', () => {
            const df = new DynamicFee(u256.Zero.toUint8Array(true).slice(0, 30));
            df.baseFeeBP = 180;
            df.minFeeBP = 15;
            df.maxFeeBP = 150;

            const fee = df.getDynamicFeeBP(u256.fromU64(200_000), u256.Zero);
            expect(fee).toStrictEqual(150);
        });
    });

    describe('computeFeeAmount()', () => {
        it('should return (amount * feeBP)/10000', () => {
            const df = new DynamicFee(u256.Zero.toUint8Array(true).slice(0, 30));
            const amount = u256.fromU64(10000);
            const feeBP = <u64>25;

            const fee = df.computeFeeAmount(amount, feeBP);
            expect(fee).toStrictEqual(u256.fromU32(25));
        });

        it('should handle large amount with no overflow in logic (u256 usage)', () => {
            const df = new DynamicFee(u256.Zero.toUint8Array(true).slice(0, 30));
            const amount = u256.fromU64(1_000_000_000);
            const feeBP = <u64>100;

            const fee = df.computeFeeAmount(amount, feeBP);
            expect(fee).toStrictEqual(u256.fromU32(10_000_000));
        });

        it('should yield 0 if feeBP=0', () => {
            const df = new DynamicFee(u256.Zero.toUint8Array(true).slice(0, 30));
            const amount = u256.fromU64(50_000);
            const fee = df.computeFeeAmount(amount, 0);
            expect(fee).toStrictEqual(u256.Zero);
        });
    });
});
