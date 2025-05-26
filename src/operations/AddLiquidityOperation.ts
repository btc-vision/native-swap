import { BaseOperation } from './BaseOperation';
import { getProvider, Provider } from '../models/Provider';
import { Blockchain, Revert, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { LiquidityAddedEvent } from '../events/LiquidityAddedEvent';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { Reservation } from '../models/Reservation';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { ITradeManager } from '../managers/interfaces/ITradeManager';
import { CompletedTrade } from '../models/CompletedTrade';

export class AddLiquidityOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly receiver: string;
    private provider: Provider;
    private tradeManager: ITradeManager;

    constructor(
        liquidityQueue: ILiquidityQueue,
        tradeManager: ITradeManager,
        providerId: u256,
        receiver: string,
    ) {
        super(liquidityQueue);

        this.tradeManager = tradeManager;
        this.providerId = providerId;
        this.receiver = receiver;
        this.provider = getProvider(providerId);
    }

    public execute(): void {
        this.checkPreConditions();

        const reservation: Reservation = this.getReservation();
        const trade: CompletedTrade = this.executeTrade(reservation);
        this.updateLiquidityQueue(trade);
        this.updateProvider(trade.getTotalTokensPurchased());
        this.emitLiquidityAddedEvent(
            trade.getTotalTokensPurchased(),
            trade.getTotalSatoshisSpent(),
        );
    }

    private checkPreConditions(): void {
        this.ensureNotInRemovalQueue();
    }

    private emitLiquidityAddedEvent(tokensBoughtFromQueue: u256, btcSpent: u64): void {
        Blockchain.emit(
            new LiquidityAddedEvent(
                SafeMath.add(tokensBoughtFromQueue, tokensBoughtFromQueue),
                tokensBoughtFromQueue,
                btcSpent,
            ),
        );
    }

    private ensureNotInRemovalQueue(): void {
        if (this.provider.isPendingRemoval()) {
            throw new Revert(
                'NATIVE_SWAP: You are in the removal queue. Wait for removal of your liquidity first.',
            );
        }
    }

    private ensurePurchaseWasMade(tokensBoughtFromQueue: u256, btcSpent: u64): void {
        if (tokensBoughtFromQueue.isZero() || btcSpent === 0) {
            throw new Revert('NATIVE_SWAP: No effective purchase made. Check your BTC outputs.');
        }
    }

    private ensureReservationForLP(reservation: Reservation): void {
        if (!reservation.isForLiquidityPool()) {
            throw new Revert('NATIVE_SWAP: You must reserve liquidity for LP first.');
        }
    }

    private getReservation(): Reservation {
        const reservation: Reservation = this.liquidityQueue.getReservationWithExpirationChecks();
        this.ensureReservationForLP(reservation);

        return reservation;
    }

    private executeTrade(reservation: Reservation): CompletedTrade {
        const trade: CompletedTrade = this.tradeManager.executeTrade(reservation);

        this.ensurePurchaseWasMade(trade.getTotalTokensPurchased(), trade.getTotalSatoshisSpent());

        TransferHelper.safeTransferFrom(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            trade.getTotalTokensPurchased(),
        );
        return trade;
    }

    private updateLiquidityQueue(trade: CompletedTrade): void {
        this.liquidityQueue.decreaseTotalReserved(trade.totalTokensReserved);
        this.liquidityQueue.increaseTotalReserve(trade.getTotalTokensPurchased());
        this.liquidityQueue.increaseVirtualSatoshisReserve(trade.getTotalSatoshisSpent());
        this.liquidityQueue.increaseVirtualTokenReserve(trade.getTotalTokensPurchased());
        this.liquidityQueue.increaseSatoshisOwed(this.providerId, trade.getTotalSatoshisSpent());
    }

    private updateProvider(tokensBoughtFromQueue: u256): void {
        this.provider.markLiquidityProvider();

        if (!this.provider.hasReservedAmount()) {
            this.provider.setBtcReceiver(this.receiver);
        }

        this.provider.addToLiquidityProvided(tokensBoughtFromQueue.toU128());
    }
}
