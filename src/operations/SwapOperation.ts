import { BaseOperation } from './BaseOperation';
import {
    Address,
    Blockchain,
    Revert,
    SafeMath,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { SwapExecutedEvent } from '../events/SwapExecutedEvent';
import { Reservation } from '../models/Reservation';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { ITradeManager } from '../managers/interfaces/ITradeManager';
import { CompletedTrade } from '../models/CompletedTrade';
import { ReservationFallbackEvent } from '../events/ReservationFallbackEvent';

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

        let trade: CompletedTrade;
        if (!reservation.isExpired()) {
            trade = this.executeNotExpired(reservation);
        } else {
            trade = this.executeExpired(reservation);
        }

        const initialTotalTokensPurchased: u256 = trade.getTotalTokensPurchased();
        let totalTokensPurchased: u256 = trade.getTotalTokensPurchased();
        const totalSatoshisSpent: u64 = trade.getTotalSatoshisSpent();
        let totalFees: u256 = u256.Zero;

        if (!totalTokensPurchased.isZero()) {
            totalTokensPurchased = this.applyFeesIfEnabled(
                totalTokensPurchased,
                totalSatoshisSpent,
            );

            this.updateLiquidityQueue(
                trade.totalTokensReserved,
                totalTokensPurchased,
                totalSatoshisSpent,
            );

            this.sendToken(totalTokensPurchased);
            totalFees = u256.sub(initialTotalTokensPurchased, totalTokensPurchased);
        } else {
            throw new Revert('NATIVE_SWAP: No tokens purchased in swap.');
        }

        this.emitSwapExecutedEvent(
            Blockchain.tx.sender,
            totalSatoshisSpent,
            totalTokensPurchased,
            totalFees,
        );
    }

    private applyFeesIfEnabled(totalTokensPurchased: u256, totalSatoshisSpent: u64): u256 {
        let newTotalTokensPurchased = totalTokensPurchased;

        if (this.liquidityQueue.feesEnabled) {
            const totalFeeTokens: u256 = this.liquidityQueue.computeFees(
                totalTokensPurchased,
                totalSatoshisSpent,
            );

            newTotalTokensPurchased = SafeMath.sub(totalTokensPurchased, totalFeeTokens);

            this.liquidityQueue.distributeFee(totalFeeTokens);
        }

        return newTotalTokensPurchased;
    }

    private emitSwapExecutedEvent(
        buyer: Address,
        totalSatoshisSpent: u64,
        totalTokensPurchased: u256,
        totalFees: u256,
    ): void {
        Blockchain.emit(
            new SwapExecutedEvent(buyer, totalSatoshisSpent, totalTokensPurchased, totalFees),
        );
    }

    private emitReservationFallbackEvent(reservation: Reservation): void {
        Blockchain.emit(new ReservationFallbackEvent(reservation));
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

    private ensureTokensPurchasedForExpiredReservation(totalTokensPurchased: u256): void {
        if (totalTokensPurchased === u256.Zero) {
            throw new Revert('NATIVE_SWAP: No tokens purchased for expired reservation.');
        }
    }

    private executeExpired(reservation: Reservation): CompletedTrade {
        this.ensureReservationNotSwapped(reservation);
        this.ensureReservationHasProvider(reservation);

        reservation.setSwapped(true);

        this.emitReservationFallbackEvent(reservation);

        const tradeResult: CompletedTrade = this.tradeManager.executeTradeExpired(
            reservation,
            this.liquidityQueue.quote(),
        );

        this.ensureTokensPurchasedForExpiredReservation(tradeResult.totalTokensPurchased);

        reservation.save();

        return tradeResult;
    }

    private executeNotExpired(reservation: Reservation): CompletedTrade {
        reservation.ensureCanBeConsumed();
        reservation.setSwapped(true);

        const tradeResult: CompletedTrade = this.tradeManager.executeTradeNotExpired(
            reservation,
            this.liquidityQueue.quote(),
        );

        reservation.save();

        return tradeResult;
    }

    private sendToken(amount: u256): void {
        TransferHelper.transfer(this.liquidityQueue.token, Blockchain.tx.sender, amount);
    }

    private updateLiquidityQueue(
        totalTokensReserved: u256,
        totalTokensPurchased: u256,
        totalSatoshisSpent: u64,
    ): void {
        this.liquidityQueue.decreaseTotalReserved(totalTokensReserved);
        this.liquidityQueue.decreaseTotalReserve(totalTokensPurchased);
        this.liquidityQueue.recordTradeVolumes(totalTokensPurchased, totalSatoshisSpent);
    }
}
