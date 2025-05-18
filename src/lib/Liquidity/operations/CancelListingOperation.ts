import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import { getProvider, Provider } from '../../Provider';
import { Blockchain, Revert, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ListingCanceledEvent } from '../../../events/ListingCanceledEvent';
import { slash } from '../Slashing';
import { SLASH_GRACE_WINDOW, SLASH_RAMP_UP_BLOCKS } from '../../../data-types/Constants';

export class CancelListingOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly provider: Provider;

    constructor(liquidityQueue: LiquidityQueue, providerId: u256) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.provider = getProvider(providerId);
    }

    public execute(): void {
        const amount: u256 = this.provider.liquidity.toU256();

        this.ensureProviderIsActive();
        this.ensureNoActiveReservation();
        this.ensureLiquidity(amount);
        this.ensureProviderCannotProvideLiquidity();
        this.ensureNotInitialProvider();
        this.ensureProviderNotPendingRemoval();

        // Load the index of the provider
        this.provider.loadIndexedAt();

        const listedAt: u64 = this.provider.listedTokenAtBlock();
        if (listedAt === 0) {
            throw new Revert('NATIVE_SWAP: Provider is not listed.');
        }

        const delta: u64 = SafeMath.sub64(Blockchain.block.number, listedAt);
        const penalty: u256 = slash(amount, delta, SLASH_GRACE_WINDOW, SLASH_RAMP_UP_BLOCKS);
        const refund: u256 = SafeMath.sub(amount, penalty);

        // reset provider state before any transfers
        this.liquidityQueue.resetProvider(this.provider, false, true);

        // Transfer tokens back to the provider
        if (!refund.isZero()) {
            TransferHelper.safeTransfer(this.liquidityQueue.token, Blockchain.tx.sender, refund);
        }

        if (!penalty.isZero()) {
            this.liquidityQueue.accruePenalty(penalty);
        }

        this.emitListingCanceledEvent(amount.toU128());
    }

    private ensureProviderIsActive(): void {
        if (!this.provider.isActive()) {
            throw new Revert("NATIVE_SWAP: Provider is not active or doesn't exist.");
        }
    }

    private ensureNoActiveReservation(): void {
        if (this.provider.haveReserved()) {
            throw new Revert(
                `NATIVE_SWAP: Someone have active reservations on your liquidity. ${this.provider.reserved}`,
            );
        }
    }

    private ensureLiquidity(amount: u256): void {
        if (amount.isZero()) {
            throw new Revert('NATIVE_SWAP: Provider has no liquidity.');
        }
    }

    private ensureProviderCannotProvideLiquidity(): void {
        if (this.provider.canProvideLiquidity()) {
            throw new Revert(
                'NATIVE_SWAP: You can no longer cancel this listing. Provider is providing liquidity.',
            );
        }
    }

    private ensureNotInitialProvider(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProvider)) {
            throw new Revert('NATIVE_SWAP: Initial provider cannot cancel listing.');
        }
    }

    private ensureProviderNotPendingRemoval(): void {
        if (this.provider.pendingRemoval) {
            throw new Revert('NATIVE_SWAP: Provider is in pending removal.');
        }
    }

    private emitListingCanceledEvent(amount: u128): void {
        Blockchain.emit(new ListingCanceledEvent(amount));
    }
}
