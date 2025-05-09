import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import {
    Address,
    Blockchain,
    Revert,
    SafeMath,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { SwapExecutedEvent } from '../../../events/SwapExecutedEvent';
import { Reservation } from '../../Reservation';
import { u256 } from '@btc-vision/as-bignum/assembly';

export class SwapOperation extends BaseOperation {
    public constructor(
        liquidityQueue: LiquidityQueue,
        private readonly stakingAddress: Address = Address.dead(),
    ) {
        super(liquidityQueue);
    }

    public execute(): void {
        const reservation = this.liquidityQueue.getReservationWithExpirationChecks();
        this.ensureReservation(reservation);

        const buyer: Address = Blockchain.tx.sender;
        const trade = this.liquidityQueue.executeTrade(reservation);

        let totalTokensPurchased = SafeMath.add(
            trade.totalTokensPurchased,
            trade.totalTokensRefunded,
        );

        const totalSatoshisSpent = SafeMath.add(trade.totalSatoshisSpent, trade.totalRefundedBTC);
        if (!totalTokensPurchased.isZero()) {
            if (this.liquidityQueue.feesEnabled) {
                const totalFeeTokens = this.liquidityQueue.computeFees(
                    totalTokensPurchased,
                    totalSatoshisSpent,
                );

                totalTokensPurchased = SafeMath.sub(totalTokensPurchased, totalFeeTokens);
                this.liquidityQueue.distributeFee(totalFeeTokens, this.stakingAddress);
            }

            this.liquidityQueue.decreaseTotalReserved(trade.tokensReserved);
            this.liquidityQueue.decreaseTotalReserve(totalTokensPurchased);

            TransferHelper.safeTransfer(this.liquidityQueue.token, buyer, totalTokensPurchased);

            this.liquidityQueue.buyTokens(totalTokensPurchased, totalSatoshisSpent);
        }

        this.liquidityQueue.cleanUpQueues();

        this.emitSwapExecutedEvent(buyer, totalSatoshisSpent, totalTokensPurchased);
    }

    private ensureReservation(reservation: Reservation): void {
        if (reservation.reservedLP) {
            throw new Revert('NATIVE_SWAP: Reserved for LP; cannot swap');
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
