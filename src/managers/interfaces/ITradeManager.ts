import { Reservation } from '../../models/Reservation';
import { CompletedTrade } from '../../models/CompletedTrade';
import { u256 } from '@btc-vision/as-bignum/assembly';

export interface ITradeManager {
    executeTradeNotExpired(reservation: Reservation, currentQuote: u256): CompletedTrade;

    executeTradeExpired(reservation: Reservation, currentQuote: u256): CompletedTrade;
}
