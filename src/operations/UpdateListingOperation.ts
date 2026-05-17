import { BaseOperation } from './BaseOperation';
import { getProvider, Provider } from '../models/Provider';
import { Blockchain, Revert } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { ITickBitmapManager } from '../managers/interfaces/ITickBitmapManager';
import { ListingUpdatedEvent } from '../events/ListingUpdatedEvent';
import { MAX_TICK, MIN_TICK } from '../constants/Contract';

/**
 * Move a provider's listing from `oldTick` to `newTick`. Same FIFO slot mechanics as
 * withdraw + relist would do, but atomic and free.
 *
 * Preserved across the move:
 *   - `liquidityAmount` (no tokens move)
 *   - `latestReservedUntilBlock` (the freeze invariant carries over)
 *   - `BTC receiver`
 *
 * Guarded by the freeze invariant — same gate as `withdrawListing`. **No** withdraw-mode
 * bypass here: emergencies should withdraw, not re-price.
 */
export class UpdateListingOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly provider: Provider;
    private readonly tickBitmapManager: ITickBitmapManager;
    private readonly newPriceTick: i32;

    constructor(
        liquidityQueue: ILiquidityQueue,
        tickBitmapManager: ITickBitmapManager,
        providerId: u256,
        newPriceTick: i32,
    ) {
        super(liquidityQueue);
        this.providerId = providerId;
        this.provider = getProvider(providerId);
        this.tickBitmapManager = tickBitmapManager;
        this.newPriceTick = newPriceTick;
    }

    public override execute(): void {
        if (!this.provider.isActive()) {
            throw new Revert('NATIVE_SWAP: Provider has no active listing.');
        }
        if (this.provider.isListingFrozen()) {
            throw new Revert(
                `NATIVE_SWAP: Listing frozen until block ${this.provider.getLatestReservedUntilBlock()}. Wait or let purge run.`,
            );
        }
        if (this.newPriceTick < MIN_TICK || this.newPriceTick > MAX_TICK) {
            throw new Revert(
                `NATIVE_SWAP: tick ${this.newPriceTick} out of range [${MIN_TICK}, ${MAX_TICK}].`,
            );
        }

        const oldTick: i32 = this.provider.getPriceTick();
        if (oldTick == this.newPriceTick) {
            return; // no-op
        }

        // Stale-clean any zombie reservedAmount (same as withdraw)
        const reserved: u128 = this.provider.getReservedAmount();
        if (!reserved.isZero()) {
            const liq: u128 = this.provider.getLiquidityAmount();
            const toClear: u128 = u128.lt(reserved, liq) ? reserved : liq;
            this.liquidityQueue.decreaseTotalReserved(toClear.toU256());
            this.provider.setReservedAmount(u128.Zero);
        }

        // Pull out of old tick's purged sub-queue if present
        if (this.provider.isPurged()) {
            this.tickBitmapManager.removeFromPurgeQueue(this.provider);
        }

        // Tombstone in old tick's FIFO
        this.tickBitmapManager.removeFromTickQueue(this.provider);

        // Re-list at new tick (priceTick set inside addToTickFIFO via setTickFifoIndex; we update it explicitly)
        this.provider.setPriceTick(this.newPriceTick);
        this.tickBitmapManager.addToTickFIFO(this.provider, this.newPriceTick);
        this.provider.save();

        Blockchain.emit(
            new ListingUpdatedEvent(
                this.providerId,
                oldTick,
                this.newPriceTick,
                this.provider.getLiquidityAmount(),
            ),
        );
    }
}
