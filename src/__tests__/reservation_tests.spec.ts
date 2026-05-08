import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
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
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    INDEX_NOT_SET_VALUE,
    RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
    TIMEOUT_AFTER_EXPIRATION_BLOCKS,
} from '../constants/Contract';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { TickMath } from '../utils/TickMath';

/**
 * Reservation tests post-refactor.
 *   - `ReservationProviderData` now stores (providerId u256, providedAmount,
 *     tick i32, fillPrice u128, creationBlock).
 *   - No `ProviderTypes` (priority queue is gone).
 *
 * The behavioral surface (creation block, purge index, swap/purged flags,
 * activation delay, expiration timing) is unchanged.
 */

function entry(
    providerId: u64,
    amount: u64,
    tick: i32,
    creationBlock: u64,
): ReservationProviderData {
    return new ReservationProviderData(
        u256.fromU64(providerId),
        u128.fromU64(amount),
        tick,
        TickMath.tickToPrice(tick),
        creationBlock,
    );
}

describe('Reservation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('Reservation – constructor', () => {
        it('should create a new reservation and initialize correctly', () => {
            setBlockchainEnvironment(1000);

            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            const reservationId = u128.fromBytes(
                Reservation.generateId(tokenAddress1, providerAddress1),
                true,
            );

            expect(reservation.getProviderCount()).toStrictEqual(0);
            expect(reservation.getExpirationBlock()).toStrictEqual(
                RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation.getUserTimeoutBlockExpiration()).toStrictEqual(0);
            expect(reservation.getPurgeIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(reservation.getId()).toStrictEqual(reservationId);
            expect(reservation.getActivationDelay()).toStrictEqual(0);
            expect(reservation.getSwapped()).toBeFalsy();
            expect(reservation.getPurged()).toBeFalsy();
        });

        it('should return an empty reservation when loading a non-existent reservationId', () => {
            setBlockchainEnvironment(1000);

            const reservationId = createReservationId(tokenAddress1, providerAddress1);
            const reservation: Reservation = Reservation.load(reservationId);

            expect(reservation.getProviderCount()).toStrictEqual(0);
            expect(reservation.getExpirationBlock()).toStrictEqual(
                RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation.getUserTimeoutBlockExpiration()).toStrictEqual(0);
            expect(reservation.getPurgeIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(reservation.getId()).toStrictEqual(reservationId);
            expect(reservation.getActivationDelay()).toStrictEqual(0);
            expect(reservation.getSwapped()).toBeFalsy();
            expect(reservation.getPurged()).toBeFalsy();
        });

        it('correctly loads a saved reservation incl. per-provider data', () => {
            setBlockchainEnvironment(1000);

            const reservationId: u128 = createReservationId(tokenAddress1, providerAddress1);
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

            expect(reservation.getId()).toStrictEqual(reservationId);

            reservation.setCreationBlock(10);
            reservation.setPurgeIndex(20);
            reservation.setActivationDelay(2);
            reservation.timeoutUser();
            reservation.setSwapped(true);
            reservation.setPurged(true);

            const tickA: i32 = 100;
            const tickB: i32 = -250;
            reservation.addProvider(entry(1, 1000, tickA, reservation.getCreationBlock()));
            reservation.addProvider(entry(2, 2000, tickB, reservation.getCreationBlock()));

            reservation.save();

            const reservation2: Reservation = Reservation.load(reservationId);

            expect(reservation2.getId()).toStrictEqual(reservationId);
            expect(reservation2.getExpirationBlock()).toStrictEqual(
                10 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation2.getSwapped()).toBeTruthy();
            expect(reservation2.getPurged()).toBeTruthy();
            expect(reservation2.getPurgeIndex()).toStrictEqual(20);
            expect(reservation2.getActivationDelay()).toStrictEqual(2);
            expect(reservation2.getUserTimeoutBlockExpiration()).toStrictEqual(
                10 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + TIMEOUT_AFTER_EXPIRATION_BLOCKS,
            );
            expect(reservation2.getProviderCount()).toStrictEqual(2);

            const pd1: ReservationProviderData = reservation2.getProviderAt(0);
            expect<bool>(u256.eq(pd1.providerId, u256.fromU64(1))).toBe(true);
            expect(pd1.providedAmount).toStrictEqual(u128.fromU64(1000));
            expect<i32>(pd1.tick).toBe(tickA);
            expect<bool>(u128.eq(pd1.fillPrice, TickMath.tickToPrice(tickA))).toBe(true);

            const pd2: ReservationProviderData = reservation2.getProviderAt(1);
            expect<bool>(u256.eq(pd2.providerId, u256.fromU64(2))).toBe(true);
            expect(pd2.providedAmount).toStrictEqual(u128.fromU64(2000));
            expect<i32>(pd2.tick).toBe(tickB);
            expect<bool>(u128.eq(pd2.fillPrice, TickMath.tickToPrice(tickB))).toBe(true);
        });
    });

    describe('Reservation – Provider management', () => {
        it('addProvider stores and getProviderAt retrieves values', () => {
            setBlockchainEnvironment(1000);
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            reservation.setCreationBlock(1000);

            reservation.addProvider(entry(5, 99, 0, reservation.getCreationBlock()));

            const fetched: ReservationProviderData = reservation.getProviderAt(0);
            expect<bool>(u256.eq(fetched.providerId, u256.fromU64(5))).toBe(true);
            expect(fetched.providedAmount).toStrictEqual(u128.fromU64(99));
            expect<i32>(fetched.tick).toBe(0);
            expect<u64>(fetched.creationBlock).toBe(1000);
        });

        it('save/load round-trips entry data', () => {
            setBlockchainEnvironment(1000);
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            reservation.setCreationBlock(1000);

            reservation.addProvider(entry(5, 99, 42, reservation.getCreationBlock()));
            reservation.save();

            const reservation2 = new Reservation(tokenAddress1, providerAddress1);
            const fetched: ReservationProviderData = reservation2.getProviderAt(0);
            expect<bool>(u256.eq(fetched.providerId, u256.fromU64(5))).toBe(true);
            expect(fetched.providedAmount).toStrictEqual(u128.fromU64(99));
            expect<i32>(fetched.tick).toBe(42);
            expect<u64>(fetched.creationBlock).toBe(1000);
        });
    });

    describe('Reservation – ensureCanBeConsumed timing rules', () => {
        it('throws if consumed in same block when activationDelay=0', () => {
            expect(() => {
                const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
                reservation.addProvider(entry(0, 1000, 0, 1000));

                setBlockchainEnvironment(1000);

                reservation.setCreationBlock(Blockchain.block.number);
                reservation.ensureCanBeConsumed();
            }).toThrow();
        });

        it('throws if activationDelay not elapsed', () => {
            expect(() => {
                const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
                reservation.addProvider(entry(0, 1000, 0, 1000));

                setBlockchainEnvironment(1000);
                reservation.setActivationDelay(3);
                reservation.setCreationBlock(Blockchain.block.number);
                setBlockchainEnvironment(1002);

                reservation.ensureCanBeConsumed();
            }).toThrow();
        });

        it('throws if not valid', () => {
            expect(() => {
                setBlockchainEnvironment(999);
                const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
                reservation.setCreationBlock(999);
                setBlockchainEnvironment(1000);
                reservation.ensureCanBeConsumed();
            }).toThrow();
        });

        it('passes when activationDelay elapsed', () => {
            expect(() => {
                const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
                reservation.addProvider(entry(0, 1000, 0, 1000));

                setBlockchainEnvironment(1000);
                reservation.setActivationDelay(2);
                reservation.setCreationBlock(Blockchain.block.number);
                setBlockchainEnvironment(1003);

                reservation.ensureCanBeConsumed();
            }).not.toThrow();
        });
    });

    describe('Reservation – expiration & validity', () => {
        it('isExpired false before expiration block', () => {
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            reservation.addProvider(entry(0, 1000, 0, 1000));

            setBlockchainEnvironment(1000);
            reservation.setCreationBlock(Blockchain.block.number);
            expect(reservation.isExpired()).toBeFalsy();
        });

        it('isExpired true after expiration block', () => {
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            reservation.addProvider(entry(0, 1000, 0, 1000));

            setBlockchainEnvironment(1000);
            reservation.setCreationBlock(Blockchain.block.number);

            setBlockchainEnvironment(1000 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + 1);
            expect(reservation.isExpired()).toBeTruthy();
        });

        it('isValid false when expired', () => {
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            reservation.addProvider(entry(0, 1000, 0, 1000));

            setBlockchainEnvironment(1000);
            reservation.setCreationBlock(Blockchain.block.number);

            setBlockchainEnvironment(1000 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + 1);
            expect(reservation.isValid()).toBeFalsy();
        });

        it('isValid false on a fresh reservation with no providers', () => {
            const reservation: Reservation = new Reservation(tokenAddress2, providerAddress2);
            expect(reservation.isValid()).toBeFalsy();
        });
    });

    describe('Reservation – getters/setters', () => {
        it('creation/expiration block round-trip', () => {
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

            setBlockchainEnvironment(1000);
            reservation.setCreationBlock(1000);

            expect(reservation.getCreationBlock()).toStrictEqual(1000);
            expect(reservation.getExpirationBlock()).toStrictEqual(
                1000 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
        });

        it('purge index getter/setter', () => {
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            setBlockchainEnvironment(1);
            reservation.setPurgeIndex(10);
            expect(reservation.getPurgeIndex()).toStrictEqual(10);
        });

        it('swapped flag toggles', () => {
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            setBlockchainEnvironment(1);
            reservation.setSwapped(true);
            expect(reservation.getSwapped()).toBeTruthy();
            reservation.setSwapped(false);
            expect(reservation.getSwapped()).toBeFalsy();
        });

        it('purged flag toggles', () => {
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            setBlockchainEnvironment(1);
            reservation.setPurged(true);
            expect(reservation.getPurged()).toBeTruthy();
            reservation.setPurged(false);
            expect(reservation.getPurged()).toBeFalsy();
        });

        it('user timeout block expiration when timeoutUser called', () => {
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            setBlockchainEnvironment(1000);
            reservation.setCreationBlock(1000);
            reservation.timeoutUser();
            expect(reservation.getUserTimeoutBlockExpiration()).toStrictEqual(
                1000 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + TIMEOUT_AFTER_EXPIRATION_BLOCKS,
            );
        });

        it('user timeout returns 0 when not in timeout', () => {
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            setBlockchainEnvironment(1000);
            reservation.setCreationBlock(1000);
            expect(reservation.getUserTimeoutBlockExpiration()).toStrictEqual(0);
        });

        it('activationDelay round-trip', () => {
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            setBlockchainEnvironment(1000);
            reservation.setActivationDelay(1);
            expect(reservation.getActivationDelay()).toStrictEqual(1);
        });

        it('isDirty becomes true after addProvider', () => {
            setBlockchainEnvironment(1000);
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
            expect(reservation.isDirty()).toBeFalsy();
            reservation.addProvider(entry(0, 1000, 0, 1000));
            expect(reservation.isDirty()).toBeTruthy();
        });
    });

    describe('Reservation – delete()', () => {
        it('delete resets arrays and reservationData (preserves swapped flag)', () => {
            setBlockchainEnvironment(1000);

            const reservationId: u128 = createReservationId(tokenAddress1, providerAddress1);
            const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

            expect(reservation.getId()).toStrictEqual(reservationId);

            reservation.setCreationBlock(1000);
            reservation.setPurgeIndex(10);
            reservation.setActivationDelay(2);
            reservation.setSwapped(true);
            reservation.setPurged(true);

            const tickA: i32 = 0;
            const tickB: i32 = 75;
            reservation.addProvider(entry(1, 1000, tickA, 1000));
            reservation.addProvider(entry(2, 2000, tickB, 1000));
            reservation.save();

            const reservation2: Reservation = Reservation.load(reservationId);

            expect(reservation2.getId()).toStrictEqual(reservationId);
            expect(reservation2.getExpirationBlock()).toStrictEqual(
                1000 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation2.getPurgeIndex()).toStrictEqual(10);
            expect(reservation2.getActivationDelay()).toStrictEqual(2);
            expect(reservation2.getUserTimeoutBlockExpiration()).toStrictEqual(0);
            expect(reservation2.getProviderCount()).toStrictEqual(2);
            expect(reservation2.getPurged()).toBeTruthy();

            const pd1: ReservationProviderData = reservation2.getProviderAt(0);
            expect<bool>(u256.eq(pd1.providerId, u256.fromU64(1))).toBe(true);
            expect(pd1.providedAmount).toStrictEqual(u128.fromU64(1000));
            expect<i32>(pd1.tick).toBe(tickA);
            expect<u64>(pd1.creationBlock).toBe(1000);

            const pd2: ReservationProviderData = reservation2.getProviderAt(1);
            expect<bool>(u256.eq(pd2.providerId, u256.fromU64(2))).toBe(true);
            expect(pd2.providedAmount).toStrictEqual(u128.fromU64(2000));
            expect<i32>(pd2.tick).toBe(tickB);
            expect<u64>(pd2.creationBlock).toBe(1000);

            reservation2.delete(false);

            // swapped is intentionally not reset on delete
            expect(reservation2.getSwapped()).toBeTruthy();
            expect(reservation2.getPurged()).toBeFalsy();
            expect(reservation2.getProviderCount()).toStrictEqual(0);
            expect(reservation2.getPurgeIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(reservation2.getExpirationBlock()).toStrictEqual(
                RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation2.getUserTimeoutBlockExpiration()).toStrictEqual(0);
            expect(reservation2.getActivationDelay()).toStrictEqual(0);

            const reservation3: Reservation = Reservation.load(reservationId);
            expect(reservation3.getProviderCount()).toStrictEqual(0);
            expect(reservation3.getPurgeIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(reservation3.getExpirationBlock()).toStrictEqual(
                RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
            );
            expect(reservation3.getUserTimeoutBlockExpiration()).toStrictEqual(0);
            expect(reservation3.getActivationDelay()).toStrictEqual(0);
            expect(reservation3.getPurged()).toBeFalsy();
        });
    });
});
