import { BaseOperation } from './BaseOperation';
import { Blockchain, Revert, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { SwapExecutedEvent } from '../events/SwapExecutedEvent';
import { Reservation } from '../models/Reservation';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { ITradeManager } from '../managers/interfaces/ITradeManager';
import { CompletedTrade } from '../models/CompletedTrade';
import { ReservationFallbackEvent } from '../events/ReservationFallbackEvent';

/**
 * Settle a reservation. With per-entry frozen `fillPrice`, the old "expired vs not expired"
 * distinction collapses: TradeManager runs the same loop in either case. The only difference
 * is the activation-delay check (skipped for already-expired reservations because the
 * reservation isn't valid for normal consumption — it's being timed out).
 */
export class SwapOperation extends BaseOperation {
    private readonly tradeManager: ITradeManager;

    public constructor(liquidityQueue: ILiquidityQueue, tradeManager: ITradeManager) {
        super(liquidityQueue);
        this.tradeManager = tradeManager;
    }

    public override execute(): void {
        const reservation: Reservation = new Reservation(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
        );
        this.ensureReservationNotSwapped(reservation);
        this.ensureReservationHasProvider(reservation);

        if (!reservation.isExpired()) {
            // Normal path: must be past activationDelay.
            reservation.ensureCanBeConsumed();
        } else {
            // Expired path: emit fallback marker, settle anything actually paid for.
            Blockchain.emit(new ReservationFallbackEvent(reservation));
        }

        reservation.setSwapped(true);
        const trade: CompletedTrade = this.tradeManager.executeTrade(reservation);

        if (trade.totalTokensPurchased.isZero() && reservation.isExpired()) {
            // Expired reservation with no actual BTC paid → just burn the slot, no event noise.
            return;
        }
        if (trade.totalTokensPurchased.isZero()) {
            throw new Revert('NATIVE_SWAP: No tokens purchased in swap.');
        }

        // Decrease total-reserved by what was reserved by this reservation.
        // Note: TradeManager already releases reservedAmount per provider (for non-purged paths),
        // and it already sub'd reservedLiquidity inside the per-provider helper. So here we
        // only need to NOT double-decrement. The trade.totalTokensReserved is a running sum
        // that reflects what we already released.

        // Send tokens to buyer (post-fee).
        TransferHelper.transfer(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            trade.totalTokensPurchased,
        );

        Blockchain.emit(
            new SwapExecutedEvent(
                Blockchain.tx.sender,
                trade.totalSatoshisSpent,
                trade.totalTokensPurchased,
                trade.totalTokensRefunded, // re-using this field for fee amount
            ),
        );
    }

    private ensureReservationNotSwapped(reservation: Reservation): void {
        if (reservation.getSwapped()) {
            throw new Revert('NATIVE_SWAP: Reservation already swapped.');
        }
    }

    private ensureReservationHasProvider(reservation: Reservation): void {
        if (reservation.getProviderCount() === 0) {
            throw new Revert('NATIVE_SWAP: Reservation does not have any providers.');
        }
    }
}
