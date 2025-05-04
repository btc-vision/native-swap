import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import { getProvider, Provider } from '../../Provider';
import { Blockchain, Revert, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { LiquidityAddedEvent } from '../../../events/LiquidityAddedEvent';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { Reservation } from '../../Reservation';

export class AddLiquidityOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly receiver: string;
    private provider: Provider;

    constructor(liquidityQueue: LiquidityQueue, providerId: u256, receiver: string) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.receiver = receiver;
        this.provider = getProvider(providerId);
    }

    public execute(): void {
        this.ensureNotInRemovalQueue();

        // Make sure there's an active reservation for LP
        const reservation = this.liquidityQueue.getReservationWithExpirationChecks();
        this.ensureReservedLiquidityFirst(reservation);

        // First, execute the trade to see how many tokens were purchased (T)
        // and how much BTC was used (B).
        const trade = this.liquidityQueue.executeTrade(reservation);
        const tokensBoughtFromQueue = SafeMath.add(
            trade.totalTokensPurchased,
            trade.totalTokensRefunded,
        ); // T

        const btcSpent = SafeMath.add(trade.totalSatoshisSpent, trade.totalRefundedBTC); // B
        this.ensurePurchaseMade(tokensBoughtFromQueue, btcSpent);

        //  Enforce 50/50 => The user must deposit exactly `tokensBoughtFromQueue` more tokens
        //  from their wallet. This ensures that in total, they've contributed equal "value"
        //  in BTC and in tokens.
        //  So we do a safeTransferFrom of that exact token amount:
        TransferHelper.safeTransferFrom(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            tokensBoughtFromQueue,
        );

        // Because the purchase from the queue effectively "used BTC to buy tokens,"
        // update our totalReserved to un-reserve those tokens.
        this.liquidityQueue.decreaseTotalReserved(trade.tokensReserved);

        // Combine the user’s newly deposited tokens (the "other 50%" side)
        // into the pool’s total reserves.
        this.liquidityQueue.increaseTotalReserve(tokensBoughtFromQueue);

        this.liquidityQueue.increaseVirtualBTCReserve(btcSpent);
        this.liquidityQueue.increaseVirtualTokenReserve(tokensBoughtFromQueue);

        // Credit the user’s "virtual BTC" so they can withdraw it later in removeLiquidity.
        this.liquidityQueue.increaseBTCowed(this.providerId, btcSpent);

        // Mark the provider as an LP
        this.markProviderAsLPProvider(tokensBoughtFromQueue);

        this.emitLiquidityAddedEvent(tokensBoughtFromQueue, btcSpent);
    }

    private ensureNotInRemovalQueue(): void {
        if (this.provider.pendingRemoval) {
            throw new Revert(
                'NATIVE_SWAP: You are in the removal queue. Wait for removal of your liquidity first.',
            );
        }
    }

    private ensureReservedLiquidityFirst(reservation: Reservation): void {
        if (!reservation.reservedLP) {
            throw new Revert('NATIVE_SWAP: You must reserve liquidity for LP first.');
        }
    }

    private ensurePurchaseMade(tokensBoughtFromQueue: u256, btcSpent: u256): void {
        if (tokensBoughtFromQueue.isZero() || btcSpent.isZero()) {
            throw new Revert('NATIVE_SWAP: No effective purchase made. Check your BTC outputs.');
        }
    }

    private markProviderAsLPProvider(tokensBoughtFromQueue: u256): void {
        this.provider.isLp = true;

        // Prevent exploits where someone add liquidity then change receiving address
        if (!this.provider.haveReserved()) {
            this.provider.btcReceiver = this.receiver;
        }

        this.provider.increaseLiquidityProvided(tokensBoughtFromQueue);
    }

    private emitLiquidityAddedEvent(tokensBoughtFromQueue: u256, btcSpent: u256): void {
        Blockchain.emit(
            new LiquidityAddedEvent(
                SafeMath.add(tokensBoughtFromQueue, tokensBoughtFromQueue), // The tokens from the user wallet
                tokensBoughtFromQueue, // The tokens purchased from queue
                btcSpent,
            ),
        );
    }
}
