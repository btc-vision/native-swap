import { clearCachedProviders, Provider } from '../lib/Provider';
import { Blockchain, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import {
    createProviders,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../lib/FeeManager';

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

    it('should create a new liquidity queue and load the values when it exists and virtual pool is not updated', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        // Block quote
        queue.virtualBTCReserve = u256.fromU32(10000);
        queue.virtualTokenReserve = u256.fromU32(100000);
        queue.setBlockQuote();

        setBlockchainEnvironment(2);
        queue.virtualBTCReserve = u256.fromU32(10000);
        queue.virtualTokenReserve = u256.fromU32(200000);
        queue.setBlockQuote();

        // Settings
        queue.maxReserves5BlockPercent = 9999;

        // Purge settings
        queue.lastPurgedBlock = 1000;
        queue.antiBotExpirationBlock = 1000;

        // Provider manager
        const providers: Provider[] = createProviders(
            3,
            0,
            false,
            true,
            true,
            'kcweojewoj2309',
            u256.fromU32(100000),
            u128.fromU32(100000),
            u128.fromU32(10000),
            true,
            true,
        );

        for (let i = 0; i < providers.length; i++) {
            queue.addToPriorityQueue(providers[i].providerId);
        }

        queue.p0 = u256.fromU32(99999);
        queue.initialLiquidityProvider = providers[0].providerId;
        queue.lastVirtualUpdateBlock = 888;
        queue.maxTokensPerReservation = u256.fromU32(20000);
        queue.updateTotalReserve(u256.fromU32(1000), true);
        queue.updateTotalReserved(u256.fromU32(2000), true);
        queue.deltaTokensAdd = u256.fromU32(10000);
        queue.deltaBTCBuy = u256.fromU32(20000);
        queue.deltaTokensSell = u256.fromU32(30000);
        queue.deltaTokensBuy = u256.fromU32(40000);

        queue.save();

        const queue2: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue2.p0).toStrictEqual(queue.p0);
        expect(queue2.initialLiquidityProvider).toStrictEqual(queue.initialLiquidityProvider);
        expect(queue2.lastVirtualUpdateBlock).toStrictEqual(queue.lastVirtualUpdateBlock);
        expect(queue2.maxTokensPerReservation).toStrictEqual(queue.maxTokensPerReservation);
        expect(queue2.liquidity).toStrictEqual(queue.liquidity);
        expect(queue2.reservedLiquidity).toStrictEqual(queue.reservedLiquidity);
        expect(queue2.deltaTokensAdd).toStrictEqual(queue.deltaTokensAdd);
        expect(queue2.deltaBTCBuy).toStrictEqual(queue.deltaBTCBuy);
        expect(queue2.deltaTokensSell).toStrictEqual(queue.deltaTokensSell);
        expect(queue2.deltaTokensBuy).toStrictEqual(queue.deltaTokensBuy);
        expect(queue2.antiBotExpirationBlock).toStrictEqual(queue.antiBotExpirationBlock);
        expect(queue2.lastPurgedBlock).toStrictEqual(queue.lastPurgedBlock);
        expect(queue2.maxReserves5BlockPercent).toStrictEqual(queue.maxReserves5BlockPercent);
        expect(queue2.getBlockQuote(1)).toStrictEqual(queue.getBlockQuote(1));
        expect(queue2.getBlockQuote(2)).toStrictEqual(queue.getBlockQuote(2));
        expect(queue2.virtualTokenReserve).toStrictEqual(queue.virtualTokenReserve);
        expect(queue2.virtualBTCReserve).toStrictEqual(queue.virtualBTCReserve);
    });

    it('should create a new liquidity queue and load the values when it exists and virtual pool is updated', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        // Block quote
        queue.virtualBTCReserve = u256.fromU32(10000);
        queue.virtualTokenReserve = u256.fromU32(100000);
        queue.setBlockQuote();

        setBlockchainEnvironment(2);
        queue.virtualBTCReserve = u256.fromU32(10000);
        queue.virtualTokenReserve = u256.fromU32(200000);
        queue.setBlockQuote();

        // Settings
        queue.maxReserves5BlockPercent = 9999;

        // Purge settings
        queue.lastPurgedBlock = 1000;
        queue.antiBotExpirationBlock = 1000;

        // Provider manager
        const providers: Provider[] = createProviders(
            3,
            0,
            false,
            true,
            true,
            'kcweojewoj2309',
            u256.fromU32(100000),
            u128.fromU32(100000),
            u128.fromU32(10000),
            true,
            true,
        );

        for (let i = 0; i < providers.length; i++) {
            queue.addToPriorityQueue(providers[i].providerId);
        }

        queue.p0 = u256.fromU32(99999);
        queue.initialLiquidityProvider = providers[0].providerId;
        queue.maxTokensPerReservation = u256.fromU32(20000);
        queue.updateTotalReserve(u256.fromU32(1000), true);
        queue.updateTotalReserved(u256.fromU32(2000), true);
        queue.deltaTokensAdd = u256.fromU32(10000);
        queue.deltaBTCBuy = u256.fromU32(20000);
        queue.deltaTokensSell = u256.fromU32(30000);
        queue.deltaTokensBuy = u256.fromU32(40000);

        queue.save();

        expect(queue.lastVirtualUpdateBlock).toStrictEqual(1);

        setBlockchainEnvironment(2);

        // The goal is only to check if updateVirtualPoolIfNeeded has been called.
        const queue2: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        expect(queue2.lastVirtualUpdateBlock).toStrictEqual(2);
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

    it('should correctly get/set maxTokensPerReservation value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.maxTokensPerReservation = u256.fromU32(45);
        expect(queue.maxTokensPerReservation).toStrictEqual(u256.fromU32(45));
    });

    it('should correctly get/set maxTokensPerReservation value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.maxReserves5BlockPercent = 25;
        expect(queue.maxReserves5BlockPercent).toStrictEqual(25);
    });

    it('should correctly get/set lastPurgedBlock value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastPurgedBlock = 25;
        expect(queue.lastPurgedBlock).toStrictEqual(25);
    });

    it('should correctly get/set antiBotExpirationBlock value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.antiBotExpirationBlock = 25;
        expect(queue.antiBotExpirationBlock).toStrictEqual(25);
    });

    it('should correctly get/set BTCowed value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.setBTCowed(u256.fromU32(9), u256.fromU32(1000));
        expect(queue.getBTCowed(u256.fromU32(9))).toStrictEqual(u256.fromU32(1000));
    });

    it('should correctly get/set BTCowedReserved value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.setBTCowedReserved(u256.fromU32(10), u256.fromU32(2000));
        expect(queue.getBTCowedReserved(u256.fromU32(10))).toStrictEqual(u256.fromU32(2000));
    });

    it('should return 0 when getUtilizationRatio is called and liquidity is 0', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.updateTotalReserved(u256.fromU32(10000), true);
        expect(queue.getUtilizationRatio()).toStrictEqual(u256.Zero);
    });

    it('should return 0 when getUtilizationRatio is called and reservedLiquidity is 0', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.updateTotalReserve(u256.fromU32(10000), true);
        expect(queue.getUtilizationRatio()).toStrictEqual(u256.Zero);
    });

    it('should return the correct value when getUtilizationRatio is called, liquidity <> 0 and reservedLiquidity <> 0', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.updateTotalReserved(u256.fromU32(9000), true);
        queue.updateTotalReserve(u256.fromU32(1000), true);
        expect(queue.getUtilizationRatio()).toStrictEqual(u256.fromU32(900));
    });

    it('should throw when getUtilizationRatio is called and reservedLiquidity is > (u256.Max/100)', () => {
        setBlockchainEnvironment(1);
        expect(() => {
            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const maxValue: u256 = SafeMath.add(
                SafeMath.div(u256.Max, u256.fromU32(100)),
                u256.One,
            );

            queue.updateTotalReserved(maxValue, true);
            queue.updateTotalReserve(u256.fromU32(1000), true);
            queue.getUtilizationRatio();
        }).toThrow();
    });

    it('should return the correct value when tokensToSatoshis is called', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue.tokensToSatoshis(u256.fromU32(10000), u256.fromU32(50000))).toStrictEqual(
            u256.fromU64(20000000),
        );
    });

    it('should return the correct value when satoshisToTokens is called', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue.satoshisToTokens(u256.fromU32(20000000), u256.fromU32(50000))).toStrictEqual(
            u256.fromU64(10000),
        );
    });

    it('should revert when calling setBlockQuote and Block number >= u32.MAX_VALUE', () => {
        setBlockchainEnvironment(u32.MAX_VALUE);

        expect(() => {
            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            queue.setBlockQuote();
        }).toThrow('Block number too large, max array size.');
    });

    it('should correctly get/set the block quote when Block number < u32.MAX_VALUE', () => {
        setBlockchainEnvironment(10000);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.virtualBTCReserve = u256.fromU32(10000);

        const quote = queue.quote();
        queue.setBlockQuote();

        expect(queue.getBlockQuote(10000)).toStrictEqual(quote);
    });

    it('should correctly initialize the initial liquidity', () => {
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.initializeInitialLiquidity(
            u256.fromU32(99999),
            u256.fromU32(10000),
            u256.fromU32(888888),
            10,
        );

        const virtualBTCReserve = SafeMath.div(u256.fromU32(888888), u256.fromU32(99999));

        expect(queue.p0).toStrictEqual(u256.fromU32(99999));
        expect(queue.initialLiquidityProvider).toStrictEqual(u256.fromU32(10000));
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(888888));
        expect(queue.maxReserves5BlockPercent).toStrictEqual(10);
        expect(queue.virtualBTCReserve).toStrictEqual(virtualBTCReserve, `1`);
    });

    it('should correctly set deltaBTCBuy and deltaTokensBuy when calling buyTokens', () => {
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.buyTokens(u256.fromU32(10000), u256.fromU32(888888));

        expect(queue.deltaBTCBuy).toStrictEqual(u256.fromU32(888888));
        expect(queue.deltaTokensBuy).toStrictEqual(u256.fromU32(10000));
    });

    it('should correctly compute the number of tokens after tax when calling getTokensAfterTax', () => {
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const tokens = queue.getTokensAfterTax(u128.fromU32(10000));

        expect(tokens).toStrictEqual(u128.fromU32(9700));
    });

    it('should correctly clean all the queues when calling cleanUpQueues', () => {
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const tokens = queue.getTokensAfterTax(u128.fromU32(10000));

        expect(tokens).toStrictEqual(u128.fromU32(9700));
    });

    it('should correctly compute the fees when calling computeFees', () => {
        //!!!! TODO:
    });

    it('should get FeeManager.PRIORITY_QUEUE_BASE_FEE as priority fees when calling getCostPriorityFee and no provider in priority queue', () => {
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        FeeManager.PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC = 2;
        FeeManager.PRIORITY_QUEUE_BASE_FEE = 1000;
        const cost = queue.getCostPriorityFee();

        expect(cost).toStrictEqual(FeeManager.PRIORITY_QUEUE_BASE_FEE);
    });

    it('should get the correct priority fees when calling getCostPriorityFee and 3 providers in priority queue and priority queue starting index is 0', () => {
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const providers: Provider[] = createProviders(
            3,
            0,
            false,
            true,
            true,
            'kcweojewoj2309',
            u256.fromU32(100000),
            u128.fromU32(100000),
            u128.fromU32(10000),
            true,
            true,
        );

        for (let i = 0; i < providers.length; i++) {
            queue.addToPriorityQueue(providers[i].providerId);
        }

        FeeManager.PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC = 2;
        FeeManager.PRIORITY_QUEUE_BASE_FEE = 1000;
        const cost = queue.getCostPriorityFee();

        expect(cost).toStrictEqual(1006);
    });

    it('should get the correct priority fees when calling getCostPriorityFee and 5 providers in priority queue and priority queue starting index is 2', () => {
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const providers: Provider[] = createProviders(
            5,
            0,
            false,
            true,
            true,
            'kcweojewoj2309',
            u256.fromU32(100000),
            u128.fromU32(100000),
            u128.fromU32(10000),
            true,
            true,
        );

        for (let i = 0; i < providers.length; i++) {
            queue.addToPriorityQueue(providers[i].providerId);
        }

        providers[0].setActive(false, true);
        providers[1].setActive(false, true);

        queue.cleanUpQueues();

        FeeManager.PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC = 2;
        FeeManager.PRIORITY_QUEUE_BASE_FEE = 1000;
        const cost = queue.getCostPriorityFee();

        expect(cost).toStrictEqual(1006);
    });
});

describe('Liquidity queue updateVirtualPool tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should not update when currentBlock <= this.lastVirtualUpdateBlock', () => {
        setBlockchainEnvironment(1);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 5;
        queue.updateVirtualPoolIfNeeded();

        expect(queue.lastVirtualUpdateBlock).toStrictEqual(5);
    });

    it('should set virtualTokenReserve to 1 when computed virtualTokenReserve is 0', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.Zero;
        queue.virtualTokenReserve = u256.Zero;
        queue.updateVirtualPoolIfNeeded();

        expect(queue.virtualTokenReserve).toStrictEqual(u256.One);
    });

    it('should add the tokens to the virtual pool when tokens are added', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.Zero;
        queue.virtualTokenReserve = u256.Zero;
        queue.deltaTokensAdd = u256.fromU32(1000);
        queue.updateVirtualPoolIfNeeded();

        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(1000));
    });

    it('should apply the tokens buys to the virtual pool when the deltaTokensBuy >= virtualTokenReserve ', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.fromU32(100000);
        queue.virtualTokenReserve = u256.fromU32(10000);
        queue.deltaTokensBuy = u256.fromU32(11000);
        queue.deltaBTCBuy = u256.fromU32(999900001);
        queue.updateVirtualPoolIfNeeded();

        expect(queue.virtualBTCReserve).toStrictEqual(u256.fromU64(1000000000));
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(1));
    });

    it('should apply the tokens buys to the virtual pool when the deltaTokensBuy >= virtualTokenReserve and incB = deltaBTCBuy', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.fromU32(100000);
        queue.virtualTokenReserve = u256.fromU32(10000);
        queue.deltaTokensBuy = u256.fromU32(11000);
        queue.deltaBTCBuy = u256.fromU32(999990000);
        queue.updateVirtualPoolIfNeeded();

        expect(queue.virtualBTCReserve).toStrictEqual(u256.fromU64(1000000000));
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(1));
    });

    it('should apply the tokens buys to the virtual pool when the deltaTokensBuy >= virtualTokenReserve and incB > deltaBTCBuy', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.fromU32(10);
        queue.virtualTokenReserve = u256.fromU32(10999);
        queue.deltaTokensBuy = u256.fromU32(11000);
        queue.deltaBTCBuy = u256.fromU32(10);
        queue.updateVirtualPoolIfNeeded();

        expect(queue.virtualBTCReserve).toStrictEqual(u256.fromU64(20));
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(5499));
    });

    it('should apply the tokens buys to the virtual pool when the deltaTokensBuy >= virtualTokenReserve and incB > deltaBTCBuy and newTprime = 0', () => {
        //!!! impossible to get this state
        expect(false).toBeTruthy();
    });

    it('should apply the tokens buys to the virtual pool when the deltaTokensBuy < virtualTokenReserve ', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.fromU32(100000);
        queue.virtualTokenReserve = u256.fromU32(10000);
        queue.deltaTokensBuy = u256.fromU32(9000);
        queue.deltaBTCBuy = u256.fromU32(999900001);
        queue.updateVirtualPoolIfNeeded();

        expect(queue.virtualBTCReserve).toStrictEqual(u256.fromU64(1000000));
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(1000));
    });

    it('should apply the tokens buys to the virtual pool when the deltaTokensBuy < virtualTokenReserve and incB = deltaBTCBuy', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.fromU32(100);
        queue.virtualTokenReserve = u256.fromU32(20);
        queue.deltaTokensBuy = u256.fromU32(10);
        queue.deltaBTCBuy = u256.fromU32(100);
        queue.updateVirtualPoolIfNeeded();

        expect(queue.virtualBTCReserve).toStrictEqual(u256.fromU64(200));
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(10));
    });

    it('should apply the tokens buys to the virtual pool when the deltaTokensBuy < virtualTokenReserve and incB > deltaBTCBuy', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.fromU32(10);
        queue.virtualTokenReserve = u256.fromU32(10);
        queue.deltaTokensBuy = u256.fromU32(2);
        queue.deltaBTCBuy = u256.fromU32(1);
        queue.updateVirtualPoolIfNeeded();

        expect(queue.virtualBTCReserve).toStrictEqual(u256.fromU64(11));
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(9));
    });

    it('should make virtualTokenReserve when T is 0', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.fromU32(100000);
        queue.virtualTokenReserve = u256.fromU32(0);
        queue.updateVirtualPoolIfNeeded();

        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(1));
    });

    it('should reset all accumulators to 0', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.fromU32(100000);
        queue.virtualTokenReserve = u256.fromU32(10000);
        queue.deltaTokensBuy = u256.fromU32(10);
        queue.deltaBTCBuy = u256.fromU32(10);
        queue.deltaTokensSell = u256.fromU32(2);
        queue.deltaTokensAdd = u256.fromU32(2);

        queue.updateVirtualPoolIfNeeded();

        expect(queue.deltaBTCBuy).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensAdd).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensSell).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensBuy).toStrictEqual(u256.Zero);
    });

    it('should update lastVirtualUpdateBlock to the current block', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.fromU32(100000);
        queue.virtualTokenReserve = u256.fromU32(10000);
        queue.deltaTokensBuy = u256.fromU32(10);
        queue.deltaBTCBuy = u256.fromU32(10);
        queue.deltaTokensSell = u256.fromU32(2);
        queue.deltaTokensAdd = u256.fromU32(2);

        queue.updateVirtualPoolIfNeeded();

        expect(queue.lastVirtualUpdateBlock).toStrictEqual(5);
    });
});

describe('Liquidity queue dynamic fees and computeVolatility tests', () => {
    it('should return 0 when computeVolatility is called and oldQuote = 0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        // Block quote 0
        queue.virtualBTCReserve = u256.Zero;
        queue.virtualTokenReserve = u256.Zero;

        queue.updateVirtualPoolIfNeeded();

        expect(queue.volatility).toStrictEqual(u256.Zero);
    });

    it('should return 0 when computeVolatility is called and oldQuote > 0 and currentQuote = 0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        // Block quote 0
        queue.virtualBTCReserve = u256.fromU32(10000);
        queue.virtualTokenReserve = u256.fromU32(100);
        queue.setBlockQuote();

        expect(queue.getBlockQuote(0)).not.toStrictEqual(u256.Zero);

        setBlockchainEnvironment(5);

        queue.updateVirtualPoolIfNeeded();

        expect(queue.volatility).toStrictEqual(u256.Zero);
    });

    it('should underflow when computeVolatility is called and currentQuote - oldQuote < 0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        // Block quote 0
        queue.virtualBTCReserve = u256.fromU32(10000);
        queue.virtualTokenReserve = u256.fromU32(100000);
        queue.setBlockQuote();

        setBlockchainEnvironment(5);
        // Block quote 5
        queue.virtualBTCReserve = u256.fromU32(5000);
        queue.virtualTokenReserve = u256.fromU32(250);
        queue.setBlockQuote();

        const currentBlock: u64 = 5;
        const windowSize: u32 = 6;

        const oldBlock: u64 = (currentBlock - windowSize) % <u64>(u32.MAX_VALUE - 1);

        log(`${oldBlock}`);
        //const t: u256 = SafeMath.sub(queue.getBlockQuote(5), queue.getBlockQuote(0));

        //log(`${t}`);

        queue.updateVirtualPoolIfNeeded();

        //expect(queue.).toStrictEqual(5);
    });

    it('should return volatility when computeVolatility is called', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.setBlockQuote();

        setBlockchainEnvironment(5);
        queue.setBlockQuote();

        queue.updateVirtualPoolIfNeeded();
    });
});
