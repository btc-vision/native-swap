import { BaseOperation } from './BaseOperation';
import { getProvider, Provider } from '../models/Provider';
import { Blockchain, Revert, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ListingCanceledEvent } from '../events/ListingCanceledEvent';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';

export class CancelListingOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly provider: Provider;

    constructor(liquidityQueue: ILiquidityQueue, providerId: u256) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.provider = getProvider(providerId);
    }

    public execute(): void {
        this.checkPreConditions();

        const refundAmount: u128 = this.provider.getLiquidityAmount();

        this.prepareProviderForRefund();
        this.transferLiquidityBack(refundAmount);
        this.postProcessQueues();
        this.emitListingCanceledEvent(refundAmount);
    }

    private prepareProviderForRefund(): void {
        // !!!this.provider.loadIndexedAt();

        this.liquidityQueue.resetProvider(this.provider, false, true);
    }

    private transferLiquidityBack(amount: u128): void {
        TransferHelper.safeTransfer(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            amount.toU256(),
        );
    }

    private postProcessQueues(): void {
        this.liquidityQueue.cleanUpQueues();
    }

    private checkPreConditions(): void {
        this.ensureProviderIsActive();
        this.ensureNoActiveReservation();
        this.ensureLiquidityNotZero();
        this.ensureProviderCannotProvideLiquidity();
        this.ensureNotInitialProvider();
        this.ensureProviderNotPendingRemoval();
    }

    private ensureProviderIsActive(): void {
        if (!this.provider.isActive()) {
            throw new Revert("NATIVE_SWAP: Provider is not active or doesn't exist.");
        }
    }

    private ensureNoActiveReservation(): void {
        if (this.provider.hasReservedAmount()) {
            throw new Revert(
                `NATIVE_SWAP: Someone have active reservations on your liquidity. ${this.provider.getReservedAmount()}.`,
            );
        }
    }

    private ensureLiquidityNotZero(): void {
        if (!this.provider.hasLiquidityAmount()) {
            throw new Revert('NATIVE_SWAP: Provider has no liquidity.');
        }
    }

    private ensureProviderCannotProvideLiquidity(): void {
        if (this.provider.isLiquidityProvisionAllowed()) {
            throw new Revert(
                'NATIVE_SWAP: You can no longer cancel this listing. Provider is providing liquidity.',
            );
        }
    }

    private ensureNotInitialProvider(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProviderId)) {
            throw new Revert('NATIVE_SWAP: Initial provider cannot cancel listing.');
        }
    }

    private ensureProviderNotPendingRemoval(): void {
        if (this.provider.isPendingRemoval()) {
            throw new Revert('NATIVE_SWAP: Provider is in pending removal.');
        }
    }

    private emitListingCanceledEvent(amount: u128): void {
        Blockchain.emit(new ListingCanceledEvent(amount));
    }
}
