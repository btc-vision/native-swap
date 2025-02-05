import { clearCachedProviders } from '../lib/Provider';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import { setBlockchainEnvironment, tokenAddress1, tokenIdUint8Array1 } from './test_helper';
import { u256 } from '@btc-vision/as-bignum/assembly';

describe('Liquidity queue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should create an empty new liquidity queue when it does not exists', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue.p0).toStrictEqual(u256.Zero);
        expect(queue.initialLiquidityProvider).toStrictEqual(u256.Zero);
        expect(queue.virtualBTCReserve).toStrictEqual(u256.Zero);
        expect(queue.virtualTokenReserve).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensAdd).toStrictEqual(u256.Zero);
        expect(queue.deltaBTCBuy).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensBuy).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensSell).toStrictEqual(u256.Zero);
        expect(queue.lastVirtualUpdateBlock).toStrictEqual(0);
        expect(queue.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue.liquidity).toStrictEqual(u256.Zero);
        expect(queue.maxTokensPerReservation).toStrictEqual(u256.Zero);
        expect(queue.maxReserves5BlockPercent).toStrictEqual(0);
        expect(queue.lastPurgedBlock).toStrictEqual(0);
        expect(queue.antiBotExpirationBlock).toStrictEqual(0);
    });

    it('should create an empty new liquidity queue when it does not exists and virtual pool is updated', () => {
        setBlockchainEnvironment(1);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue.p0).toStrictEqual(u256.Zero);
        expect(queue.initialLiquidityProvider).toStrictEqual(u256.Zero);
        expect(queue.virtualBTCReserve).toStrictEqual(u256.Zero);
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(1));
        expect(queue.deltaTokensAdd).toStrictEqual(u256.Zero);
        expect(queue.deltaBTCBuy).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensBuy).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensSell).toStrictEqual(u256.Zero);
        expect(queue.lastVirtualUpdateBlock).toStrictEqual(1);
        expect(queue.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue.liquidity).toStrictEqual(u256.Zero);
        expect(queue.maxTokensPerReservation).toStrictEqual(u256.Zero);
        expect(queue.maxReserves5BlockPercent).toStrictEqual(0);
        expect(queue.lastPurgedBlock).toStrictEqual(0);
        expect(queue.antiBotExpirationBlock).toStrictEqual(0);
    });

    it('should create a new liquidity queue and load the values when it exists', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
    });

    it('should correctly get/set p0 value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.p0 = u256.fromU32(1000);
        expect(queue.p0).toStrictEqual(u256.fromU32(1000));
    });

    it('should correctly get/set initialLiquidityProvider value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.initialLiquidityProvider = u256.fromU32(999);
        expect(queue.initialLiquidityProvider).toStrictEqual(u256.fromU32(999));
    });

    it('should correctly get/set virtualBTCReserve value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.virtualBTCReserve = u256.fromU32(9999999);
        expect(queue.virtualBTCReserve).toStrictEqual(u256.fromU32(9999999));
    });

    it('should correctly get/set virtualTokenReserve value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.virtualTokenReserve = u256.fromU32(8888888);
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(8888888));
    });

    it('should correctly get/set deltaTokensAdd value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.deltaTokensAdd = u256.fromU32(1000);
        expect(queue.deltaTokensAdd).toStrictEqual(u256.fromU32(1000));
    });

    it('should correctly get/set deltaBTCBuy value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.deltaBTCBuy = u256.fromU32(1000);
        expect(queue.deltaBTCBuy).toStrictEqual(u256.fromU32(1000));
    });

    it('should correctly get/set deltaTokensSell value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.deltaTokensSell = u256.fromU32(1000);
        expect(queue.deltaTokensSell).toStrictEqual(u256.fromU32(1000));
    });

    it('should correctly get/set lastVirtualUpdateBlock value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 5;
        expect(queue.lastVirtualUpdateBlock).toStrictEqual(5);
    });

    it('should correctly get/updateTotalReserved value when increasing', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.updateTotalReserved(u256.fromU32(10000000), true);
        expect(queue.reservedLiquidity).toStrictEqual(u256.fromU32(10000000));
    });

    it('should correctly get/updateTotalReserved value when decreasing', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.updateTotalReserved(u256.fromU32(2), true);
        queue.updateTotalReserved(u256.fromU32(1), false);
        expect(queue.reservedLiquidity).toStrictEqual(u256.fromU32(1));
    });

    it('should throw addition overflow when adding amount that will make totalReserved > u256.MAX_VALUE using updateTotalReserved ', () => {
        setBlockchainEnvironment(1);

        expect(() => {
            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.updateTotalReserved(u256.Max, true);
            queue.updateTotalReserved(u256.fromU32(1), true);
        }).toThrow('SafeMath: addition overflow');
    });

    it('should throw substraction overflow when removing amount that will make totalReserved <  0 using updateTotalReserved ', () => {
        setBlockchainEnvironment(1);

        expect(() => {
            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.updateTotalReserved(u256.fromU32(1000), false);
            queue.updateTotalReserved(u256.fromU32(1001), false);
        }).toThrow('SafeMath: subtraction overflow');
    });

    it('should correctly get/updateTotalReserve value when increasing', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.updateTotalReserve(u256.fromU32(10000000), true);
        expect(queue.liquidity).toStrictEqual(u256.fromU32(10000000));
    });

    it('should correctly get/updateTotalReserve value when decreasing', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.updateTotalReserve(u256.fromU32(2), true);
        queue.updateTotalReserve(u256.fromU32(1), false);
        expect(queue.liquidity).toStrictEqual(u256.fromU32(1));
    });

    it('should throw addition overflow when adding amount that will make totalReserves > u256.MAX_VALUE using updateTotalReserve', () => {
        setBlockchainEnvironment(1);

        expect(() => {
            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.updateTotalReserve(u256.Max, true);
            queue.updateTotalReserve(u256.fromU32(1), true);
        }).toThrow('SafeMath: addition overflow');
    });

    it('should throw substraction overflow when removing amount that will make totalReserves <  0 using updateTotalReserve', () => {
        setBlockchainEnvironment(1);

        expect(() => {
            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.updateTotalReserve(u256.fromU32(1000), false);
            queue.updateTotalReserve(u256.fromU32(1001), false);
        }).toThrow('SafeMath: subtraction overflow');
    });
});
