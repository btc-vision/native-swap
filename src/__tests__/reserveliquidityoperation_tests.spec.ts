import {
    Address,
    Blockchain,
    SafeMath,
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders, getProvider } from '../models/Provider';
import {
    createLiquidityQueue,
    createProvider,
    createProviderId,
    msgSender1,
    providerAddress1,
    providerAddress2,
    receiverAddress1,
    setBlockchainEnvironment,
    TestReserveLiquidityOperation,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import { FeeManager } from '../managers/FeeManager';
import { Reservation } from '../models/Reservation';
import {
    FEE_COLLECT_SCRIPT_PUBKEY,
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
} from '../constants/Contract';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { AddLiquidityOperation } from '../operations/AddLiquidityOperation';
import { RemoveLiquidityOperation } from '../operations/RemoveLiquidityOperation';
import { ProviderTypes } from '../types/ProviderTypes';

describe('ReserveLiquidityOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
        FeeManager.reservationBaseFee = 0;
    });

    describe('ReserveLiquidityOperation - pre conditions', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            FeeManager.reservationBaseFee = 0;
        });

        it("should revert if initial provider try to reserve his own liquidity'", () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const provider = createProvider(providerAddress1, tokenAddress1, true, true, false);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                queue.liquidityQueue.initialLiquidityProviderId = provider.getId();

                const operation = new ReserveLiquidityOperation(
                    queue.liquidityQueue,
                    provider.getId(),
                    msgSender1,
                    10000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if activationDelay is greater than the allowed limit', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                queue.liquidityQueue.initialLiquidityProviderId = providerId1;

                const operation = new ReserveLiquidityOperation(
                    queue.liquidityQueue,
                    providerId2,
                    msgSender1,
                    10000,
                    u256.Zero,
                    false,
                    8,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if maximumAmountIn = 0', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                queue.liquidityQueue.initialLiquidityProviderId = providerId1;

                const operation = new ReserveLiquidityOperation(
                    queue.liquidityQueue,
                    providerId2,
                    msgSender1,
                    0,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if maximumAmountIn below MINIMUM_TRADE_SIZE_IN_SATOSHIS', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                queue.liquidityQueue.initialLiquidityProviderId = providerId1;

                const operation = new ReserveLiquidityOperation(
                    queue.liquidityQueue,
                    providerId2,
                    msgSender1,
                    1000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if no pool exists for token', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                queue.liquidityQueue.initialLiquidityProviderId = u256.Zero;

                const operation = new ReserveLiquidityOperation(
                    queue.liquidityQueue,
                    providerId2,
                    msgSender1,
                    10000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if insufficient fees collected', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const initialProvider = getProvider(initialProviderId);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                FeeManager.reservationBaseFee = 10000;

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    5,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress1, providerAddress1);
                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const provider1 = getProvider(providerId1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const reserveOp = new ReserveLiquidityOperation(
                    queue2.liquidityQueue,
                    providerId1,
                    providerAddress1,
                    10000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
            }).toThrow();
        });
    });

    describe('ReserveLiquidityOperation - create reservation', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            FeeManager.reservationBaseFee = 0;
        });

        it('should revert if user is timed out', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    5,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress1, providerAddress1);
                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const reserveOp = new ReserveLiquidityOperation(
                    queue2.liquidityQueue,
                    providerId1,
                    providerAddress1,
                    10000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(107, providerAddress1, providerAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true, true);
                const reserveOp2 = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId1,
                    providerAddress1,
                    10000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp2.execute();
            }).toThrow();
        });

        it("should revert if there is already an active reservation'", () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    5,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress1, providerAddress1);
                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const reserveOp = new ReserveLiquidityOperation(
                    queue2.liquidityQueue,
                    providerId1,
                    providerAddress1,
                    10000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress1, providerAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const reserveOp2 = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId1,
                    providerAddress1,
                    10000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp2.execute();
            }).toThrow();
        });

        it('should delete the reservation when expired and dirty', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new ReserveLiquidityOperation(
                queue2.liquidityQueue,
                providerId2,
                providerAddress2,
                900000000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue2.liquidityQueue.save();

            const reservation = new Reservation(tokenAddress1, providerAddress2);
            expect(reservation.getActivationDelay()).toStrictEqual(2);
            expect(reservation.isForLiquidityPool()).toBeFalsy();
            expect(reservation.getExpirationBlock()).toStrictEqual(108);
            expect(reservation.getPurgeIndex()).toStrictEqual(0);
            expect(reservation.getProviderCount()).toStrictEqual(1);

            const value1 = reservation.getProviderAt(0);
            expect(value1.providerIndex).toStrictEqual(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            expect(value1.providedAmount).toStrictEqual(u128.fromString(`49999999999999999999999`));
            expect(queue2.liquidityQueue.reservedLiquidity).toStrictEqual(
                u256.fromString(`49999999999999999999999`),
            );

            for (let i: u64 = 105; i < 110; i++) {
                setBlockchainEnvironment(i, providerAddress2, providerAddress2);
                const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                q.liquidityQueue.save();
            }

            setBlockchainEnvironment(110, providerAddress2, providerAddress2);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

            const reserveOp2 = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                900000000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp2.execute();
            queue3.liquidityQueue.save();

            const reservation2 = new Reservation(tokenAddress1, providerAddress2);
            expect(reservation2.getCreationBlock()).toStrictEqual(110);
        });

        it('should exit early ensureReservationPurged when reservation not expired', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    5,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(103, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const reserveOp = new ReserveLiquidityOperation(
                    queue2.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    900000000,
                    u256.Zero,
                    false,
                    2,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
                queue2.liquidityQueue.save();

                const reservation = new Reservation(tokenAddress1, providerAddress2);
                expect(reservation.getActivationDelay()).toStrictEqual(2);
                expect(reservation.isForLiquidityPool()).toBeFalsy();
                expect(reservation.getExpirationBlock()).toStrictEqual(108);
                expect(reservation.getPurgeIndex()).toStrictEqual(0);
                expect(reservation.getProviderCount()).toStrictEqual(1);

                const value1 = reservation.getProviderAt(0);
                expect(value1.providerIndex).toStrictEqual(INITIAL_LIQUIDITY_PROVIDER_INDEX);
                expect(value1.providedAmount).toStrictEqual(
                    u128.fromString(`49999999999999999999999`),
                );
                expect(queue2.liquidityQueue.reservedLiquidity).toStrictEqual(
                    u256.fromString(`49999999999999999999999`),
                );

                for (let i: u64 = 104; i < 107; i++) {
                    setBlockchainEnvironment(i, providerAddress2, providerAddress2);
                    const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                    q.liquidityQueue.save();
                }

                setBlockchainEnvironment(107, providerAddress2, providerAddress2);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

                const reserveOp2 = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    900000000,
                    u256.Zero,
                    false,
                    2,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp2.execute();
                queue3.liquidityQueue.save();
            }).toThrow();
        });

        it('should set isForLiquidityPool flag when reservation is for liquidity pool ', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                900000000,
                u256.Zero,
                true,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            const reservation = new Reservation(tokenAddress1, providerAddress2);
            expect(reservation.isForLiquidityPool()).toBeTruthy();
        });

        it('should not set isForLiquidityPool flag when reservation is not for liquidity pool ', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                900000000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            const reservation = new Reservation(tokenAddress1, providerAddress2);
            expect(reservation.isForLiquidityPool()).toBeFalsy();
        });

        it('should set the creation block number', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                900000000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            const reservation = new Reservation(tokenAddress1, providerAddress2);
            expect(reservation.getCreationBlock()).toStrictEqual(102);
        });
    });

    describe('ReserveLiquidityOperation - other validations', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            FeeManager.reservationBaseFee = 0;
        });

        it("should revert if liquidity queue does not have enough available liquidity'", () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    10,
                    u256.fromU32(15000),
                    5,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress1, providerAddress1);
                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                // Make reservedliquidity > liquidity
                queue2.liquidityQueue.increaseTotalReserved(
                    SafeMath.add(queue2.liquidityQueue.liquidity, u256.One),
                );

                const reserveOp = new ReserveLiquidityOperation(
                    queue2.liquidityQueue,
                    providerId1,
                    providerAddress1,
                    11000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
            }).toThrow();
        });

        it('should revert if quote is 0', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    5,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress1, providerAddress1);
                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                // Force quote = 0
                queue2.liquidityQueue.virtualTokenReserve = u256.Zero;

                const reserveOp = new ReserveLiquidityOperation(
                    queue2.liquidityQueue,
                    providerId1,
                    providerAddress1,
                    10000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
                queue2.liquidityQueue.save();
            }).toThrow();
        });
    });

    describe('ReserveLiquidityOperation - computeTokenRemaining', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            FeeManager.reservationBaseFee = 0;
        });

        it('should revert when trying to add to much tokens for liquidity pool', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU64(999999999),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    0,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.virtualTokenReserve = u256.fromString(
                    '99999999999999999999999999999999',
                );
                queue.liquidityQueue.virtualSatoshisReserve = 1;
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(101, providerAddress1, providerAddress1);
                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const reserveOp = new ReserveLiquidityOperation(
                    queue2.liquidityQueue,
                    providerId1,
                    providerAddress1,
                    u64.MAX_VALUE,
                    u256.Zero,
                    true,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
            }).toThrow();
        });

        it('should limit the number of tokens to the available liquidity', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(10000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                100,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                90000000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            const reservation = new Reservation(tokenAddress1, providerAddress2);
            expect(reservation.getProviderCount()).toStrictEqual(1);

            const result = reservation.getProviderAt(0);

            expect(result).not.toBeNull();

            if (result !== null) {
                expect(result.providedAmount).toStrictEqual(
                    u128.fromString(`9999999999999999999999`),
                );
            }
        });

        it('should revert when the cap is reached', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    1,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.increaseTotalReserved(
                    u256.fromString(`10000000000000000000000`),
                );
                queue.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const reserveOp = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    90000000,
                    u256.Zero,
                    false,
                    2,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
                queue3.liquidityQueue.save();
            }).toThrow();
        });

        it('should revert when the minimum reservation threshold is not met', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    1,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.increaseTotalReserved(
                    u256.fromString(`9999999999999999999900`),
                );
                queue.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const reserveOp = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    90000000,
                    u256.Zero,
                    false,
                    2,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
                queue3.liquidityQueue.save();
            }).toThrow();
        });

        it('should revert when above max tokens per reservation', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    150,
                    u256.fromU32(10000),
                    100,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const reserveOp = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    90000000,
                    u256.Zero,
                    false,
                    2,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
                queue3.liquidityQueue.save();
            }).toThrow();
        });

        it('should revert when tokens is 0', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    100,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const reserveOp = new TestReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    10000,
                    u256.Zero,
                    false,
                    2,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.mockLimitByAvailableLiquidity(u256.Zero);

                reserveOp.execute();
                queue3.liquidityQueue.save();
            }).toThrow();
        });
    });

    describe('ReserveLiquidityOperation - reserve', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            FeeManager.reservationBaseFee = 0;
        });

        it('should break if tokensToSatoshis(...) < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT => exit loop', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress1, providerAddress1);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const listOp = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                providerId1,
                u128.fromString(`6667000000000000000`),
                receiverAddress1,
                Address.dead(),
                false,
                false,
            );

            listOp.execute();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                10001,
                u256.Zero,
                false,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            expect(queue3.liquidityQueue.reservedLiquidity).toStrictEqual(
                u256.fromString(`6666688890000000000`),
            );
        });

        it('should break when nextprovider is null', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initProvider = getProvider(initialProviderId);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress1, providerAddress1);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const listOp = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                providerId1,
                u128.fromString(`10000000000000000000`),
                receiverAddress1,
                Address.dead(),
                false,
                false,
            );

            listOp.execute();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            // Fake the ip.reserved to max so it won't be used to get liquidity.
            // As ip is the last provider to be checked, if no liquidity is available to be reserved, null will be returned.
            initProvider.setReservedAmount(initProvider.getLiquidityAmount());

            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                20000,
                u256.Zero,
                false,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            const reservation = new Reservation(tokenAddress1, providerAddress2);
            expect(reservation.getProviderCount()).toStrictEqual(1);

            const values = reservation.getProviderAt(0);
            expect(values.providedAmount).toStrictEqual(u128.fromString(`9999383330000000000`));
        });

        it('should revert when provider queue index is not set', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const initProvider = getProvider(initialProviderId);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    5,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress1, providerAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const listOp = new ListTokensForSaleOperation(
                    queue2.liquidityQueue,
                    providerId1,
                    u128.fromString(`10000000000000000000`),
                    receiverAddress1,
                    Address.dead(),
                    false,
                    false,
                );

                listOp.execute();
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(103, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const provider1 = getProvider(providerId1);
                provider1.setQueueIndex(INDEX_NOT_SET_VALUE);
                const reserveOp = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    20000,
                    u256.Zero,
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
                queue3.liquidityQueue.save();

                const reservation = new Reservation(tokenAddress1, providerAddress2);
                expect(reservation.getProviderCount()).toStrictEqual(1);

                const values = reservation.getProviderAt(0);
                expect(values.providedAmount).toStrictEqual(u128.fromString(`9999999999999999999`));
            }).toThrow();
        });

        it('should break if repeated initial provider', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initProvider = getProvider(initialProviderId);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            initProvider.setReservedAmount(initProvider.getLiquidityAmount());
            queue3.liquidityQueue.mockgetNextProviderWithLiquidity(initProvider);

            const reserveOp = new ReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                20000,
                u256.Zero,
                false,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            const reservation = new Reservation(tokenAddress1, providerAddress2);
            expect(reservation.getProviderCount()).toStrictEqual(0);
        });

        it('should revert if repeated provider id', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    5,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(103, providerAddress2, providerAddress2);
                const provider = createProvider(providerAddress2, tokenAddress1);
                provider.setQueueIndex(1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                queue3.liquidityQueue.mockgetNextProviderWithLiquidity(provider);

                const reserveOp = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    provider.getId(),
                    providerAddress2,
                    10000,
                    u256.Zero,
                    false,
                    2,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
                queue3.liquidityQueue.save();
            }).toThrow();
        });

        it('should revert if Not enough liquidity reserved', () => {
            expect(() => {
                setBlockchainEnvironment(100, msgSender1, msgSender1);
                Blockchain.mockValidateBitcoinAddressResult(true);

                const initialProviderId = createProviderId(msgSender1, tokenAddress1);
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const floorPrice: u256 = SafeMath.div(
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                    u256.fromU32(1500),
                );
                const initialLiquidity = SafeMath.mul128(
                    u128.fromU32(1000000),
                    SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
                );

                const createPoolOp = new CreatePoolOperation(
                    queue.liquidityQueue,
                    floorPrice,
                    initialProviderId,
                    initialLiquidity,
                    receiverAddress1,
                    0,
                    u256.Zero,
                    5,
                    Address.dead(),
                );

                createPoolOp.execute();
                queue.liquidityQueue.setBlockQuote();
                queue.liquidityQueue.save();

                setBlockchainEnvironment(102, providerAddress1, providerAddress1);
                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                const providerId1 = createProviderId(providerAddress1, tokenAddress1);
                const listOp = new ListTokensForSaleOperation(
                    queue2.liquidityQueue,
                    providerId1,
                    u128.fromString(`10000000000000000000`),
                    receiverAddress1,
                    Address.dead(),
                    false,
                    false,
                );

                listOp.execute();
                queue2.liquidityQueue.save();

                setBlockchainEnvironment(103, providerAddress2, providerAddress2);
                const providerId2 = createProviderId(providerAddress2, tokenAddress1);
                const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const reserveOp = new ReserveLiquidityOperation(
                    queue3.liquidityQueue,
                    providerId2,
                    providerAddress2,
                    900000000000,
                    u256.fromString(`9000000000000000000000000`),
                    false,
                    0,
                    MAXIMUM_PROVIDER_PER_RESERVATIONS,
                );

                reserveOp.execute();
                queue3.liquidityQueue.save();
            }).toThrow();
        });

        it('should not use more than the maximum number of providers per reservation', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1000),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(100000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                100,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress1, providerAddress1);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const provider1 = getProvider(providerId1);
            const listOp = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                providerId1,
                u128.fromString(`10000000000000000000`),
                receiverAddress1,
                Address.dead(),
                false,
                false,
            );

            listOp.execute();
            queue2.liquidityQueue.save();

            provider1.setReservedAmount(
                SafeMath.sub128(
                    provider1.getAvailableLiquidityAmount(),
                    u128.fromString('999999999999999999'),
                ),
            );

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new TestReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                1000000000000,
                u256.Zero,
                false,
                0,
                1,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            expect(reserveOp.getReservedProviderCount()).toStrictEqual(1);
        });
    });

    describe('ReserveLiquidityOperation - reserve from pending removal', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            FeeManager.reservationBaseFee = 0;
        });

        it('should reserve from a pending removal provider and increment reservedProviderCount', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress1, providerAddress1);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000),
            );
            transactionOutput.push(
                new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const provider1 = getProvider(providerId1);
            const reserveOp = new ReserveLiquidityOperation(
                queue2.liquidityQueue,
                providerId1,
                providerAddress1,
                900000000,
                u256.Zero,
                true,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue2.liquidityQueue.setBlockQuote();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(104, providerAddress1, providerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const addLiquidityOp = new AddLiquidityOperation(
                queue3.liquidityQueue,
                queue3.tradeManager,
                providerId1,
                receiverAddress1,
            );

            addLiquidityOp.execute();
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(105, providerAddress1, providerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const removeLiquidityOp = new RemoveLiquidityOperation(
                queue4.liquidityQueue,
                providerId1,
            );

            removeLiquidityOp.execute();
            queue4.liquidityQueue.setBlockQuote();
            queue4.liquidityQueue.save();

            setBlockchainEnvironment(106, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reserveOp2 = new TestReserveLiquidityOperation(
                queue5.liquidityQueue,
                providerId2,
                providerAddress2,
                10000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp2.execute();
            queue5.liquidityQueue.save();

            const reservation = new Reservation(tokenAddress1, providerAddress2);

            expect(reserveOp2.getReservedProviderCount()).toStrictEqual(1);
            expect(provider1.isPendingRemoval()).toBeTruthy();
            expect(reservation.getProviderCount()).toStrictEqual(1);
            const data = reservation.getProviderAt(0);
            expect(data).not.toBeNull();

            if (data !== null) {
                expect(data.providerType).toStrictEqual(ProviderTypes.LiquidityRemoval);
            }
        });

        it('should cap to owed amount when reserving from a pending removal provider and remainingSatoshis > owed amount', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress1, providerAddress1);
            const transactionOutput: TransactionOutput[] = [];

            transactionOutput.push(new TransactionOutput(0, 0, null, 'fakeaddress', 0));
            transactionOutput.push(
                new TransactionOutput(1, 0, null, FEE_COLLECT_SCRIPT_PUBKEY, 10000),
            );
            transactionOutput.push(
                new TransactionOutput(2, 0, null, initialProvider.getBtcReceiver(), 10000),
            );

            Blockchain.mockTransactionOutput(transactionOutput);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const provider1 = getProvider(providerId1);
            const reserveOp = new ReserveLiquidityOperation(
                queue2.liquidityQueue,
                providerId1,
                providerAddress1,
                900000000,
                u256.Zero,
                true,
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue2.liquidityQueue.setBlockQuote();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(104, providerAddress1, providerAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const addLiquidityOp = new AddLiquidityOperation(
                queue3.liquidityQueue,
                queue3.tradeManager,
                providerId1,
                receiverAddress1,
            );

            addLiquidityOp.execute();
            queue3.liquidityQueue.setBlockQuote();
            queue3.liquidityQueue.save();

            setBlockchainEnvironment(105, providerAddress1, providerAddress1);
            const queue4 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const removeLiquidityOp = new RemoveLiquidityOperation(
                queue4.liquidityQueue,
                providerId1,
            );

            removeLiquidityOp.execute();
            queue4.liquidityQueue.setBlockQuote();
            queue4.liquidityQueue.save();

            setBlockchainEnvironment(106, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reserveOp2 = new TestReserveLiquidityOperation(
                queue5.liquidityQueue,
                providerId2,
                providerAddress2,
                10000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            const reservation = new Reservation(tokenAddress1, providerAddress2);

            queue5.liquidityQueue.setSatoshisOwed(providerId1, 20000);
            reserveOp2.callReserveFromRemovalProvider(
                reservation,
                provider1,
                30000,
                u256.fromString(`66666666666666666666666`),
            );

            expect(reservation.getProviderCount()).toStrictEqual(1);
            const data = reservation.getProviderAt(0);
            expect(data).not.toBeNull();

            if (data !== null) {
                expect(data.providedAmount).toStrictEqual(u128.fromString(`13333333333333333333`));
                expect(queue5.liquidityQueue.getSatoshisOwedReserved(providerId1)).toStrictEqual(
                    20000,
                );
            }
        });

        it('should reserve remainingSatoshis when reserving from a pending removal provider and remainingSatoshis <= owed amount', () => {
            setBlockchainEnvironment(106, providerAddress2, providerAddress2);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const provider1 = getProvider(providerId1);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reserveOp2 = new TestReserveLiquidityOperation(
                queue5.liquidityQueue,
                providerId2,
                providerAddress2,
                10000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            const reservation = new Reservation(tokenAddress1, providerAddress2);

            queue5.liquidityQueue.setSatoshisOwed(providerId1, 30000);
            reserveOp2.setRemainingTokens(u256.fromString(`13333333333333333333`));
            reserveOp2.callReserveFromRemovalProvider(
                reservation,
                provider1,
                20000,
                u256.fromString(`66666666666666666666666`),
            );

            expect(reservation.getProviderCount()).toStrictEqual(1);
            const data = reservation.getProviderAt(0);
            expect(data).not.toBeNull();

            if (data !== null) {
                expect(data.providedAmount).toStrictEqual(u128.fromString(`13333333333333333333`));
                expect(queue5.liquidityQueue.getSatoshisOwedReserved(providerId1)).toStrictEqual(
                    20000,
                );
            }
        });

        it('should reserve nothing from a pending removal provider when targetTokensToReserve is 0', () => {
            setBlockchainEnvironment(106, providerAddress2, providerAddress2);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const provider1 = getProvider(providerId1);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reserveOp2 = new TestReserveLiquidityOperation(
                queue5.liquidityQueue,
                providerId2,
                providerAddress2,
                10000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            const reservation = new Reservation(tokenAddress1, providerAddress2);

            queue5.liquidityQueue.setSatoshisOwed(providerId1, 30000);
            reserveOp2.setRemainingTokens(u256.fromString(`0`));
            reserveOp2.callReserveFromRemovalProvider(
                reservation,
                provider1,
                0,
                u256.fromString(`66666666666666666666666`),
            );

            expect(reservation.getProviderCount()).toStrictEqual(0);
        });
    });

    describe('ReserveLiquidityOperation - reserve from normal/priority', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            FeeManager.reservationBaseFee = 0;
        });

        it('should reserve from a normal/priority provider and increment reservedProviderCount', () => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            initialProvider.markInitialLiquidityProvider();
            initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue.liquidityQueue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
                Address.dead(),
            );

            createPoolOp.execute();
            queue.liquidityQueue.setBlockQuote();
            queue.liquidityQueue.save();

            setBlockchainEnvironment(102, providerAddress1, providerAddress1);
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const listOp = new ListTokensForSaleOperation(
                queue2.liquidityQueue,
                providerId1,
                u128.fromString(`10000000000000000000`),
                receiverAddress1,
                Address.dead(),
                false,
                false,
            );

            listOp.execute();
            queue2.liquidityQueue.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new TestReserveLiquidityOperation(
                queue3.liquidityQueue,
                providerId2,
                providerAddress2,
                900000000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            reserveOp.execute();
            queue3.liquidityQueue.save();

            expect(reserveOp.getReservedProviderCount()).toStrictEqual(2);

            const reservation = new Reservation(tokenAddress1, providerAddress2);
            expect(reservation.getActivationDelay()).toStrictEqual(2);
            expect(reservation.isForLiquidityPool()).toBeFalsy();
            expect(reservation.getExpirationBlock()).toStrictEqual(108);
            expect(reservation.getPurgeIndex()).toStrictEqual(0);

            expect(reservation.getProviderCount()).toStrictEqual(2);
            const value1 = reservation.getProviderAt(0);
            const value2 = reservation.getProviderAt(1);

            expect(value1.providerIndex).toStrictEqual(0);
            expect(value2.providerIndex).toStrictEqual(INITIAL_LIQUIDITY_PROVIDER_INDEX);

            expect(value1.providedAmount).toStrictEqual(u128.fromString(`9999383330000000000`));
            expect(value2.providedAmount).toStrictEqual(u128.fromString(`49990499951250000000000`));
            expect(queue3.liquidityQueue.reservedLiquidity).toStrictEqual(
                u256.fromString(`50000499334580000000000`),
            );

            const reservationList = queue3.reservationManager.callgetReservationListForBlock(103);
            const reservationActiveList = queue3.reservationManager.callgetActiveListForBlock(103);

            expect(reservationList.getLength()).toStrictEqual(1);
            expect(reservationList.get(reservation.getPurgeIndex())).toStrictEqual(
                reservation.getId(),
            );
            expect(reservationActiveList.getLength()).toStrictEqual(1);
            expect(reservationActiveList.get(reservation.getPurgeIndex())).toBeTruthy();
        });

        it('should cap to provider available liquidity when reserving from a normal/priority provider and remainingTokens > provider available liquidity', () => {
            setBlockchainEnvironment(106, providerAddress2, providerAddress2);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const provider1 = getProvider(providerId1);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reserveOp2 = new TestReserveLiquidityOperation(
                queue5.liquidityQueue,
                providerId2,
                providerAddress2,
                10000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            const reservation = new Reservation(tokenAddress1, providerAddress2);

            provider1.setLiquidityAmount(u128.fromString(`10000000000000000000`));
            provider1.setReservedAmount(u128.Zero);
            reserveOp2.setRemainingTokens(u256.fromString(`13333333333333333333`));
            reserveOp2.callReserveFromProvider(
                reservation,
                provider1,
                u256.fromString(`66666666666666666666666`),
            );

            expect(reservation.getProviderCount()).toStrictEqual(1);
            const data = reservation.getProviderAt(0);
            expect(data).not.toBeNull();

            if (data !== null) {
                expect(data.providedAmount).toStrictEqual(u128.fromString(`9999999999999999999`));
            }
        });

        it('should reserve only from 1 normal/priority provider when remainingTokens <= provider available liquidity', () => {
            setBlockchainEnvironment(106, providerAddress2, providerAddress2);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const provider1 = getProvider(providerId1);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reserveOp2 = new TestReserveLiquidityOperation(
                queue5.liquidityQueue,
                providerId2,
                providerAddress2,
                10000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            const reservation = new Reservation(tokenAddress1, providerAddress2);

            provider1.setLiquidityAmount(u128.fromString(`13333333333333333333`));
            provider1.setReservedAmount(u128.Zero);
            reserveOp2.setRemainingTokens(u256.fromString(`12222222222222222222`));
            reserveOp2.callReserveFromProvider(
                reservation,
                provider1,
                u256.fromString(`66666666666666666666666`),
            );

            expect(reservation.getProviderCount()).toStrictEqual(1);
            const data = reservation.getProviderAt(0);
            expect(data).not.toBeNull();

            if (data !== null) {
                expect(data.providedAmount).toStrictEqual(u128.fromString(`12221999999999999999`));
            }
        });

        it('should use all provider available liquidity when leftover falls below minimum', () => {
            setBlockchainEnvironment(106, providerAddress2, providerAddress2);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const provider1 = getProvider(providerId1);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reserveOp2 = new TestReserveLiquidityOperation(
                queue5.liquidityQueue,
                providerId2,
                providerAddress2,
                10000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            const reservation = new Reservation(tokenAddress1, providerAddress2);

            provider1.setLiquidityAmount(u128.fromString(`13333333333333333333`));
            provider1.setReservedAmount(u128.Zero);
            reserveOp2.setRemainingTokens(u256.fromString(`13333333333333333332`));
            reserveOp2.callReserveFromProvider(
                reservation,
                provider1,
                u256.fromString(`66666666666666666666666`),
            );

            expect(reservation.getProviderCount()).toStrictEqual(1);
            const data = reservation.getProviderAt(0);
            expect(data).not.toBeNull();

            if (data !== null) {
                expect(data.providedAmount).toStrictEqual(u128.fromString(`13333333333333333333`));
            }
        });

        it('should be removed from purge queue when provider is from a purge queue and available liquidity below minimum', () => {
            setBlockchainEnvironment(106, providerAddress2, providerAddress2);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const provider1 = getProvider(providerId1);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue5 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const reserveOp2 = new TestReserveLiquidityOperation(
                queue5.liquidityQueue,
                providerId2,
                providerAddress2,
                10000,
                u256.Zero,
                false,
                2,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
            );

            const reservation = new Reservation(tokenAddress1, providerAddress2);

            provider1.setLiquidityAmount(u128.fromString(`13333333333333333333`));
            provider1.setReservedAmount(u128.Zero);

            queue5.providerManager.addToNormalQueue(provider1);
            queue5.providerManager.addToNormalPurgedQueue(provider1);

            expect(provider1.isPurged()).toBeTruthy();
            expect(provider1.getPurgedIndex()).toStrictEqual(0);
            expect(queue5.providerManager.normalPurgedQueueLength).toStrictEqual(1);

            reserveOp2.setRemainingTokens(u256.fromString(`13333333333333333332`));
            reserveOp2.callReserveFromProvider(
                reservation,
                provider1,
                u256.fromString(`66666666666666666666666`),
            );

            expect(provider1.isPurged()).toBeFalsy();
            expect(provider1.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(queue5.providerManager.normalPurgedQueueLength).toStrictEqual(0);
        });
    });
});
