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

export class SwapOperation extends BaseOperation {
    private readonly tradeManager: ITradeManager;

    public constructor(
        liquidityQueue: ILiquidityQueue,
        tradeManager: ITradeManager,
        private readonly stakingAddress: Address = Address.dead(),
    ) {
        super(liquidityQueue);
        this.tradeManager = tradeManager;
    }

    public execute(): void {
        const reservation = this.liquidityQueue.getReservationWithExpirationChecks();
        this.ensureReservationForLP(reservation);

        const trade = this.tradeManager.executeTrade(reservation);

        let totalTokensPurchased = trade.getTotalTokensPurchased();
        const totalSatoshisSpent = trade.getTotalSatoshisSpent();

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
        }

        this.postProcessQueues();
        this.emitSwapExecutedEvent(Blockchain.tx.sender, totalSatoshisSpent, totalTokensPurchased);
    }

    private applyFeesIfEnabled(totalTokensPurchased: u256, totalSatoshisSpent: u256): u256 {
        let newTotalTokensPurchased = totalTokensPurchased;

        if (this.liquidityQueue.feesEnabled) {
            const totalFeeTokens = this.liquidityQueue.computeFees(
                totalTokensPurchased,
                totalSatoshisSpent,
            );

            newTotalTokensPurchased = SafeMath.sub(totalTokensPurchased, totalFeeTokens);
            this.liquidityQueue.distributeFee(totalFeeTokens, this.stakingAddress);
        }

        return newTotalTokensPurchased;
    }

    private updateLiquidityQueue(
        totalTokensReserved: u256,
        totalTokensPurchased: u256,
        totalSatoshisSpent: u256,
    ): void {
        this.liquidityQueue.decreaseTotalReserved(totalTokensReserved);
        this.liquidityQueue.decreaseTotalReserve(totalTokensPurchased);
        this.liquidityQueue.buyTokens(totalTokensPurchased, totalSatoshisSpent);
    }

    private sendToken(amount: u256): void {
        TransferHelper.safeTransfer(this.liquidityQueue.token, Blockchain.tx.sender, amount);
    }

    private postProcessQueues(): void {
        this.liquidityQueue.cleanUpQueues();
    }

    private ensureReservationForLP(reservation: Reservation): void {
        if (reservation.isForLiquidityPool()) {
            throw new Revert('NATIVE_SWAP: Reserved for LP; cannot swap.');
        }
    }

    private emitSwapExecutedEvent(
        buyer: Address,
        totalSatoshisSpent: u256,
        totalTokensPurchased: u256,
    ): void {
        Blockchain.emit(new SwapExecutedEvent(buyer, totalSatoshisSpent, totalTokensPurchased));
    }
}
