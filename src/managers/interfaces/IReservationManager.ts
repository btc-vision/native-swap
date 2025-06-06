import { Address } from '@btc-vision/btc-runtime/runtime';
import { Reservation } from '../../models/Reservation';
import { u128 } from '@btc-vision/as-bignum/assembly';

export interface IReservationManager {
    addReservation(blockNumber: u64, reservation: Reservation): void;

    blockWithReservationsLength(): u64;

    deactivateReservation(reservation: Reservation): void;

    getReservationIdAtIndex(blockNumber: u64, index: u32): u128;

    getReservationWithExpirationChecks(owner: Address): Reservation;

    isReservationActiveAtIndex(blockNumber: u64, index: u32): boolean;

    purgeReservationsAndRestoreProviders(lastPurgedBlock: u64): u64;
}
