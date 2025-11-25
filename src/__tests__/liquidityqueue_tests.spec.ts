import {
    clearCachedProviders,
    clearPendingStakingContractAmount,
    getPendingStakingContractAmount,
    Provider,
} from '../models/Provider';
import {
    Blockchain,
    SafeMath,
    StoredBooleanArray,
    StoredU128Array,
    TransferHelper,
    U32_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    createProviderId,
    createReservation,
    ITestLiquidityQueue,
    ITestProviderManager,
    providerAddress1,
    providerAddress2,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { FeeManager } from '../managers/FeeManager';

import { Reservation } from '../models/Reservation';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import {
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    MAX_TOTAL_SATOSHIS,
} from '../constants/Contract';
import { ProviderTypes } from '../types/ProviderTypes';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

function getLiquidityQueue(): ITestLiquidityQueue {
    const createQueueResult = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

    const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

    // Set initial state
    queue.virtualSatoshisReserve = 1000000;
    queue.virtualTokenReserve = u256.fromU64(1000000);
    queue.lastVirtualUpdateBlock = 0;

    // Reset accumulators
    queue.totalTokensSellActivated = u256.Zero;
    queue.totalTokensExchangedForSatoshis = u256.Zero;
    queue.totalSatoshisExchangedForTokens = 0;

    setBlockchainEnvironment(100);

    return queue;
}

describe('Liquidity queue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('Creation/Initialization', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should create an empty new liquidity queue when it does not exists', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            expect(queue.initialLiquidityProviderId).toStrictEqual(u256.Zero);
            expect(queue.virtualSatoshisReserve).toStrictEqual(0);
            expect(queue.virtualTokenReserve).toStrictEqual(u256.One);
            expect(queue.totalTokensSellActivated).toStrictEqual(u256.Zero);
            expect(queue.totalSatoshisExchangedForTokens).toStrictEqual(0);
            expect(queue.totalTokensExchangedForSatoshis).toStrictEqual(u256.Zero);
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

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            expect(queue.initialLiquidityProviderId).toStrictEqual(u256.Zero);
            expect(queue.virtualSatoshisReserve).toStrictEqual(0);
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(1));
            expect(queue.totalTokensSellActivated).toStrictEqual(u256.Zero);
            expect(queue.totalSatoshisExchangedForTokens).toStrictEqual(0);
            expect(queue.totalTokensExchangedForSatoshis).toStrictEqual(u256.Zero);
            expect(queue.lastVirtualUpdateBlock).toStrictEqual(1);
            expect(queue.reservedLiquidity).toStrictEqual(u256.Zero);
            expect(queue.liquidity).toStrictEqual(u256.Zero);
            expect(queue.maxTokensPerReservation).toStrictEqual(u256.Zero);
            expect(queue.maxReserves5BlockPercent).toStrictEqual(0);
            expect(queue.lastPurgedBlock).toStrictEqual(0);
            expect(queue.antiBotExpirationBlock).toStrictEqual(0);
        });

        it('should correctly initialize the initial liquidity', () => {
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.initializeInitialLiquidity(
                u256.fromU32(99999),
                u256.fromU32(10000),
                u128.fromU32(888888),
                10,
            );

            const virtualSatoshisReserve = SafeMath.div64(888888, 99999);

            expect(queue.initialLiquidityProviderId).toStrictEqual(u256.fromU32(10000));
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(888888));
            expect(queue.maxReserves5BlockPercent).toStrictEqual(10);
            expect(queue.virtualSatoshisReserve).toStrictEqual(virtualSatoshisReserve, `1`);
        });

        it('should purge reservation when flag is set', () => {
            const createQueueResult1 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            createQueueResult1.liquidityQueue.virtualSatoshisReserve = 10000;
            createQueueResult1.liquidityQueue.save();

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                true,
            );

            expect(
                createQueueResult2.reservationManager.purgeReservationsAndRestoreProvidersCalled,
            ).toBeTruthy();
        });

        it('should revert if the initial satoshis reserve > MAX_TOTAL_SATOSHIS', () => {
            expect(() => {
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

                queue.initializeInitialLiquidity(
                    u256.fromU32(1),
                    u256.fromU32(10000),
                    u128.fromString('88888888888888888'),
                    10,
                );
            }).toThrow();
        });
    });

    describe('Getters/Setters', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should correctly get/set initialLiquidityProvider value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.initialLiquidityProviderId = u256.fromU32(999);
            expect(queue.initialLiquidityProviderId).toStrictEqual(u256.fromU32(999));
        });

        it('should correctly get/set virtualSatoshisReserve value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.virtualSatoshisReserve = 9999999;
            expect(queue.virtualSatoshisReserve).toStrictEqual(9999999);
        });

        it('should correctly get/set virtualTokenReserve value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.virtualTokenReserve = u256.fromU32(8888888);
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(8888888));
        });

        it('should correctly get/set totalTokensSellActivated value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.totalTokensSellActivated = u256.fromU32(1000);
            expect(queue.totalTokensSellActivated).toStrictEqual(u256.fromU32(1000));
        });

        it('should correctly get/set totalSatoshisExchangedForTokens value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.totalSatoshisExchangedForTokens = 1000;
            expect(queue.totalSatoshisExchangedForTokens).toStrictEqual(1000);
        });

        it('should correctly get available liquidity', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(100));
            queue.increaseTotalReserved(u256.fromU32(10));

            expect(queue.availableLiquidity).toStrictEqual(u256.fromU32(90));
        });

        it('should correctly get/set lastVirtualUpdateBlock value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastVirtualUpdateBlock = 5;
            expect(queue.lastVirtualUpdateBlock).toStrictEqual(5);
        });

        it('should correctly get/set maxTokensPerReservation value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.maxTokensPerReservation = u256.fromU32(45);
            expect(queue.maxTokensPerReservation).toStrictEqual(u256.fromU32(45));
        });

        it('should correctly get/set maxTokensPerReservation value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.maxReserves5BlockPercent = 25;
            expect(queue.maxReserves5BlockPercent).toStrictEqual(25);
        });

        it('should correctly get/set lastPurgedBlock value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastPurgedBlock = 25;
            expect(queue.lastPurgedBlock).toStrictEqual(25);
        });

        it('should correctly get/set antiBotExpirationBlock value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.antiBotExpirationBlock = 25;
            expect(queue.antiBotExpirationBlock).toStrictEqual(25);
        });

        it('should gets the feesEnabled', () => {
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            expect(queue.feesEnabled).toBeTruthy();
        });

        it('should gets the timeoutEnabled', () => {
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            expect(queue.timeOutEnabled).toBeFalsy();

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
                true,
            );
            const queue2: ILiquidityQueue = createQueueResult2.liquidityQueue;
            expect(queue2.timeOutEnabled).toBeTruthy();
        });

        it('should gets the normal queue starting index', () => {
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            expect(queue.getNormalQueueStartingIndex()).toStrictEqual(0);

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
                true,
            );

            const provider1 = new Provider(createProviderId(providerAddress1, tokenAddress1));
            const provider2 = new Provider(createProviderId(providerAddress2, tokenAddress1));
            provider2.setLiquidityAmount(u128.fromString(`1000000`));

            const queue2: ITestLiquidityQueue = createQueueResult2.liquidityQueue;
            queue2.setLiquidity(u256.fromU64(1000000000000000));
            queue2.virtualTokenReserve = u256.fromU64(100000000);
            queue2.virtualSatoshisReserve = 1000000000000000;
            queue2.save();

            provider1.activate();
            provider2.activate();
            queue2.addToNormalQueue(provider1);
            queue2.addToNormalQueue(provider2);
            provider1.save();
            provider2.save();

            queue2.removeFromNormalQueue(provider1);
            provider1.save();

            createQueueResult2.providerManager.cleanUpQueues(u256.fromU32(1));
            expect(queue2.getNormalQueueStartingIndex()).toStrictEqual(1);
        });

        it('should gets the priority queue starting index', () => {
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            expect(queue.getPriorityQueueStartingIndex()).toStrictEqual(0);

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
                true,
            );

            const queue2: ITestLiquidityQueue = createQueueResult2.liquidityQueue;
            queue2.setLiquidity(u256.fromU64(1000000000000000));
            queue2.virtualTokenReserve = u256.fromU64(100000000);
            queue2.virtualSatoshisReserve = 1000000000000000;
            queue2.save();

            const provider1 = new Provider(createProviderId(providerAddress1, tokenAddress1));
            const provider2 = new Provider(createProviderId(providerAddress2, tokenAddress1));
            provider2.setLiquidityAmount(u128.fromString(`1000000`));

            provider1.activate();
            provider2.activate();
            provider1.markPriority();
            provider2.markPriority();

            queue2.addToPriorityQueue(provider1);
            queue2.addToPriorityQueue(provider2);
            provider1.save();
            provider2.save();

            queue2.removeFromPriorityQueue(provider1);
            provider1.save();

            createQueueResult2.providerManager.cleanUpQueues(u256.fromU32(1));
            expect(queue2.getPriorityQueueStartingIndex()).toStrictEqual(1);
        });

        it('should get the length of the block with reservation queue', () => {
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            expect(queue.blockWithReservationsLength()).toStrictEqual(0);
        });
    });

    describe('Math operations', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should correctly increase total reserved value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserved(u256.fromU32(10000000));
            expect(queue.reservedLiquidity).toStrictEqual(u256.fromU32(10000000));
        });

        it('should correctly decrease total reserved value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserved(u256.fromU32(2));
            queue.decreaseTotalReserved(u256.fromU32(1));
            expect(queue.reservedLiquidity).toStrictEqual(u256.fromU32(1));
        });

        it('should throw addition overflow when adding amount that will make totalReserved over limit', () => {
            setBlockchainEnvironment(1);

            expect(() => {
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

                queue.increaseTotalReserved(u256.Max);
                queue.increaseTotalReserved(u256.fromU32(1));
            }).toThrow();
        });

        it('should throw subtraction underflow when removing amount that will make totalReserved <  0', () => {
            setBlockchainEnvironment(1);

            expect(() => {
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

                queue.decreaseTotalReserved(u256.fromU32(1000));
                queue.decreaseTotalReserved(u256.fromU32(1001));
            }).toThrow();
        });

        it('should correctly increase total reserve value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(10000000));
            expect(queue.liquidity).toStrictEqual(u256.fromU32(10000000));
        });

        it('should correctly decrease total reserve value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(2));
            queue.decreaseTotalReserve(u256.fromU32(1));
            expect(queue.liquidity).toStrictEqual(u256.fromU32(1));
        });

        it('should throw addition overflow when adding amount that will make totalReserves over limit', () => {
            setBlockchainEnvironment(1);

            expect(() => {
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

                queue.increaseTotalReserve(u256.Max);
                queue.increaseTotalReserve(u256.fromU32(1));
            }).toThrow();
        });

        it('should throw subtraction underflow when removing amount that will make totalReserves <  0', () => {
            setBlockchainEnvironment(1);

            expect(() => {
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

                queue.decreaseTotalReserve(u256.fromU32(1000));
                queue.decreaseTotalReserve(u256.fromU32(1001));
            }).toThrow();
        });

        it('should correctly decrease virtual satoshis reserve value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.virtualSatoshisReserve = 100;
            queue.decreaseVirtualSatoshisReserve(10);

            expect(queue.virtualSatoshisReserve).toStrictEqual(90);
        });

        it('should correctly increase virtual satoshis reserve value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.virtualSatoshisReserve = 100;
            queue.increaseVirtualSatoshisReserve(10);

            expect(queue.virtualSatoshisReserve).toStrictEqual(110);
        });

        it('should throw subtraction underflow when removing amount that will make virtual satoshis reserve <  0', () => {
            expect(() => {
                setBlockchainEnvironment(1);
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
                queue.virtualSatoshisReserve = 100;
                queue.decreaseVirtualSatoshisReserve(110);
            }).toThrow();
        });

        it('should throw addition overflow when adding amount that will make virtual satoshis reserve over limit', () => {
            expect(() => {
                setBlockchainEnvironment(1);
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
                queue.virtualSatoshisReserve = 100;
                queue.increaseVirtualSatoshisReserve(u64.MAX_VALUE);
            }).toThrow();
        });

        it('should correctly decrease virtual tokens reserve value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.virtualTokenReserve = u256.fromU32(100);
            queue.decreaseVirtualTokenReserve(u256.fromU32(10));

            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(90));
        });

        it('should correctly increase virtual tokens reserve value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.virtualTokenReserve = u256.fromU32(100);
            queue.increaseVirtualTokenReserve(u256.fromU32(10));

            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(110));
        });

        it('should throw subtraction underflow when removing amount that will make virtual tokens reserve <  0', () => {
            expect(() => {
                setBlockchainEnvironment(1);
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
                queue.virtualTokenReserve = u256.fromU32(100);
                queue.decreaseVirtualTokenReserve(u256.fromU32(110));
            }).toThrow();
        });

        it('should throw addition overflow when adding amount that will make virtual tokens reserve over limit', () => {
            expect(() => {
                setBlockchainEnvironment(1);
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
                queue.virtualTokenReserve = u256.fromU32(100);
                queue.increaseVirtualTokenReserve(u256.Max);
            }).toThrow();
        });

        it('should correctly increase delta satoshis buy value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.increaseTotalSatoshisExchangedForTokens(100);

            expect(queue.totalSatoshisExchangedForTokens).toStrictEqual(100);
        });

        it('should correctly increase delta tokens add value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.increaseTotalTokensSellActivated(u256.fromU32(100));

            expect(queue.totalTokensSellActivated).toStrictEqual(u256.fromU32(100));
        });

        it('should correctly increase delta tokens buy value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.increaseTotalTokensExchangedForSatoshis(u256.fromU32(100));

            expect(queue.totalTokensExchangedForSatoshis).toStrictEqual(u256.fromU32(100));
        });

        it('should correctly increase total reserve value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.increaseTotalReserve(u256.fromU32(100));

            expect(queue.liquidity).toStrictEqual(u256.fromU32(100));
        });

        it('should correctly increase total reserved value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.increaseTotalReserved(u256.fromU32(100));

            expect(queue.reservedLiquidity).toStrictEqual(u256.fromU32(100));
        });
    });

    describe('Utilization ratio', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should return 0 when liquidity is 0', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserved(u256.fromU32(10000));
            expect(queue.getUtilizationRatio()).toStrictEqual(u256.Zero);
        });

        it('should return 0 when reservedLiquidity is 0', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(10000));
            expect(queue.getUtilizationRatio()).toStrictEqual(u256.Zero);
        });

        it('should return the correct value when liquidity <> 0 and reservedLiquidity <> 0', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserved(u256.fromU32(9000));
            queue.increaseTotalReserve(u256.fromU32(1000));
            expect(queue.getUtilizationRatio()).toStrictEqual(u256.fromU32(900));
        });

        it('should throw when reservedLiquidity is > (u256.Max/100)', () => {
            setBlockchainEnvironment(1);
            expect(() => {
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
                const maxValue: u256 = SafeMath.add(
                    SafeMath.div(u256.Max, u256.fromU32(100)),
                    u256.One,
                );

                queue.increaseTotalReserved(maxValue);
                queue.increaseTotalReserve(u256.fromU32(1000));
                queue.getUtilizationRatio();
            }).toThrow();
        });
    });

    describe('Penalty', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should decrease total reserve and virtual token reserve and add penalty to staking contract', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.decreaseTotalReserve(queue.liquidity);
            queue.decreaseVirtualTokenReserve(queue.virtualTokenReserve);
            queue.decreaseVirtualSatoshisReserve(queue.virtualSatoshisReserve);

            queue.increaseTotalReserve(u256.fromU64(10000));
            queue.increaseVirtualTokenReserve(u256.fromU64(10000));
            queue.increaseVirtualSatoshisReserve(100000);

            queue.accruePenalty(u128.fromU64(10000), u128.fromU64(5000));
            queue.updateVirtualPoolIfNeeded();
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(5000));
            expect(queue.liquidity).toStrictEqual(u256.Zero);
            expect(queue.virtualSatoshisReserve).toStrictEqual(50000);
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromString(`10000`));
        });

        it('should not increase token reserve with penalty when penaltyLeft is Zero', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.decreaseTotalReserve(queue.liquidity);
            queue.decreaseVirtualTokenReserve(queue.virtualTokenReserve);

            expect(queue.virtualTokenReserve).toStrictEqual(u256.Zero);
            expect(queue.liquidity).toStrictEqual(u256.Zero);
            queue.increaseTotalReserve(u256.fromU64(10000));
            expect(queue.liquidity).toStrictEqual(u256.fromU64(10000));

            queue.accruePenalty(u128.fromU64(10000), u128.fromU64(10000));

            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(0));
            expect(queue.liquidity).toStrictEqual(u256.Zero);
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromString(`10000`));
        });

        it('should do nothing when penalty is Zero', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.decreaseTotalReserve(queue.liquidity);
            queue.decreaseVirtualTokenReserve(queue.virtualTokenReserve);

            expect(queue.virtualTokenReserve).toStrictEqual(u256.Zero);
            expect(queue.liquidity).toStrictEqual(u256.Zero);
            queue.increaseTotalReserve(u256.fromU64(10000));
            expect(queue.liquidity).toStrictEqual(u256.fromU64(10000));

            queue.accruePenalty(u128.Zero, u128.Zero);

            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(0));
            expect(queue.liquidity).toStrictEqual(u256.fromU64(10000));
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
        });

        it('should revert when penalty is less than half value', () => {
            expect(() => {
                setBlockchainEnvironment(1);
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
                queue.decreaseTotalReserve(queue.liquidity);
                queue.decreaseVirtualTokenReserve(queue.virtualTokenReserve);

                expect(queue.virtualTokenReserve).toStrictEqual(u256.Zero);
                expect(queue.liquidity).toStrictEqual(u256.Zero);
                queue.increaseTotalReserve(u256.fromU64(10000));
                expect(queue.liquidity).toStrictEqual(u256.fromU64(10000));

                queue.accruePenalty(u128.fromU64(10000), u128.fromU64(15000));
            }).toThrow();
        });
    });

    describe('Queue data', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should return the provider queue data', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.markPriority();
            queue.addToPriorityQueue(provider);
            queue.save();

            const data = queue.getProviderQueueData();

            expect(data.byteLength).toStrictEqual(U32_BYTE_LENGTH * 6);
        });
    });

    describe('Fees', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should correctly compute the fees', () => {
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(100000));
            queue.increaseTotalReserved(u256.fromU32(10000));

            const fees = queue.computeFees(u256.fromU32(20000), 100000);

            expect(fees).toStrictEqual(u256.fromU32(46));
        });

        it('should get FeeManager.priorityQueueBaseFee as priority fees when no provider in priority queue', () => {
            FeeManager.priorityQueueBaseFee = 1000;
            const cost = FeeManager.priorityQueueBaseFee;

            expect(cost).toStrictEqual(FeeManager.priorityQueueBaseFee);
        });

        it('should correctly distribute the fee to the staking contract', () => {
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.setLiquidity(u256.fromU32(15000));
            queue.virtualTokenReserve = u256.fromU32(15000);
            queue.distributeFee(u256.fromU32(10000));
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(5000));
            expect(queue.liquidity).toStrictEqual(u256.fromU32(5000));
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromString(`10000`));
        });

        it('should not call safetransfer when moto fee = 0', () => {
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.setLiquidity(u256.fromU32(10000));
            queue.virtualTokenReserve = u256.Zero;
            queue.distributeFee(u256.Zero);

            expect(queue.virtualTokenReserve).toStrictEqual(u256.Zero);
            expect(queue.liquidity).toStrictEqual(u256.fromU32(10000));
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
        });
    });

    describe('Virtual Pool', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });

        it('should set virtualTokenReserve to 1 when computed virtualTokenReserve is 0', () => {
            setBlockchainEnvironment(5);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastVirtualUpdateBlock = 4;
            queue.virtualSatoshisReserve = 0;
            queue.virtualTokenReserve = u256.Zero;
            queue.updateVirtualPoolIfNeeded();

            expect(queue.virtualTokenReserve).toStrictEqual(u256.One);
        });

        it('should add the tokens to the virtual pool when tokens are added', () => {
            setBlockchainEnvironment(5);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastVirtualUpdateBlock = 4;
            queue.virtualSatoshisReserve = 0;
            queue.virtualTokenReserve = u256.Zero;
            queue.totalTokensSellActivated = u256.fromU32(1000);
            queue.updateVirtualPoolIfNeeded();

            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(1000));
        });

        it('should make virtualTokenReserve when T is 0', () => {
            setBlockchainEnvironment(5);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastVirtualUpdateBlock = 4;
            queue.virtualSatoshisReserve = 100000;
            queue.virtualTokenReserve = u256.fromU32(0);
            queue.updateVirtualPoolIfNeeded();

            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(1));
        });

        it('should reset all accumulators to 0', () => {
            setBlockchainEnvironment(5);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastVirtualUpdateBlock = 4;
            queue.virtualSatoshisReserve = 100000;
            queue.virtualTokenReserve = u256.fromU32(10000);
            queue.totalTokensExchangedForSatoshis = u256.fromU32(10);
            queue.totalSatoshisExchangedForTokens = 10;
            queue.totalTokensSellActivated = u256.fromU32(2);

            queue.updateVirtualPoolIfNeeded();

            expect(queue.totalSatoshisExchangedForTokens).toStrictEqual(0);
            expect(queue.totalTokensSellActivated).toStrictEqual(u256.Zero);
            expect(queue.totalTokensExchangedForSatoshis).toStrictEqual(u256.Zero);
        });

        it('should update lastVirtualUpdateBlock to the current block', () => {
            setBlockchainEnvironment(5);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastVirtualUpdateBlock = 4;
            queue.virtualSatoshisReserve = 100000;
            queue.virtualTokenReserve = u256.fromU32(10000);
            queue.totalTokensExchangedForSatoshis = u256.fromU32(10);
            queue.totalSatoshisExchangedForTokens = 10;
            queue.totalTokensSellActivated = u256.fromU32(2);

            queue.updateVirtualPoolIfNeeded();

            expect(queue.lastVirtualUpdateBlock).toStrictEqual(5);
        });

        it('should revert when virtualSatoshisReserve > MAX_TOTAL_SATOSHIS', () => {
            expect(() => {
                setBlockchainEnvironment(5);

                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

                queue.lastVirtualUpdateBlock = 4;
                queue.virtualSatoshisReserve = MAX_TOTAL_SATOSHIS.toU64() + 1;
                queue.virtualTokenReserve = u256.fromU32(1);
                queue.totalTokensExchangedForSatoshis = u256.Zero;
                queue.totalSatoshisExchangedForTokens = 0;
                queue.updateVirtualPoolIfNeeded();
            }).toThrow();
        });
    });
    //--

    describe('updateVirtualPoolIfNeeded', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });

        describe('Basic functionality', () => {
            test('should update without any changes when no trades occurred', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const initialSatoshis = queue.virtualSatoshisReserve;
                const initialTokens = queue.virtualTokenReserve;

                queue.updateVirtualPoolIfNeeded();

                expect(queue.virtualSatoshisReserve).toStrictEqual(initialSatoshis);
                expect(queue.virtualTokenReserve).toStrictEqual(initialTokens);
                expect(queue.lastVirtualUpdateBlock).toStrictEqual(Blockchain.block.number);
            });

            test('should reset accumulators after update', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();

                queue.totalTokensSellActivated = u256.fromU64(1000);
                queue.totalTokensExchangedForSatoshis = u256.fromU64(500);
                queue.totalSatoshisExchangedForTokens = 250;

                queue.updateVirtualPoolIfNeeded();

                expect(queue.totalTokensSellActivated).toStrictEqual(u256.Zero);
                expect(queue.totalTokensExchangedForSatoshis).toStrictEqual(u256.Zero);
                expect(queue.totalSatoshisExchangedForTokens).toStrictEqual(0);
            });

            test('should update volatility', () => {
                const expectedVolatility: u256 = u256.fromU32(150);
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                queue.mockComputeVolatility(expectedVolatility);
                queue.updateVirtualPoolIfNeeded();

                expect(queue.volatility).toStrictEqual(expectedVolatility);
            });
        });

        describe('Sell side (adding tokens)', () => {
            test('should correctly update reserves when tokens are added', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const initialB = u256.fromU64(queue.virtualSatoshisReserve);
                const initialT = queue.virtualTokenReserve;
                const initialK = SafeMath.mul(initialB, initialT);

                // Add 500 tokens to the pool (sell side)
                queue.totalTokensSellActivated = u256.fromU64(500);

                queue.updateVirtualPoolIfNeeded();

                // After adding tokens, B should decrease to maintain k
                const newB = u256.fromU64(queue.virtualSatoshisReserve);
                const newT = queue.virtualTokenReserve;
                const newK = SafeMath.mul(newB, newT);

                // T should increase
                expect(newT).toBeGreaterThan(initialT);
                // B should decrease
                expect(newB).toBeLessThan(initialB);
                // K should be approximately maintained (within tolerance)
                const diff =
                    newK > initialK ? SafeMath.sub(newK, initialK) : SafeMath.sub(initialK, newK);
                const tolerance = SafeMath.div(initialK, u256.fromU64(100000));
                expect(diff).toBeLessThanOrEqual(tolerance);
            });

            test('should throw if constant product is broken beyond tolerance', () => {
                expect(() => {
                    const queue: ITestLiquidityQueue = getLiquidityQueue();

                    // Set up a scenario that would break the constant product
                    queue.virtualSatoshisReserve = 10; // Very small reserve
                    queue.virtualTokenReserve = u256.fromU64(10);
                    queue.totalTokensSellActivated = u256.fromU64(1000000); // Huge addition

                    queue.updateVirtualPoolIfNeeded();
                }).toThrow('Constant product broken after adding liquidity');
            });

            test('should handle zero token additions', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                queue.totalTokensSellActivated = u256.Zero;

                const initialSatoshis = queue.virtualSatoshisReserve;
                const initialTokens = queue.virtualTokenReserve;

                queue.updateVirtualPoolIfNeeded();

                expect(queue.virtualSatoshisReserve).toBe(initialSatoshis);
                expect(queue.virtualTokenReserve).toBe(initialTokens);
            });
        });

        describe('Buy side (removing tokens)', () => {
            test('should correctly update reserves when tokens are bought', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const initialB = u256.fromU64(queue.virtualSatoshisReserve);
                const initialT = queue.virtualTokenReserve;

                // Buy 100 tokens with 110 satoshis
                queue.totalTokensExchangedForSatoshis = u256.fromU64(100);
                queue.totalSatoshisExchangedForTokens = 110;

                queue.updateVirtualPoolIfNeeded();

                const newB = u256.fromU64(queue.virtualSatoshisReserve);
                const newT = queue.virtualTokenReserve;

                // T should decrease (tokens were bought)
                expect(newT).toBeLessThan(initialT);
                // B should be recalculated to maintain k
                expect(newB).toBeGreaterThan(initialB);
            });

            test('should throw when trying to buy more tokens than available', () => {
                expect(() => {
                    const queue: ITestLiquidityQueue = getLiquidityQueue();
                    queue.virtualTokenReserve = u256.fromU64(1000);
                    queue.totalTokensExchangedForSatoshis = u256.fromU64(1001); // Try to buy more than available

                    queue.updateVirtualPoolIfNeeded();
                }).toThrow('Impossible state: Cannot buy');
            });

            test('should handle edge case where all tokens are bought', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                queue.virtualTokenReserve = u256.fromU64(1000);
                queue.totalTokensExchangedForSatoshis = u256.fromU64(999); // Buy almost all

                queue.updateVirtualPoolIfNeeded();

                // Should set minimum token reserve to 1
                expect(queue.virtualTokenReserve).toBeGreaterThanOrEqual(u256.One);
            });

            test('should handle zero buys', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                queue.totalTokensExchangedForSatoshis = u256.Zero;
                queue.totalSatoshisExchangedForTokens = 0;

                const initialSatoshis = queue.virtualSatoshisReserve;
                const initialTokens = queue.virtualTokenReserve;

                queue.updateVirtualPoolIfNeeded();

                expect(queue.virtualSatoshisReserve).toBe(initialSatoshis);
                expect(queue.virtualTokenReserve).toBe(initialTokens);
            });
        });

        describe('Combined operations', () => {
            test('should handle both sells and buys in the same update', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();

                // First add liquidity (sell side)
                queue.totalTokensSellActivated = u256.fromU64(500);
                // Then buy some tokens
                queue.totalTokensExchangedForSatoshis = u256.fromU64(200);
                queue.totalSatoshisExchangedForTokens = 250;

                queue.updateVirtualPoolIfNeeded();

                // Verify reserves are updated
                expect(queue.lastVirtualUpdateBlock).toBe(Blockchain.block.number);
                // Accumulators should be reset
                expect(queue.totalTokensSellActivated).toBe(u256.Zero);
                expect(queue.totalTokensExchangedForSatoshis).toBe(u256.Zero);
                expect(queue.totalSatoshisExchangedForTokens).toBe(0);
            });

            test('should maintain constant product through multiple operations', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                const initialB = u256.fromU64(queue.virtualSatoshisReserve);
                const initialT = queue.virtualTokenReserve;
                const initialK = SafeMath.mul(initialB, initialT);

                // Add tokens
                queue.totalTokensSellActivated = u256.fromU64(300);
                // Buy tokens
                queue.totalTokensExchangedForSatoshis = u256.fromU64(150);
                queue.totalSatoshisExchangedForTokens = 200;

                queue.updateVirtualPoolIfNeeded();

                const finalB = u256.fromU64(queue.virtualSatoshisReserve);
                const finalT = queue.virtualTokenReserve;
                const finalK = SafeMath.mul(finalB, finalT);

                // K should be approximately maintained
                const diff =
                    finalK > initialK
                        ? SafeMath.sub(finalK, initialK)
                        : SafeMath.sub(initialK, finalK);
                const tolerance = SafeMath.div(initialK, u256.fromU64(100000));
                expect(diff).toBeLessThanOrEqual(tolerance);
            });
        });

        describe('Edge cases and error conditions', () => {
            test('should throw when virtual satoshis exceed MAX_TOTAL_SATOSHIS', () => {
                expect(() => {
                    const queue: ITestLiquidityQueue = getLiquidityQueue();

                    // Set up a scenario that would cause B to exceed max
                    queue.virtualSatoshisReserve = MAX_TOTAL_SATOSHIS.toU64() - 1000;
                    queue.virtualTokenReserve = u256.fromU64(10); // Very few tokens
                    queue.totalTokensExchangedForSatoshis = u256.fromU64(9); // Buy most tokens

                    queue.updateVirtualPoolIfNeeded();
                }).toThrow('Impossible state: New virtual satoshis reserve out of range');
            });

            test('should set token reserve to 1 if it becomes zero', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                // Set up a scenario where we buy tokens but not ALL tokens
                // to avoid the >= check, but get close enough that rounding
                // or calculation might result in zero
                queue.virtualSatoshisReserve = 1000000;
                queue.virtualTokenReserve = u256.fromU64(100);

                // Buy 99 tokens (not all 100), leaving 1 token
                // This should work without throwing
                queue.totalTokensExchangedForSatoshis = u256.fromU64(99);
                queue.totalSatoshisExchangedForTokens = 10000000; // Pay a lot to buy almost all

                queue.updateVirtualPoolIfNeeded();

                // The function should maintain at least 1 token
                expect(queue.virtualTokenReserve).toBeGreaterThanOrEqual(u256.One);
            });

            test('should handle very large token additions', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                queue.totalTokensSellActivated = u256.fromU64(1000000000);

                queue.updateVirtualPoolIfNeeded();

                // Should complete without throwing
                expect(queue.virtualTokenReserve).toBeGreaterThan(u256.fromU64(1000000000));
            });

            test('should handle precision edge cases', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();

                queue.virtualSatoshisReserve = 1000000; // 0.01 BTC (in satoshis)
                queue.virtualTokenReserve = u256.fromU64(1000000000000); // Large token amount
                queue.totalTokensSellActivated = u256.fromU64(1000000); // Add a reasonable amount

                queue.updateVirtualPoolIfNeeded();

                // Should maintain approximate constant product
                expect(queue.virtualSatoshisReserve).toBeGreaterThan(0);
                expect(queue.virtualTokenReserve).toBeGreaterThan(u256.Zero);

                // Verify the constant product is approximately maintained
                const B = u256.fromU64(queue.virtualSatoshisReserve);
                const T = queue.virtualTokenReserve;
                const k = SafeMath.mul(B, T);
                expect(k).toBeGreaterThan(u256.Zero);
            });
        });

        describe('Block number handling', () => {
            test('should update lastVirtualUpdateBlock to current block', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();
                setBlockchainEnvironment(500);

                queue.updateVirtualPoolIfNeeded();

                expect(queue.lastVirtualUpdateBlock).toBe(500);
            });

            test('should process update even if called multiple times in same block', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();

                // Since the check is commented out, it should process every time
                queue.totalTokensSellActivated = u256.fromU64(100);

                queue.updateVirtualPoolIfNeeded();
                const firstSatoshis = queue.virtualSatoshisReserve;

                // Set up for another update in same block
                queue.totalTokensSellActivated = u256.fromU64(100);

                queue.updateVirtualPoolIfNeeded();
                const secondSatoshis = queue.virtualSatoshisReserve;

                // Both updates should be processed
                expect(firstSatoshis).not.toBe(secondSatoshis);
            });
        });

        describe('Integration scenarios', () => {
            test('should handle realistic trading scenario', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();

                // Simulate a series of trades
                queue.virtualSatoshisReserve = 10000000; // 0.1 BTC
                queue.virtualTokenReserve = u256.fromU64(10000000);

                // Multiple sellers add liquidity
                queue.totalTokensSellActivated = u256.fromU64(50000);
                // Some buyers purchase tokens
                queue.totalTokensExchangedForSatoshis = u256.fromU64(20000);
                queue.totalSatoshisExchangedForTokens = 25000;

                queue.updateVirtualPoolIfNeeded();

                // Verify state is valid
                expect(queue.virtualSatoshisReserve).toBeGreaterThan(0);
                expect(queue.virtualTokenReserve).toBeGreaterThan(u256.Zero);
                expect(queue.lastVirtualUpdateBlock).toBe(Blockchain.block.number);
            });

            test('should handle high-frequency trading pattern', () => {
                const queue: ITestLiquidityQueue = getLiquidityQueue();

                // Simulate rapid small trades
                for (let i = 0; i < 10; i++) {
                    queue.totalTokensSellActivated = u256.fromU64(10);
                    queue.totalTokensExchangedForSatoshis = u256.fromU64(5);
                    queue.totalSatoshisExchangedForTokens = 6;

                    queue.updateVirtualPoolIfNeeded();

                    // Verify invariants hold
                    expect(queue.virtualSatoshisReserve).toBeGreaterThan(0);
                    expect(queue.virtualTokenReserve).toBeGreaterThan(u256.Zero);
                }
            });
        });
    });

    //--

    describe('Dynamic fees and computeVolatility', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });

        it('should return 0 when oldQuote = 0', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.virtualSatoshisReserve = 0;
            queue.virtualTokenReserve = u256.Zero;

            queue.updateVirtualPoolIfNeeded();

            expect(queue.volatility).toStrictEqual(u256.Zero);
        });

        it('should return 0 when oldQuote > 0 and currentQuote = 0', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.virtualSatoshisReserve = 10000;
            queue.virtualTokenReserve = u256.fromU32(100);
            queue.setBlockQuote();

            expect(createQueueResult.quoteManager.getBlockQuote(0)).not.toStrictEqual(u256.Zero);

            setBlockchainEnvironment(5);

            queue.updateVirtualPoolIfNeeded();

            expect(queue.volatility).toStrictEqual(u256.Zero);
        });

        it('should underflow when currentQuote - oldQuote < 0', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.virtualSatoshisReserve = 10000;
            queue.virtualTokenReserve = u256.fromU32(100000);
            queue.setBlockQuote();

            setBlockchainEnvironment(5);
            queue.virtualSatoshisReserve = 5000;
            queue.virtualTokenReserve = u256.fromU32(250);
            queue.setBlockQuote();

            queue.updateVirtualPoolIfNeeded();

            expect(queue.volatility).toStrictEqual(u256.fromU32(9950));
        });

        it('should return correct volatility', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.virtualSatoshisReserve = 5000;
            queue.virtualTokenReserve = u256.fromU32(250);
            queue.setBlockQuote();

            setBlockchainEnvironment(5);
            queue.virtualSatoshisReserve = 10000;
            queue.virtualTokenReserve = u256.fromU32(100000);
            queue.setBlockQuote();

            queue.updateVirtualPoolIfNeeded();
            expect(queue.volatility).toStrictEqual(u256.fromU32(1990000));
        });
    });

    describe('Reservation', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });

        it('should correctly add an active reservations in the reservation list', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const reservation: Reservation = createReservation(tokenAddress1, providerAddress1);
            const reservation2: Reservation = createReservation(tokenAddress1, providerAddress2);

            queue.addReservation(reservation);
            queue.addReservation(reservation2);

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ITestLiquidityQueue = createQueueResult2.liquidityQueue;

            const list2: StoredU128Array =
                createQueueResult2.reservationManager.callgetReservationListForBlock(1000);
            expect(list2.getLength()).toStrictEqual(2);
            expect(list2.get(0)).toStrictEqual(reservation.getId());
            expect(list2.get(1)).toStrictEqual(reservation2.getId());

            const list2TokenActive: StoredBooleanArray =
                createQueueResult2.reservationManager.callgetActiveListForBlock(1000);
            expect(list2TokenActive.get(0)).toBeTruthy();
            expect(list2TokenActive.get(1)).toBeTruthy();

            const list3: StoredU128Array =
                createQueueResult2.reservationManager.callgetReservationListForBlock(1001);
            expect(list3.getLength()).toStrictEqual(0);
        });

        it('should correctly get a non expired reservation', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const reservation: Reservation = createReservation(tokenAddress1, providerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    INITIAL_LIQUIDITY_PROVIDER_INDEX,
                    u128.fromU32(10000),
                    ProviderTypes.Normal,
                    1000,
                ),
            );
            reservation.save();
            queue.addReservation(reservation);
            queue.save();

            setBlockchainEnvironment(1001, providerAddress1, providerAddress1);
            const reservation2: Reservation = queue.getReservationWithExpirationChecks();

            expect(reservation2).not.toBeNull();
        });

        it('should revert on expired reservation', () => {
            expect(() => {
                setBlockchainEnvironment(1000);

                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

                const reservation: Reservation = createReservation(tokenAddress1, providerAddress1);
                reservation.addProvider(
                    new ReservationProviderData(
                        INITIAL_LIQUIDITY_PROVIDER_INDEX,
                        u128.fromU32(10000),
                        ProviderTypes.Normal,
                        1000,
                    ),
                );
                reservation.save();
                queue.addReservation(reservation);
                queue.save();

                setBlockchainEnvironment(1006, providerAddress1, providerAddress1);
                const reservation2: Reservation = queue.getReservationWithExpirationChecks();

                expect(reservation2).not.toBeNull();
            }).toThrow();
        });

        it('should get a reservation id at a given index for a block', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const reservation: Reservation = createReservation(tokenAddress1, providerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    INITIAL_LIQUIDITY_PROVIDER_INDEX,
                    u128.fromU32(10000),
                    ProviderTypes.Normal,
                    1000,
                ),
            );
            reservation.save();
            queue.addReservation(reservation);
            queue.save();

            setBlockchainEnvironment(1001, providerAddress1, providerAddress1);
            const reservationId: u128 = queue.getReservationIdAtIndex(
                1000,
                reservation.getPurgeIndex(),
            );

            expect(reservationId).toStrictEqual(reservation.getId());
        });

        it('should get a 0 as reservation id when a reservation does not exists at a given index for a block', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const reservation: Reservation = createReservation(tokenAddress1, providerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    INITIAL_LIQUIDITY_PROVIDER_INDEX,
                    u128.fromU32(10000),
                    ProviderTypes.Normal,
                    1000,
                ),
            );
            reservation.save();
            queue.addReservation(reservation);
            queue.save();

            setBlockchainEnvironment(1001, providerAddress1, providerAddress1);
            const reservationId: u128 = queue.getReservationIdAtIndex(
                1001,
                reservation.getPurgeIndex(),
            );

            expect(reservationId).toStrictEqual(u128.Zero);
        });

        it('should get if a reservation is active at a given index for a block', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const reservation: Reservation = createReservation(tokenAddress1, providerAddress1);
            reservation.addProvider(
                new ReservationProviderData(
                    INITIAL_LIQUIDITY_PROVIDER_INDEX,
                    u128.fromU32(10000),
                    ProviderTypes.Normal,
                    1000,
                ),
            );
            reservation.save();
            queue.addReservation(reservation);
            queue.save();

            setBlockchainEnvironment(1001, providerAddress1, providerAddress1);
            const isActive = queue.isReservationActiveAtIndex(1000, reservation.getPurgeIndex());

            expect(isActive).toBeTruthy();
        });
    });

    describe('Provider', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });

        it('should correctly add to priority queue', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.markPriority();
            queue.addToPriorityQueue(provider);
            queue.save();

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ITestLiquidityQueue = createQueueResult2.liquidityQueue;

            expect(createQueueResult2.providerManager.priorityQueueLength).toStrictEqual(1);
            expect(
                createQueueResult2.providerManager.getFromPriorityQueue(provider.getQueueIndex()),
            ).toStrictEqual(provider.getId());
        });

        it('should correctly add to normal queue', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.clearPriority();
            queue.addToNormalQueue(provider);
            queue.save();

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ITestLiquidityQueue = createQueueResult2.liquidityQueue;

            expect(createQueueResult2.providerManager.normalQueueLength).toStrictEqual(1);
            expect(
                createQueueResult2.providerManager.getFromNormalQueue(provider.getQueueIndex()),
            ).toStrictEqual(provider.getId());
        });

        it('should call getNextProviderWithLiquidity', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;
            queue.getNextProviderWithLiquidity(u256.fromU32(1000));

            expect(
                createQueueResult.providerManager.getNextProviderWithLiquidityCalled,
            ).toBeTruthy();
        });

        it('should call resetProvider', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.addToNormalQueue(provider);
            queue.setLiquidity(provider.getLiquidityAmount().toU256());
            queue.increaseVirtualTokenReserve(u256.fromU32(100000));
            queue.resetProvider(provider, true, false);

            expect(createQueueResult.providerManager.resetProviderCalled).toBeTruthy();
        });

        it('should correctly remove from normal queue', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.addToNormalQueue(provider);
            provider.save();
            queue.save();

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ITestLiquidityQueue = createQueueResult2.liquidityQueue;
            queue2.removeFromNormalQueue(provider);
            queue2.save();

            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('should correctly remove from priority queue', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.markPriority();
            queue.addToPriorityQueue(provider);
            queue.save();

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ITestLiquidityQueue = createQueueResult2.liquidityQueue;
            queue2.removeFromPriorityQueue(provider);
            queue2.save();

            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('should correctly remove from purged queue', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;
            const manager: ITestProviderManager = createQueueResult.providerManager;

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.addToNormalQueue(provider);
            manager.addToNormalPurgedQueue(provider);
            provider.save();
            queue.save();

            expect(provider.getPurgedIndex()).not.toStrictEqual(INDEX_NOT_SET_VALUE);

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ITestLiquidityQueue = createQueueResult2.liquidityQueue;
            queue2.removeFromPurgeQueue(provider);
            queue2.save();

            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });
    });

    describe('Cap', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });

        it('should return 0 if liquidity is 0', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.setLiquidity(u256.Zero);

            const result = queue.getMaximumTokensLeftBeforeCap();
            expect(result).toStrictEqual(u256.Zero);
        });

        it('should return the correct number of tokens', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.maxReserves5BlockPercent = 50;
            queue.increaseTotalReserve(u256.fromU64(1000000000));
            queue.increaseTotalReserved(u256.fromU32(499999999));

            const result = queue.getMaximumTokensLeftBeforeCap();
            expect(result).toStrictEqual(u256.fromU32(1));
        });

        it('should return 0 if reservedScaled >= capScaled', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(100));
            queue.increaseTotalReserved(u256.fromU32(90));
            queue.maxReserves5BlockPercent = 80;

            const result = queue.getMaximumTokensLeftBeforeCap();
            expect(result).toStrictEqual(u256.Zero);
        });

        it('should handle the exact boundary ratioScaled == maxPercentScaled => 0', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(100));
            queue.increaseTotalReserved(u256.fromU32(40));
            queue.maxReserves5BlockPercent = 40;

            const result = queue.getMaximumTokensLeftBeforeCap();

            expect(result).toStrictEqual(u256.Zero);
        });

        it('should handle large numbers', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(10_000_000));
            queue.increaseTotalReserved(u256.fromU32(1_000_000));
            queue.maxReserves5BlockPercent = 50;

            const result = queue.getMaximumTokensLeftBeforeCap();

            expect(result).toStrictEqual(u256.fromU64(4_000_000));
        });

        it('should handle 0% maxReserves5BlockPercent', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(100));
            queue.increaseTotalReserved(u256.fromU32(50));
            queue.maxReserves5BlockPercent = 0;

            const result = queue.getMaximumTokensLeftBeforeCap();
            expect(result).toStrictEqual(u256.Zero);
        });

        it('should handle 100% maxReserves5BlockPercent', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(100));
            queue.increaseTotalReserved(u256.fromU32(30));
            queue.maxReserves5BlockPercent = 100;

            const result = queue.getMaximumTokensLeftBeforeCap();
            expect(result).toStrictEqual(u256.fromU64(70));
        });

        it('should handle the case: reserved==liquidity when maxPercent<100', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(100));
            queue.increaseTotalReserved(u256.fromU32(100));
            queue.maxReserves5BlockPercent = 90;

            const result = queue.getMaximumTokensLeftBeforeCap();
            expect(result).toStrictEqual(u256.Zero);
        });

        it('should handle the case: reserved==liquidity when maxPercent=100', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(500));
            queue.increaseTotalReserved(u256.fromU32(500));
            queue.maxReserves5BlockPercent = 100;

            const result = queue.getMaximumTokensLeftBeforeCap();
            expect(result).toStrictEqual(u256.Zero);
        });

        it('should produce partial leftover if ratio is small and max is small but non-zero', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.increaseTotalReserve(u256.fromU32(100));
            queue.increaseTotalReserved(u256.fromU32(1));
            queue.maxReserves5BlockPercent = 5;

            const result = queue.getMaximumTokensLeftBeforeCap();
            expect(result).toStrictEqual(u256.fromU32(4));
        });
    });

    describe('Quote', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });

        it('should return 0 if virtualTokenReserve is 0', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.virtualTokenReserve = u256.Zero;

            const result = queue.quote();
            expect(result).toStrictEqual(u256.Zero);
        });

        it('should throws if virtualSatoshisReserve is 0', () => {
            expect(() => {
                setBlockchainEnvironment(0);

                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

                queue.virtualTokenReserve = u256.fromU32(1000);
                queue.virtualSatoshisReserve = 0;
                queue.quote();
            }).toThrow();
        });

        it('should return a valid quote', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.virtualTokenReserve = u256.fromU32(10000);
            queue.virtualSatoshisReserve = 100;

            const result = queue.quote();
            expect(result).toStrictEqual(u256.fromU64(10000000000));
        });

        it('should correctly get/set block quote', () => {
            setBlockchainEnvironment(0);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.virtualTokenReserve = u256.fromU32(10000);
            queue.virtualSatoshisReserve = 100;
            queue.setBlockQuote();
            queue.save();

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ILiquidityQueue = createQueueResult2.liquidityQueue;
            const blockQuote = createQueueResult2.quoteManager.getBlockQuote(
                Blockchain.block.number,
            );

            expect(blockQuote).toStrictEqual(u256.fromU64(10000000000));
        });

        it('should revert when calling setBlockQuote and Block number >= u32.MAX_VALUE', () => {
            setBlockchainEnvironment(u32.MAX_VALUE);

            expect(() => {
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
                queue.setBlockQuote();
            }).toThrow();
        });
    });
});
