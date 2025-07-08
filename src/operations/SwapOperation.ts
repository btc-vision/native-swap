import { BaseOperation } from './BaseOperation';
import { Address, Blockchain, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { SwapExecutedEvent } from '../events/SwapExecutedEvent';
import { Reservation } from '../models/Reservation';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { ITradeManager } from '../managers/interfaces/ITradeManager';
import { CompletedTrade } from '../models/CompletedTrade';

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

    public override execute(): void {
        const reservation: Reservation = this.liquidityQueue.getReservationWithExpirationChecks();
        const trade: CompletedTrade = this.tradeManager.executeTrade(reservation);

        let totalTokensPurchased: u256 = trade.getTotalTokensPurchased();
        const totalSatoshisSpent: u64 = trade.getTotalSatoshisSpent();

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

        this.emitSwapExecutedEvent(Blockchain.tx.sender, totalSatoshisSpent, totalTokensPurchased);
    }

    private applyFeesIfEnabled(totalTokensPurchased: u256, totalSatoshisSpent: u64): u256 {
        let newTotalTokensPurchased = totalTokensPurchased;

        if (this.liquidityQueue.feesEnabled) {
            const totalFeeTokens: u256 = this.liquidityQueue.computeFees(
                totalTokensPurchased,
                totalSatoshisSpent,
            );
            
            newTotalTokensPurchased = SafeMath.sub(totalTokensPurchased, totalFeeTokens);

            this.liquidityQueue.distributeFee(totalFeeTokens, this.stakingAddress);
        }

        return newTotalTokensPurchased;
    }

    private emitSwapExecutedEvent(
        buyer: Address,
        totalSatoshisSpent: u64,
        totalTokensPurchased: u256,
    ): void {
        Blockchain.emit(new SwapExecutedEvent(buyer, totalSatoshisSpent, totalTokensPurchased));
    }

    private sendToken(amount: u256): void {
        TransferHelper.safeTransfer(this.liquidityQueue.token, Blockchain.tx.sender, amount);
    }

    private updateLiquidityQueue(
        totalTokensReserved: u256,
        totalTokensPurchased: u256,
        totalSatoshisSpent: u64,
    ): void {
        this.liquidityQueue.decreaseTotalReserved(totalTokensReserved);
        this.liquidityQueue.decreaseTotalReserve(totalTokensPurchased);
        this.liquidityQueue.buyTokens(totalTokensPurchased, totalSatoshisSpent);
    }
}
