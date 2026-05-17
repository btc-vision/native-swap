import { BaseOperation } from './BaseOperation';
import { getProvider, Provider } from '../models/Provider';
import { Blockchain, Revert, StoredBoolean, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { WithdrawListingEvent } from '../events/WithdrawListingEvent';
import { WITHDRAW_MODE_POINTER } from '../constants/StoredPointers';
import { ITickBitmapManager } from '../managers/interfaces/ITickBitmapManager';

/**
 * Cancel a listing. Guarded by the freeze invariant: must wait until
 * `block.number > provider.latestReservedUntilBlock` before withdrawing.
 *
 * Withdraw-mode bypass: if `_withdrawModeActive` is true (governance emergency),
 * skip the freeze guard. Buyers' open reservations against this provider will
 * settle as 0-token fills (provider's tokens are gone).
 *
 * Tombstones the FIFO slot, clears the bitmap bit if the tick has no other entries,
 * refunds remaining liquidity, resets provider state.
 */
export class WithdrawListingOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly provider: Provider;
    private readonly tickBitmapManager: ITickBitmapManager;
    private readonly withdrawMode: StoredBoolean;

    constructor(
        liquidityQueue: ILiquidityQueue,
        tickBitmapManager: ITickBitmapManager,
        providerId: u256,
    ) {
        super(liquidityQueue);
        this.providerId = providerId;
        this.provider = getProvider(providerId);
        this.tickBitmapManager = tickBitmapManager;
        this.withdrawMode = new StoredBoolean(WITHDRAW_MODE_POINTER, false);
    }

    public override execute(): void {
        if (!this.provider.isActive()) {
            throw new Revert('NATIVE_SWAP: Provider has no active listing.');
        }

        // Freeze guard — bypassed in emergency withdraw mode.
        if (!this.withdrawMode.value) {
            if (this.provider.isListingFrozen()) {
                throw new Revert(
                    `NATIVE_SWAP: Listing frozen until block ${this.provider.getLatestReservedUntilBlock()}. Wait or let purge run.`,
                );
            }
        }

        // Stale-clean any zombie reservedAmount: past the freeze, it is provably stale.
        // Clamp to liquidity to be safe against accounting glitches.
        const reserved: u128 = this.provider.getReservedAmount();
        if (!reserved.isZero()) {
            const liq: u128 = this.provider.getLiquidityAmount();
            const toClear: u128 = u128.lt(reserved, liq) ? reserved : liq;
            this.liquidityQueue.decreaseTotalReserved(toClear.toU256());
            this.provider.setReservedAmount(u128.Zero);
        }

        // If the provider is currently in their tick's purged sub-queue, pull them out first.
        if (this.provider.isPurged()) {
            this.tickBitmapManager.removeFromPurgeQueue(this.provider);
        }

        // Tombstone in FIFO[priceTick]. May clear bitmap bit if all sub-queues at the tick empty.
        this.tickBitmapManager.removeFromTickQueue(this.provider);

        const refundAmount: u128 = this.provider.getLiquidityAmount();
        if (refundAmount.isZero()) {
            // Nothing to refund (e.g., everything was bought / dust-cleared earlier).
            this.finalizeProvider();
            this.emitWithdrawListingEvent(u128.Zero);
            return;
        }

        // Decrement total reserve, refund tokens, reset provider state.
        this.liquidityQueue.decreaseTotalReserve(refundAmount.toU256());
        TransferHelper.transfer(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            refundAmount.toU256(),
        );
        this.finalizeProvider();
        this.emitWithdrawListingEvent(refundAmount);
    }

    private finalizeProvider(): void {
        this.provider.resetAll();
        this.provider.save();
    }

    private emitWithdrawListingEvent(amount: u128): void {
        Blockchain.emit(
            new WithdrawListingEvent(
                amount,
                this.liquidityQueue.token,
                this.providerId,
                Blockchain.tx.sender,
            ),
        );
    }
}
