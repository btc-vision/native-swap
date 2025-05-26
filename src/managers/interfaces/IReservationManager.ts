import { Address, StoredBooleanArray, StoredU128Array } from '@btc-vision/btc-runtime/runtime';
import { Reservation } from '../../models/Reservation';
import { u128 } from '@btc-vision/as-bignum/assembly';

export interface IReservationManager {
    addActiveReservation(blockNumber: u64, reservationId: u128): u32;

    purgeReservationsAndRestoreProviders(lastPurgedBlock: u64): u64;

    getActiveReservationListForBlock(blockNumber: u64): StoredBooleanArray;

    getReservationListForBlock(blockNumber: u64): StoredU128Array;

    getReservationIdAtIndex(blockNumber: u64, index: u32): u128;

    getReservationActiveAtIndex(blockNumber: u64, index: u32): boolean;

    getReservationWithExpirationChecks(sender: Address): Reservation;
}
