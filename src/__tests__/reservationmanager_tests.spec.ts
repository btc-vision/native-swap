import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProvider,
    createReservation,
    ownerAddress1,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';
import { ProviderTypes } from '../types/ProviderTypes';
import { PurgedResult } from '../managers/ReservationManager';

describe('Reservation manager tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('Reservation manager - purgedResult', () => {
        it('should create a new PurgedResult and initialize correctly', () => {
            const result: PurgedResult = new PurgedResult(u256.fromU64(1000), 99, true);

            expect(result.finished).toBeTruthy();
            expect(result.freed).toStrictEqual(u256.fromU64(1000));
            expect(result.providersPurged).toStrictEqual(99);
        });
    });

    describe('Reservation manager - addReservation', () => {
        it('adds a reservation, push block and returns index', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;

            const reservationList = manager.callgetReservationListForBlock(100);
            const activeReservationList = manager.callgetActiveListForBlock(100);

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

            const reservationList2 = manager2.callgetReservationListForBlock(100);
            const activeReservationList2 = manager2.callgetActiveListForBlock(100);

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

            const reservationList = manager.callgetReservationListForBlock(100);
            const activeReservationList = manager.callgetActiveListForBlock(100);

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

            const reservationList2 = manager2.callgetReservationListForBlock(100);
            const activeReservationList2 = manager2.callgetActiveListForBlock(100);

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

                const reservationList = manager.callgetReservationListForBlock(100);
                const activeReservationList = manager.callgetActiveListForBlock(100);

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

    describe('Reservation manager - blockWithReservationsLength', () => {
        it('adds reservations and gets correct number of blocks with reservations', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;
            const reservation = createReservation(tokenAddress1, providerAddress1);
            manager.addReservation(100, reservation);

            createLiquidityQueueResult.liquidityQueue.save();

            setBlockchainEnvironment(102);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;
            const reservation2 = createReservation(tokenAddress1, providerAddress2);
            manager2.addReservation(102, reservation2);

            createLiquidityQueueResult2.liquidityQueue.save();

            const nbBlocks = manager2.blockWithReservationsLength();

            expect(nbBlocks).toStrictEqual(2);
        });
    });

    describe('Reservation manager - deactivateReservation', () => {
        it('adds an active reservation and deactivate it', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;
            const reservation = createReservation(tokenAddress1, providerAddress1);
            manager.addReservation(100, reservation);

            setBlockchainEnvironment(101);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;
            const reservation2 = createReservation(tokenAddress1, providerAddress2);
            manager2.addReservation(101, reservation2);

            setBlockchainEnvironment(102);

            const createLiquidityQueueResult3 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager3 = createLiquidityQueueResult3.reservationManager;
            const activeReservationList = manager3.callgetActiveListForBlock(100);
            expect(activeReservationList.get(reservation.getPurgeIndex())).toBeTruthy();
            manager3.deactivateReservation(reservation);
            expect(activeReservationList.get(reservation.getPurgeIndex())).toBeFalsy();
        });
    });

    describe('Reservation manager - getReservationWithExpirationChecks', () => {
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

    describe('Reservation manager - getReservationIdAtIndex', () => {
        it('should returns a valid reservation index', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;
            const reservation = createReservation(tokenAddress1, ownerAddress1);
            manager.addReservation(100, reservation);

            setBlockchainEnvironment(101);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;
            const result = manager2.getReservationIdAtIndex(100, reservation.getPurgeIndex());

            expect(result).toStrictEqual(reservation.getId());
        });

        it('should returns 0 when reservation does not exists', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;
            const reservation = createReservation(tokenAddress1, ownerAddress1);
            manager.addReservation(100, reservation);

            setBlockchainEnvironment(101);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;
            const result = manager2.getReservationIdAtIndex(100, 10);

            expect(result).toStrictEqual(u128.Zero);
        });
    });

    describe('Reservation manager - isReservationActiveAtIndex', () => {
        it('checks if a reservation is active at a given index', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;
            const reservation = createReservation(tokenAddress1, providerAddress1);
            manager.addReservation(100, reservation);

            setBlockchainEnvironment(101);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;
            const active = manager2.isReservationActiveAtIndex(100, reservation.getPurgeIndex());
            expect(active).toBeTruthy();
        });

        it('checks if a reservation is inactive at a given index', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;
            const reservation = createReservation(tokenAddress1, providerAddress1);
            manager.addReservation(100, reservation);
            manager.deactivateReservation(reservation);

            setBlockchainEnvironment(101);

            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager2 = createLiquidityQueueResult2.reservationManager;
            const active = manager2.isReservationActiveAtIndex(100, reservation.getPurgeIndex());
            expect(active).toBeFalsy();
        });
    });

    describe('Reservation manager - purgeReservationsAndRestoreProviders', () => {
        it('it should returns early if not enough blocks passed', () => {
            setBlockchainEnvironment(4);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const quote = createLiquidityQueueResult.quoteManager.getBlockQuote(
                Blockchain.block.number,
            );
            const manager = createLiquidityQueueResult.reservationManager;
            const result = manager.purgeReservationsAndRestoreProviders(0, quote);

            expect(result).toStrictEqual(0);
        });

        it('it should returns early if no block with reservation', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const quote = createLiquidityQueueResult.quoteManager.getBlockQuote(
                Blockchain.block.number,
            );
            const manager = createLiquidityQueueResult.reservationManager;
            const result = manager.purgeReservationsAndRestoreProviders(0, quote);

            expect(result).toStrictEqual(95);
        });

        it('restores current index if no new blocks', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const quote = createLiquidityQueueResult.quoteManager.getBlockQuote(
                Blockchain.block.number,
            );
            const manager = createLiquidityQueueResult.reservationManager;
            const result = manager.purgeReservationsAndRestoreProviders(96, quote);

            expect(result).toStrictEqual(96);
        });

        it('should stop purging when maximum number of providers to purge is reached', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            createLiquidityQueueResult.liquidityQueue.increaseTotalReserve(u256.fromU64(400000));
            createLiquidityQueueResult.liquidityQueue.increaseTotalReserved(u256.fromU64(400000));
            createLiquidityQueueResult.quoteManager.setBlockQuote(100, u256.fromU64(666666666));

            const provider1 = createProvider(providerAddress1, tokenAddress1);
            provider1.setLiquidityAmount(u128.fromU64(150000));

            const provider2 = createProvider(providerAddress1, tokenAddress1);
            provider2.setLiquidityAmount(u128.fromU64(250000));

            const providerManager = createLiquidityQueueResult.providerManager;

            provider1.addToReservedAmount(u128.fromU64(150000));
            providerManager.addToNormalQueue(provider1);

            provider2.addToReservedAmount(u128.fromU64(250000));
            providerManager.addToNormalQueue(provider2);

            const reservationManager = createLiquidityQueueResult.reservationManager;
            reservationManager.setAtLeastProvidersToPurge(2);

            const reservation1 = createReservation(tokenAddress1, providerAddress1);
            reservation1.addProvider(
                new ReservationProviderData(
                    provider1.getQueueIndex(),
                    u128.fromU64(150000),
                    ProviderTypes.Normal,
                    100,
                ),
            );
            reservationManager.addReservation(100, reservation1);
            reservation1.save();

            const reservation2 = createReservation(tokenAddress1, providerAddress2);
            reservation2.addProvider(
                new ReservationProviderData(
                    provider2.getQueueIndex(),
                    u128.fromU64(100000),
                    ProviderTypes.Normal,
                    100,
                ),
            );
            reservationManager.addReservation(100, reservation2);
            reservation2.save();

            const reservation3 = createReservation(tokenAddress1, providerAddress3);
            reservation3.addProvider(
                new ReservationProviderData(
                    provider2.getQueueIndex(),
                    u128.fromU64(150000),
                    ProviderTypes.Normal,
                    100,
                ),
            );
            reservationManager.addReservation(100, reservation3);
            reservation3.save();

            createLiquidityQueueResult.liquidityQueue.save();

            setBlockchainEnvironment(106);
            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const quote = createLiquidityQueueResult.quoteManager.getBlockQuote(
                Blockchain.block.number,
            );
            const manager2 = createLiquidityQueueResult2.reservationManager;
            manager2.setAtLeastProvidersToPurge(2);
            manager2.purgeReservationsAndRestoreProviders(100, quote);

            expect(createLiquidityQueueResult.liquidityQueue.reservedLiquidity).toStrictEqual(
                u256.fromU64(150000),
            );
        });

        it('should remove block from blocksWithReservations when all providers are purged', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            createLiquidityQueueResult.liquidityQueue.increaseTotalReserve(u256.fromU64(400000));
            createLiquidityQueueResult.liquidityQueue.increaseTotalReserved(u256.fromU64(400000));
            createLiquidityQueueResult.quoteManager.setBlockQuote(100, u256.fromU64(666666666));

            const provider1 = createProvider(providerAddress1, tokenAddress1);
            provider1.setLiquidityAmount(u128.fromU64(150000));

            const provider2 = createProvider(providerAddress1, tokenAddress1);
            provider2.setLiquidityAmount(u128.fromU64(250000));

            const providerManager = createLiquidityQueueResult.providerManager;

            provider1.addToReservedAmount(u128.fromU64(150000));
            providerManager.addToNormalQueue(provider1);

            provider2.addToReservedAmount(u128.fromU64(250000));
            providerManager.addToNormalQueue(provider2);

            const reservationManager = createLiquidityQueueResult.reservationManager;

            const reservation1 = createReservation(tokenAddress1, providerAddress1);
            reservation1.addProvider(
                new ReservationProviderData(
                    provider1.getQueueIndex(),
                    u128.fromU64(150000),
                    ProviderTypes.Normal,
                    100,
                ),
            );
            reservationManager.addReservation(100, reservation1);
            reservation1.save();

            const reservation2 = createReservation(tokenAddress1, providerAddress2);
            reservation2.addProvider(
                new ReservationProviderData(
                    provider2.getQueueIndex(),
                    u128.fromU64(100000),
                    ProviderTypes.Normal,
                    100,
                ),
            );
            reservationManager.addReservation(100, reservation2);
            reservation2.save();

            const reservation3 = createReservation(tokenAddress1, providerAddress3);
            reservation3.addProvider(
                new ReservationProviderData(
                    provider2.getQueueIndex(),
                    u128.fromU64(150000),
                    ProviderTypes.Normal,
                    100,
                ),
            );
            reservationManager.addReservation(100, reservation3);
            reservation3.save();

            createLiquidityQueueResult.liquidityQueue.save();

            setBlockchainEnvironment(106);
            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const quote = createLiquidityQueueResult.quoteManager.getBlockQuote(
                Blockchain.block.number,
            );
            const manager2 = createLiquidityQueueResult2.reservationManager;
            manager2.purgeReservationsAndRestoreProviders(100, quote);

            expect(createLiquidityQueueResult.liquidityQueue.reservedLiquidity).toStrictEqual(
                u256.fromU64(0),
            );

            expect(manager2.blockWithReservationsLength()).toStrictEqual(0);
        });

        it('should stop purging if the block being purged >= maximum block to purge', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const reservationManager = createLiquidityQueueResult.reservationManager;
            const reservation1 = createReservation(tokenAddress1, providerAddress1);
            reservationManager.addReservation(110, reservation1);
            reservation1.save();

            createLiquidityQueueResult.liquidityQueue.save();

            setBlockchainEnvironment(106);
            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const quote = createLiquidityQueueResult.quoteManager.getBlockQuote(
                Blockchain.block.number,
            );
            const manager2 = createLiquidityQueueResult2.reservationManager;
            const lastPurgedBlock = manager2.purgeReservationsAndRestoreProviders(100, quote);

            expect(lastPurgedBlock).toStrictEqual(100);
        });

        it('should revert if reservation is still active', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const createLiquidityQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                createLiquidityQueueResult.liquidityQueue.increaseTotalReserve(
                    u256.fromU64(400000),
                );
                createLiquidityQueueResult.liquidityQueue.increaseTotalReserved(
                    u256.fromU64(400000),
                );
                createLiquidityQueueResult.quoteManager.setBlockQuote(100, u256.fromU64(666666666));

                const provider1 = createProvider(providerAddress1, tokenAddress1);
                provider1.setLiquidityAmount(u128.fromU64(150000));

                const providerManager = createLiquidityQueueResult.providerManager;

                provider1.addToReservedAmount(u128.fromU64(150000));
                providerManager.addToNormalQueue(provider1);

                const reservationManager = createLiquidityQueueResult.reservationManager;

                const reservation1 = createReservation(tokenAddress1, providerAddress1);
                reservation1.setCreationBlock(110);
                reservation1.addProvider(
                    new ReservationProviderData(
                        provider1.getQueueIndex(),
                        u128.fromU64(150000),
                        ProviderTypes.Normal,
                        110,
                    ),
                );
                reservationManager.addReservation(100, reservation1);
                reservation1.save();

                createLiquidityQueueResult.liquidityQueue.save();

                setBlockchainEnvironment(106);
                const createLiquidityQueueResult2 = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const quote = createLiquidityQueueResult.quoteManager.getBlockQuote(
                    Blockchain.block.number,
                );
                const manager2 = createLiquidityQueueResult2.reservationManager;
                manager2.purgeReservationsAndRestoreProviders(100, quote);
            }).toThrow();
        });

        it('should revert if reservation purge index does not match', () => {
            expect(() => {
                setBlockchainEnvironment(100);

                const createLiquidityQueueResult = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                createLiquidityQueueResult.liquidityQueue.increaseTotalReserve(
                    u256.fromU64(400000),
                );
                createLiquidityQueueResult.liquidityQueue.increaseTotalReserved(
                    u256.fromU64(400000),
                );
                createLiquidityQueueResult.quoteManager.setBlockQuote(100, u256.fromU64(666666666));

                const provider1 = createProvider(providerAddress1, tokenAddress1);
                provider1.setLiquidityAmount(u128.fromU64(150000));

                const providerManager = createLiquidityQueueResult.providerManager;

                provider1.addToReservedAmount(u128.fromU64(150000));
                providerManager.addToNormalQueue(provider1);

                const reservationManager = createLiquidityQueueResult.reservationManager;

                const reservation1 = createReservation(tokenAddress1, providerAddress1);
                reservation1.setCreationBlock(100);
                reservation1.addProvider(
                    new ReservationProviderData(
                        provider1.getQueueIndex(),
                        u128.fromU64(150000),
                        ProviderTypes.Normal,
                        100,
                    ),
                );
                reservationManager.addReservation(100, reservation1);
                reservation1.setPurgeIndex(10);
                reservation1.save();

                createLiquidityQueueResult.liquidityQueue.save();

                setBlockchainEnvironment(106);
                const createLiquidityQueueResult2 = createLiquidityQueue(
                    tokenAddress1,
                    tokenIdUint8Array1,
                    false,
                );

                const quote = createLiquidityQueueResult.quoteManager.getBlockQuote(
                    Blockchain.block.number,
                );
                const manager2 = createLiquidityQueueResult2.reservationManager;
                manager2.purgeReservationsAndRestoreProviders(100, quote);
            }).toThrow();
        });

        it('should return next block from the list as the new last purged block', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            createLiquidityQueueResult.liquidityQueue.increaseTotalReserve(u256.fromU64(400000));
            createLiquidityQueueResult.liquidityQueue.increaseTotalReserved(u256.fromU64(400000));
            createLiquidityQueueResult.quoteManager.setBlockQuote(100, u256.fromU64(666666666));

            const provider1 = createProvider(providerAddress1, tokenAddress1);
            provider1.setLiquidityAmount(u128.fromU64(150000));

            const provider2 = createProvider(providerAddress1, tokenAddress1);
            provider2.setLiquidityAmount(u128.fromU64(250000));

            const providerManager = createLiquidityQueueResult.providerManager;

            provider1.addToReservedAmount(u128.fromU64(150000));
            providerManager.addToNormalQueue(provider1);
            provider1.save();

            provider2.addToReservedAmount(u128.fromU64(250000));
            providerManager.addToNormalQueue(provider2);
            provider2.save();

            const reservationManager = createLiquidityQueueResult.reservationManager;

            const reservation1 = createReservation(tokenAddress1, providerAddress1);
            reservation1.addProvider(
                new ReservationProviderData(
                    provider1.getQueueIndex(),
                    u128.fromU64(150000),
                    ProviderTypes.Normal,
                    100,
                ),
            );
            reservationManager.addReservation(100, reservation1);
            reservation1.save();

            createLiquidityQueueResult.liquidityQueue.save();

            setBlockchainEnvironment(102);
            const createLiquidityQueueResult2 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const reservationManager2 = createLiquidityQueueResult2.reservationManager;

            const reservation2 = createReservation(tokenAddress1, providerAddress2);
            reservation2.addProvider(
                new ReservationProviderData(
                    provider2.getQueueIndex(),
                    u128.fromU64(100000),
                    ProviderTypes.Normal,
                    101,
                ),
            );
            reservationManager2.addReservation(102, reservation2);
            reservation2.save();
            createLiquidityQueueResult2.liquidityQueue.save();

            setBlockchainEnvironment(106);
            const createLiquidityQueueResult3 = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const quote = createLiquidityQueueResult.quoteManager.getBlockQuote(
                Blockchain.block.number,
            );
            const reservationManager3 = createLiquidityQueueResult3.reservationManager;
            const newLastExpirationBlock = reservationManager3.purgeReservationsAndRestoreProviders(
                100,
                quote,
            );

            expect(reservationManager3.blockWithReservationsLength()).toStrictEqual(1);
            expect(newLastExpirationBlock).toStrictEqual(101);
        });
    });

    describe('Reservation manager - get lists', () => {
        it('should gets the reservation list', () => {
            setBlockchainEnvironment(100);

            const createLiquidityQueueResult = createLiquidityQueue(
                tokenAddress1,
                tokenIdUint8Array1,
                false,
            );

            const manager = createLiquidityQueueResult.reservationManager;

            const reservationList = manager.callgetReservationListForBlock(100);

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

            const reservationList2 = manager2.callgetReservationListForBlock(100);

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

            const activeReservationList = manager.callgetActiveListForBlock(100);

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

            const activeReservationList2 = manager2.callgetActiveListForBlock(100);

            expect(activeReservationList2).not.toBeNull();
            expect(activeReservationList2.getLength()).toStrictEqual(1);
        });
    });
});
