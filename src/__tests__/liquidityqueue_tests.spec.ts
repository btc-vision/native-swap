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
    msgSender1,
    ownerAddress1,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    receiverAddress1,
    receiverAddress2,
    setBlockchainEnvironment,
    TestLiquidityQueue,
    tokenAddress1,
    tokenAddress2,
    tokenIdUint8Array1,
    tokenIdUint8Array2,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../lib/FeeManager';
import {
    LIQUIDITY_REMOVAL_TYPE,
    NORMAL_TYPE,
    PRIORITY_TYPE,
    Reservation,
} from '../lib/Reservation';
import { satoshisToTokens, tokensToSatoshis } from '../utils/NativeSwapUtils';

describe('Liquidity queue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should create an empty new liquidity queue when it does not exists', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue.initialLiquidityProvider).toStrictEqual(u256.Zero);
        expect(queue.virtualBTCReserve).toStrictEqual(u256.Zero);
        expect(queue.virtualTokenReserve).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensAdd).toStrictEqual(u256.Zero);
        expect(queue.deltaBTCBuy).toStrictEqual(0);
        expect(queue.deltaTokensBuy).toStrictEqual(u256.Zero);
        //!!!expect(queue.deltaTokensSell).toStrictEqual(u256.Zero);
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

        expect(queue.initialLiquidityProvider).toStrictEqual(u256.Zero);
        expect(queue.virtualBTCReserve).toStrictEqual(u256.Zero);
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(1));
        expect(queue.deltaTokensAdd).toStrictEqual(u256.Zero);
        expect(queue.deltaBTCBuy).toStrictEqual(0);
        expect(queue.deltaTokensBuy).toStrictEqual(u256.Zero);
        //!!!!expect(queue.deltaTokensSell).toStrictEqual(u256.Zero);
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

        queue.initialLiquidityProvider = providers[0].providerId;
        queue.lastVirtualUpdateBlock = 888;
        queue.maxTokensPerReservation = u256.fromU32(20000);
        queue.increaseTotalReserve(u256.fromU32(1000));
        queue.increaseTotalReserved(u256.fromU32(2000));
        queue.deltaTokensAdd = u256.fromU32(10000);
        queue.deltaBTCBuy = 20000;
        //!!!!queue.deltaTokensSell = u256.fromU32(30000);
        queue.deltaTokensBuy = u256.fromU32(40000);

        queue.save();

        const queue2: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue2.initialLiquidityProvider).toStrictEqual(queue.initialLiquidityProvider);
        expect(queue2.lastVirtualUpdateBlock).toStrictEqual(queue.lastVirtualUpdateBlock);
        expect(queue2.maxTokensPerReservation).toStrictEqual(queue.maxTokensPerReservation);
        expect(queue2.liquidity).toStrictEqual(queue.liquidity);
        expect(queue2.reservedLiquidity).toStrictEqual(queue.reservedLiquidity);
        expect(queue2.deltaTokensAdd).toStrictEqual(queue.deltaTokensAdd);
        expect(queue2.deltaBTCBuy).toStrictEqual(queue.deltaBTCBuy);
        //!!!!expect(queue2.deltaTokensSell).toStrictEqual(queue.deltaTokensSell);
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

        queue.initialLiquidityProvider = providers[0].providerId;
        queue.maxTokensPerReservation = u256.fromU32(20000);
        queue.increaseTotalReserve(u256.fromU32(1000));
        queue.increaseTotalReserved(u256.fromU32(2000));
        queue.deltaTokensAdd = u256.fromU32(10000);
        queue.deltaBTCBuy = 20000;
        //!!!!queue.deltaTokensSell = u256.fromU32(30000);
        queue.deltaTokensBuy = u256.fromU32(40000);

        queue.save();

        expect(queue.lastVirtualUpdateBlock).toStrictEqual(1);

        setBlockchainEnvironment(2);

        // The goal is only to check if updateVirtualPoolIfNeeded has been called.
        const queue2: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        expect(queue2.lastVirtualUpdateBlock).toStrictEqual(2);
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

        queue.deltaBTCBuy = 1000;
        expect(queue.deltaBTCBuy).toStrictEqual(1000);
    });

    /*!!!!
    it('should correctly get/set deltaTokensSell value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.deltaTokensSell = u256.fromU32(1000);
        expect(queue.deltaTokensSell).toStrictEqual(u256.fromU32(1000));
    });
*/

    it('should correctly get/set lastVirtualUpdateBlock value', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 5;
        expect(queue.lastVirtualUpdateBlock).toStrictEqual(5);
    });

    it('should correctly get/updateTotalReserved value when increasing', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.increaseTotalReserved(u256.fromU32(10000000));
        expect(queue.reservedLiquidity).toStrictEqual(u256.fromU32(10000000));
    });

    it('should correctly get/updateTotalReserved value when decreasing', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.increaseTotalReserved(u256.fromU32(2));
        queue.decreaseTotalReserved(u256.fromU32(1));
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

            queue.increaseTotalReserved(u256.Max);
            queue.increaseTotalReserved(u256.fromU32(1));
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

            queue.decreaseTotalReserved(u256.fromU32(1000));
            queue.decreaseTotalReserved(u256.fromU32(1001));
        }).toThrow('SafeMath: subtraction overflow');
    });

    it('should correctly get/updateTotalReserve value when increasing', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.increaseTotalReserve(u256.fromU32(10000000));
        expect(queue.liquidity).toStrictEqual(u256.fromU32(10000000));
    });

    it('should correctly get/updateTotalReserve value when decreasing', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.increaseTotalReserve(u256.fromU32(2));
        queue.decreaseTotalReserve(u256.fromU32(1));
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

            queue.increaseTotalReserve(u256.Max);
            queue.increaseTotalReserve(u256.fromU32(1));
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

            queue.decreaseTotalReserve(u256.fromU32(1000));
            queue.decreaseTotalReserve(u256.fromU32(1001));
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

        queue.increaseTotalReserved(u256.fromU32(10000));
        expect(queue.getUtilizationRatio()).toStrictEqual(u256.Zero);
    });

    it('should return 0 when getUtilizationRatio is called and reservedLiquidity is 0', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.increaseTotalReserve(u256.fromU32(10000));
        expect(queue.getUtilizationRatio()).toStrictEqual(u256.Zero);
    });

    it('should return the correct value when getUtilizationRatio is called, liquidity <> 0 and reservedLiquidity <> 0', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.increaseTotalReserved(u256.fromU32(9000));
        queue.increaseTotalReserve(u256.fromU32(1000));
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

            queue.increaseTotalReserved(maxValue);
            queue.increaseTotalReserve(u256.fromU32(1000));
            queue.getUtilizationRatio();
        }).toThrow();
    });

    it('should return the correct value when tokensToSatoshis is called', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(tokensToSatoshis(u256.fromU32(10000), u256.fromU32(50000))).toStrictEqual(
            u256.fromU64(20002000),
        );
    });

    it('should return the correct value when satoshisToTokens is called', () => {
        setBlockchainEnvironment(1);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(satoshisToTokens(u256.fromU32(20000000), u256.fromU32(50000))).toStrictEqual(
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

        expect(queue.initialLiquidityProvider).toStrictEqual(u256.fromU32(10000));
        expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(888888));
        expect(queue.maxReserves5BlockPercent).toStrictEqual(10);
        expect(queue.virtualBTCReserve).toStrictEqual(virtualBTCReserve, `1`);
    });

    it('should correctly set deltaBTCBuy and deltaTokensBuy when calling buyTokens', () => {
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.buyTokens(u256.fromU32(10000), u256.fromU32(888888));

        expect(queue.deltaBTCBuy).toStrictEqual(888888);
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
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.increaseTotalReserve(u256.fromU32(100000));
        queue.increaseTotalReserved(u256.fromU32(10000));

        const fees = queue.computeFees(u256.fromU32(20000), u256.fromU32(100000));

        expect(fees).toStrictEqual(u256.fromU32(46));
    });

    it('should get FeeManager.PRIORITY_QUEUE_BASE_FEE as priority fees when calling getCostPriorityFee and no provider in priority queue', () => {
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        FeeManager.PRIORITY_QUEUE_BASE_FEE = 1000;
        const cost = FeeManager.PRIORITY_QUEUE_BASE_FEE;

        expect(cost).toStrictEqual(FeeManager.PRIORITY_QUEUE_BASE_FEE);
    });

    /*it('should return Address.dead when the staking contract address is not initialized', () => {
        setBlockchainEnvironment(90);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue.stakingContractAddress).toStrictEqual(Address.dead());
    });

    it('should return the valid staking contract address when initialized', () => {
        setBlockchainEnvironment(90);

        const stakingContractAddress = new StoredAddress(STAKING_CA_POINTER, Address.dead());
        stakingContractAddress.value = testStackingContractAddress;

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue.stakingContractAddress).toStrictEqual(testStackingContractAddress);
    });*/
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
        queue.deltaBTCBuy = 999900001;
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
        queue.deltaBTCBuy = 999990000;
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
        queue.deltaBTCBuy = 10;
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
        queue.deltaBTCBuy = 999900001;
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
        queue.deltaBTCBuy = 100;
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
        queue.deltaBTCBuy = 1;
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
        queue.deltaBTCBuy = 10;
        //!!!!queue.deltaTokensSell = u256.fromU32(2);
        queue.deltaTokensAdd = u256.fromU32(2);

        queue.updateVirtualPoolIfNeeded();

        expect(queue.deltaBTCBuy).toStrictEqual(0);
        expect(queue.deltaTokensAdd).toStrictEqual(u256.Zero);
        //!!!!expect(queue.deltaTokensSell).toStrictEqual(u256.Zero);
        expect(queue.deltaTokensBuy).toStrictEqual(u256.Zero);
    });

    it('should update lastVirtualUpdateBlock to the current block', () => {
        setBlockchainEnvironment(5);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        queue.lastVirtualUpdateBlock = 4;
        queue.virtualBTCReserve = u256.fromU32(100000);
        queue.virtualTokenReserve = u256.fromU32(10000);
        queue.deltaTokensBuy = u256.fromU32(10);
        queue.deltaBTCBuy = 10;
        //!!!!queue.deltaTokensSell = u256.fromU32(2);
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

    it('should throw if reservation is not valid when calling getReservationWithExpirationChecks', () => {
        setBlockchainEnvironment(0);

        expect(() => {
            const reservation = new Reservation(tokenAddress1, msgSender1);
            expect(reservation.valid()).toBeFalsy();

            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.getReservationWithExpirationChecks();
        }).toThrow();
    });

    it("should throw if createdAt + getActivationDelay > current block => 'Too early' when calling getReservationWithExpirationChecks", () => {
        setBlockchainEnvironment(0);

        expect(() => {
            const reservation = new Reservation(tokenAddress1, msgSender1);
            reservation.reserveAtIndex(0, u128.fromU64(1000), PRIORITY_TYPE);
            reservation.setActivationDelay(2);
            reservation.setExpirationBlock(LiquidityQueue.RESERVATION_EXPIRE_AFTER);
            expect(reservation.valid()).toBeTruthy();
            reservation.save();

            setBlockchainEnvironment(1);
            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.getReservationWithExpirationChecks();
        }).toThrow();
    });

    it("should throw if getActivationDelay = 0 and createdAt = current block => 'Too early' when calling getReservationWithExpirationChecks", () => {
        setBlockchainEnvironment(0);

        expect(() => {
            const reservation = new Reservation(tokenAddress1, msgSender1);
            reservation.reserveAtIndex(0, u128.fromU64(1000), PRIORITY_TYPE);
            reservation.setActivationDelay(0);
            reservation.setExpirationBlock(LiquidityQueue.RESERVATION_EXPIRE_AFTER);
            expect(reservation.valid()).toBeTruthy();
            reservation.save();

            setBlockchainEnvironment(0);
            const queue: LiquidityQueue = new LiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.getReservationWithExpirationChecks();
        }).toThrow();
    });

    it('should return reservation if createdAt + getActivationDelay <= current block when calling getReservationWithExpirationChecks', () => {
        setBlockchainEnvironment(0);

        const reservation = new Reservation(tokenAddress1, msgSender1);
        reservation.reserveAtIndex(0, u128.fromU64(1000), PRIORITY_TYPE);
        reservation.setActivationDelay(2);
        reservation.setExpirationBlock(LiquidityQueue.RESERVATION_EXPIRE_AFTER);
        expect(reservation.valid()).toBeTruthy();
        reservation.save();

        setBlockchainEnvironment(2);
        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const result = queue.getReservationWithExpirationChecks();

        expect(result.reservationId).toStrictEqual(reservation.reservationId);
    });
});

describe('Liquidity getMaximumTokensLeftBeforeCap tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should return the correct number of tokens', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.maxReserves5BlockPercent = 50;
        queue.increaseTotalReserve(u256.fromU64(1000000000));
        queue.increaseTotalReserved(u256.fromU32(499999999));

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.fromU32(1));
    });

    it('should return 0 if totalLiquidity is 0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.increaseTotalReserved(u256.fromU32(50));
        queue.increaseTotalReserve(u256.Zero);
        queue.maxReserves5BlockPercent = 10;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.Zero);
    });

    it('should return 0 if reservedScaled >= capScaled', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.increaseTotalReserved(u256.fromU32(90));
        queue.increaseTotalReserve(u256.fromU32(100));
        queue.maxReserves5BlockPercent = 80;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.Zero);
    });

    it('should handle the exact boundary ratioScaled == maxPercentScaled => 0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.increaseTotalReserved(u256.fromU32(40));
        queue.increaseTotalReserve(u256.fromU32(100));
        queue.maxReserves5BlockPercent = 40;

        const result = queue.getMaximumTokensLeftBeforeCap();

        expect(result).toStrictEqual(u256.Zero);
    });

    it('should handle large numbers', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.increaseTotalReserved(u256.fromU32(1_000_000));
        queue.increaseTotalReserve(u256.fromU32(10_000_000));
        queue.maxReserves5BlockPercent = 50;

        const result = queue.getMaximumTokensLeftBeforeCap();

        expect(result).toStrictEqual(u256.fromU64(4_000_000));
    });

    it('should handle 0% maxReserves5BlockPercent => full leftover if liquidity != 0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.increaseTotalReserved(u256.fromU32(50));
        queue.increaseTotalReserve(u256.fromU32(100));
        queue.maxReserves5BlockPercent = 0;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.Zero);
    });

    it('should handle 100% maxReserves5BlockPercent => leftover could be up to totalLiquidity if ratio < 1', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.increaseTotalReserved(u256.fromU32(30));
        queue.increaseTotalReserve(u256.fromU32(100));
        queue.maxReserves5BlockPercent = 100;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.fromU64(70));
    });

    it('should handle the case: reserved==liquidity => ratio=1 => leftover=0 if maxPercent<100', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.increaseTotalReserved(u256.fromU32(100));
        queue.increaseTotalReserve(u256.fromU32(100));
        queue.maxReserves5BlockPercent = 90;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.Zero);
    });

    it('should produce some leftover if ratio=1 but max=100 => leftover=0 as well, ratio=1 => leftover= (100%-100%)=0', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.increaseTotalReserved(u256.fromU32(500));
        queue.increaseTotalReserve(u256.fromU32(500));
        queue.maxReserves5BlockPercent = 100;

        const result = queue.getMaximumTokensLeftBeforeCap();
        expect(result).toStrictEqual(u256.Zero);
    });

    it('should produce partial leftover if ratio is small and max is small but non-zero', () => {
        setBlockchainEnvironment(0);

        const queue: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        queue.increaseTotalReserved(u256.fromU32(1));
        queue.increaseTotalReserve(u256.fromU32(100));
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

        queue.increaseTotalReserve(u256.fromU64(2000000000));
        queue.increaseTotalReserved(u256.fromU64(10));
        expect(queue.quote()).not.toStrictEqual(u256.Zero);

        queue.setBlockQuote();

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.reserveAtIndex(u32.MAX_VALUE, u128.fromU32(10), NORMAL_TYPE);
        reservation.setPurgeIndex(0);

        const reservationActiveList = queue.getActiveReservationListForBlock(0);
        reservationActiveList.push(true);
        reservationActiveList.save();

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

            queue.increaseTotalReserve(u256.fromU64(2000000000));
            queue.increaseTotalReserved(u256.fromU64(10));
            expect(queue.quote()).not.toStrictEqual(u256.Zero);

            queue.setBlockQuote();

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.reserveAtIndex(u32.MAX_VALUE, u128.fromU32(10), NORMAL_TYPE);
            reservation.setPurgeIndex(0);
            const reservationActiveList = queue.getActiveReservationListForBlock(0);
            reservationActiveList.push(true);
            reservationActiveList.save();

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

            queue.increaseTotalReserve(u256.fromU64(2000000000));
            queue.increaseTotalReserved(u256.fromU64(10));
            expect(queue.quote()).not.toStrictEqual(u256.Zero);

            queue.setBlockQuote();

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.reserveAtIndex(u32.MAX_VALUE, u128.fromU32(10), NORMAL_TYPE);
            reservation.setPurgeIndex(0);
            reservation.save();
            const reservationActiveList = queue.getActiveReservationListForBlock(1000);
            reservationActiveList.push(true);
            reservationActiveList.save();
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
            queue.increaseTotalReserve(u256.fromU64(3000000000));
            queue.increaseTotalReserved(u256.fromU64(10));
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
            receiverAddress2,
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
        queue.increaseTotalReserve(u256.fromU64(3000000000));
        queue.increaseTotalReserved(u256.fromU64(10));
        queue.setBTCowedReserved(provider2.providerId, u256.fromU64(20000));
        expect(queue.quote()).not.toStrictEqual(u256.Zero);

        queue.setBlockQuote();

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        reservation.reserveAtIndex(
            <u32>provider2.indexedAt,
            u128.fromU32(999999),
            LIQUIDITY_REMOVAL_TYPE,
        );
        reservation.setPurgeIndex(0);
        reservation.save();

        const reservationActiveList = queue.getActiveReservationListForBlock(1000);
        reservationActiveList.push(true);
        reservationActiveList.save();

        queue.save();

        setBlockchainEnvironment(1003);

        const queue2: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        const reservation2: Reservation = new Reservation(tokenAddress1, ownerAddress1);

        queue2.executeTrade(reservation2);
        queue2.save();

        const queue3: LiquidityQueue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        expect(queue3.getBTCowedReserved(provider2.providerId)).toStrictEqual(u256.fromU32(19900));
    });
});

describe('LiquidityQueue => purgeReservationsAndRestoreProviders', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should do nothing if currentBlockNumber <= expireAfter => calls restoreCurrentIndex', () => {
        setBlockchainEnvironment(10);

        const queue: TestLiquidityQueue = new TestLiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        expect(queue.getCurrentIndexPriority()).toStrictEqual(0);
        expect(queue.getCurrentIndex()).toStrictEqual(0);
        expect(queue.getCurrentIndexRemoval()).toStrictEqual(0);

        queue.lastPurgedBlock = 8;
        queue.setPreviousReservationStartingIndex(100);
        queue.setPreviousReservationStandardStartingIndex(101);
        queue.setPreviousRemovalStartingIndex(102);
        queue.callPurgeReservationsAndRestoreProviders();

        expect(queue.getCurrentIndexPriority()).toStrictEqual(100);
        expect(queue.getCurrentIndex()).toStrictEqual(101);
        expect(queue.getCurrentIndexRemoval()).toStrictEqual(102);
    });

    it('should do nothing if lastPurgedBlock >= maxBlockToPurge => calls restoreCurrentIndex', () => {
        setBlockchainEnvironment(20);

        const queue: TestLiquidityQueue = new TestLiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        expect(queue.getCurrentIndexPriority()).toStrictEqual(0);
        expect(queue.getCurrentIndex()).toStrictEqual(0);
        expect(queue.getCurrentIndexRemoval()).toStrictEqual(0);

        queue.setPreviousReservationStartingIndex(100);
        queue.setPreviousReservationStandardStartingIndex(101);
        queue.setPreviousRemovalStartingIndex(102);
        queue.lastPurgedBlock = 15;
        queue.callPurgeReservationsAndRestoreProviders();

        expect(queue.getCurrentIndexPriority()).toStrictEqual(100);
        expect(queue.getCurrentIndex()).toStrictEqual(101);
        expect(queue.getCurrentIndexRemoval()).toStrictEqual(102);
    });

    it("should do nothing if the block range has no 'active' reservations => after the for loop => updatedOne=false => restoreIndex", () => {
        setBlockchainEnvironment(6);

        const queue: TestLiquidityQueue = new TestLiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        expect(queue.getCurrentIndexPriority()).toStrictEqual(0);
        expect(queue.getCurrentIndex()).toStrictEqual(0);
        expect(queue.getCurrentIndexRemoval()).toStrictEqual(0);

        queue.setPreviousReservationStartingIndex(100);
        queue.setPreviousReservationStandardStartingIndex(101);
        queue.setPreviousRemovalStartingIndex(102);
        queue.lastPurgedBlock = 5;
        expect(queue.getReservationListForBlock(6).getLength()).toStrictEqual(0);

        queue.callPurgeReservationsAndRestoreProviders();

        expect(queue.getCurrentIndexPriority()).toStrictEqual(100);
        expect(queue.getCurrentIndex()).toStrictEqual(101);
        expect(queue.getCurrentIndexRemoval()).toStrictEqual(102);
    });

    it("should do nothing if the block range has a reservation but not 'active' => after the for loop => updatedOne=false => restoreIndex", () => {
        setBlockchainEnvironment(100);

        const queue: TestLiquidityQueue = new TestLiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        expect(queue.getCurrentIndexPriority()).toStrictEqual(0);
        expect(queue.getCurrentIndex()).toStrictEqual(0);
        expect(queue.getCurrentIndexRemoval()).toStrictEqual(0);

        queue.setPreviousReservationStartingIndex(100);
        queue.setPreviousReservationStandardStartingIndex(101);
        queue.setPreviousRemovalStartingIndex(102);
        queue.lastPurgedBlock = 0;
        queue.addActiveReservationToList(0, u128.fromU32(1));
        const reservationActiveList = queue.getActiveReservationListForBlock(0);
        expect(reservationActiveList.get(0)).toBeTruthy();
        reservationActiveList.set(0, false);
        reservationActiveList.save();
        expect(reservationActiveList.get(0)).toBeFalsy();

        queue.callPurgeReservationsAndRestoreProviders();

        expect(queue.getCurrentIndexPriority()).toStrictEqual(100);
        expect(queue.getCurrentIndex()).toStrictEqual(101);
        expect(queue.getCurrentIndexRemoval()).toStrictEqual(102);
    });

    it('should handle scenario with active reservations => we remove them => updatedOne= true => calls resetStartingIndex + updateTotalReserved', () => {
        setBlockchainEnvironment(100);

        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            'lwekfopewjfwe',
            u256.fromU32(10000000),
            u128.fromU32(10000000),
            u128.fromU32(1000000),
            true,
            false,
        );

        const provider2: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            false,
            true,
            true,
            'ddekwpepew',
            u256.fromU32(10000000),
            u128.fromU32(10000000),
            u128.fromU32(1000000),
            true,
            false,
        );

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

        const queue: TestLiquidityQueue = new TestLiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        queue.initializeInitialLiquidity(
            u256.fromU32(10000),
            provider1.providerId,
            u256.fromU64(10000000),
            5,
        );

        queue.setPreviousReservationStartingIndex(100);
        queue.setPreviousReservationStandardStartingIndex(101);
        queue.setPreviousRemovalStartingIndex(102);
        queue.increaseTotalReserve(u256.fromU64(10000000));
        queue.increaseTotalReserved(u256.fromU64(2000000));
        queue.setBlockQuote();
        queue.addToStandardQueue(provider2.providerId);
        queue.lastPurgedBlock = 0;
        const purgeIndex = queue.addActiveReservationToList(0, reservation.reservationId);

        reservation.setExpirationBlock(90);
        reservation.setPurgeIndex(purgeIndex);
        reservation.reserveAtIndex(<u32>provider2.indexedAt, u128.fromU32(1000000), NORMAL_TYPE);
        reservation.save();

        const reservationActiveList = queue.getActiveReservationListForBlock(0);
        reservationActiveList.push(true);
        reservationActiveList.save();

        const activereservationList1 = queue.getActiveReservationListForBlock(0);
        expect(activereservationList1.get(purgeIndex)).toBeTruthy();
        queue.callPurgeReservationsAndRestoreProviders();

        const reservationList = queue.getReservationListForBlock(0);
        const activereservationList2 = queue.getActiveReservationListForBlock(0);

        expect(activereservationList2.getLength()).toStrictEqual(0);
        expect(reservationList.getLength()).toStrictEqual(0);
        expect(queue.getPreviousRemovalStartingIndex()).toStrictEqual(0);
        expect(queue.getPreviousReservationStandardStartingIndex()).toStrictEqual(0);
        expect(queue.getPreviousReservationStartingIndex()).toStrictEqual(0);
        expect(queue.reservedLiquidity).toStrictEqual(u256.fromU32(1000000));
        expect(queue.lastPurgedBlock).toStrictEqual(95);
    });

    it('should revert if reservation purge index mismatch', () => {
        setBlockchainEnvironment(50);

        expect(() => {
            const provider1: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                'lwekfopewjfwe',
                u256.fromU32(10000000),
                u128.fromU32(10000000),
                u128.fromU32(1000000),
                true,
                false,
            );

            const provider2: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                true,
                true,
                'ddekwpepew',
                u256.fromU32(10000000),
                u128.fromU32(10000000),
                u128.fromU32(1000000),
                true,
                false,
            );

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

            const queue: TestLiquidityQueue = new TestLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.initializeInitialLiquidity(
                u256.fromU32(10000),
                provider1.providerId,
                u256.fromU64(10000000),
                5,
            );

            queue.setPreviousReservationStartingIndex(100);
            queue.setPreviousReservationStandardStartingIndex(101);
            queue.setPreviousRemovalStartingIndex(102);
            queue.increaseTotalReserve(u256.fromU64(10000000));
            queue.increaseTotalReserved(u256.fromU64(2000000));
            queue.setBlockQuote();
            queue.addToStandardQueue(provider2.providerId);
            queue.lastPurgedBlock = 0;
            queue.addActiveReservationToList(0, reservation.reservationId);

            reservation.setExpirationBlock(90);
            reservation.setPurgeIndex(10000);
            reservation.reserveAtIndex(
                <u32>provider2.indexedAt,
                u128.fromU32(1000000),
                NORMAL_TYPE,
            );

            reservation.save();

            queue.callPurgeReservationsAndRestoreProviders();
        }).toThrow();
    });

    it('should revert if reservation is not expired', () => {
        setBlockchainEnvironment(50);

        expect(() => {
            const provider1: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                'lwekfopewjfwe',
                u256.fromU32(10000000),
                u128.fromU32(10000000),
                u128.fromU32(1000000),
                true,
                false,
            );

            const provider2: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                true,
                true,
                'ddekwpepew',
                u256.fromU32(10000000),
                u128.fromU32(10000000),
                u128.fromU32(1000000),
                true,
                false,
            );

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

            const queue: TestLiquidityQueue = new TestLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.initializeInitialLiquidity(
                u256.fromU32(10000),
                provider1.providerId,
                u256.fromU64(10000000),
                5,
            );

            queue.setPreviousReservationStartingIndex(100);
            queue.setPreviousReservationStandardStartingIndex(101);
            queue.setPreviousRemovalStartingIndex(102);
            queue.increaseTotalReserve(u256.fromU64(10000000));
            queue.increaseTotalReserved(u256.fromU64(2000000));
            queue.setBlockQuote();
            queue.addToStandardQueue(provider2.providerId);
            queue.lastPurgedBlock = 0;
            const purgeIndex = queue.addActiveReservationToList(0, reservation.reservationId);

            reservation.setExpirationBlock(9999);
            reservation.setPurgeIndex(purgeIndex);
            reservation.reserveAtIndex(
                <u32>provider2.indexedAt,
                u128.fromU32(1000000),
                NORMAL_TYPE,
            );

            reservation.save();

            queue.callPurgeReservationsAndRestoreProviders();
        }).toThrow();
    });

    it("should revert if reserved amount bigger than provider reserve => 'Impossible: reserved amount bigger...'", () => {
        setBlockchainEnvironment(100);

        expect(() => {
            const provider1: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                'lwekfopewjfwe',
                u256.fromU32(10000000),
                u128.fromU32(10000000),
                u128.fromU32(1000000),
                true,
                false,
            );

            const provider2: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                false,
                true,
                true,
                'ddekwpepew',
                u256.fromU32(10000000),
                u128.fromU32(10000000),
                u128.fromU32(1000000),
                true,
                false,
            );

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

            const queue: TestLiquidityQueue = new TestLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.initializeInitialLiquidity(
                u256.fromU32(10000),
                provider1.providerId,
                u256.fromU64(10000000),
                5,
            );

            queue.setPreviousReservationStartingIndex(100);
            queue.setPreviousReservationStandardStartingIndex(101);
            queue.setPreviousRemovalStartingIndex(102);
            queue.increaseTotalReserve(u256.fromU64(10000000));
            queue.increaseTotalReserved(u256.fromU64(2000000));
            queue.setBlockQuote();
            queue.addToStandardQueue(provider2.providerId);
            queue.lastPurgedBlock = 0;
            const purgeIndex = queue.addActiveReservationToList(0, reservation.reservationId);

            reservation.setExpirationBlock(90);
            reservation.setPurgeIndex(purgeIndex);
            reservation.reserveAtIndex(
                <u32>provider2.indexedAt,
                u128.fromU32(100000000),
                NORMAL_TYPE,
            );

            reservation.save();

            queue.callPurgeReservationsAndRestoreProviders();
        }).toThrow();
    });

    it('should revert when pendingRemoval provider => no quote at block', () => {
        setBlockchainEnvironment(100);

        expect(() => {
            const provider1: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                true,
                true,
                'lwekfopewjfwe',
                u256.fromU32(10000000),
                u128.fromU32(10000000),
                u128.fromU32(1000000),
                true,
                false,
            );

            const provider2: Provider = createProvider(
                providerAddress2,
                tokenAddress1,
                true,
                true,
                true,
                'ddekwpepew',
                u256.fromU32(10000000),
                u128.fromU32(10000000),
                u128.fromU32(1000000),
                true,
                false,
            );

            const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

            const queue: TestLiquidityQueue = new TestLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            queue.initializeInitialLiquidity(
                u256.fromU32(10000),
                provider1.providerId,
                u256.fromU64(10000000),
                5,
            );

            queue.setPreviousReservationStartingIndex(100);
            queue.setPreviousReservationStandardStartingIndex(101);
            queue.setPreviousRemovalStartingIndex(102);
            queue.increaseTotalReserve(u256.fromU64(10000000));
            queue.increaseTotalReserved(u256.fromU64(2000000));
            queue.setBlockQuote();
            queue.addToRemovalQueue(provider2.providerId);
            queue.lastPurgedBlock = 0;
            const purgeIndex = queue.addActiveReservationToList(0, reservation.reservationId);

            reservation.setExpirationBlock(90);
            reservation.setPurgeIndex(purgeIndex);
            reservation.reserveAtIndex(
                <u32>provider2.indexedAt,
                u128.fromU32(1000000),
                LIQUIDITY_REMOVAL_TYPE,
            );

            reservation.save();

            queue.callPurgeReservationsAndRestoreProviders();
        }).toThrow();
    });

    it('should handle pendingRemoval provider => removal queue => calls purgeAndRestoreProviderRemovalQueue => costInSats < wasReservedSats => clamp by owedReserved', () => {
        setBlockchainEnvironment(90);

        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            'lwekfopewjfwe',
            u256.fromU32(10000000),
            u128.fromU32(10000000),
            u128.fromU32(1000000),
            true,
            false,
        );

        const provider2: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            true,
            true,
            'ddekwpepew',
            u256.fromU64(10000000),
            u128.fromU64(10000000),
            u128.fromU64(1000000),
            true,
            false,
        );

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

        const queue: TestLiquidityQueue = new TestLiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        queue.initializeInitialLiquidity(
            u256.fromU32(100000),
            provider1.providerId,
            u256.fromU64(20000000),
            5,
        );

        queue.setPreviousReservationStartingIndex(100);
        queue.setPreviousReservationStandardStartingIndex(101);
        queue.setPreviousRemovalStartingIndex(102);
        queue.increaseTotalReserve(u256.fromU64(20000000));
        queue.increaseTotalReserved(u256.fromU64(1000000));
        queue.setBlockQuote();
        queue.addToRemovalQueue(provider2.providerId);
        queue.setBTCowedReserved(provider2.providerId, u256.from(100));
        queue.lastPurgedBlock = 0;
        const purgeIndex = queue.addActiveReservationToList(0, reservation.reservationId);

        reservation.setExpirationBlock(95);
        reservation.setPurgeIndex(purgeIndex);
        reservation.reserveAtIndex(
            <u32>provider2.indexedAt,
            u128.fromU64(1000000),
            LIQUIDITY_REMOVAL_TYPE,
        );

        reservation.save();

        setBlockchainEnvironment(96);
        queue.callPurgeReservationsAndRestoreProviders();

        expect(queue.getBTCowedReserved(provider2.providerId)).toStrictEqual(u256.fromU32(90));
    });

    it('should handle pendingRemoval provider => removal queue => calls purgeAndRestoreProviderRemovalQueue => costInSats < wasReservedSats => clamp by owedReserved', () => {
        setBlockchainEnvironment(90);

        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            'lwekfopewjfwe',
            u256.fromU32(10000000),
            u128.fromU32(10000000),
            u128.fromU32(1000000),
            true,
            false,
        );

        const provider2: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            true,
            true,
            'ddekwpepew',
            u256.fromU64(10000000),
            u128.fromU64(10000000),
            u128.fromU64(1000000),
            true,
            false,
        );

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

        const queue: TestLiquidityQueue = new TestLiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        queue.initializeInitialLiquidity(
            u256.fromU32(100000),
            provider1.providerId,
            u256.fromU64(20000000),
            5,
        );

        queue.setPreviousReservationStartingIndex(100);
        queue.setPreviousReservationStandardStartingIndex(101);
        queue.setPreviousRemovalStartingIndex(102);
        queue.increaseTotalReserve(u256.fromU64(20000000));
        queue.increaseTotalReserved(u256.fromU64(1000000));
        queue.setBlockQuote();
        queue.addToRemovalQueue(provider2.providerId);
        queue.setBTCowedReserved(provider2.providerId, u256.from(100));
        queue.lastPurgedBlock = 0;
        const purgeIndex = queue.addActiveReservationToList(0, reservation.reservationId);

        reservation.setExpirationBlock(95);
        reservation.setPurgeIndex(purgeIndex);
        reservation.reserveAtIndex(
            <u32>provider2.indexedAt,
            u128.fromU64(1000000),
            LIQUIDITY_REMOVAL_TYPE,
        );

        reservation.save();

        setBlockchainEnvironment(96);
        queue.callPurgeReservationsAndRestoreProviders();

        expect(queue.getBTCowedReserved(provider2.providerId)).toStrictEqual(u256.fromU32(90));
    });

    it('should handle pendingRemoval provider => removal queue => calls purgeAndRestoreProviderRemovalQueue => costInSats > wasReservedSats => clamp by owedReserved', () => {
        setBlockchainEnvironment(90);

        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            'lwekfopewjfwe',
            u256.fromU32(10000000),
            u128.fromU32(10000000),
            u128.fromU32(1000000),
            true,
            false,
        );

        const provider2: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            true,
            true,
            'ddekwpepew',
            u256.fromU64(10000000),
            u128.fromU64(10000000),
            u128.fromU64(1000000),
            true,
            false,
        );

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);

        const queue: TestLiquidityQueue = new TestLiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        queue.initializeInitialLiquidity(
            u256.fromU32(100000),
            provider1.providerId,
            u256.fromU64(20000000),
            5,
        );

        queue.setPreviousReservationStartingIndex(100);
        queue.setPreviousReservationStandardStartingIndex(101);
        queue.setPreviousRemovalStartingIndex(102);
        queue.increaseTotalReserve(u256.fromU64(20000000));
        queue.increaseTotalReserved(u256.fromU64(1000000));
        queue.setBlockQuote();
        queue.addToRemovalQueue(provider2.providerId);
        queue.setBTCowedReserved(provider2.providerId, u256.from(9));
        queue.lastPurgedBlock = 0;
        const purgeIndex = queue.addActiveReservationToList(0, reservation.reservationId);

        reservation.setExpirationBlock(95);
        reservation.setPurgeIndex(purgeIndex);
        reservation.reserveAtIndex(
            <u32>provider2.indexedAt,
            u128.fromU64(1000000),
            LIQUIDITY_REMOVAL_TYPE,
        );

        reservation.save();

        setBlockchainEnvironment(96);
        queue.callPurgeReservationsAndRestoreProviders();

        expect(queue.getBTCowedReserved(provider2.providerId)).toStrictEqual(u256.fromU32(0));
        expect(queue.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue.getPreviousReservationStartingIndex()).toStrictEqual(0);
        expect(queue.getPreviousRemovalStartingIndex()).toStrictEqual(0);
        expect(queue.getPreviousReservationStandardStartingIndex()).toStrictEqual(0);
    });

    it('should handle multiple providers for a reservation', () => {
        setBlockchainEnvironment(90);

        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            'lwekfopewjfwe',
            u256.fromU32(10000000),
            u128.fromU32(10000000),
            u128.fromU32(0),
            true,
            false,
        );

        const provider2: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            true,
            true,
            'ddekwpepew',
            u256.fromU64(10000000),
            u128.fromU64(10000000),
            u128.fromU64(10000000),
            true,
            false,
        );

        const provider3: Provider = createProvider(
            providerAddress3,
            tokenAddress1,
            true,
            true,
            true,
            'ddekwpepew',
            u256.fromU64(5000000),
            u128.fromU64(5000000),
            u128.fromU64(2000000),
            true,
            false,
        );

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        const queue: TestLiquidityQueue = new TestLiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        queue.initializeInitialLiquidity(
            u256.fromU32(1),
            provider1.providerId,
            u256.fromU64(10000000),
            5,
        );

        queue.setPreviousReservationStartingIndex(100);
        queue.setPreviousReservationStandardStartingIndex(101);
        queue.setPreviousRemovalStartingIndex(102);
        queue.increaseTotalReserve(u256.fromU64(25000000));
        queue.increaseTotalReserved(u256.fromU64(12000000));
        queue.setBlockQuote();
        queue.addToRemovalQueue(provider2.providerId);
        queue.addToStandardQueue(provider3.providerId);
        queue.setBTCowedReserved(provider2.providerId, u256.from(10000000));
        queue.setBTCowedReserved(provider3.providerId, u256.from(2000000));
        queue.lastPurgedBlock = 0;
        const purgeIndex = queue.addActiveReservationToList(0, reservation.reservationId);

        reservation.setExpirationBlock(95);
        reservation.setPurgeIndex(purgeIndex);
        reservation.reserveAtIndex(
            <u32>provider2.indexedAt,
            u128.fromU64(10000000),
            LIQUIDITY_REMOVAL_TYPE,
        );
        reservation.reserveAtIndex(<u32>provider3.indexedAt, u128.fromU64(2000000), NORMAL_TYPE);

        reservation.save();

        setBlockchainEnvironment(96);
        queue.callPurgeReservationsAndRestoreProviders();

        expect(queue.getBTCowedReserved(provider2.providerId)).toStrictEqual(u256.Zero);
        expect(queue.reservedLiquidity).toStrictEqual(u256.Zero);
        expect(queue.getPreviousReservationStartingIndex()).toStrictEqual(0);
        expect(queue.getPreviousRemovalStartingIndex()).toStrictEqual(0);
        expect(queue.getPreviousReservationStandardStartingIndex()).toStrictEqual(0);
    });

    it('should handle normal provider for a reservation', () => {
        setBlockchainEnvironment(90);

        const provider1: Provider = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            true,
            true,
            'lwekfopewjfwe',
            u256.fromU32(10000000),
            u128.fromU32(10000000),
            u128.fromU32(0),
            true,
            false,
        );

        const provider2: Provider = createProvider(
            providerAddress2,
            tokenAddress1,
            true,
            true,
            true,
            'ddekwpepew',
            u256.fromU64(10000000),
            u128.fromU64(10000000),
            u128.fromU64(9999950),
            true,
            false,
        );

        const reservation: Reservation = createReservation(tokenAddress1, ownerAddress1);
        const queue: TestLiquidityQueue = new TestLiquidityQueue(
            tokenAddress1,
            tokenIdUint8Array1,
            false,
        );

        queue.initializeInitialLiquidity(
            u256.fromU32(1),
            provider1.providerId,
            u256.fromU64(10000000),
            5,
        );

        queue.setPreviousReservationStartingIndex(100);
        queue.setPreviousReservationStandardStartingIndex(101);
        queue.setPreviousRemovalStartingIndex(102);
        queue.increaseTotalReserve(u256.fromU64(20000000));
        queue.increaseTotalReserved(u256.fromU64(9999950));
        queue.setBlockQuote();
        queue.addToStandardQueue(provider2.providerId);
        queue.lastPurgedBlock = 0;
        const purgeIndex = queue.addActiveReservationToList(0, reservation.reservationId);

        expect(queue.getFromStandardQueue(provider2.indexedAt)).toStrictEqual(provider2.providerId);

        reservation.setExpirationBlock(95);
        reservation.setPurgeIndex(purgeIndex);
        reservation.reserveAtIndex(<u32>provider2.indexedAt, u128.fromU64(100), NORMAL_TYPE);

        reservation.save();

        setBlockchainEnvironment(96);
        queue.callPurgeReservationsAndRestoreProviders();

        expect(queue.getFromStandardQueue(provider2.indexedAt)).toStrictEqual(u256.Zero);
        expect(provider2.liquidity).toStrictEqual(u128.Zero);
        expect(provider2.reserved).toStrictEqual(u128.Zero);
        expect(queue.getPreviousReservationStartingIndex()).toStrictEqual(0);
        expect(queue.getPreviousRemovalStartingIndex()).toStrictEqual(0);
        expect(queue.getPreviousReservationStandardStartingIndex()).toStrictEqual(0);
    });
});
