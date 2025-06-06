import { BaseOperation } from './BaseOperation';
import { getProvider, Provider } from '../models/Provider';
import { Blockchain, Revert, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ListingCanceledEvent } from '../events/ListingCanceledEvent';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import {
    BLOCK_NOT_SET_VALUE,
    SLASH_GRACE_WINDOW,
    SLASH_RAMP_UP_BLOCKS,
} from '../constants/Contract';
import { slash } from '../utils/Slashing';

export class CancelListingOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly provider: Provider;

    constructor(liquidityQueue: ILiquidityQueue, providerId: u256) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.provider = getProvider(providerId);
    }

    public execute(): void {
        const listedAtBlock: u64 = this.provider.getListedTokenAtBlock();
        this.checkPreConditions(listedAtBlock);

        const initialAmount: u128 = this.provider.getLiquidityAmount();
        const penaltyAmount: u128 = this.calculatePenalty(listedAtBlock, initialAmount);
        const refundAmount: u128 = this.calculateRefund(initialAmount, penaltyAmount);

        this.prepareProviderForRefund();
        this.transferLiquidityBack(refundAmount);
        this.postProcessQueues(penaltyAmount);
        this.emitListingCanceledEvent(refundAmount);
    }

    private calculatePenalty(listedAtBlock: u64, amount: u128): u128 {
        const delta: u64 = SafeMath.sub64(Blockchain.block.number, listedAtBlock);
        return slash(amount, delta, SLASH_GRACE_WINDOW, SLASH_RAMP_UP_BLOCKS);
    }

    private calculateRefund(amount: u128, penalty: u128): u128 {
        return SafeMath.sub128(amount, penalty);
    }

    private checkPreConditions(listedAtBlock: u64): void {
        this.ensureListedTokenAtBlock(listedAtBlock);
        this.ensureProviderIsActive();
        this.ensureNoActiveReservation();
        this.ensureLiquidityNotZero();
        this.ensureProviderNotProvideLiquidity();
        this.ensureNotInitialProvider();
        this.ensureProviderNotPendingRemoval();
    }

    private emitListingCanceledEvent(amount: u128): void {
        Blockchain.emit(new ListingCanceledEvent(amount));
    }

    private ensureLiquidityNotZero(): void {
        if (!this.provider.hasLiquidityAmount()) {
            throw new Revert('NATIVE_SWAP: Provider has no liquidity.');
        }
    }

    private ensureListedTokenAtBlock(blockNumber: u64): void {
        if (blockNumber === BLOCK_NOT_SET_VALUE) {
            throw new Revert('NATIVE_SWAP: Provider is not listed.');
        }
    }

    private ensureNoActiveReservation(): void {
        if (this.provider.hasReservedAmount()) {
            throw new Revert(
                `NATIVE_SWAP: Someone have active reservations on your liquidity. ${this.provider.getReservedAmount()}.`,
            );
        }
    }

    private ensureNotInitialProvider(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProviderId)) {
            throw new Revert('NATIVE_SWAP: Initial provider cannot cancel listing.');
        }
    }

    private ensureProviderNotProvideLiquidity(): void {
        if (this.provider.isLiquidityProvisionAllowed()) {
            throw new Revert(
                'NATIVE_SWAP: You can no longer cancel this listing. Provider is providing liquidity.',
            );
        }
    }

    private ensureProviderIsActive(): void {
        if (!this.provider.isActive()) {
            throw new Revert("NATIVE_SWAP: Provider is not active or doesn't exist.");
        }
    }

    private ensureProviderNotPendingRemoval(): void {
        if (this.provider.isPendingRemoval()) {
            throw new Revert('NATIVE_SWAP: Provider is in pending removal.');
        }
    }

    private postProcessQueues(penaltyAmount: u128): void {
        if (!penaltyAmount.isZero()) {
            this.liquidityQueue.accruePenalty(penaltyAmount);
        }
    }

    private prepareProviderForRefund(): void {
        this.liquidityQueue.resetProvider(this.provider, false, true);
    }

    private transferLiquidityBack(amount: u128): void {
        if (!amount.isZero()) {
            TransferHelper.safeTransfer(
                this.liquidityQueue.token,
                Blockchain.tx.sender,
                amount.toU256(),
            );
        }
    }
}
