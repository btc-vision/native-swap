import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '../../../btc-runtime/runtime';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import { tokenAddress1, tokenIdUint8Array1 } from './test_helper';
import { u256 } from '@btc-vision/as-bignum/assembly';

function createReserve(): LiquidityQueueReserve {
    return new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
}

describe('CompletedTrade tests', () => {
    let reserve: LiquidityQueueReserve;

    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
        reserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
    });

    it('values defaults to zero after creation', () => {
        expect(reserve.liquidity).toStrictEqual(u256.Zero);
        expect(reserve.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(reserve.availableLiquidity).toStrictEqual(u256.Zero);
        expect(reserve.deltaTokensAdd).toStrictEqual(u256.Zero);
        expect(reserve.deltaTokensBuy).toStrictEqual(u256.Zero);
        expect(reserve.deltaSatoshisBuy).toStrictEqual(0);
        expect(reserve.virtualTokenReserve).toStrictEqual(u256.Zero);
        expect(reserve.virtualSatoshisReserve).toStrictEqual(0);
    });

    it('can set and get deltaTokensAdd', () => {
        const value: u256 = u256.fromU64(123);
        reserve.deltaTokensAdd = value;
        expect(reserve.deltaTokensAdd).toStrictEqual(value);
    });

    it('can set and get deltaTokensBuy', () => {
        const value: u256 = u256.fromU64(456);
        reserve.deltaTokensBuy = value;
        expect(reserve.deltaTokensBuy).toStrictEqual(value);
    });

    it('can set and get deltaSatoshisBuy', () => {
        const value: u64 = 789;
        reserve.deltaSatoshisBuy = value;
        expect(reserve.deltaSatoshisBuy).toStrictEqual(value);
    });

    it('can set and get virtualTokenReserve', () => {
        const value: u256 = u256.fromU64(1000);
        reserve.virtualTokenReserve = value;
        expect(reserve.virtualTokenReserve).toStrictEqual(value);
    });

    it('can set and get virtualSatoshisReserve', () => {
        const value: u64 = 2000;
        reserve.virtualSatoshisReserve = value;
        expect(reserve.virtualSatoshisReserve).toStrictEqual(value);
    });

    it('addToDeltaTokensAdd increments only deltaTokensAdd', () => {
        const a: u256 = u256.fromU64(10);
        const b: u256 = u256.fromU64(15);
        reserve.addToDeltaTokensAdd(a);
        expect(reserve.deltaTokensAdd).toStrictEqual(a);
        reserve.addToDeltaTokensAdd(b);
        expect(reserve.deltaTokensAdd).toStrictEqual(u256.fromU64(25));
    });

    it('addToDeltaTokensAdd overflows when exceeding u256.MAX', () => {
        const max: u256 = u256.Max;
        const one: u256 = u256.One;
        reserve.deltaTokensAdd = max;
        expect(reserve.deltaTokensAdd).toStrictEqual(max);
        expect<() => void>(() => {
            reserve.addToDeltaTokensAdd(one);
        }).toThrow();
    });

    it('addToDeltaTokensBuy increments only deltaTokensBuy', () => {
        const value: u256 = u256.fromU64(7);
        reserve.addToDeltaTokensBuy(value);
        expect(reserve.deltaTokensBuy).toStrictEqual(value);
    });

    it('addToDeltaTokensBuy overflows when exceeding u256.MAX', () => {
        const max: u256 = u256.Max;
        const one: u256 = u256.One;
        reserve.deltaTokensBuy = max;
        expect(reserve.deltaTokensBuy).toStrictEqual(max);
        expect<() => void>(() => {
            reserve.addToDeltaTokensBuy(one);
        }).toThrow();
    });

    it('addToDeltaSatoshisBuy increments only deltaSatoshisBuy', () => {
        const x: u64 = 100;
        const y: u64 = 50;
        reserve.addToDeltaSatoshisBuy(x);
        expect(reserve.deltaSatoshisBuy).toStrictEqual(x);
        reserve.addToDeltaSatoshisBuy(y);
        expect(reserve.deltaSatoshisBuy).toStrictEqual(150);
    });

    it('addToDeltaSatoshisBuy overflows when exceeding u64.MAX', () => {
        const max64: u64 = u64.MAX_VALUE;
        const one64: u64 = 1;
        reserve.deltaSatoshisBuy = max64;
        expect(reserve.deltaSatoshisBuy).toStrictEqual(max64);
        expect<() => void>(() => {
            reserve.addToDeltaSatoshisBuy(one64);
        }).toThrow();
    });

    it('addToTotalReserve increases liquidity', () => {
        const inc: u256 = u256.fromU64(1000);
        reserve.addToTotalReserve(inc);
        expect(reserve.liquidity).toStrictEqual(inc);
    });

    it('subFromTotalReserve decreases liquidity', () => {
        const inc: u256 = u256.fromU64(500);
        reserve.addToTotalReserve(inc);
        const dec: u256 = u256.fromU64(200);
        reserve.subFromTotalReserve(dec);
        expect(reserve.liquidity).toStrictEqual(u256.fromU64(300));
    });

    it('addToTotalReserve overflows when exceeding u256.MAX', () => {
        const max: u256 = u256.Max;
        const one: u256 = u256.One;
        reserve.addToTotalReserve(max);
        expect<() => void>(() => {
            reserve.addToTotalReserve(one);
        }).toThrow();
    });

    it('subFromTotalReserve underflows when subtracting more than exists', () => {
        const one: u256 = u256.One;
        expect<() => void>(() => {
            reserve.subFromTotalReserve(one);
        }).toThrow();
    });

    it('addToTotalReserved increases reservedLiquidity', () => {
        const inc: u256 = u256.fromU64(400);
        reserve.addToTotalReserved(inc);
        expect(reserve.reservedLiquidity).toStrictEqual(inc);
    });

    it('subFromTotalReserved decreases reservedLiquidity', () => {
        const inc: u256 = u256.fromU64(400);
        reserve.addToTotalReserved(inc);
        const dec: u256 = u256.fromU64(150);
        reserve.subFromTotalReserved(dec);
        expect(reserve.reservedLiquidity).toStrictEqual(u256.fromU64(250));
    });

    it('addToTotalReserved overflows when exceeding u256.MAX', () => {
        const max: u256 = u256.Max;
        const one: u256 = u256.One;
        reserve.addToTotalReserved(max);
        expect<() => void>(() => {
            reserve.addToTotalReserved(one);
        }).toThrow();
    });

    it('subFromTotalReserved underflows when subtracting more than exists', () => {
        const one: u256 = u256.One;
        expect<() => void>(() => {
            reserve.subFromTotalReserved(one);
        }).toThrow();
    });

    it('addToVirtualTokenReserve updates virtualTokenReserve', () => {
        const inc: u256 = u256.fromU64(300);
        reserve.addToVirtualTokenReserve(inc);
        expect(reserve.virtualTokenReserve).toStrictEqual(inc);
    });

    it('subFromVirtualTokenReserve updates virtualTokenReserve', () => {
        const inc: u256 = u256.fromU64(300);
        reserve.addToVirtualTokenReserve(inc);
        const dec: u256 = u256.fromU64(120);
        reserve.subFromVirtualTokenReserve(dec);
        expect(reserve.virtualTokenReserve).toStrictEqual(u256.fromU64(180));
    });

    it('addToVirtualTokenReserve overflows when exceeding u256.MAX', () => {
        const max: u256 = u256.Max;
        const one: u256 = u256.One;
        reserve.virtualTokenReserve = max;
        expect(reserve.virtualTokenReserve).toStrictEqual(max);
        expect<() => void>(() => {
            reserve.addToVirtualTokenReserve(one);
        }).toThrow();
    });

    it('subFromVirtualTokenReserve underflows when subtracting more than exists', () => {
        const one: u256 = u256.One;
        expect<() => void>(() => {
            reserve.subFromVirtualTokenReserve(one);
        }).toThrow();
    });

    it('addToVirtualSatoshisReserve updates virtualSatoshisReserve', () => {
        const inc: u64 = 500;
        reserve.addToVirtualSatoshisReserve(inc);
        expect(reserve.virtualSatoshisReserve).toStrictEqual(inc);
    });

    it('subFromVirtualSatoshisReserve updates virtualSatoshisReserve', () => {
        const inc: u64 = 500;
        reserve.addToVirtualSatoshisReserve(inc);
        const dec: u64 = 200;
        reserve.subFromVirtualSatoshisReserve(dec);
        expect(reserve.virtualSatoshisReserve).toStrictEqual(300);
    });

    it('addToVirtualSatoshisReserve overflows when exceeding u64.MAX', () => {
        const max64: u64 = u64.MAX_VALUE;
        const one64: u64 = 1;
        reserve.virtualSatoshisReserve = max64;
        expect(reserve.virtualSatoshisReserve).toStrictEqual(max64);
        expect<() => void>(() => {
            reserve.addToVirtualSatoshisReserve(one64);
        }).toThrow();
    });

    it('subFromVirtualSatoshisReserve underflows when subtracting more than exists', () => {
        const one64: u64 = 1;
        expect<() => void>(() => {
            reserve.subFromVirtualSatoshisReserve(one64);
        }).toThrow();
    });

    it('availableLiquidity equals liquidity minus reservedLiquidity', () => {
        const total: u256 = u256.fromU64(1000);
        const reserved: u256 = u256.fromU64(250);
        reserve.addToTotalReserve(total);
        reserve.addToTotalReserved(reserved);
        expect(reserve.availableLiquidity).toStrictEqual(u256.fromU64(750));
    });

    it('availableLiquidity underflows when reservedLiquidity exceeds liquidity', () => {
        reserve.addToTotalReserve(u256.fromU64(1000));
        reserve.addToTotalReserved(u256.fromU64(1001));

        expect<() => void>(() => {
            const avail: u256 = reserve.availableLiquidity;
        }).toThrow();
    });
});
