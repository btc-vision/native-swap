import { BaseOperation } from './BaseOperation';
import {
    Address,
    Blockchain,
    ExtendedAddress,
    Revert,
    SafeMath,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Reservation } from '../models/Reservation';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { LiquidityReservedEvent } from '../events/LiquidityReservedEvent';
import { ReservationCreatedEvent } from '../events/ReservationCreatedEvent';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { Provider } from '../models/Provider';
import { TickMath } from '../utils/TickMath';
import {
    MAX_ACTIVATION_DELAY,
    MAX_TICK,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
    MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
    MINIMUM_TRADE_SIZE_IN_SAT,
    RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';

/**
 * Walk the bitmap from cheapest tick upward and reserve providers' liquidity until the
 * buyer's `maxAmountInSats` is exhausted or `maxProviders` is reached.
 *
 * For each picked provider:
 *   - read the provider's tick → fillPrice via TickMath
 *   - reserve `tokensToReserve = min(avail, sats_budget_to_tokens)`
 *   - record an entry: `(providerId, providedAmount, tick, fillPrice, creationBlock)`
 *   - bump `provider.latestReservedUntilBlock` (monotonic max — locks listing for cancel/update)
 *   - dust-snap if leftover would be < 1k sats: snap up provider's full availableLiquidity
 *
 * Minimums enforced:
 *   - buyer-side: `maxAmountInSats >= MINIMUM_TRADE_SIZE_IN_SAT` (10k)
 *   - per-entry:  walk breaks when `tokensToReserve` would be worth < 1,000 sats
 *
 * The buyer must prove ownership by sending `remainingSats` to a CSV P2WSH derived from
 * their pubkey + activationDelay — preserved from the existing flow.
 */
export class ReserveLiquidityOperation extends BaseOperation {
    private readonly buyer: Address;
    private readonly providerId: u256;
    private readonly maximumAmountInSats: u64;
    private readonly minimumAmountOutTokens: u256;
    private readonly activationDelay: u8;
    private readonly maximumProvidersPerReservation: u8;
    private readonly numberOfFulfilledProviderToResets: u8;
    private readonly sender: Uint8Array;

    private reservedTokens: u256 = u256.Zero;
    private satoshisSpent: u64 = 0;
    private reservedProviderCount: u8 = 0;

    constructor(
        liquidityQueue: ILiquidityQueue,
        providerId: u256,
        buyer: Address,
        maximumAmountInSats: u64,
        minimumAmountOutTokens: u256,
        activationDelay: u8,
        maximumProvidersPerReservation: u8,
        numberOfFulfilledProviderToResets: u8,
        sender: Uint8Array,
    ) {
        super(liquidityQueue);
        this.providerId = providerId;
        this.buyer = buyer;
        this.maximumAmountInSats = maximumAmountInSats;
        this.minimumAmountOutTokens = minimumAmountOutTokens;
        this.activationDelay = activationDelay;
        this.maximumProvidersPerReservation = maximumProvidersPerReservation;
        this.numberOfFulfilledProviderToResets = numberOfFulfilledProviderToResets;
        this.sender = sender;
    }

    public override execute(): void {
        this.checkPreConditions();

        const reservation: Reservation = this.createReservation();

        // Run incremental purge before walking — frees any expired reservations' reserved tokens.
        this.liquidityQueue.purgeReservationsAndRestoreProviders();

        this.verifySentEnoughSatoshi();

        this.reserveProviders(reservation);

        this.ensureMinimumTokenReserved();

        this.liquidityQueue.increaseTotalReserved(this.reservedTokens);
        this.liquidityQueue.addReservation(reservation);
        this.liquidityQueue.cleanUpQueues();

        Blockchain.emit(new ReservationCreatedEvent(this.reservedTokens, this.satoshisSpent));
    }

    /**
     * The walk. Updates running totals and emits LiquidityReservedEvent per entry.
     */
    private reserveProviders(reservation: Reservation): void {
        let remainingSats: u64 = this.maximumAmountInSats;

        while (
            remainingSats >= STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT &&
            this.reservedProviderCount < this.maximumProvidersPerReservation
        ) {
            const tick: i32 = this.liquidityQueue.bestTick();
            if (tick > MAX_TICK) break;
            const fillPrice: u128 = TickMath.tickToPrice(tick);

            const provider: Provider | null = this.liquidityQueue.getNextProviderWithLiquidity();
            if (provider === null) break;

            const avail: u128 = provider.getAvailableLiquidityAmount();
            const tokensFitsBudget: u128 = TickMath.satoshisToTokens(remainingSats, fillPrice);
            let tokensToReserve: u128 = u128.lt(avail, tokensFitsBudget) ? avail : tokensFitsBudget;

            // Per-provider minimum (≥ 1,000 sats) — walk breaks if not met.
            if (!Provider.meetsMinimumReservationAmountAtTick(tokensToReserve, tick)) break;

            // Dust-snap: if leftover after this reservation would be below the per-provider
            // minimum, grab the whole remaining liquidity into THIS entry as a bonus to the
            // buyer (the dust would otherwise be stranded). The buyer's sats spend is capped
            // at their existing budget — the provider effectively absorbs the dust loss.
            let dustSnapped: bool = false;
            const leftoverTokens: u128 = SafeMath.sub128(avail, tokensToReserve);
            if (!leftoverTokens.isZero()) {
                const leftoverSats: u64 = TickMath.tokensToSatoshis(leftoverTokens, fillPrice);
                if (leftoverSats < MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT) {
                    tokensToReserve = avail;
                    dustSnapped = true;
                }
            }

            // Buyer's sats spent for this entry. If dust-snapped, cap at remainingSats —
            // the bonus tokens are free to the buyer.
            let sats: u64 = TickMath.tokensToSatoshis(tokensToReserve, fillPrice);
            if (dustSnapped && sats > remainingSats) {
                sats = remainingSats;
            }
            if (sats == 0) break; // shouldn't happen given the min checks, defensive guard

            provider.addToReservedAmount(tokensToReserve);
            provider.bumpLatestReservedUntilBlock(reservation.getExpirationBlock());

            reservation.addProvider(
                new ReservationProviderData(
                    provider.getId(),
                    tokensToReserve,
                    tick,
                    fillPrice,
                    reservation.getCreationBlock(),
                ),
            );
            Blockchain.emit(
                new LiquidityReservedEvent(
                    provider.getBtcReceiver(),
                    sats,
                    tokensToReserve,
                    provider.getId(),
                    tick,
                    fillPrice,
                ),
            );

            this.reservedTokens = SafeMath.add(this.reservedTokens, tokensToReserve.toU256());
            this.satoshisSpent = SafeMath.add64(this.satoshisSpent, sats);
            remainingSats = SafeMath.sub64(remainingSats, sats);
            this.reservedProviderCount += 1;
            if (remainingSats == 0) break;
        }

        reservation.save();
    }

    // ========================================================================
    // Pre-conditions / guards
    // ========================================================================

    private checkPreConditions(): void {
        if (!this.liquidityQueue.isPoolRegistered()) {
            throw new Revert(
                'NATIVE_SWAP: Pool not registered for this token. Call createPool first.',
            );
        }
        if (this.activationDelay == 0 || this.activationDelay > MAX_ACTIVATION_DELAY) {
            throw new Revert(
                `NATIVE_SWAP: activationDelay must be in (0, ${MAX_ACTIVATION_DELAY}]; got ${this.activationDelay}.`,
            );
        }
        if (this.maximumAmountInSats == 0) {
            throw new Revert('NATIVE_SWAP: maxAmountInSats cannot be zero.');
        }
        // Buyer-side minimum: at least MINIMUM_TRADE_SIZE_IN_SAT (10,000 sats).
        if (this.maximumAmountInSats < MINIMUM_TRADE_SIZE_IN_SAT) {
            throw new Revert(
                `NATIVE_SWAP: maxAmountInSats below minimum trade size (${MINIMUM_TRADE_SIZE_IN_SAT}).`,
            );
        }
        if (this.maximumProvidersPerReservation == 0 ||
            this.maximumProvidersPerReservation > MAXIMUM_PROVIDER_PER_RESERVATIONS) {
            throw new Revert(
                `NATIVE_SWAP: maximumProvidersPerReservation out of range.`,
            );
        }
    }

    private createReservation(): Reservation {
        const reservation: Reservation = new Reservation(this.liquidityQueue.token, this.buyer);

        // If a previous reservation exists and is expired, allow re-use after purge.
        // Otherwise, reject — only one active reservation per (token, buyer).
        if (reservation.isExpired()) {
            if (reservation.isDirty()) {
                reservation.delete(false);
            }
        } else {
            throw new Revert(
                'NATIVE_SWAP: You already have an active reservation. Swap or wait for expiration.',
            );
        }

        // Honor user timeout (if enabled by pool settings).
        if (
            this.liquidityQueue.timeOutEnabled &&
            Blockchain.block.number <= reservation.getUserTimeoutBlockExpiration()
        ) {
            throw new Revert('NATIVE_SWAP: User is timed out.');
        }

        reservation.setActivationDelay(this.activationDelay);
        reservation.setCreationBlock(Blockchain.block.number);
        reservation.setSwapped(false);
        reservation.setPurged(false);
        reservation.save();
        return reservation;
    }

    /**
     * Buyer must prove ownership by sending sats to their own CSV-derived address.
     * The required amount is `maximumAmountInSats` (the budget). If they sent less,
     * it caps how many providers we can fill on settlement — but at reservation time
     * we already require the full budget to be locked.
     */
    private verifySentEnoughSatoshi(): void {
        const csvAddress: string = ExtendedAddress.toCSV(this.sender, this.activationDelay);
        const sentSatoshis: u64 = this.getSatoshisSent(csvAddress);
        if (this.maximumAmountInSats > sentSatoshis) {
            throw new Revert(
                `NATIVE_SWAP: prove ownership by sending ${this.maximumAmountInSats} sats to ${csvAddress}; sent ${sentSatoshis}.`,
            );
        }
    }

    private getSatoshisSent(address: string): u64 {
        let total: u64 = 0;
        const outputs = Blockchain.tx.outputs;
        for (let i = 0; i < outputs.length; i++) {
            const out = outputs[i];
            if (out.to === address) total = SafeMath.add64(total, out.value);
        }
        return total;
    }

    private ensureMinimumTokenReserved(): void {
        if (this.reservedTokens.isZero()) {
            throw new Revert('NATIVE_SWAP: No liquidity reserved.');
        }
        if (u256.lt(this.reservedTokens, this.minimumAmountOutTokens)) {
            throw new Revert(
                `NATIVE_SWAP: Not enough liquidity reserved (got ${this.reservedTokens}, wanted ${this.minimumAmountOutTokens}).`,
            );
        }
    }
}
