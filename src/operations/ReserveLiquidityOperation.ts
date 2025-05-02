import { BaseOperation } from './BaseOperation';
import { Address, Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { Reservation } from '../models/Reservation';
import { LiquidityReservedEvent } from '../events/LiquidityReservedEvent';
import { ReservationCreatedEvent } from '../events/ReservationCreatedEvent';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../managers/FeeManager';
import { getTotalFeeCollected } from '../utils/BlockchainUtils';
import { satoshisToTokens, tokensToSatoshis } from '../utils/SatoshisConversion';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import {
    MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
    MINIMUM_TRADE_SIZE_IN_SAT,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';
import { Provider } from '../models/Provider';

export class ReserveLiquidityOperation extends BaseOperation {
    public static MaxActivationDelay: u8 = 3;
    private readonly buyer: Address;
    private readonly maximumAmountIn: u256;
    private readonly minimumAmountOut: u256;
    private readonly providerId: u256;
    private readonly forLP: bool;
    private readonly activationDelay: u8;
    private tokensRemaining: u256 = u256.Zero;
    private tokensReserved: u256 = u256.Zero;
    private satSpent: u256 = u256.Zero;
    private currentQuote: u256 = u256.Zero;

    constructor(
        liquidityQueue: ILiquidityQueue,
        providerId: u256,
        buyer: Address,
        maximumAmountIn: u256,
        minimumAmountOut: u256,
        forLP: bool,
        activationDelay: u8,
    ) {
        super(liquidityQueue);

        this.buyer = buyer;
        this.providerId = providerId;
        this.maximumAmountIn = maximumAmountIn;
        this.minimumAmountOut = minimumAmountOut;
        this.forLP = forLP;
        this.activationDelay = activationDelay;
    }

    public execute(): void {
        this.checkPreConditions();

        const reservation = this.createReservation();

        this.initializeInternalMembers();

        let lastIndex: u64 = <u64>u32.MAX_VALUE + <u64>1; // Impossible value
        let lastProviderId: u256 = u256.Zero;

        // Loop over providers while tokensRemaining > 0
        while (!this.tokensRemaining.isZero()) {
            const tokensRemainingInSatoshis = tokensToSatoshis(
                this.tokensRemaining,
                this.currentQuote,
            );

            if (this.isSmallerThanMinimumReservationAmount(tokensRemainingInSatoshis)) {
                break;
            }

            const provider = this.liquidityQueue.getNextProviderWithLiquidity(this.currentQuote);
            if (provider === null) {
                break;
            }

            // If we see repeated initial liquidity provider => break
            if (provider.getQueueIndex() === u32.MAX_VALUE && lastIndex === u32.MAX_VALUE) {
                break;
            }

            this.ensureNoRepeatedProvider(provider.getId(), lastProviderId);

            lastProviderId = provider.getId();
            lastIndex = provider.getQueueIndex();

            this.ensurePendingRemovalStatesValid(provider);

            if (
                provider.isPendingRemoval() &&
                provider.isLiquidityProvider() &&
                provider.isFromRemovalQueue()
            ) {
                this.reserveFromRemovalProvider(reservation, provider, tokensRemainingInSatoshis);
            } else {
                this.reserveFromProvider(reservation, provider);
            }
        }

        this.ensureMinimumTokenReserved();
        this.liquidityQueue.increaseTotalReserved(this.tokensReserved);
        this.finalizeReservation(reservation);
        this.liquidityQueue.setBlockQuote();
        this.emitReservationCreatedEvent(this.tokensReserved, this.satSpent);
    }

    private checkPreConditions(): void {
        this.ensureNotOwnLiquidity();
        this.ensureActivationDelayValid(this.activationDelay);
        this.ensureMaximumAmountInNotZero(this.maximumAmountIn);
        this.ensureMaximumAmountInNotBelowTradeSize(this.maximumAmountIn);
        this.ensurePoolExistsForToken(this.liquidityQueue.initialLiquidityProviderId);
        this.ensureSufficientFeesCollected();
        this.ensureNoBots();
        this.ensureLiquidityValid();
    }

    private createReservation(): Reservation {
        const reservation = new Reservation(this.liquidityQueue.token, this.buyer);
        this.ensureNoActiveReservation(reservation);
        this.ensureUserNotTimedOut(reservation);

        return reservation;
    }

    private initializeInternalMembers(): void {
        this.currentQuote = this.liquidityQueue.quote();
        this.ensureCurrentQuoteValid();

        this.tokensRemaining = this.computeTokenRemaining();
        this.tokensReserved = u256.Zero;
        this.satSpent = u256.Zero;
    }

    private reserveFromRemovalProvider(
        reservation: Reservation,
        provider: Provider,
        tokensRemainingInSatoshis: u256,
    ): void {
        const providerId = provider.getId();
        const maxOwed = this.liquidityQueue.getBTCOwedLeft(providerId);
        const satoshisToReserve = SafeMath.min(tokensRemainingInSatoshis, maxOwed);
        const tokensToReserve = satoshisToTokens(satoshisToReserve, this.currentQuote);

        if (!tokensToReserve.isZero()) {
            const finalTokens = SafeMath.min(tokensToReserve, this.tokensRemaining);
            const finalSatoshis = u256.eq(tokensToReserve, finalTokens)
                ? satoshisToReserve
                : tokensToSatoshis(finalTokens, this.currentQuote);

            this.applyRemovalReservation(
                provider,
                reservation,
                finalTokens,
                finalSatoshis,
                providerId,
            );
        }
    }

    private applyRemovalReservation(
        provider: Provider,
        reservation: Reservation,
        tokens: u256,
        satoshis: u256,
        providerId: u256,
    ): void {
        this.tokensReserved = SafeMath.add(this.tokensReserved, tokens);
        this.satSpent = SafeMath.add(this.satSpent, satoshis);
        this.tokensRemaining = SafeMath.sub(this.tokensRemaining, tokens);

        const currentReserved = this.liquidityQueue.getBTCowedReserved(providerId);
        const newReserved = SafeMath.add(currentReserved, satoshis);
        this.liquidityQueue.setBTCowedReserved(providerId, newReserved);

        reservation.addProvider({
            providedAmount: tokens.toU128(),
            providerIndex: provider.getQueueIndex(),
            providerType: provider.getProviderType(),
        });

        this.emitLiquidityReservedEvent(providerId, provider.getbtcReceiver(), satoshis.toU128());
    }

    private reserveFromProvider(reservation: Reservation, provider: Provider): void {
        const availableLiquidity = provider.getAvailableLiquidityAmount();
        const tokensToAttempt = this.computeInitialTokensToReserve(availableLiquidity);
        const costInSatoshis = this.computeCostWithMinimumCheck(
            tokensToAttempt,
            availableLiquidity,
        );
        const finalTokensToReserve = satoshisToTokens(costInSatoshis, this.currentQuote);

        if (!finalTokensToReserve.isZero()) {
            this.applyReservation(reservation, provider, finalTokensToReserve, costInSatoshis);
        }
    }

    private computeInitialTokensToReserve(availableLiquidity: u256): u256 {
        return SafeMath.min(availableLiquidity, this.tokensRemaining);
    }

    private computeCostWithMinimumCheck(desiredTokens: u256, maxLiquidity: u256): u256 {
        const maxCost = tokensToSatoshis(maxLiquidity, this.currentQuote);
        const desiredCost = tokensToSatoshis(desiredTokens, this.currentQuote);
        const leftover = SafeMath.sub(maxCost, desiredCost);

        // if leftover would drop below the minimum provider reservation, take it all
        return u256.lt(leftover, MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)
            ? maxCost
            : desiredCost;
    }

    private applyReservation(
        reservation: Reservation,
        provider: Provider,
        tokens: u256,
        costInSatoshis: u256,
    ): void {
        const tokensU128 = tokens.toU128();

        provider.addToReservedAmount(tokensU128);

        this.tokensReserved = SafeMath.add(this.tokensReserved, tokens);
        this.satSpent = SafeMath.add(this.satSpent, costInSatoshis);

        if (u256.gt(this.tokensRemaining, tokens)) {
            this.tokensRemaining = SafeMath.sub(this.tokensRemaining, tokens);
        } else {
            this.tokensRemaining = u256.Zero;
        }

        reservation.addProvider({
            providedAmount: tokensU128,
            providerIndex: provider.getQueueIndex(),
            providerType: provider.getProviderType(),
        });

        this.emitLiquidityReservedEvent(
            provider.getId(),
            provider.getbtcReceiver(),
            costInSatoshis.toU128(),
        );
    }

    private finalizeReservation(reservation: Reservation): void {
        reservation.setActivationDelay(this.activationDelay);

        if (this.forLP) {
            reservation.markForLiquidityPool();
        }

        reservation.setCreationBlock(Blockchain.block.number);

        const index: u32 = this.liquidityQueue.addActiveReservation(
            Blockchain.block.number,
            reservation.getId(),
        );

        reservation.setPurgeIndex(index);
        reservation.save();
    }

    private isSmallerThanMinimumReservationAmount(amount: u256): boolean {
        if (u256.lt(amount, STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)) {
            return true;
        }

        return false;
    }

    private computeTokenRemaining(): u256 {
        const tokens = satoshisToTokens(this.maximumAmountIn, this.currentQuote);

        const limitedByLiquidity = this.limitByAvailableLiquidity(tokens);
        this.ensureAvailableLiquidityNonZero(limitedByLiquidity);

        const limitedByCap = this.limitByReservationCap(limitedByLiquidity);
        this.ensureCapNotReached(limitedByCap);

        this.ensureMinimumReservationMet(limitedByCap);

        return limitedByCap;
    }

    private limitByAvailableLiquidity(tokens: u256): u256 {
        const available = this.liquidityQueue.availableLiquidity;

        return SafeMath.min(available, tokens);
    }

    private limitByReservationCap(tokens: u256): u256 {
        const cap = this.liquidityQueue.getMaximumTokensLeftBeforeCap();

        return SafeMath.min(tokens, cap);
    }

    private ensureAvailableLiquidityNonZero(tokens: u256): void {
        if (tokens.isZero()) {
            throw new Revert('NATIVE_SWAP: Not enough liquidity available');
        }
    }

    private ensureCapNotReached(tokens: u256): void {
        if (tokens.isZero()) {
            throw new Revert('NATIVE_SWAP: Maximum reservation limit reached. Try again later');
        }
    }

    private ensureMinimumReservationMet(tokens: u256): void {
        const satCost = tokensToSatoshis(tokens, this.currentQuote);

        if (u256.lt(satCost, MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)) {
            throw new Revert(`NATIVE_SWAP: Minimum liquidity not met (${satCost} sat)`);
        }
    }

    private ensureNoActiveReservation(reservation: Reservation): void {
        if (reservation.isValid()) {
            throw new Revert(
                'NATIVE_SWAP: You already have an active reservation. Swap or wait for expiration before creating another',
            );
        }
    }

    private ensureUserNotTimedOut(reservation: Reservation): void {
        const userTimeoutUntilBlock: u64 = reservation.getUserTimeoutBlockExpiration();

        if (
            this.liquidityQueue.timeOutEnabled &&
            Blockchain.block.number <= userTimeoutUntilBlock
        ) {
            throw new Revert('NATIVE_SWAP: User is timed out');
        }
    }

    private ensureCurrentQuoteValid(): void {
        if (this.currentQuote.isZero()) {
            throw new Revert('Impossible state: Token is worth infinity');
        }
    }

    private ensureNoBots(): void {
        if (Blockchain.block.number <= this.liquidityQueue.antiBotExpirationBlock) {
            if (u256.gt(this.maximumAmountIn, this.liquidityQueue.maxTokensPerReservation)) {
                throw new Revert('NATIVE_SWAP: Cannot exceed anti-bot max tokens per reservation');
            }
        }
    }

    private ensureLiquidityValid(): void {
        if (u256.lt(this.liquidityQueue.liquidity, this.liquidityQueue.reservedLiquidity)) {
            throw new Revert('Impossible state: liquidity < reservedLiquidity');
        }
    }

    private ensureMaximumAmountInNotZero(maximumAmountIn: u256): void {
        if (maximumAmountIn.isZero()) {
            throw new Revert('NATIVE_SWAP: Maximum amount in cannot be zero');
        }
    }

    private ensureMaximumAmountInNotBelowTradeSize(maximumAmountIn: u256): void {
        if (u256.lt(maximumAmountIn, MINIMUM_TRADE_SIZE_IN_SAT)) {
            throw new Revert(
                `NATIVE_SWAP: Requested amount is below minimum trade size ${maximumAmountIn} < ${MINIMUM_TRADE_SIZE_IN_SAT}`,
            );
        }
    }

    private ensureActivationDelayValid(activationDelay: u8): void {
        if (activationDelay > ReserveLiquidityOperation.MaxActivationDelay) {
            throw new Revert(
                `NATIVE_SWAP: Activation delay cannot be greater than ${ReserveLiquidityOperation.MaxActivationDelay}`,
            );
        }
    }

    private ensurePoolExistsForToken(initialLiquidityProviderId: u256): void {
        if (initialLiquidityProviderId.isZero()) {
            throw new Revert('NATIVE_SWAP: No pool exists for token');
        }
    }

    private ensureSufficientFeesCollected(): void {
        const totalFee = getTotalFeeCollected();

        if (totalFee < FeeManager.reservationBaseFee) {
            throw new Revert('NATIVE_SWAP: Insufficient fees collected');
        }
    }

    private ensureNotOwnLiquidity(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProviderId)) {
            throw new Revert('NATIVE_SWAP: You may not reserve your own liquidity');
        }
    }

    private ensurePendingRemovalStatesValid(provider: Provider): void {
        if (provider.isPendingRemoval()) {
            if (!provider.isLiquidityProvider()) {
                throw new Revert(
                    `Impossible state: provider ${provider.getId()} cannot be in pending removal state and not be a LP`,
                );
            }

            if (!provider.isFromRemovalQueue()) {
                throw new Revert(
                    `Impossible state: provider ${provider.getId()} cannot be in pending removal state and not be marked as coming from removal queue`,
                );
            }
        }

        if (provider.isFromRemovalQueue()) {
            if (!provider.isPendingRemoval()) {
                throw new Revert(
                    `Impossible state: provider ${provider.getId()} cannot be from removal queue and not be in pending removal state`,
                );
            }

            if (!provider.isLiquidityProvider()) {
                throw new Revert(
                    `Impossible state: provider ${provider.getId()} cannot be from removal queue and not be a LP`,
                );
            }
        }
    }

    private ensureNoRepeatedProvider(currentId: u256, lastId: u256): void {
        if (u256.eq(currentId, lastId)) {
            throw new Revert(`Impossible state: repeated provider, ${currentId} === ${lastId}`);
        }
    }

    private ensureMinimumTokenReserved(): void {
        if (u256.lt(this.tokensReserved, this.minimumAmountOut)) {
            throw new Revert(
                `NATIVE_SWAP: Not enough liquidity reserved; wanted ${this.minimumAmountOut}, got ${tokensReserved}, spent ${satSpent}, leftover tokens: ${this.tokensRemaining}, quote: ${currentQuote}`,
            );
        }
    }

    private emitReservationCreatedEvent(tokensReserved: u256, satSpent: u256): void {
        Blockchain.emit(new ReservationCreatedEvent(tokensReserved, satSpent));
    }

    private emitLiquidityReservedEvent(
        providerId: u256,
        btcReceiver: string,
        costInSatoshis: u128,
    ): void {
        Blockchain.emit(new LiquidityReservedEvent(btcReceiver, costInSatoshis, providerId));
    }
}
