import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import { tokenAddress1, tokenIdUint8Array1 } from './test_helper';
import { u256 } from '@btc-vision/as-bignum/assembly';

function createReserve(): LiquidityQueueReserve {
    return new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
}

describe('CompletedTrade tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('values defaults to zero after creation', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        expect(reserve.liquidity).toStrictEqual(u256.Zero);
        expect(reserve.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(reserve.availableLiquidity).toStrictEqual(u256.Zero);
        expect(reserve.totalTokensSellActivated).toStrictEqual(u256.Zero);
        expect(reserve.totalTokensExchangedForSatoshis).toStrictEqual(u256.Zero);
        expect(reserve.totalSatoshisExchangedForTokens).toStrictEqual(0);
        expect(reserve.virtualTokenReserve).toStrictEqual(u256.Zero);
        expect(reserve.virtualSatoshisReserve).toStrictEqual(0);
    });

    it('can set and get totalTokensSellActivated', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const value: u256 = u256.fromU64(123);
        reserve.totalTokensSellActivated = value;
        expect(reserve.totalTokensSellActivated).toStrictEqual(value);
    });

    it('can set and get totalTokensExchangedForSatoshis', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const value: u256 = u256.fromU64(456);
        reserve.totalTokensExchangedForSatoshis = value;
        expect(reserve.totalTokensExchangedForSatoshis).toStrictEqual(value);
    });

    it('can set and get totalSatoshisExchangedForTokens', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const value: u64 = 789;
        reserve.totalSatoshisExchangedForTokens = value;
        expect(reserve.totalSatoshisExchangedForTokens).toStrictEqual(value);
    });

    it('can set and get virtualTokenReserve', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const value: u256 = u256.fromU64(1000);
        reserve.virtualTokenReserve = value;
        expect(reserve.virtualTokenReserve).toStrictEqual(value);
    });

    it('can set and get virtualSatoshisReserve', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const value: u64 = 2000;
        reserve.virtualSatoshisReserve = value;
        expect(reserve.virtualSatoshisReserve).toStrictEqual(value);
    });

    it('addTototalTokensSellActivated increments only totalTokensSellActivated', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const a: u256 = u256.fromU64(10);
        const b: u256 = u256.fromU64(15);
        reserve.addToTotalTokensSellActivated(a);
        expect(reserve.totalTokensSellActivated).toStrictEqual(a);
        reserve.addToTotalTokensSellActivated(b);
        expect(reserve.totalTokensSellActivated).toStrictEqual(u256.fromU64(25));
    });

    it('addTototalTokensSellActivated overflows when exceeding u256.MAX', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const max: u256 = u256.Max;
            const one: u256 = u256.One;
            reserve.totalTokensSellActivated = max;
            expect(reserve.totalTokensSellActivated).toStrictEqual(max);

            reserve.addToTotalTokensSellActivated(one);
        }).toThrow();
    });

    it('addTototalTokensExchangedForSatoshis increments only totalTokensExchangedForSatoshis', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const value: u256 = u256.fromU64(7);
        reserve.addToTotalTokensExchangedForSatoshis(value);
        expect(reserve.totalTokensExchangedForSatoshis).toStrictEqual(value);
    });

    it('addTototalTokensExchangedForSatoshis overflows when exceeding u256.MAX', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const max: u256 = u256.Max;
            const one: u256 = u256.One;
            reserve.totalTokensExchangedForSatoshis = max;
            expect(reserve.totalTokensExchangedForSatoshis).toStrictEqual(max);

            reserve.addToTotalTokensExchangedForSatoshis(one);
        }).toThrow();
    });

    it('addTototalSatoshisExchangedForTokens increments only totalSatoshisExchangedForTokens', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const x: u64 = 100;
        const y: u64 = 50;
        reserve.addToTotalSatoshisExchangedForTokens(x);
        expect(reserve.totalSatoshisExchangedForTokens).toStrictEqual(x);
        reserve.addToTotalSatoshisExchangedForTokens(y);
        expect(reserve.totalSatoshisExchangedForTokens).toStrictEqual(150);
    });

    it('addTototalSatoshisExchangedForTokens overflows when exceeding u64.MAX', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const max64: u64 = u64.MAX_VALUE;
            const one64: u64 = 1;
            reserve.totalSatoshisExchangedForTokens = max64;
            expect(reserve.totalSatoshisExchangedForTokens).toStrictEqual(max64);

            reserve.addToTotalSatoshisExchangedForTokens(one64);
        }).toThrow();
    });

    it('addToTotalReserve increases liquidity', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const inc: u256 = u256.fromU64(1000);
        reserve.addToTotalReserve(inc);
        expect(reserve.liquidity).toStrictEqual(inc);
    });

    it('subFromTotalReserve decreases liquidity', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const inc: u256 = u256.fromU64(500);
        reserve.addToTotalReserve(inc);
        const dec: u256 = u256.fromU64(200);
        reserve.subFromTotalReserve(dec);
        expect(reserve.liquidity).toStrictEqual(u256.fromU64(300));
    });

    it('addToTotalReserve overflows when exceeding u256.MAX', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const max: u256 = u256.Max;
            const one: u256 = u256.One;
            reserve.addToTotalReserve(max);
            reserve.addToTotalReserve(one);
        }).toThrow();
    });

    it('subFromTotalReserve underflows when subtracting more than exists', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const one: u256 = u256.One;

            reserve.subFromTotalReserve(one);
        }).toThrow();
    });

    it('addToTotalReserved increases reservedLiquidity', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const inc: u256 = u256.fromU64(400);
        reserve.addToTotalReserved(inc);
        expect(reserve.reservedLiquidity).toStrictEqual(inc);
    });

    it('subFromTotalReserved decreases reservedLiquidity', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const inc: u256 = u256.fromU64(400);
        reserve.addToTotalReserved(inc);
        const dec: u256 = u256.fromU64(150);
        reserve.subFromTotalReserved(dec);
        expect(reserve.reservedLiquidity).toStrictEqual(u256.fromU64(250));
    });

    it('addToTotalReserved overflows when exceeding u256.MAX', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const max: u256 = u256.Max;
            const one: u256 = u256.One;
            reserve.addToTotalReserved(max);

            reserve.addToTotalReserved(one);
        }).toThrow();
    });

    it('subFromTotalReserved underflows when subtracting more than exists', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const one: u256 = u256.One;

            reserve.subFromTotalReserved(one);
        }).toThrow();
    });

    it('addToVirtualTokenReserve updates virtualTokenReserve', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const inc: u256 = u256.fromU64(300);
        reserve.addToVirtualTokenReserve(inc);
        expect(reserve.virtualTokenReserve).toStrictEqual(inc);
    });

    it('subFromVirtualTokenReserve updates virtualTokenReserve', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const inc: u256 = u256.fromU64(300);
        reserve.addToVirtualTokenReserve(inc);
        const dec: u256 = u256.fromU64(120);
        reserve.subFromVirtualTokenReserve(dec);
        expect(reserve.virtualTokenReserve).toStrictEqual(u256.fromU64(180));
    });

    it('addToVirtualTokenReserve overflows when exceeding u256.MAX', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const max: u256 = u256.Max;
            const one: u256 = u256.One;
            reserve.virtualTokenReserve = max;
            expect(reserve.virtualTokenReserve).toStrictEqual(max);

            reserve.addToVirtualTokenReserve(one);
        }).toThrow();
    });

    it('subFromVirtualTokenReserve underflows when subtracting more than exists', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const one: u256 = u256.One;

            reserve.subFromVirtualTokenReserve(one);
        }).toThrow();
    });

    it('addToVirtualSatoshisReserve updates virtualSatoshisReserve', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const inc: u64 = 500;
        reserve.addToVirtualSatoshisReserve(inc);
        expect(reserve.virtualSatoshisReserve).toStrictEqual(inc);
    });

    it('subFromVirtualSatoshisReserve updates virtualSatoshisReserve', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const inc: u64 = 500;
        reserve.addToVirtualSatoshisReserve(inc);
        const dec: u64 = 200;
        reserve.subFromVirtualSatoshisReserve(dec);
        expect(reserve.virtualSatoshisReserve).toStrictEqual(300);
    });

    it('addToVirtualSatoshisReserve overflows when exceeding u64.MAX', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const max64: u64 = u64.MAX_VALUE;
            const one64: u64 = 1;
            reserve.virtualSatoshisReserve = max64;
            expect(reserve.virtualSatoshisReserve).toStrictEqual(max64);

            reserve.addToVirtualSatoshisReserve(one64);
        }).toThrow();
    });

    it('subFromVirtualSatoshisReserve underflows when subtracting more than exists', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            const one64: u64 = 1;

            reserve.subFromVirtualSatoshisReserve(one64);
        }).toThrow();
    });

    it('availableLiquidity equals liquidity minus reservedLiquidity', () => {
        const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
        const total: u256 = u256.fromU64(1000);
        const reserved: u256 = u256.fromU64(250);
        reserve.addToTotalReserve(total);
        reserve.addToTotalReserved(reserved);
        expect(reserve.availableLiquidity).toStrictEqual(u256.fromU64(750));
    });

    it('availableLiquidity underflows when reservedLiquidity exceeds liquidity', () => {
        expect(() => {
            const reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
            reserve.addToTotalReserve(u256.fromU64(1000));
            reserve.addToTotalReserved(u256.fromU64(1001));

            const liquidity = reserve.availableLiquidity;
        }).toThrow();
    });
});
