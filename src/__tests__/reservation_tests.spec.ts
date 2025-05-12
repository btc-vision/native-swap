import { Blockchain, TransferHelper } from '../../../btc-runtime/runtime';
import { clearCachedProviders } from '../models/Provider';
import {
    createReservationId,
    providerAddress1,
    providerAddress2,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenAddress2,
} from './test_helper';
import { Reservation } from '../models/Reservation';
import { u128 } from '@btc-vision/as-bignum/assembly';
import {
    INDEX_NOT_SET_VALUE,
    MAXIMUM_PROVIDER_COUNT,
    RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
    TIMEOUT_AFTER_EXPIRATION_BLOCKS,
} from '../constants/Contract';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ProviderTypes } from '../types/ProviderTypes';

describe('Reservation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('Reservation – constructor', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should create a new reservation and initialize correctly', () => {
            setBlockchainEnvironment(1000);

            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            const reservationId = u128.fromBytes(
                Reservation.generateId(tokenAddress1, providerAddress1),
                true,
            );

            expect(reservation.getProviderCount()).toStrictEqual(0);
            expect(reservation.isForLiquidityPool()).toBeFalsy();
            expect(reservation.getExpirationBlock()).toStrictEqual(
                RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation.getUserTimeoutBlockExpiration()).toStrictEqual(0);
            expect(reservation.getPurgeIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(reservation.getId()).toStrictEqual(reservationId);
            expect(reservation.getActivationDelay()).toStrictEqual(0);
        });

        it('should return an empty reservation when loading a non existing reservationId', () => {
            setBlockchainEnvironment(1000);

            const reservationId = createReservationId(tokenAddress1, providerAddress1);
            const reservation: Reservation = Reservation.load(reservationId);

            expect(reservation.getProviderCount()).toStrictEqual(0);
            expect(reservation.isForLiquidityPool()).toBeFalsy();
            expect(reservation.getExpirationBlock()).toStrictEqual(
                RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation.getUserTimeoutBlockExpiration()).toStrictEqual(0);
            expect(reservation.getPurgeIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(reservation.getId()).toStrictEqual(reservationId);
            expect(reservation.getActivationDelay()).toStrictEqual(0);
        });

        it('should correctly load a reservation when loading an existing reservationId', () => {
            setBlockchainEnvironment(1000);

            const reservationId: u128 = createReservationId(tokenAddress1, providerAddress1);
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

            expect(reservation.getId()).toStrictEqual(reservationId);

            reservation.setCreationBlock(10);
            reservation.markForLiquidityPool();
            reservation.setPurgeIndex(20);
            reservation.setActivationDelay(2);
            reservation.timeoutUser();
            reservation.addProvider(
                new ReservationProviderData(1, u128.fromU64(1000), ProviderTypes.Normal),
            );
            reservation.addProvider(
                new ReservationProviderData(2, u128.fromU64(2000), ProviderTypes.Priority),
            );
            reservation.addProvider(
                new ReservationProviderData(3, u128.fromU64(3000), ProviderTypes.LiquidityRemoval),
            );
            reservation.save();

            const reservation2: Reservation = Reservation.load(reservationId);

            expect(reservation2.getId()).toStrictEqual(reservationId);

            expect(reservation2.getExpirationBlock()).toStrictEqual(
                10 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation2.isForLiquidityPool()).toBeTruthy();
            expect(reservation2.getPurgeIndex()).toStrictEqual(20);
            expect(reservation2.getActivationDelay()).toStrictEqual(2);
            expect(reservation2.getUserTimeoutBlockExpiration()).toStrictEqual(
                10 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + TIMEOUT_AFTER_EXPIRATION_BLOCKS,
            );
            expect(reservation2.getProviderCount()).toStrictEqual(3);

            const pd1: ReservationProviderData = reservation2.getProviderAt(0);
            expect(pd1.providerIndex).toStrictEqual(1);
            expect(pd1.providedAmount).toStrictEqual(u128.fromU64(1000));
            expect(pd1.providerType).toStrictEqual(ProviderTypes.Normal);

            const pd2: ReservationProviderData = reservation2.getProviderAt(1);
            expect(pd2.providerIndex).toStrictEqual(2);
            expect(pd2.providedAmount).toStrictEqual(u128.fromU64(2000));
            expect(pd2.providerType).toStrictEqual(ProviderTypes.Priority);

            const pd3: ReservationProviderData = reservation2.getProviderAt(1);
            expect(pd3.providerIndex).toStrictEqual(3);
            expect(pd3.providedAmount).toStrictEqual(u128.fromU64(3000));
            expect(pd3.providerType).toStrictEqual(ProviderTypes.LiquidityRemoval);
        });
    });

    describe('Reservation – Provider managements', () => {
        let reservation: Reservation;

        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            reservation = new Reservation(tokenAddress1, providerAddress1);
        });

        it('addProvider stores and getProviderAt retrieves values', () => {
            setBlockchainEnvironment(1000);

            const providerData: ReservationProviderData = new ReservationProviderData(
                5,
                u128.fromU64(99),
                ProviderTypes.Normal,
            );
            reservation.addProvider(providerData);

            const fetched: ReservationProviderData = reservation.getProviderAt(0);
            expect(fetched.providerIndex).toBe(5);
            expect(fetched.providedAmount).toStrictEqual(u128.fromU64(99));
            expect(fetched.providerType).toStrictEqual(ProviderTypes.Normal);
        });

        it('addProvider stores and getProviderAt retrieves values when Reservation saved/loaded', () => {
            setBlockchainEnvironment(1000);

            const providerData: ReservationProviderData = new ReservationProviderData(
                5,
                u128.fromU64(99),
                ProviderTypes.Normal,
            );
            reservation.addProvider(providerData);
            reservation.save();

            const reservation2 = new Reservation(tokenAddress1, providerAddress1);
            const fetched: ReservationProviderData = reservation2.getProviderAt(0);
            expect(fetched.providerIndex).toBe(5);
            expect(fetched.providedAmount).toStrictEqual(u128.fromU64(99));
            expect(fetched.providerType).toStrictEqual(ProviderTypes.Normal);
        });

        it('addProvider throws when exceeding MAXIMUM_PROVIDER_COUNT', () => {
            setBlockchainEnvironment(1000);

            for (let i: u32 = 0; i < MAXIMUM_PROVIDER_COUNT; i++) {
                reservation.addProvider(
                    new ReservationProviderData(i, u128.Zero, ProviderTypes.Normal),
                );
            }
            expect<() => void>(() => {
                reservation.addProvider(
                    new ReservationProviderData(99, u128.Zero, ProviderTypes.Normal),
                );
            }).toThrow();
        });

        it('getProviderAt bounds check throws', () => {
            setBlockchainEnvironment(1000);

            reservation.addProvider(
                new ReservationProviderData(1, u128.Zero, ProviderTypes.Normal),
            );
            expect<() => void>(() => {
                reservation.getProviderAt(2);
            }).toThrow();
        });
    });

    describe('Reservation – ensureCanBeConsumed timing rules', () => {
        let reservation: Reservation;

        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            reservation = new Reservation(tokenAddress1, providerAddress1);
            reservation.addProvider(
                new ReservationProviderData(0, u128.fromU64(1000), ProviderTypes.Normal),
            );
        });

        it('throws if consumed in same block when activationDelay=0', () => {
            setBlockchainEnvironment(1000);

            reservation.setCreationBlock(Blockchain.block.number);
            expect<() => void>(() => {
                reservation.ensureCanBeConsumed();
            }).toThrow();
        });

        it('throws if activationDelay not elapsed', () => {
            setBlockchainEnvironment(1000);

            reservation.setActivationDelay(3);
            reservation.setCreationBlock(Blockchain.block.number);
            setBlockchainEnvironment(1002);

            expect<() => void>(() => {
                reservation.ensureCanBeConsumed();
            }).toThrow();
        });

        it('throws if not valid', () => {
            setBlockchainEnvironment(1000);

            const reservation1 = new Reservation(tokenAddress2, providerAddress2);
            reservation1.setActivationDelay(3);
            reservation.setCreationBlock(Blockchain.block.number);

            expect<() => void>(() => {
                reservation.ensureCanBeConsumed();
            }).toThrow();
        });

        it('passes when activationDelay elapsed', () => {
            setBlockchainEnvironment(1000);

            reservation.setActivationDelay(2);
            reservation.setCreationBlock(Blockchain.block.number); // blk X
            setBlockchainEnvironment(1003);
            expect<() => void>(() => {
                reservation.ensureCanBeConsumed();
            }).not.toThrow();
        });
    });

    describe('Reservation – expiration & validity', () => {
        let reservation: Reservation;

        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            reservation = new Reservation(tokenAddress1, providerAddress1);
            reservation.addProvider(
                new ReservationProviderData(0, u128.fromU64(1000), ProviderTypes.Normal),
            );
        });

        it('isExpired false before expiration block', () => {
            setBlockchainEnvironment(1000);

            reservation.setCreationBlock(Blockchain.block.number);
            expect(reservation.isExpired()).toBeFalsy();
        });

        it('isExpired true after expiration block', () => {
            setBlockchainEnvironment(1000);
            reservation.setCreationBlock(Blockchain.block.number);

            setBlockchainEnvironment(1000 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + 1);
            expect(reservation.isExpired()).toBeTruthy();
        });

        it('isValid false when expired', () => {
            setBlockchainEnvironment(1000);
            reservation.setCreationBlock(Blockchain.block.number);

            setBlockchainEnvironment(1000 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + 1);
            expect(reservation.isValid()).toBeFalsy();
        });

        it('isValid false when no providers', () => {
            const reservation1 = new Reservation(tokenAddress2, providerAddress2);
            expect(reservation.isValid()).toBeFalsy();
        });
    });

    describe('Reservation – Getters/Setters', () => {
        let reservation: Reservation;

        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            reservation = new Reservation(tokenAddress1, providerAddress1);
        });

        it('should correctly get/set creation/expiration block when greater than current block number', () => {
            setBlockchainEnvironment(1000);

            reservation.setCreationBlock(1000);

            expect(reservation.getCreationBlock()).toStrictEqual(1000);
            expect(reservation.getExpirationBlock()).toStrictEqual(
                1000 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
        });

        it('should correctly get/set the purge index', () => {
            setBlockchainEnvironment(1);

            reservation.setPurgeIndex(10);

            expect(reservation.getPurgeIndex()).toStrictEqual(10);
        });

        it('should correctly return the getUserTimeoutBlockExpiration block when user is timeout', () => {
            setBlockchainEnvironment(1000);

            reservation.setCreationBlock(1000);
            reservation.timeoutUser();
            expect(reservation.getUserTimeoutBlockExpiration()).toStrictEqual(
                1000 + TIMEOUT_AFTER_EXPIRATION_BLOCKS,
            );
        });

        it('should return 0 as the getUserTimeoutBlockExpiration block when user is not timeout', () => {
            setBlockchainEnvironment(1000);

            reservation.setCreationBlock(1000);

            expect(reservation.getUserTimeoutBlockExpiration()).toStrictEqual(0);
        });

        it('should correctly get/set the reserved for liquidity pool state', () => {
            setBlockchainEnvironment(1000);

            reservation.markForLiquidityPool();

            expect(reservation.isForLiquidityPool()).toBeTruthy();

            reservation.clearForLiquidityPool();

            expect(reservation.isForLiquidityPool()).toBeFalsy();
        });

        it('should correctly set the activation delay', () => {
            setBlockchainEnvironment(1000);

            reservation.setActivationDelay(1);

            expect(reservation.getActivationDelay()).toStrictEqual(1);
        });
    });

    describe('Reservation – delete()', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('delete resets arrays and reservationData', () => {
            setBlockchainEnvironment(1000);

            const reservationId: u128 = createReservationId(tokenAddress1, providerAddress1);
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

            expect(reservation.getId()).toStrictEqual(reservationId);

            reservation.setCreationBlock(1000);
            reservation.markForLiquidityPool();
            reservation.setPurgeIndex(10);
            reservation.setActivationDelay(2);
            reservation.addProvider(
                new ReservationProviderData(1, u128.fromU64(1000), ProviderTypes.Normal),
            );
            reservation.addProvider(
                new ReservationProviderData(2, u128.fromU64(2000), ProviderTypes.Priority),
            );
            reservation.addProvider(
                new ReservationProviderData(3, u128.fromU64(3000), ProviderTypes.LiquidityRemoval),
            );
            reservation.save();

            const reservation2: Reservation = Reservation.load(reservationId);

            expect(reservation2.getId()).toStrictEqual(reservationId);

            expect(reservation2.getExpirationBlock()).toStrictEqual(
                1000 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation2.isForLiquidityPool()).toBeTruthy();
            expect(reservation2.getPurgeIndex()).toStrictEqual(10);
            expect(reservation2.getActivationDelay()).toStrictEqual(2);
            expect(reservation2.getUserTimeoutBlockExpiration()).toStrictEqual(0);
            expect(reservation2.getProviderCount()).toStrictEqual(3);

            const pd1: ReservationProviderData = reservation2.getProviderAt(0);
            expect(pd1.providerIndex).toStrictEqual(1);
            expect(pd1.providedAmount).toStrictEqual(u128.fromU64(1000));
            expect(pd1.providerType).toStrictEqual(ProviderTypes.Normal);

            const pd2: ReservationProviderData = reservation2.getProviderAt(1);
            expect(pd2.providerIndex).toStrictEqual(2);
            expect(pd2.providedAmount).toStrictEqual(u128.fromU64(2000));
            expect(pd2.providerType).toStrictEqual(ProviderTypes.Priority);

            const pd3: ReservationProviderData = reservation2.getProviderAt(1);
            expect(pd3.providerIndex).toStrictEqual(3);
            expect(pd3.providedAmount).toStrictEqual(u128.fromU64(3000));
            expect(pd3.providerType).toStrictEqual(ProviderTypes.LiquidityRemoval);

            reservation2.delete(false);

            expect(reservation2.getProviderCount()).toStrictEqual(0);
            expect(reservation2.getPurgeIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(reservation2.isForLiquidityPool()).toBeFalsy();
            expect(reservation2.getExpirationBlock()).toStrictEqual(
                RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation2.getUserTimeoutBlockExpiration()).toStrictEqual(0);
            expect(reservation2.getActivationDelay()).toStrictEqual(0);

            // Ensure deleted value are persisted
            const reservation3: Reservation = Reservation.load(reservationId);

            expect(reservation3.getProviderCount()).toStrictEqual(0);
            expect(reservation3.getPurgeIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(reservation3.isForLiquidityPool()).toBeFalsy();
            expect(reservation3.getExpirationBlock()).toStrictEqual(
                RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation3.getUserTimeoutBlockExpiration()).toStrictEqual(0);
            expect(reservation3.getActivationDelay()).toStrictEqual(0);
        });
    });
});
