import { Address } from '@btc-vision/btc-runtime/runtime';
import { Reservation } from '../../models/Reservation';
import { u128 } from '@btc-vision/as-bignum/assembly';

/**
 * Tracks active reservations across blocks. Provides the gas-bounded incremental purge
 * mechanism (`purgeReservationsAndRestoreProviders`) that walks expired reservations
 * and pushes their providers to per-tick purged sub-queues via `TickBitmapManager`.
 */
export interface IReservationManager {
    addReservation(blockNumber: u64, reservation: Reservation): void;
    blockWithReservationsLength(): u32;
    deactivateReservation(reservation: Reservation): void;
    getReservationIdAtIndex(blockNumber: u64, index: u32): u128;
    getReservationWithExpirationChecks(owner: Address): Reservation;
    isReservationActiveAtIndex(blockNumber: u64, index: u32): boolean;

    /**
     * Incrementally purge reservations that expired more than RESERVATION_EXPIRE_AFTER_IN_BLOCKS
     * blocks ago. Returns the new `lastPurgedBlock` cursor. No more `quote` arg — settlement
     * uses each entry's frozen `fillPrice`.
     */
    purgeReservationsAndRestoreProviders(lastPurgedBlock: u64): u64;
}
