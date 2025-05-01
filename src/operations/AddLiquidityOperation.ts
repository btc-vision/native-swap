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

        const reservation = this.getReservation();
        const { trade, tokensBoughtFromQueue, btcSpent } = this.executeTrade(reservation);
        this.updateLiquidityQueue(trade, tokensBoughtFromQueue, btcSpent);
        this.updateProvider(tokensBoughtFromQueue);
        this.postProcessQueues();
        this.emitLiquidityAddedEvent(tokensBoughtFromQueue, btcSpent);
    }

    private checkPreConditions(): void {
        this.ensureNotInRemovalQueue();
    }

    private getReservation(): Reservation {
        const reservation = this.liquidityQueue.getReservationWithExpirationChecks();
        this.ensureReservationForLP(reservation);

        return reservation;
    }

    private executeTrade(reservation: Reservation): {
        trade: CompletedTrade;
        tokensBoughtFromQueue: u256;
        btcSpent: u256;
    } {
        const trade = this.tradeManager.executeTrade(reservation);

        const tokensBoughtFromQueue = SafeMath.add(
            trade.totalTokensPurchased,
            trade.totalTokensRefunded,
        );

        const btcSpent = SafeMath.add(trade.totalSatoshisSpent, trade.totalRefundedBTC);
        this.ensurePurchaseWasMade(tokensBoughtFromQueue, btcSpent);

        TransferHelper.safeTransferFrom(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            tokensBoughtFromQueue,
        );
        return { trade, tokensBoughtFromQueue, btcSpent };
    }

    private updateLiquidityQueue(
        trade: CompletedTrade,
        tokensBoughtFromQueue: u256,
        btcSpent: u256,
    ): void {
        this.liquidityQueue.decreaseTotalReserved(trade.totalTokensReserved);
        this.liquidityQueue.increaseTotalReserve(tokensBoughtFromQueue);
        this.liquidityQueue.increaseVirtualBTCReserve(btcSpent);
        this.liquidityQueue.increaseVirtualTokenReserve(tokensBoughtFromQueue);
        this.liquidityQueue.increaseBTCowed(this.providerId, btcSpent);
    }

    private updateProvider(tokensBoughtFromQueue: u256): void {
        this.provider.markLiquidityProvider();

        if (!this.provider.hasReservedAmount()) {
            this.provider.setbtcReceiver(this.receiver);
        }

        this.provider.addToLiquidityProvided(tokensBoughtFromQueue);
    }

    private postProcessQueues(): void {
        this.liquidityQueue.cleanUpQueues();
    }

    private ensureNotInRemovalQueue(): void {
        if (this.provider.isPendingRemoval()) {
            throw new Revert(
                'NATIVE_SWAP: You are in the removal queue. Wait for removal of your liquidity first.',
            );
        }
    }

    private ensureReservationForLP(reservation: Reservation): void {
        if (!reservation.isForLiquidityPool()) {
            throw new Revert('NATIVE_SWAP: You must reserve liquidity for LP first.');
        }
    }

    private ensurePurchaseWasMade(tokensBoughtFromQueue: u256, btcSpent: u256): void {
        if (tokensBoughtFromQueue.isZero() || btcSpent.isZero()) {
            throw new Revert('NATIVE_SWAP: No effective purchase made. Check your BTC outputs.');
        }
    }

    private emitLiquidityAddedEvent(tokensBoughtFromQueue: u256, btcSpent: u256): void {
        Blockchain.emit(
            new LiquidityAddedEvent(
                SafeMath.add(tokensBoughtFromQueue, tokensBoughtFromQueue),
                tokensBoughtFromQueue,
                btcSpent,
            ),
        );
    }
}
