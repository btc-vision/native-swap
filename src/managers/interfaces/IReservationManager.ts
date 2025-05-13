import { Address, StoredBooleanArray, StoredU128Array } from '@btc-vision/btc-runtime/runtime';
import { Reservation } from '../../models/Reservation';
import { u128 } from '@btc-vision/as-bignum/assembly';

export interface IReservationManager {
    getReservationWithExpirationChecks(sender: Address): Reservation;

    addActiveReservation(blockNumber: u64, reservationId: u128): u32;

    purgeReservationsAndRestoreProviders(lastPurgedBlock: u64): u64;

    getActiveReservationListForBlock(blockNumber: u64): StoredBooleanArray;

    getReservationListForBlock(blockNumber: u64): StoredU128Array;
}
