import { Reservation } from '../../models/Reservation';
import { CompletedTrade } from '../../models/CompletedTrade';

export interface ITradeManager {
    executeTrade(reservation: Reservation): CompletedTrade;
}
