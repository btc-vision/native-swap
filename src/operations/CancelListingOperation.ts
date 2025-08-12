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

    public override execute(): void {
        const listedAtBlock: u64 = this.provider.getListedTokenAtBlock();
        this.checkPreConditions(listedAtBlock);

        const initialAmount: u128 = this.provider.getLiquidityAmount();
        const penaltyAmount: u128 = this.calculatePenalty(listedAtBlock, initialAmount);
        const halfToCharge: u128 = this.calculateHalfToCharge(initialAmount, penaltyAmount);
        const refundAmount: u256 = this.calculateRefund(initialAmount, penaltyAmount);

        this.prepareProviderForRefund();
        this.transferLiquidityBack(refundAmount);
        this.postProcessQueues(refundAmount, penaltyAmount, halfToCharge);
        this.emitListingCanceledEvent(initialAmount, penaltyAmount);
    }

    protected calculatePenalty(listedAtBlock: u64, amount: u128): u128 {
        const delta: u64 = SafeMath.sub64(Blockchain.block.number, listedAtBlock);
        let penalty: u128 = slash(amount, delta, SLASH_GRACE_WINDOW, SLASH_RAMP_UP_BLOCKS);

        if (u128.gt(penalty, amount)) {
            penalty = amount;
        }

        return penalty;
    }

    private calculateHalfToCharge(initialAmount: u128, penaltyAmount: u128): u128 {
        /* Half already credited to pool
         * Listing path in this repo credits CEIL(amount / 2),
         * so we must mirror that exact rounding.
         */
        const halfFloor: u128 = SafeMath.div128(initialAmount, u128.fromU32(2));
        const halfCred: u128 = u128.add(halfFloor, u128.and(initialAmount, u128.One)); // +1 if odd

        /* Amount that still has to be booked into pool inventory */
        const halfToCharge: u128 = u128.lt(penaltyAmount, halfCred) ? penaltyAmount : halfCred;

        return halfToCharge;
    }

    private calculateRefund(amount: u128, penalty: u128): u256 {
        return SafeMath.sub128(amount, penalty).toU256();
    }

    private checkPreConditions(listedAtBlock: u64): void {
        this.ensureListedTokenAtBlock(listedAtBlock);
        this.ensureProviderIsActive();
        this.ensureNoActiveReservation();
        this.ensureProviderIsNotPurged();
        this.ensureLiquidityNotZero();
        this.ensureProviderNotProvideLiquidity();
        this.ensureNotInitialProvider();
    }

    private emitListingCanceledEvent(amount: u128, penalty: u128): void {
        Blockchain.emit(new ListingCanceledEvent(amount, penalty));
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
                `NATIVE_SWAP: You can no longer cancel this listing. Someone have active reservations on your liquidity. ${this.provider.getReservedAmount()}.`,
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

    private ensureProviderIsNotPurged(): void {
        if (this.provider.isPurged()) {
            throw new Revert(
                'NATIVE_SWAP: You cannot cancel this listing at the moment. Provider is in the purge queue and needs to be purged first. Try again in a few blocks.',
            );
        }
    }

    private postProcessQueues(refundAmount: u256, penaltyAmount: u128, halfToCharge: u128): void {
        if (!penaltyAmount.isZero()) {
            this.liquidityQueue.accruePenalty(penaltyAmount, halfToCharge);
        }

        if (!refundAmount.isZero()) {
            this.liquidityQueue.decreaseTotalReserve(refundAmount);
        }
    }

    private prepareProviderForRefund(): void {
        this.liquidityQueue.resetProvider(this.provider, false, true);
    }

    private transferLiquidityBack(amount: u256): void {
        if (!amount.isZero()) {
            TransferHelper.safeTransfer(this.liquidityQueue.token, Blockchain.tx.sender, amount);
        }
    }
}
