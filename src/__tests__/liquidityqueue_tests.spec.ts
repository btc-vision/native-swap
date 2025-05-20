import { clearCachedProviders, Provider } from '../models/Provider';
import {
    Address,
    Blockchain,
    SafeMath,
    StoredBooleanArray,
    StoredU128Array,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    createProviders,
    createReservation,
    ITestLiquidityQueue,
    providerAddress1,
    providerAddress2,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../managers/FeeManager';

import { Reservation } from '../models/Reservation';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { IQuoteManager } from '../managers/interfaces/IQuoteManager';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';
import { ProviderTypes } from '../types/ProviderTypes';

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
            expect(queue.virtualTokenReserve).toStrictEqual(u256.Zero);
            expect(queue.deltaTokensAdd).toStrictEqual(u256.Zero);
            expect(queue.deltaSatoshisBuy).toStrictEqual(0);
            expect(queue.deltaTokensBuy).toStrictEqual(u256.Zero);
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
            expect(queue.deltaTokensAdd).toStrictEqual(u256.Zero);
            expect(queue.deltaSatoshisBuy).toStrictEqual(0);
            expect(queue.deltaTokensBuy).toStrictEqual(u256.Zero);
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
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            const quoteManager: IQuoteManager = createQueueResult.quoteManager;

            queue.virtualSatoshisReserve = 10000;
            queue.virtualTokenReserve = u256.fromU32(100000);
            queue.setBlockQuote();

            setBlockchainEnvironment(2);
            queue.virtualSatoshisReserve = 10000;
            queue.virtualTokenReserve = u256.fromU32(200000);
            queue.setBlockQuote();

            queue.maxReserves5BlockPercent = 9999;
            queue.lastPurgedBlock = 1000;
            queue.antiBotExpirationBlock = 1000;

            const providers: Provider[] = createProviders(
                3,
                0,
                false,
                true,
                true,
                'kcweojewoj2309',
                u128.fromU32(100000),
                u128.fromU32(100000),
                u128.fromU32(10000),
                true,
                true,
            );

            for (let i = 0; i < providers.length; i++) {
                queue.addToPriorityQueue(providers[i]);
            }

            queue.initialLiquidityProviderId = providers[0].getId();
            queue.lastVirtualUpdateBlock = 888;
            queue.maxTokensPerReservation = u256.fromU32(20000);
            queue.increaseTotalReserve(u256.fromU32(1000));
            queue.increaseTotalReserved(u256.fromU32(2000));
            queue.deltaTokensAdd = u256.fromU32(10000);
            queue.deltaSatoshisBuy = 20000;
            queue.deltaTokensBuy = u256.fromU32(40000);

            queue.save();

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ILiquidityQueue = createQueueResult2.liquidityQueue;
            const quoteManager2: IQuoteManager = createQueueResult2.quoteManager;

            expect(queue2.initialLiquidityProviderId).toStrictEqual(
                queue.initialLiquidityProviderId,
            );
            expect(queue2.lastVirtualUpdateBlock).toStrictEqual(queue.lastVirtualUpdateBlock);
            expect(queue2.maxTokensPerReservation).toStrictEqual(queue.maxTokensPerReservation);
            expect(queue2.liquidity).toStrictEqual(queue.liquidity);
            expect(queue2.reservedLiquidity).toStrictEqual(queue.reservedLiquidity);
            expect(queue2.deltaTokensAdd).toStrictEqual(queue.deltaTokensAdd);
            expect(queue2.deltaSatoshisBuy).toStrictEqual(queue.deltaSatoshisBuy);
            expect(queue2.deltaTokensBuy).toStrictEqual(queue.deltaTokensBuy);
            expect(queue2.antiBotExpirationBlock).toStrictEqual(queue.antiBotExpirationBlock);
            expect(queue2.lastPurgedBlock).toStrictEqual(queue.lastPurgedBlock);
            expect(queue2.maxReserves5BlockPercent).toStrictEqual(queue.maxReserves5BlockPercent);
            expect(quoteManager2.getBlockQuote(1)).toStrictEqual(quoteManager.getBlockQuote(1));
            expect(quoteManager2.getBlockQuote(2)).toStrictEqual(quoteManager.getBlockQuote(2));
            expect(queue2.virtualTokenReserve).toStrictEqual(queue.virtualTokenReserve);
            expect(queue2.virtualSatoshisReserve).toStrictEqual(queue.virtualSatoshisReserve);
        });

        it('should create a new liquidity queue and load the values when it exists and virtual pool is updated', () => {
            setBlockchainEnvironment(100);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            const quoteManager: IQuoteManager = createQueueResult.quoteManager;

            queue.virtualSatoshisReserve = 10000;
            queue.virtualTokenReserve = u256.fromU32(100000);
            queue.setBlockQuote();

            setBlockchainEnvironment(102);
            queue.virtualSatoshisReserve = 10000;
            queue.virtualTokenReserve = u256.fromU32(200000);
            queue.setBlockQuote();

            queue.maxReserves5BlockPercent = 9999;
            queue.lastPurgedBlock = 1000;
            queue.antiBotExpirationBlock = 1000;

            const providers: Provider[] = createProviders(
                3,
                0,
                false,
                true,
                true,
                'kcweojewoj2309',
                u128.fromU32(100000),
                u128.fromU32(100000),
                u128.fromU32(10000),
                true,
                true,
            );

            for (let i = 0; i < providers.length; i++) {
                queue.addToPriorityQueue(providers[i]);
            }

            queue.initialLiquidityProviderId = providers[0].getId();
            queue.maxTokensPerReservation = u256.fromU32(20000);
            queue.increaseTotalReserve(u256.fromU32(1000));
            queue.increaseTotalReserved(u256.fromU32(2000));
            queue.deltaTokensAdd = u256.fromU32(10000);
            queue.deltaSatoshisBuy = 20000;
            queue.deltaTokensBuy = u256.fromU32(40000);

            queue.save();

            expect(queue.lastVirtualUpdateBlock).toStrictEqual(100);

            // The goal is only to check if updateVirtualPoolIfNeeded has been called.
            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ILiquidityQueue = createQueueResult2.liquidityQueue;
            expect(queue2.lastVirtualUpdateBlock).toStrictEqual(102);
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
            const createQueueResult = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            expect(
                createQueueResult.reservationManager.purgeReservationsAndRestoreProvidersCalled,
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

        it('should correctly get/set deltaTokensAdd value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.deltaTokensAdd = u256.fromU32(1000);
            expect(queue.deltaTokensAdd).toStrictEqual(u256.fromU32(1000));
        });

        it('should correctly get/set deltaSatoshisBuy value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.deltaSatoshisBuy = 1000;
            expect(queue.deltaSatoshisBuy).toStrictEqual(1000);
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

        it('should correctly get/set SatoshisOwed value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.setSatoshisOwed(u256.fromU32(9), 1000);
            expect(queue.getSatoshisOwed(u256.fromU32(9))).toStrictEqual(1000);
        });

        it('should correctly get getSatoshisOwedLeft value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.setSatoshisOwed(u256.fromU32(9), 1000);
            queue.setSatoshisOwedReserved(u256.fromU32(9), 100);
            expect(queue.getSatoshisOwedLeft(u256.fromU32(9))).toStrictEqual(900);
        });

        it('should correctly get/set SatoshisOwedReserved value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.setSatoshisOwedReserved(u256.fromU32(10), 2000);
            expect(queue.getSatoshisOwedReserved(u256.fromU32(10))).toStrictEqual(2000);
        });

        it('should correctly set deltaSatoshisBuy and deltaTokensBuy when calling buyTokens', () => {
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.buyTokens(u256.fromU32(10000), 888888);

            expect(queue.deltaSatoshisBuy).toStrictEqual(888888);
            expect(queue.deltaTokensBuy).toStrictEqual(u256.fromU32(10000));
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
    });

    describe('Math operations', () => {
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

        it('should correctly increase satoshis owed value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.setSatoshisOwed(u256.fromU32(9), 100);
            queue.increaseSatoshisOwed(u256.fromU32(9), 10);

            expect(queue.getSatoshisOwed(u256.fromU32(9))).toStrictEqual(110);
        });

        it('should throw addition overflow when adding amount that will make satoshis owed over limit', () => {
            expect(() => {
                setBlockchainEnvironment(1);
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
                queue.setSatoshisOwed(u256.fromU32(9), 100);
                queue.increaseSatoshisOwed(u256.fromU32(9), u64.MAX_VALUE);
            }).toThrow();
        });

        it('should correctly increase satoshis owed reserved value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.setSatoshisOwedReserved(u256.fromU32(9), 100);
            queue.increaseSatoshisOwedReserved(u256.fromU32(9), 10);

            expect(queue.getSatoshisOwedReserved(u256.fromU32(9))).toStrictEqual(110);
        });

        it('should throw addition overflow when adding amount that will make satoshis owed reserved over limit', () => {
            expect(() => {
                setBlockchainEnvironment(1);
                const createQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );
                const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
                queue.setSatoshisOwedReserved(u256.fromU32(9), 100);
                queue.increaseSatoshisOwedReserved(u256.fromU32(9), u64.MAX_VALUE);
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
            queue.increaseDeltaSatoshisBuy(100);

            expect(queue.deltaSatoshisBuy).toStrictEqual(100);
        });

        it('should correctly increase delta tokens add value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.increaseDeltaTokensAdd(u256.fromU32(100));

            expect(queue.deltaTokensAdd).toStrictEqual(u256.fromU32(100));
        });

        it('should correctly increase delta tokens buy value', () => {
            setBlockchainEnvironment(1);
            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;
            queue.increaseDeltaTokensBuy(u256.fromU32(100));

            expect(queue.deltaTokensBuy).toStrictEqual(u256.fromU32(100));
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

    describe('Fees', () => {
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
            TransferHelper.clearMockedResults();

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.setLiquidity(u256.fromU32(10000));
            queue.virtualTokenReserve = u256.Zero;
            queue.distributeFee(u256.fromU32(10000), Address.dead());

            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(5000));
            expect(queue.liquidity).toStrictEqual(u256.fromU32(5000));
            expect(TransferHelper.safeTransferCalled).toBeTruthy();
        });

        it('should not call safetransfer when moto fee = 0', () => {
            TransferHelper.clearMockedResults();

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            queue.setLiquidity(u256.fromU32(10000));
            queue.virtualTokenReserve = u256.Zero;
            queue.distributeFee(u256.Zero, Address.dead());

            expect(queue.virtualTokenReserve).toStrictEqual(u256.Zero);
            expect(queue.liquidity).toStrictEqual(u256.fromU32(10000));
            expect(TransferHelper.safeTransferCalled).toBeFalsy();
        });
    });

    describe('Virtual Pool', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });

        it('should not update when currentBlock <= this.lastVirtualUpdateBlock', () => {
            setBlockchainEnvironment(1);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastVirtualUpdateBlock = 5;
            queue.updateVirtualPoolIfNeeded();

            expect(queue.lastVirtualUpdateBlock).toStrictEqual(5);
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
            queue.deltaTokensAdd = u256.fromU32(1000);
            queue.updateVirtualPoolIfNeeded();

            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU32(1000));
        });

        it('should apply the tokens buys to the virtual pool when the deltaTokensBuy >= virtualTokenReserve ', () => {
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
            queue.deltaTokensBuy = u256.fromU32(11000);
            queue.deltaSatoshisBuy = 999900001;
            queue.updateVirtualPoolIfNeeded();

            expect(queue.virtualSatoshisReserve).toStrictEqual(1000000000);
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(1));
        });

        it('should apply the tokens buys to the virtual pool when the deltaTokensBuy >= virtualTokenReserve and incB = deltaSatoshisBuy', () => {
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
            queue.deltaTokensBuy = u256.fromU32(11000);
            queue.deltaSatoshisBuy = 999990000;
            queue.updateVirtualPoolIfNeeded();

            expect(queue.virtualSatoshisReserve).toStrictEqual(1000000000);
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(1));
        });

        it('should apply the tokens buys to the virtual pool when the deltaTokensBuy >= virtualTokenReserve and incB > deltaSatoshisBuy', () => {
            setBlockchainEnvironment(5);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastVirtualUpdateBlock = 4;
            queue.virtualSatoshisReserve = 10;
            queue.virtualTokenReserve = u256.fromU32(10999);
            queue.deltaTokensBuy = u256.fromU32(11000);
            queue.deltaSatoshisBuy = 10;
            queue.updateVirtualPoolIfNeeded();

            expect(queue.virtualSatoshisReserve).toStrictEqual(20);
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(5499));
        });

        it('should apply the tokens buys to the virtual pool when the deltaTokensBuy < virtualTokenReserve ', () => {
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
            queue.deltaTokensBuy = u256.fromU32(9000);
            queue.deltaSatoshisBuy = 999900001;
            queue.updateVirtualPoolIfNeeded();

            expect(queue.virtualSatoshisReserve).toStrictEqual(1000000);
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(1000));
        });

        it('should apply the tokens buys to the virtual pool when the deltaTokensBuy < virtualTokenReserve and incB = deltaSatoshisBuy', () => {
            setBlockchainEnvironment(5);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastVirtualUpdateBlock = 4;
            queue.virtualSatoshisReserve = 100;
            queue.virtualTokenReserve = u256.fromU32(20);
            queue.deltaTokensBuy = u256.fromU32(10);
            queue.deltaSatoshisBuy = 100;
            queue.updateVirtualPoolIfNeeded();

            expect(queue.virtualSatoshisReserve).toStrictEqual(200);
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(10));
        });

        it('should apply the tokens buys to the virtual pool when the deltaTokensBuy < virtualTokenReserve and incB > deltaSatoshisBuy', () => {
            setBlockchainEnvironment(5);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ILiquidityQueue = createQueueResult.liquidityQueue;

            queue.lastVirtualUpdateBlock = 4;
            queue.virtualSatoshisReserve = 10;
            queue.virtualTokenReserve = u256.fromU32(10);
            queue.deltaTokensBuy = u256.fromU32(2);
            queue.deltaSatoshisBuy = 1;
            queue.updateVirtualPoolIfNeeded();

            expect(queue.virtualSatoshisReserve).toStrictEqual(11);
            expect(queue.virtualTokenReserve).toStrictEqual(u256.fromU64(9));
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
            queue.deltaTokensBuy = u256.fromU32(10);
            queue.deltaSatoshisBuy = 10;
            queue.deltaTokensAdd = u256.fromU32(2);

            queue.updateVirtualPoolIfNeeded();

            expect(queue.deltaSatoshisBuy).toStrictEqual(0);
            expect(queue.deltaTokensAdd).toStrictEqual(u256.Zero);
            expect(queue.deltaTokensBuy).toStrictEqual(u256.Zero);
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
            queue.deltaTokensBuy = u256.fromU32(10);
            queue.deltaSatoshisBuy = 10;
            queue.deltaTokensAdd = u256.fromU32(2);

            queue.updateVirtualPoolIfNeeded();

            expect(queue.lastVirtualUpdateBlock).toStrictEqual(5);
        });
    });

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

            queue.addActiveReservation(reservation);
            queue.addActiveReservation(reservation2);

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ITestLiquidityQueue = createQueueResult2.liquidityQueue;

            const list2: StoredU128Array =
                createQueueResult2.reservationManager.getReservationListForBlock(1000);
            expect(list2.getLength()).toStrictEqual(2);
            expect(list2.get(0)).toStrictEqual(reservation.getId());
            expect(list2.get(1)).toStrictEqual(reservation2.getId());

            const list2TokenActive: StoredBooleanArray =
                createQueueResult2.reservationManager.getActiveReservationListForBlock(1000);
            expect(list2TokenActive.get(0)).toBeTruthy();
            expect(list2TokenActive.get(1)).toBeTruthy();

            const list3: StoredU128Array =
                createQueueResult2.reservationManager.getReservationListForBlock(1001);
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
                ),
            );
            reservation.save();
            queue.addActiveReservation(reservation);
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
                    ),
                );
                reservation.save();
                queue.addActiveReservation(reservation);
                queue.save();

                setBlockchainEnvironment(1006, providerAddress1, providerAddress1);
                const reservation2: Reservation = queue.getReservationWithExpirationChecks();

                expect(reservation2).not.toBeNull();
            }).toThrow();
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

        it('should correctly add to removal queue', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
            queue.addToRemovalQueue(provider);
            queue.save();

            const createQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue2: ITestLiquidityQueue = createQueueResult2.liquidityQueue;

            expect(createQueueResult2.providerManager.removalQueueLength).toStrictEqual(1);
            expect(
                createQueueResult2.providerManager.getFromRemovalQueue(
                    provider.getRemovalQueueIndex(),
                ),
            ).toStrictEqual(provider.getId());
        });

        it('should call cleanUpQueues', () => {
            setBlockchainEnvironment(1000);

            const createQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );
            const queue: ITestLiquidityQueue = createQueueResult.liquidityQueue;
            queue.cleanUpQueues();

            expect(createQueueResult.providerManager.cleanUpQueuesCalled).toBeTruthy();
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

            queue.resetProvider(provider);

            expect(createQueueResult.providerManager.resetProviderCalled).toBeTruthy();
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
