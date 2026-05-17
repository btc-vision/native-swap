import { Reservation } from '../../models/Reservation';
import { CompletedTrade } from '../../models/CompletedTrade';

/**
 * Settles a reservation. With per-entry frozen `fillPrice`, expired vs not-expired
 * paths share the same math — the distinction collapses to "is this still a valid
 * reservation that can be consumed?" guarded by the caller.
 */
export interface ITradeManager {
    executeTrade(reservation: Reservation): CompletedTrade;
}
