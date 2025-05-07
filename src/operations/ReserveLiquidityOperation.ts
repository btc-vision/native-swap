import { BaseOperation } from './BaseOperation';
import { Address, Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { Reservation } from '../models/Reservation';
import { LiquidityReservedEvent } from '../events/LiquidityReservedEvent';
import { ReservationCreatedEvent } from '../events/ReservationCreatedEvent';
import { u128, u256 } from '@btc-vision/as-bignum';
import { FeeManager } from '../managers/FeeManager';
import { getTotalFeeCollected } from '../utils/BlockchainUtils';
import {
    CappedTokensResult,
    satoshisToTokens,
    satoshisToTokens128,
    tokensToSatoshis,
    tokensToSatoshis128,
} from '../utils/SatoshisConversion';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import {
    MAX_ACTIVATION_DELAY,
    MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
    MINIMUM_TRADE_SIZE_IN_SAT,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';
import { Provider } from '../models/Provider';

export class ReserveLiquidityOperation extends BaseOperation {
    private readonly buyer: Address;
    private readonly maximumAmountInSats: u64;
    private readonly minimumAmountOutTokens: u256;
    private readonly providerId: u256;
    private readonly forLP: boolean;
    private readonly activationDelay: u8;
    private tokensRemaining: u256 = u256.Zero;
    private tokensReserved: u256 = u256.Zero;
    private satSpent: u64 = 0;
    private currentQuote: u256 = u256.Zero;

    constructor(
        liquidityQueue: ILiquidityQueue,
        providerId: u256,
        buyer: Address,
        maximumAmountInSats: u64,
        minimumAmountOutTokens: u256,
        forLP: boolean,
        activationDelay: u8,
    ) {
        super(liquidityQueue);

        this.buyer = buyer;
        this.providerId = providerId;
        this.maximumAmountInSats = maximumAmountInSats;
        this.minimumAmountOutTokens = minimumAmountOutTokens;
        this.forLP = forLP;
        this.activationDelay = activationDelay;
    }

    public execute(): void {
        this.checkPreConditions();

        const reservation: Reservation = this.createReservation();

        this.initializeInternalMembers();

        let lastIndex: u64 = <u64>u32.MAX_VALUE + <u64>1; // Impossible value
        let lastProviderId: u256 = u256.Zero;

        // Loop over providers while tokensRemaining > 0
        while (!this.tokensRemaining.isZero()) {
            const tokensRemainingInSatoshis: u64 = tokensToSatoshis(
                this.tokensRemaining,
                this.currentQuote,
            );

            if (this.isSmallerThanMinimumReservationAmount(tokensRemainingInSatoshis)) {
                break;
            }

            const provider: Provider | null = this.liquidityQueue.getNextProviderWithLiquidity(
                this.currentQuote,
            );
            if (provider === null) {
                break;
            }

            //!!!
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
        this.ensureActivationDelayValid();
        this.ensureMaximumAmountInNotZero();
        this.ensureMaximumAmountInNotBelowTradeSize();
        this.ensurePoolExistsForToken();
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
        this.getValidQuote();
        this.tokensRemaining = this.computeTokenRemaining();
        this.tokensReserved = u256.Zero;
        this.satSpent = 0;
    }

    private reserveFromRemovalProvider(
        reservation: Reservation,
        provider: Provider,
        tokensRemainingInSatoshis: u64,
    ): void {
        const owed: u64 = this.liquidityQueue.getBTCOwedLeft(provider.getId());
        let targetSatoshisToReserve: u64;
        let targetTokensToReserve: u128;

        if (tokensRemainingInSatoshis > owed) {
            const conversionResult: CappedTokensResult = satoshisToTokens128(
                owed,
                this.currentQuote,
            );

            targetSatoshisToReserve = conversionResult.satoshis;
            targetTokensToReserve = conversionResult.tokens;
        } else {
            const conversionResult: CappedTokensResult = this.capTokensU256ToU128(
                this.tokensRemaining,
                tokensRemainingInSatoshis,
            );

            targetSatoshisToReserve = conversionResult.satoshis;
            targetTokensToReserve = conversionResult.tokens;
        }

        if (!targetTokensToReserve.isZero()) {
            this.applyRemovalReservation(
                provider,
                reservation,
                targetTokensToReserve,
                targetSatoshisToReserve,
            );
        }
    }

    private applyRemovalReservation(
        provider: Provider,
        reservation: Reservation,
        tokens: u128,
        satoshis: u64,
    ): void {
        const providerId = provider.getId();
        const tokens256 = tokens.toU256();

        this.increaseTokensReserved(tokens256);
        this.decreaseTokensRemaining(tokens256);
        this.increaseSatSpent(satoshis);
        this.liquidityQueue.increaseBTCowedReserved(providerId, satoshis);

        reservation.addProvider({
            providedAmount: tokens,
            providerIndex: provider.getQueueIndex(),
            providerType: provider.getProviderType(),
        });

        this.emitLiquidityReservedEvent(providerId, provider.getBtcReceiver(), satoshis);
    }

    private reserveFromProvider(reservation: Reservation, provider: Provider): void {
        const availableLiquidity: u128 = provider.getAvailableLiquidityAmount();
        const tokensToAttempt: u128 = this.computeInitialTokensToReserve(availableLiquidity);
        const costInSatoshis: u64 = this.computeCostWithMinimumCheck(
            tokensToAttempt,
            availableLiquidity,
        );

        const finalTokensToReserve: CappedTokensResult = satoshisToTokens128(
            costInSatoshis,
            this.currentQuote,
        );

        if (!finalTokensToReserve.tokens.isZero()) {
            this.applyReservation(
                reservation,
                provider,
                finalTokensToReserve.tokens,
                finalTokensToReserve.satoshis,
            );
        }
    }

    private computeInitialTokensToReserve(availableLiquidity: u128): u128 {
        let targetTokensToReserve: u128;

        if (u256.ge(this.tokensRemaining, availableLiquidity.toU256())) {
            targetTokensToReserve = availableLiquidity;
        } else {
            // As tokensRemaining(u256) < availableLiquidity (u128), then we are sure tokensRemaining fits in an u128
            targetTokensToReserve = this.tokensRemaining.toU128();
        }

        return targetTokensToReserve;
    }

    private computeCostWithMinimumCheck(desiredTokens: u128, availableLiquidity: u128): u64 {
        const availableLiquidityCost: u64 = tokensToSatoshis128(
            availableLiquidity,
            this.currentQuote,
        );
        const desiredTokensCost: u64 = tokensToSatoshis128(desiredTokens, this.currentQuote);
        const leftover: u64 = SafeMath.sub64(availableLiquidityCost, desiredTokensCost);

        return leftover < MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT
            ? availableLiquidityCost
            : desiredTokensCost;
    }

    private applyReservation(
        reservation: Reservation,
        provider: Provider,
        tokens: u128,
        costInSatoshis: u64,
    ): void {
        const tokens256 = tokens.toU256();

        provider.addToReservedAmount(tokens);
        this.increaseSatSpent(costInSatoshis);
        this.increaseTokensReserved(tokens256);

        if (u256.gt(this.tokensRemaining, tokens256)) {
            this.tokensRemaining = SafeMath.sub(this.tokensRemaining, tokens256);
        } else {
            this.tokensRemaining = u256.Zero;
        }

        reservation.addProvider({
            providedAmount: tokens,
            providerIndex: provider.getQueueIndex(),
            providerType: provider.getProviderType(),
        });

        this.emitLiquidityReservedEvent(
            provider.getId(),
            provider.getBtcReceiver(),
            costInSatoshis,
        );
    }

    private finalizeReservation(reservation: Reservation): void {
        reservation.setActivationDelay(this.activationDelay);

        if (this.forLP) {
            reservation.markForLiquidityPool();
        }

        reservation.setCreationBlock(Blockchain.block.number);

        const index: u32 = this.liquidityQueue.addActiveReservation(reservation);

        reservation.setPurgeIndex(index);
        reservation.save();
    }

    private isSmallerThanMinimumReservationAmount(satoshis: u64): boolean {
        return satoshis < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT;
    }

    private computeTokenRemaining(): u256 {
        const tokens = satoshisToTokens(this.maximumAmountInSats, this.currentQuote);
        const limitedByLiquidity = this.limitByAvailableLiquidity(tokens);
        this.ensureAvailableLiquidityNonZero(limitedByLiquidity);

        const limitedByCap = this.limitByReservationCap(limitedByLiquidity);
        this.ensureCapNotReached(limitedByCap);
        this.ensureMinimumReservationMet(limitedByCap);

        return limitedByCap;
    }

    private limitByAvailableLiquidity(tokens: u256): u256 {
        return SafeMath.min(this.liquidityQueue.availableLiquidity, tokens);
    }

    private limitByReservationCap(tokens: u256): u256 {
        const cap = this.liquidityQueue.getMaximumTokensLeftBeforeCap();

        return SafeMath.min(tokens, cap);
    }

    private capTokensU256ToU128(tokensIn: u256, satoshisIn: u64): CappedTokensResult {
        const result: CappedTokensResult = new CappedTokensResult();

        if (!tokensIn.isZero()) {
            if (u256.gt(tokensIn, u128.Max.toU256())) {
                result.tokens = u128.Max;
                result.satoshis = tokensToSatoshis128(result.tokens, this.currentQuote);
            } else {
                result.tokens = tokensIn.toU128();
                result.satoshis = satoshisIn;
            }
        }

        return result;
    }

    private getValidQuote(): void {
        this.currentQuote = this.liquidityQueue.quote();
        this.ensureCurrentQuoteValid();
    }

    private increaseTokensReserved(value: u256) {
        this.tokensReserved = SafeMath.add(this.tokensReserved, value);
    }

    private decreaseTokensRemaining(value: u256) {
        this.tokensRemaining = SafeMath.sub(this.tokensRemaining, value);
    }

    private increaseSatSpent(value: u64) {
        this.satSpent = SafeMath.add64(this.satSpent, value);
    }

    private ensureAvailableLiquidityNonZero(tokens: u256): void {
        if (tokens.isZero()) {
            throw new Revert('NATIVE_SWAP: Not enough liquidity available.');
        }
    }

    private ensureCapNotReached(tokens: u256): void {
        if (tokens.isZero()) {
            throw new Revert('NATIVE_SWAP: Maximum reservation limit reached. Try again later.');
        }
    }

    private ensureMinimumReservationMet(tokens: u256): void {
        const satCost = tokensToSatoshis(tokens, this.currentQuote);

        if (satCost < MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT) {
            throw new Revert(`NATIVE_SWAP: Minimum liquidity not met (${satCost} sat).`);
        }
    }

    private ensureNoActiveReservation(reservation: Reservation): void {
        if (reservation.isValid()) {
            throw new Revert(
                'NATIVE_SWAP: You already have an active reservation. Swap or wait for expiration before creating another.',
            );
        }
    }

    private ensureUserNotTimedOut(reservation: Reservation): void {
        const userTimeoutUntilBlock: u64 = reservation.getUserTimeoutBlockExpiration();

        if (
            this.liquidityQueue.timeOutEnabled &&
            Blockchain.block.number <= userTimeoutUntilBlock
        ) {
            throw new Revert('NATIVE_SWAP: User is timed out.');
        }
    }

    private ensureCurrentQuoteValid(): void {
        if (this.currentQuote.isZero()) {
            throw new Revert('Impossible state: Token is worth infinity.');
        }
    }

    private ensureNoBots(): void {
        //!!!!
        if (Blockchain.block.number <= this.liquidityQueue.antiBotExpirationBlock) {
            if (u256.gt(this.maximumAmountInSats, this.liquidityQueue.maxTokensPerReservation)) {
                throw new Revert('NATIVE_SWAP: Cannot exceed anti-bot max tokens per reservation.');
            }
        }
    }

    private ensureLiquidityValid(): void {
        if (u256.lt(this.liquidityQueue.liquidity, this.liquidityQueue.reservedLiquidity)) {
            throw new Revert('Impossible state: liquidity < reservedLiquidity.');
        }
    }

    private ensureMaximumAmountInNotZero(): void {
        if (this.maximumAmountInSats === 0) {
            throw new Revert('NATIVE_SWAP: Maximum amount in cannot be zero.');
        }
    }

    private ensureMaximumAmountInNotBelowTradeSize(): void {
        if (this.maximumAmountInSats < MINIMUM_TRADE_SIZE_IN_SAT) {
            throw new Revert(
                `NATIVE_SWAP: Requested amount is below minimum trade size ${this.maximumAmountInSats} < ${MINIMUM_TRADE_SIZE_IN_SAT}.`,
            );
        }
    }

    private ensureActivationDelayValid(): void {
        if (this.activationDelay > MAX_ACTIVATION_DELAY) {
            throw new Revert(
                `NATIVE_SWAP: Activation delay cannot be greater than ${MAX_ACTIVATION_DELAY}.`,
            );
        }
    }

    private ensurePoolExistsForToken(): void {
        if (this.liquidityQueue.initialLiquidityProviderId.isZero()) {
            throw new Revert('NATIVE_SWAP: No pool exists for token.');
        }
    }

    private ensureSufficientFeesCollected(): void {
        const totalFee = getTotalFeeCollected();

        if (totalFee < FeeManager.reservationBaseFee) {
            throw new Revert('NATIVE_SWAP: Insufficient fees collected.');
        }
    }

    private ensureNotOwnLiquidity(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProviderId)) {
            throw new Revert('NATIVE_SWAP: You may not reserve your own liquidity.');
        }
    }

    private ensurePendingRemovalStatesValid(provider: Provider): void {
        if (provider.isPendingRemoval()) {
            if (!provider.isLiquidityProvider()) {
                throw new Revert(
                    `Impossible state: provider ${provider.getId()} cannot be in pending removal state and not be a LP.`,
                );
            }

            if (!provider.isFromRemovalQueue()) {
                throw new Revert(
                    `Impossible state: provider ${provider.getId()} cannot be in pending removal state and not be marked as coming from removal queue.`,
                );
            }
        }

        if (provider.isFromRemovalQueue()) {
            if (!provider.isPendingRemoval()) {
                throw new Revert(
                    `Impossible state: provider ${provider.getId()} cannot be from removal queue and not be in pending removal state.`,
                );
            }

            if (!provider.isLiquidityProvider()) {
                throw new Revert(
                    `Impossible state: provider ${provider.getId()} cannot be from removal queue and not be a LP.`,
                );
            }
        }
    }

    private ensureNoRepeatedProvider(currentId: u256, lastId: u256): void {
        if (u256.eq(currentId, lastId)) {
            throw new Revert(`Impossible state: repeated provider, ${currentId} === ${lastId}.`);
        }
    }

    private ensureMinimumTokenReserved(): void {
        if (u256.lt(this.tokensReserved, this.minimumAmountOutTokens)) {
            throw new Revert(
                `NATIVE_SWAP: Not enough liquidity reserved; wanted ${this.minimumAmountOutTokens}, got ${this.tokensReserved}, spent ${this.satSpent}, leftover tokens: ${this.tokensRemaining}, quote: ${this.currentQuote}.`,
            );
        }
    }

    private emitReservationCreatedEvent(tokensReserved: u256, satSpent: u64): void {
        Blockchain.emit(new ReservationCreatedEvent(tokensReserved, satSpent));
    }

    private emitLiquidityReservedEvent(
        providerId: u256,
        btcReceiver: string,
        costInSatoshis: u64,
    ): void {
        Blockchain.emit(new LiquidityReservedEvent(btcReceiver, costInSatoshis, providerId));
    }
}
