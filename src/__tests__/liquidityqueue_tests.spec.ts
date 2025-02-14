import { clearCachedProviders, Provider } from '../lib/Provider';
import {
    Blockchain,
    SafeMath,
    StoredBooleanArray,
    StoredU128Array,
    TransactionOutput,
} from '@btc-vision/btc-runtime/runtime';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import {
    createProvider,
    createProviders,
    createReservation,
    createReservationId,
    ownerAddress1,
    providerAddress1,
    providerAddress2,
    receiverAddress1,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenAddress2,
    tokenIdUint8Array1,
    tokenIdUint8Array2,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../lib/FeeManager';
import { LIQUIDITY_REMOVAL_TYPE, NORMAL_TYPE, Reservation } from '../lib/Reservation';

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

        FeeManager.PRIORITY_QUEUE_BASE_FEE = 1000;
        const cost = FeeManager.PRIORITY_QUEUE_BASE_FEE;

        expect(cost).toStrictEqual(FeeManager.PRIORITY_QUEUE_BASE_FEE);
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
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

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

        queue.updateVirtualPoolIfNeeded();

        expect(queue.volatility).toStrictEqual(u256.fromU32(9950));
    });

    it('should return volatility when computeVolatility is called', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        // Block quote 0
        queue.virtualBTCReserve = u256.fromU32(5000);
        queue.virtualTokenReserve = u256.fromU32(250);
        queue.setBlockQuote();

        setBlockchainEnvironment(5);

        // Block quote 5
        queue.virtualBTCReserve = u256.fromU32(10000);
        queue.virtualTokenReserve = u256.fromU32(100000);
        queue.setBlockQuote();

        queue.updateVirtualPoolIfNeeded();
        expect(queue.volatility).toStrictEqual(u256.fromU32(1990000));
    });
});

describe('Liquidity queue reservation lists tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should correctly add and get active reservations in the reservation list for a block number and a token', () => {
        setBlockchainEnvironment(0);

        const blockNumber: u64 = 0;
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const reservationId1: u128 = createReservationId(tokenAddress1, providerAddress1);
        const reservationId2: u128 = createReservationId(tokenAddress1, providerAddress2);

        queue.addActiveReservationToList(blockNumber, reservationId1);
        queue.addActiveReservationToList(blockNumber, reservationId2);

        const queue2: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const list2: StoredU128Array = queue.getReservationListForBlock(blockNumber);
        expect(list2.getLength()).toStrictEqual(2);
        expect(list2.get(0)).toStrictEqual(reservationId1);
        expect(list2.get(1)).toStrictEqual(reservationId2);

        const list2TokenActive: StoredBooleanArray =
            queue2.getActiveReservationListForBlock(blockNumber);
        expect(list2TokenActive.get(0)).toBeTruthy();
        expect(list2TokenActive.get(1)).toBeTruthy();

        const list3: StoredU128Array = queue2.getReservationListForBlock(blockNumber + 1);
        expect(list3.getLength()).toStrictEqual(0);
    });

    it('should correctly add and get active reservations in the reservation list for a block number and 2 tokens', () => {
        setBlockchainEnvironment(0);

        const blockNumber: u64 = 0;
        const reservationId1: u128 = createReservationId(tokenAddress1, providerAddress1);
        const reservationId2: u128 = createReservationId(tokenAddress1, providerAddress2);
        const reservationId3: u128 = createReservationId(tokenAddress2, providerAddress1);
        const reservationId4: u128 = createReservationId(tokenAddress2, providerAddress2);

        const queue1Token1: LiquidityQueue = new LiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        queue1Token1.addActiveReservationToList(blockNumber, reservationId1);
        queue1Token1.addActiveReservationToList(blockNumber, reservationId2);

        const queue1Token2: LiquidityQueue = new LiquidityQueue(
            tokenAddress2,
            tokenIdUint8Array2,
            false,
        );

        queue1Token2.addActiveReservationToList(blockNumber, reservationId3);
        queue1Token2.addActiveReservationToList(blockNumber, reservationId4);

        const queue2Token1: LiquidityQueue = new LiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );
        const list2Token1: StoredU128Array = queue2Token1.getReservationListForBlock(blockNumber);
        const list2Token1Active: StoredBooleanArray =
            queue2Token1.getActiveReservationListForBlock(blockNumber);

        expect(list2Token1.getLength()).toStrictEqual(2);
        expect(list2Token1.get(0)).toStrictEqual(reservationId1);
        expect(list2Token1.get(1)).toStrictEqual(reservationId2);
        expect(list2Token1Active.get(0)).toBeTruthy();
        expect(list2Token1Active.get(1)).toBeTruthy();

        const queue2Token2: LiquidityQueue = new LiquidityQueue(
            tokenAddress2,
            tokenIdUint8Array2,
            false,
        );
        const list2Token2: StoredU128Array = queue2Token2.getReservationListForBlock(blockNumber);
        const list2Token2Active: StoredBooleanArray =
            queue2Token2.getActiveReservationListForBlock(blockNumber);

        expect(list2Token2.getLength()).toStrictEqual(2);
        expect(list2Token2.get(0)).toStrictEqual(reservationId3);
        expect(list2Token2.get(1)).toStrictEqual(reservationId4);
        expect(list2Token2Active.get(0)).toBeTruthy();
        expect(list2Token2Active.get(1)).toBeTruthy();
    });

    it('should correctly modify an active reservation in the reservation list for a block number', () => {
        setBlockchainEnvironment(0);

        const blockNumber: u64 = 0;
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const reservationId1: u128 = createReservationId(tokenAddress1, providerAddress1);
        const reservationId2: u128 = createReservationId(tokenAddress1, providerAddress2);

        queue.addActiveReservationToList(blockNumber, reservationId1);
        queue.addActiveReservationToList(blockNumber, reservationId2);

        const queue2: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const list2TokenActive: StoredBooleanArray =
            queue2.getActiveReservationListForBlock(blockNumber);

        expect(list2TokenActive.get(0)).toBeTruthy();
        expect(list2TokenActive.get(1)).toBeTruthy();

        list2TokenActive.set(0, false);
        list2TokenActive.set(1, false);
        list2TokenActive.save();

        const queue3: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const list3TokenActive: StoredBooleanArray =
            queue3.getActiveReservationListForBlock(blockNumber);

        expect(list3TokenActive.get(0)).toBeFalsy();
        expect(list3TokenActive.get(1)).toBeFalsy();
    });
});

describe('Liquidity getMaximumTokensLeftBeforeCap tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should return 0 if totalLiquidity is 0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.updateTotalReserved(u256.fromU32(50), true);
        queue.updateTotalReserve(u256.Zero, true);
        queue.maxReserves5BlockPercent = 10;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.Zero);
    });

    it('should return 0 if ratioScaled > maxPercentScaled', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.updateTotalReserved(u256.fromU32(90), true);
        queue.updateTotalReserve(u256.fromU32(100), true);
        queue.maxReserves5BlockPercent = 80;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.Zero);
    });

    it('should compute leftover tokens if ratioScaled < maxPercentScaled', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.updateTotalReserved(u256.fromU32(20), true);
        queue.updateTotalReserve(u256.fromU32(100), true);
        queue.maxReserves5BlockPercent = 50;

        const result = queue.getMaximumTokensLeftBeforeCap();

        expect(result).toStrictEqual(u256.fromU64(30));
    });

    it('should handle the exact boundary ratioScaled == maxPercentScaled => leftover=0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.updateTotalReserved(u256.fromU32(40), true);
        queue.updateTotalReserve(u256.fromU32(100), true);
        queue.maxReserves5BlockPercent = 40;

        const result = queue.getMaximumTokensLeftBeforeCap();

        expect(result).toStrictEqual(u256.Zero);
    });

    it('should handle large numbers', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.updateTotalReserved(u256.fromU32(1_000_000), true);
        queue.updateTotalReserve(u256.fromU32(10_000_000), true);
        queue.maxReserves5BlockPercent = 50;

        const result = queue.getMaximumTokensLeftBeforeCap();

        expect(result).toStrictEqual(u256.fromU64(4_000_000));
    });

    it('should handle 0% maxReserves5BlockPercent => full leftover if liquidity != 0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.updateTotalReserved(u256.fromU32(50), true);
        queue.updateTotalReserve(u256.fromU32(100), true);
        queue.maxReserves5BlockPercent = 0;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.Zero);
    });

    it('should handle 100% maxReserves5BlockPercent => leftover could be up to totalLiquidity if ratio < 1', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.updateTotalReserved(u256.fromU32(30), true);
        queue.updateTotalReserve(u256.fromU32(100), true);
        queue.maxReserves5BlockPercent = 100;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.fromU64(70));
    });

    it('should handle the case: reserved==liquidity => ratio=1 => leftover=0 if maxPercent<100', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.updateTotalReserved(u256.fromU32(100), true);
        queue.updateTotalReserve(u256.fromU32(100), true);
        queue.maxReserves5BlockPercent = 90;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.Zero);
    });

    it('should produce some leftover if ratio=1 but max=100 => leftover=0 as well, ratio=1 => leftover= (100%-100%)=0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.updateTotalReserved(u256.fromU32(500), true);
        queue.updateTotalReserve(u256.fromU32(500), true);
        queue.maxReserves5BlockPercent = 100;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.Zero);
    });

    it('should produce partial leftover if ratio is small and max is small but non-zero', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.updateTotalReserved(u256.fromU32(1), true);
        queue.updateTotalReserve(u256.fromU32(100), true);
        queue.maxReserves5BlockPercent = 5;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.fromU32(4));
    });
});

describe('Liquidity executeTrade tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should revert if reservation is invalid', () => {
        setBlockchainEnvironment(0);

        expect(() => {
            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

            reservation.timeout();

            queue.executeTrade(reservation);
        }).toThrow('No active reservation for this address.');
    });

    it('should revert if quote at createdat block number is 0', () => {
        setBlockchainEnvironment(0);

        expect(() => {
            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.setBlockQuote();

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.reserveAtIndex(0, u128.fromU32(10), LIQUIDITY_REMOVAL_TYPE);

            queue.executeTrade(reservation);
        }).toThrow();
    });

    it('should delete reservation', () => {
        setBlockchainEnvironment(0);

        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            receiverAddress1,
            u256.fromU64(2000000000),
            u128.fromU64(2000000000),
            u128.fromU64(10),
        );

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.initializeInitialLiquidity(
            u256.fromU32(10000),
            provider1.providerId,
            u256.fromU64(2000000000),
            5,
        );

        queue.updateTotalReserve(u256.fromU64(2000000000), true);
        queue.updateTotalReserved(u256.fromU64(10), true);
        expect(queue.quote()).not.toStrictEqual(u256.Zero);

        queue.setBlockQuote();

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.reserveAtIndex(u32.MAX_VALUE, u128.fromU32(10), NORMAL_TYPE);

        const txOut: TransactionOutput[] = [];

        txOut.push(new TransactionOutput(0, provider1.btcReceiver, 100));

        Blockchain.mockTransactionOutput(txOut);

        queue.executeTrade(reservation);

        expect(reservation.valid()).toBeFalsy();
    });

    it('should set blockNumber to 0 if reservation.createdAt=0', () => {
        setBlockchainEnvironment(0);

        expect(() => {
            const provider1: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                receiverAddress1,
                u256.fromU64(2000000000),
                u128.fromU64(2000000000),
                u128.fromU64(10),
            );

            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            queue.initializeInitialLiquidity(
                u256.fromU32(10000),
                provider1.providerId,
                u256.fromU64(2000000000),
                5,
            );

            queue.updateTotalReserve(u256.fromU64(2000000000), true);
            queue.updateTotalReserved(u256.fromU64(10), true);
            expect(queue.quote()).not.toStrictEqual(u256.Zero);

            queue.setBlockQuote();

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.reserveAtIndex(u32.MAX_VALUE, u128.fromU32(10), NORMAL_TYPE);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, provider1.btcReceiver, 100));

            Blockchain.mockTransactionOutput(txOut);

            queue.executeTrade(reservation);
        }).not.toThrow();
    });

    it('should set blockNumber to createdAt if createdAt < 4294967294', () => {
        setBlockchainEnvironment(1000);

        expect(() => {
            const provider1: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                receiverAddress1,
                u256.fromU64(2000000000),
                u128.fromU64(2000000000),
                u128.fromU64(10),
            );
            provider1.indexedAt = u32.MAX_VALUE;

            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            queue.initializeInitialLiquidity(
                u256.fromU32(10000),
                provider1.providerId,
                u256.fromU64(2000000000),
                5,
            );

            queue.updateTotalReserve(u256.fromU64(2000000000), true);
            queue.updateTotalReserved(u256.fromU64(10), true);
            expect(queue.quote()).not.toStrictEqual(u256.Zero);

            queue.setBlockQuote();

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.reserveAtIndex(u32.MAX_VALUE, u128.fromU32(10), NORMAL_TYPE);
            reservation.save();
            queue.save();

            setBlockchainEnvironment(1003);

            const queue2: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, provider1.btcReceiver, 100));

            Blockchain.mockTransactionOutput(txOut);

            queue2.executeTrade(reservation2);
        }).not.toThrow();
    });

    it('should set blockNumber to wrap around (0) for createdAt = 4294967294 (u32.MAX_VALUE - 1)', () => {
        setBlockchainEnvironment(u32.MAX_VALUE - 1);

        //!!! Wrap around
        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
    });

    it('should set blockNumber to wrap around (1) for createdAt = 4294967294 (u32.MAX_VALUE - 1)', () => {
        setBlockchainEnvironment(u32.MAX_VALUE);

        //!!! Wrap around
        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
    });

    it('should revert when queueType = LIQUIDITY_REMOVAL_TYPE and !provider.pendingRemoval', () => {
        setBlockchainEnvironment(1000);

        expect(() => {
            const provider1: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                receiverAddress1,
                u256.fromU64(2000000000),
                u128.fromU64(2000000000),
                u128.Zero,
            );
            provider1.indexedAt = u32.MAX_VALUE;

            const provider2: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                true,
                true,
                receiverAddress1,
                u256.fromU64(1000000000),
                u128.fromU64(1000000000),
                u128.fromU64(10),
            );
            provider2.indexedAt = 0;

            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            queue.initializeInitialLiquidity(
                u256.fromU32(10000),
                provider1.providerId,
                u256.fromU64(2000000000),
                5,
            );

            queue.addToRemovalQueue(provider2.providerId);
            queue.updateTotalReserve(u256.fromU64(3000000000), true);
            queue.updateTotalReserved(u256.fromU64(10), true);
            expect(queue.quote()).not.toStrictEqual(u256.Zero);

            queue.setBlockQuote();

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.reserveAtIndex(
                <u32>provider2.indexedAt,
                u128.fromU32(10),
                LIQUIDITY_REMOVAL_TYPE,
            );
            reservation.save();
            queue.save();

            setBlockchainEnvironment(1003);

            const queue2: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

            const txOut: TransactionOutput[] = [];

            txOut.push(new TransactionOutput(0, provider1.btcReceiver, 100));

            Blockchain.mockTransactionOutput(txOut);

            queue2.executeTrade(reservation2);
        }).toThrow();
    });

    it('should update BTCowedReserved when queueType = LIQUIDITY_REMOVAL_TYPE and no UTXO sent', () => {
        setBlockchainEnvironment(1000);

        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            receiverAddress1,
            u256.fromU64(2000000000),
            u128.fromU64(2000000000),
            u128.Zero,
        );
        provider1.indexedAt = u32.MAX_VALUE;

        const provider2: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            true,
            true,
            receiverAddress1,
            u256.fromU64(1000000000),
            u128.fromU64(1000000000),
            u128.fromU64(10),
        );
        provider2.indexedAt = 0;

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.initializeInitialLiquidity(
            u256.fromU32(10000),
            provider1.providerId,
            u256.fromU64(2000000000),
            5,
        );

        queue.addToRemovalQueue(provider2.providerId);
        queue.updateTotalReserve(u256.fromU64(3000000000), true);
        queue.updateTotalReserved(u256.fromU64(10), true);
        expect(queue.quote()).not.toStrictEqual(u256.Zero);

        queue.setBlockQuote();

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.reserveAtIndex(
            <u32>provider2.indexedAt,
            u128.fromU32(10),
            LIQUIDITY_REMOVAL_TYPE,
        );
        reservation.save();
        queue.save();

        setBlockchainEnvironment(1003);

        const queue2: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        log(`${queue2.getBTCowedReserved(provider2.providerId)}`);
        queue2.executeTrade(reservation2);
        log(`${queue2.getBTCowedReserved(provider2.providerId)}`);
    });
});
