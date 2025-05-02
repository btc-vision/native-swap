import { Address } from '@btc-vision/btc-runtime/runtime';
import { Reservation } from '../../models/Reservation';
import { u128 } from '@btc-vision/as-bignum';

export interface IReservationManager {
    getReservationWithExpirationChecks(sender: Address): Reservation;

    addActiveReservation(blockNumber: u64, reservationId: u128): u64;

    purgeReservationsAndRestoreProviders(lastPurgedBlock: u64): u64;
}
