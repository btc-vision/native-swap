import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { addAmountToStakingContract, getProvider, Provider } from '../models/Provider';
import { Reservation } from '../models/Reservation';
import { CompletedTrade } from '../models/CompletedTrade';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ProviderConsumedEvent } from '../events/ProviderConsumedEvent';
import { EMIT_PROVIDERCONSUMED_EVENTS, SWAP_FEE_BPS, SWAP_FEE_DENOM } from '../constants/Contract';
import { ITradeManager } from './interfaces/ITradeManager';
import { ITickBitmapManager } from './interfaces/ITickBitmapManager';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { IReservationManager } from './interfaces/IReservationManager';
import { TickMath } from '../utils/TickMath';

/**
 * Settle a reservation against actual BTC outputs in this transaction.
 *
 * For each `ReservationProviderData` entry:
 *   - read frozen `(tick, fillPrice)` from the reservation entry
 *   - compute `requiredSats = (providedAmount * fillPrice) >> 88`
 *   - look up sats sent to the provider's CSV receiver in `Blockchain.tx.outputs`
 *   - if `sentSats >= requiredSats` → deliver `providedAmount` (full fill)
 *     else                             → deliver `(sentSats << 88) / fillPrice` capped at providedAmount (partial)
 *   - decrement `provider.liquidityAmount` by delivered, decrement reserved by reserved
 *   - on partial fill / no-BTC, push provider into per-tick purged sub-queue
 *
 * After all providers settled:
 *   - apply 0.3% swap fee on total tokens purchased → staking
 *   - return CompletedTrade for the SwapOperation to finalize
 */
export class TradeManager implements ITradeManager {
    protected readonly consumedOutputsFromUTXOs: Map<string, u64> = new Map<string, u64>();

    private readonly tickBitmapManager: ITickBitmapManager;
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;
    private readonly reservationManager: IReservationManager;

    private totalTokensPurchased: u256 = u256.Zero;
    private totalSatoshisSpent: u64 = 0;
    private totalTokensReserved: u256 = u256.Zero;

    constructor(
        tickBitmapManager: ITickBitmapManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        reservationManager: IReservationManager,
    ) {
        this.tickBitmapManager = tickBitmapManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.reservationManager = reservationManager;
    }

    /**
     * Single-path settlement (no expired vs not-expired distinction).
     * SwapOperation guards that the reservation is consumable.
     */
    public executeTrade(reservation: Reservation): CompletedTrade {
        this.deactivateReservation(reservation);
        this.resetTotals();

        const providerCount: u32 = reservation.getProviderCount();
        const isPurged: bool = reservation.getPurged();

        for (let index: u32 = 0; index < providerCount; index++) {
            const data: ReservationProviderData = reservation.getProviderAt(index);
            const provider: Provider = getProvider(data.providerId);

            // Skip if provider was fully wiped (e.g., emergency withdraw).
            if (!provider.isActive() && !provider.toReset()) {
                continue;
            }

            // For non-purged reservations: settle as many as possible. The reserved counters
            // are released here. For purged reservations: the per-entry reservedAmount was
            // already restored by ReservationManager.purge — don't double-release.
            if (!isPurged) {
                this.restoreReservedLiquidityForProvider(provider, data.providedAmount);
            }

            const sentSats: u64 = this.getSatoshisSent(provider.getBtcReceiver());
            if (sentSats === 0) {
                // No BTC sent to this provider → buyer skipped this leg; route provider
                // through per-tick purged sub-queue so they're served first next round.
                this.addProviderToPurgeQueue(provider);
                continue;
            }

            this.executeProviderTrade(provider, data, sentSats);
        }

        // Apply 0.3% flat swap fee on total tokens purchased
        const feeAmount: u256 = SafeMath.div(
            SafeMath.mul(this.totalTokensPurchased, u256.fromU64(SWAP_FEE_BPS)),
            u256.fromU64(SWAP_FEE_DENOM),
        );
        const buyerOut: u256 = SafeMath.sub(this.totalTokensPurchased, feeAmount);

        if (!feeAmount.isZero()) {
            this.liquidityQueueReserve.subFromTotalReserve(feeAmount);
            addAmountToStakingContract(feeAmount);
        }

        // The reservation entries are settled; remove the reservation record.
        reservation.delete(false);

        return new CompletedTrade(
            this.totalTokensReserved,
            buyerOut,
            this.totalSatoshisSpent,
            0,
            feeAmount,
        );
    }

    // ========================================================================
    // Per-provider execution
    // ========================================================================

    /** Sum BTC outputs paid to `address` in this txn, accounting for already-consumed sats. */
    protected getSatoshisSent(address: string): u64 {
        let totalSatoshis: u64 = 0;
        const outputs = Blockchain.tx.outputs;
        for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i];
            if (output.to === address) {
                totalSatoshis = SafeMath.add64(totalSatoshis, output.value);
            }
        }

        const consumedSatoshis: u64 = this.consumedOutputsFromUTXOs.has(address)
            ? this.consumedOutputsFromUTXOs.get(address)
            : 0;

        if (totalSatoshis < consumedSatoshis) {
            throw new Revert('Impossible state: Double spend detected.');
        }
        return totalSatoshis - consumedSatoshis;
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    /** Track sats already consumed against an address (so subsequent providers don't double-count). */
    protected reportUTXOUsed(address: string, value: u64): void {
        const consumedAlready: u64 = this.consumedOutputsFromUTXOs.has(address)
            ? this.consumedOutputsFromUTXOs.get(address)
            : 0;
        this.consumedOutputsFromUTXOs.set(address, SafeMath.add64(value, consumedAlready));
    }

    private executeProviderTrade(
        provider: Provider,
        data: ReservationProviderData,
        sentSats: u64,
    ): void {
        const requiredSats: u64 = TickMath.tokensToSatoshis(data.providedAmount, data.fillPrice);

        let actualTokens: u128;
        if (sentSats >= requiredSats) {
            actualTokens = data.providedAmount; // full fill
        } else {
            actualTokens = TickMath.satoshisToTokens(sentSats, data.fillPrice);
            // cap by the entry's providedAmount (no overpayment edge case)
            if (u128.gt(actualTokens, data.providedAmount)) {
                actualTokens = data.providedAmount;
            }
        }

        if (actualTokens.isZero()) {
            // sentSats was below the unit cost — treat as no-fill for this leg.
            this.addProviderToPurgeQueue(provider);
            return;
        }

        // Sanity: provider must hold at least `actualTokens` of liquidity.
        if (u128.lt(provider.getLiquidityAmount(), actualTokens)) {
            throw new Revert(
                `Impossible state: provider liquidity < actualTokens (${provider.getLiquidityAmount()} < ${actualTokens}).`,
            );
        }

        const actualSats: u64 = TickMath.tokensToSatoshis(actualTokens, data.fillPrice);
        provider.subtractFromLiquidityAmount(actualTokens);
        this.reportUTXOUsed(provider.getBtcReceiver(), actualSats);

        if (EMIT_PROVIDERCONSUMED_EVENTS) {
            Blockchain.emit(new ProviderConsumedEvent(provider.getId(), actualTokens));
        }

        this.totalTokensPurchased = SafeMath.add(this.totalTokensPurchased, actualTokens.toU256());
        this.totalSatoshisSpent = SafeMath.add64(this.totalSatoshisSpent, actualSats);
        this.totalTokensReserved = SafeMath.add(
            this.totalTokensReserved,
            data.providedAmount.toU256(),
        );

        // If partial fill, queue provider for fast-path re-allocation.
        if (u128.lt(actualTokens, data.providedAmount)) {
            this.addProviderToPurgeQueue(provider);
        }
    }

    private restoreReservedLiquidityForProvider(provider: Provider, value: u128): void {
        if (value.isZero()) return;
        provider.subtractFromReservedAmount(value);
        this.liquidityQueueReserve.subFromTotalReserved(value.toU256());
    }

    private addProviderToPurgeQueue(provider: Provider): void {
        if (!provider.isActive()) return;
        this.tickBitmapManager.addToTickPurged(provider, provider.getPriceTick());
    }

    private deactivateReservation(reservation: Reservation): void {
        this.reservationManager.deactivateReservation(reservation);
    }

    private resetTotals(): void {
        this.totalTokensPurchased = u256.Zero;
        this.totalSatoshisSpent = 0;
        this.totalTokensReserved = u256.Zero;
    }
}
