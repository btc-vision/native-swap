import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../../Provider';
import { Blockchain, Revert, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { LiquidityRemovedEvent } from '../../../events/LiquidityRemovedEvent';

export class RemoveLiquidityOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly provider: Provider;

    constructor(liquidityQueue: LiquidityQueue, providerId: u256) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.provider = getProvider(providerId);
    }

    public execute(): void {
        // Check that this provider is actually an LP
        this.ensureLiquidityProvider();
        this.ensureNotInitialProvider();
        this.ensureProviderHasNoListedTokens();

        // Figure out how much BTC they are "owed" (the virtual side),
        //    and how many tokens they currently have "locked in" the pool.
        const btcOwed = this.liquidityQueue.getBTCowed(this.providerId);

        this.ensureBTCOwed(btcOwed);
        this.ensureNotInPendingRemoval();

        // Return the token portion immediately to the user
        const tokenAmount: u256 = this.provider.liquidityProvided;
        this.ensureTokenAmountNotZero(tokenAmount);
        TransferHelper.safeTransfer(this.liquidityQueue.token, Blockchain.tx.sender, tokenAmount);

        // Decrease total reserves
        this.liquidityQueue.decreaseTotalReserve(tokenAmount);
        this.provider.liquidityProvided = u256.Zero;

        // Also reduce the virtual reserves so the ratio is consistent
        //    but do NOT update deltaTokensSell or deltaTokensBuy.
        this.liquidityQueue.decreaseVirtualTokenReserve(tokenAmount);
        this.liquidityQueue.decreaseVirtualBTCReserve(btcOwed);

        // Finally, queue them up to receive owed BTC from future inflows
        this.provider.pendingRemoval = true;
        this.liquidityQueue.addToRemovalQueue(this.providerId);

        this.emitLiquidityRemovedEvent(btcOwed, tokenAmount);
    }

    private ensureLiquidityProvider(): void {
        if (!this.provider.isLp) {
            throw new Revert('Not a liquidity provider');
        }
    }

    private ensureNotInitialProvider(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProvider)) {
            throw new Revert('Initial provider cannot remove liquidity');
        }
    }

    private ensureBTCOwed(btcOwed: u256): void {
        if (btcOwed.isZero()) {
            throw new Revert('You have no BTC owed. Did you already remove everything?');
        }
    }

    private ensureNotInPendingRemoval(): void {
        if (this.provider.pendingRemoval) {
            throw new Revert('You are already in the removal queue.');
        }
    }

    private ensureTokenAmountNotZero(tokenAmount: u256): void {
        if (tokenAmount.isZero()) {
            throw new Revert('You have no tokens to remove.');
        }
    }

    private ensureProviderHasNoListedTokens(): void {
        if (!this.provider.liquidity.isZero()) {
            throw new Revert('You cannot remove your liquidity because you have active listing.');
        }
    }

    private emitLiquidityRemovedEvent(btcOwed: u256, tokenAmount: u256): void {
        Blockchain.emit(new LiquidityRemovedEvent(this.providerId, btcOwed, tokenAmount));
    }
}
