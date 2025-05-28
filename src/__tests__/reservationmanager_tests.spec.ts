import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createReservation,
    ownerAddress1,
    providerAddress1,
    providerAddress2,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128 } from '@btc-vision/as-bignum/assembly';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';
import { ProviderTypes } from '../types/ProviderTypes';

describe('Reservation manager tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('addReservation', () => {
        it('adds a reservation, push block and returns index', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;

            const reservationList = manager.getReservationListForBlock(100);
            const activeReservationList = manager.getActiveListForBlock(100);

            expect(reservationList.getLength()).toStrictEqual(0);
            expect(activeReservationList.getLength()).toStrictEqual(0);
            expect(manager.lastBlockReservation()).toStrictEqual(u64.MAX_VALUE);

            const reservation = createReservation(tokenAddress1, providerAddress1);
            manager.addReservation(100, reservation);

            setBlockchainEnvironment(101);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;

            const reservationList2 = manager2.getReservationListForBlock(100);
            const activeReservationList2 = manager2.getActiveListForBlock(100);

            expect(reservationList2.getLength()).toStrictEqual(1);
            expect(activeReservationList2.getLength()).toStrictEqual(1);
            expect(manager2.lastBlockReservation()).toStrictEqual(100);
        });

        it('adds a reservation, do not push block and returns index', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;

            const reservationList = manager.getReservationListForBlock(100);
            const activeReservationList = manager.getActiveListForBlock(100);

            expect(reservationList.getLength()).toStrictEqual(0);
            expect(activeReservationList.getLength()).toStrictEqual(0);
            expect(manager.lastBlockReservation()).toStrictEqual(u64.MAX_VALUE);

            const reservation = createReservation(tokenAddress1, providerAddress1);
            manager.addReservation(100, reservation);

            expect(manager.lastBlockReservation()).toStrictEqual(100);

            const reservation2 = createReservation(tokenAddress1, providerAddress2);
            manager.addReservation(100, reservation2);

            expect(manager.lastBlockReservation()).toStrictEqual(100);

            setBlockchainEnvironment(101);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;

            const reservationList2 = manager2.getReservationListForBlock(100);
            const activeReservationList2 = manager2.getActiveListForBlock(100);

            expect(reservationList2.getLength()).toStrictEqual(2);
            expect(activeReservationList2.getLength()).toStrictEqual(2);
            expect(manager2.lastBlockReservation()).toStrictEqual(100);
        });

        it('throws if reservation and active indices mismatch', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const createLiquidityQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const manager = createLiquidityQueueResult.reservationManager;

                const reservationList = manager.getReservationListForBlock(100);
                const activeReservationList = manager.getActiveListForBlock(100);

                expect(reservationList.getLength()).toStrictEqual(0);
                expect(activeReservationList.getLength()).toStrictEqual(0);
                expect(manager.lastBlockReservation()).toStrictEqual(u64.MAX_VALUE);

                manager.mockAddToListReturn(100);
                manager.mockAddToActiveListReturn(200);
                const reservation = createReservation(tokenAddress1, providerAddress1);
                manager.addReservation(100, reservation);
            }).toThrow();
        });
    });

    describe('getReservationWithExpirationChecks', () => {
        it('should returns a reservation when valid', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;

            const reservation = createReservation(tokenAddress1, ownerAddress1);
            reservation.setActivationDelay(0);
            reservation.addProvider(
                new ReservationProviderData(
                    INITIAL_LIQUIDITY_PROVIDER_INDEX,
                    u128.fromU32(1000),
                    ProviderTypes.Normal,
                    reservation.getCreationBlock(),
                ),
            );
            reservation.save();
            manager.addReservation(100, reservation);

            setBlockchainEnvironment(101);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;

            const result = manager2.getReservationWithExpirationChecks(ownerAddress1);

            expect(result).not.toBeNull();
        });

        it('should revert when reservation is invalid', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const createLiquidityQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const manager = createLiquidityQueueResult.reservationManager;

                const reservation = createReservation(tokenAddress1, ownerAddress1);
                reservation.setActivationDelay(0);
                reservation.save();
                manager.addReservation(100, reservation);

                setBlockchainEnvironment(101);

                const createLiquidityQueueResult2 = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const manager2 = createLiquidityQueueResult2.reservationManager;

                manager2.getReservationWithExpirationChecks(ownerAddress1);
            }).toThrow();
        });

        it('should revert when reservation is consumed within the creation block', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const createLiquidityQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const manager = createLiquidityQueueResult.reservationManager;

                const reservation = createReservation(tokenAddress1, ownerAddress1);
                reservation.setActivationDelay(0);
                reservation.addProvider(
                    new ReservationProviderData(
                        INITIAL_LIQUIDITY_PROVIDER_INDEX,
                        u128.fromU32(1000),
                        ProviderTypes.Normal,
                        reservation.getCreationBlock(),
                    ),
                );
                reservation.save();
                manager.addReservation(100, reservation);

                const createLiquidityQueueResult2 = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const manager2 = createLiquidityQueueResult2.reservationManager;

                manager2.getReservationWithExpirationChecks(ownerAddress1);
            }).toThrow();
        });

        it('should revert when reservation is consumed before activation delay is reached', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const createLiquidityQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const manager = createLiquidityQueueResult.reservationManager;

                const reservation = createReservation(tokenAddress1, ownerAddress1);
                reservation.setActivationDelay(2);
                reservation.addProvider(
                    new ReservationProviderData(
                        INITIAL_LIQUIDITY_PROVIDER_INDEX,
                        u128.fromU32(1000),
                        ProviderTypes.Normal,
                        reservation.getCreationBlock(),
                    ),
                );
                reservation.save();
                manager.addReservation(100, reservation);

                setBlockchainEnvironment(101);
                const createLiquidityQueueResult2 = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const manager2 = createLiquidityQueueResult2.reservationManager;

                manager2.getReservationWithExpirationChecks(ownerAddress1);
            }).toThrow();
        });
    });

    describe('purgeReservationsAndRestoreProviders', () => {
        it('it should returns early if not enough blocks passed', () => {
            setBlockchainEnvironment(4);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;
            const result = manager.purgeReservationsAndRestoreProviders(0);

            expect(result).toStrictEqual(0);
        });

        it('restores current index if no new blocks', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;
            const result = manager.purgeReservationsAndRestoreProviders(96);

            expect(result).toStrictEqual(96);
        });

        it('purges and subtracts when freed', () => {});
    });

    describe('get lists', () => {
        it('should gets the reservation list', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;

            const reservationList = manager.getReservationListForBlock(100);

            expect(reservationList.getLength()).toStrictEqual(0);
            expect(manager.lastBlockReservation()).toStrictEqual(u64.MAX_VALUE);

            const reservation = createReservation(tokenAddress1, providerAddress1);
            manager.addReservation(100, reservation);

            setBlockchainEnvironment(101);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;

            const reservationList2 = manager2.getReservationListForBlock(100);

            expect(reservationList2).not.toBeNull();
            expect(reservationList2.getLength()).toStrictEqual(1);
        });

        it('should gets the active reservation list', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;

            const activeReservationList = manager.getActiveListForBlock(100);

            expect(activeReservationList.getLength()).toStrictEqual(0);
            expect(manager.lastBlockReservation()).toStrictEqual(u64.MAX_VALUE);

            const reservation = createReservation(tokenAddress1, providerAddress1);
            manager.addReservation(100, reservation);

            setBlockchainEnvironment(101);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;

            const activeReservationList2 = manager2.getActiveListForBlock(100);

            expect(activeReservationList2).not.toBeNull();
            expect(activeReservationList2.getLength()).toStrictEqual(1);
        });
    });
});
