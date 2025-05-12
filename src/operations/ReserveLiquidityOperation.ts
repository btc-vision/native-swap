import { BaseOperation } from './BaseOperation';
import { Address, Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { Reservation } from '../models/Reservation';
import { LiquidityReservedEvent } from '../events/LiquidityReservedEvent';
import { ReservationCreatedEvent } from '../events/ReservationCreatedEvent';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../managers/FeeManager';
import { getTotalFeeCollected } from '../utils/BlockchainUtils';
import {
    CappedTokensResult,
    capTokensU256ToU128,
    satoshisToTokens,
    satoshisToTokens128,
    tokensToSatoshis,
    tokensToSatoshis128,
} from '../utils/SatoshisConversion';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import {
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    MAX_ACTIVATION_DELAY,
    MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
    MINIMUM_TRADE_SIZE_IN_SAT,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';
import { Provider } from '../models/Provider';
import { ReservationProviderData } from '../models/ReservationProdiverData';

export class ReserveLiquidityOperation extends BaseOperation {
    private readonly buyer: Address;
    private readonly maximumAmountInSats: u64;
    private readonly minimumAmountOutTokens: u256;
    private readonly providerId: u256;
    private readonly forLP: boolean;
    private readonly activationDelay: u8;
    private remainingTokens: u256 = u256.Zero;
    private reservedTokens: u256 = u256.Zero;
    private satoshisSpent: u64 = 0;
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
        this.initializeInternalMembers();

        const reservation: Reservation = this.createReservation();

        this.reserve(reservation);
        this.ensureMinimumTokenReserved();
        this.liquidityQueue.increaseTotalReserved(this.reservedTokens);
        this.finalizeReservation(reservation);
        this.liquidityQueue.setBlockQuote();
        this.emitReservationCreatedEvent();
    }

    private checkPreConditions(): void {
        this.ensureNotOwnLiquidity();
        this.ensureActivationDelayValid();
        this.ensureMaximumAmountInNotZero();
        this.ensureMaximumAmountInNotBelowTradeSize();
        this.ensurePoolExistsForToken();
        this.ensureSufficientFeesCollected();
        this.ensureLiquidityValid();
    }

    private createReservation(): Reservation {
        const reservation: Reservation = new Reservation(this.liquidityQueue.token, this.buyer);
        this.ensureNoActiveReservation(reservation);
        this.ensureUserNotTimedOut(reservation);

        reservation.setActivationDelay(this.activationDelay);

        if (this.forLP) {
            reservation.markForLiquidityPool();
        }

        reservation.setCreationBlock(Blockchain.block.number);

        return reservation;
    }

    private initializeInternalMembers(): void {
        this.getValidQuote();
        this.computeTokenRemaining();
    }

    private computeTokenRemaining(): void {
        const tokens: u256 = satoshisToTokens(this.maximumAmountInSats, this.currentQuote);
        this.ensureTokenAmountIsValidForLP(tokens);

        const limitedByLiquidity: u256 = this.limitByAvailableLiquidity(tokens);
        this.ensureAvailableLiquidityNonZero(limitedByLiquidity);

        const limitedByCap: u256 = this.limitByReservationCap(limitedByLiquidity);
        this.ensureCapNotReached(limitedByCap);
        this.ensureMinimumReservationMet(limitedByCap);
        this.ensureBelowMaxTokensPerReservation(limitedByCap);

        this.remainingTokens = limitedByCap;
    }

    private reserve(reservation: Reservation): void {
        let lastIndex: u32 = INDEX_NOT_SET_VALUE;
        let lastProviderId: u256 = u256.Zero;

        while (!this.remainingTokens.isZero()) {
            const remainingSatoshis: u64 = tokensToSatoshis(
                this.remainingTokens,
                this.currentQuote,
            );

            if (this.isSmallerThanMinimumReservationAmount(remainingSatoshis)) {
                break;
            }

            const provider: Provider | null = this.liquidityQueue.getNextProviderWithLiquidity(
                this.currentQuote,
            );
            if (provider === null) {
                break;
            }

            // If we see repeated initial liquidity provider => break
            if (
                provider.getQueueIndex() === INITIAL_LIQUIDITY_PROVIDER_INDEX &&
                lastIndex === INITIAL_LIQUIDITY_PROVIDER_INDEX
            ) {
                break;
            }

            this.ensureNoRepeatedProvider(provider.getId(), lastProviderId);

            lastProviderId = provider.getId();
            lastIndex = provider.getQueueIndex();

            this.ensureStatesAreValid(provider);

            if (provider.isPendingRemoval()) {
                this.reserveFromRemovalProvider(reservation, provider, remainingSatoshis);
            } else {
                this.reserveFromProvider(reservation, provider);
            }
        }
    }

    private reserveFromRemovalProvider(
        reservation: Reservation,
        provider: Provider,
        remainingSatoshis: u64,
    ): void {
        let targetSatoshisToReserve: u64;
        let targetTokensToReserve: u128;
        const owed: u64 = this.liquidityQueue.getSatoshisOwedLeft(provider.getId());

        if (remainingSatoshis > owed) {
            const conversionResult: CappedTokensResult = satoshisToTokens128(
                owed,
                this.currentQuote,
            );

            targetSatoshisToReserve = conversionResult.satoshis;
            targetTokensToReserve = conversionResult.tokens;
        } else {
            const conversionResult: CappedTokensResult = capTokensU256ToU128(
                this.remainingTokens,
                remainingSatoshis,
                this.currentQuote,
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
        const providerId: u256 = provider.getId();
        const tokens256: u256 = tokens.toU256();

        this.increaseReservedTokens(tokens256);
        this.decreaseRemainingTokens(tokens256);
        this.increaseSatoshisSpent(satoshis);
        this.liquidityQueue.increaseSatoshisOwedReserved(providerId, satoshis);

        reservation.addProvider(
            new ReservationProviderData(
                provider.getQueueIndex(),
                tokens,
                provider.getProviderType(),
            ),
        );

        this.emitLiquidityReservedEvent(providerId, provider.getBtcReceiver(), satoshis);
    }

    private reserveFromProvider(reservation: Reservation, provider: Provider): void {
        const availableLiquidity: u128 = provider.getAvailableLiquidityAmount();
        const tokensToAttempt: u128 = this.computeTokensToReserve(availableLiquidity);
        const satoshis: u64 = this.computeSatoshisWithMinimumCheck(
            tokensToAttempt,
            availableLiquidity,
        );

        const finalTokensToReserve: CappedTokensResult = satoshisToTokens128(
            satoshis,
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

    private computeTokensToReserve(availableLiquidity: u128): u128 {
        let targetTokensToReserve: u128;

        if (u256.ge(this.remainingTokens, availableLiquidity.toU256())) {
            targetTokensToReserve = availableLiquidity;
        } else {
            // As remainingTokens(u256) < availableLiquidity (u128), then we are sure remainingTokens fits in an u128
            targetTokensToReserve = this.remainingTokens.toU128();
        }

        return targetTokensToReserve;
    }

    private computeSatoshisWithMinimumCheck(tokens: u128, availableLiquidity: u128): u64 {
        const availableLiquidityCost: u64 = tokensToSatoshis128(
            availableLiquidity,
            this.currentQuote,
        );
        const tokensCost: u64 = tokensToSatoshis128(tokens, this.currentQuote);
        const leftover: u64 = SafeMath.sub64(availableLiquidityCost, tokensCost);

        // If the available liquidity falls below the minimum after the buy,
        // include the remaining in the reservation cost. This will
        // return a slightly bigger number of tokens than the requested.
        return leftover < MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT
            ? availableLiquidityCost
            : tokensCost;
    }

    private applyReservation(
        reservation: Reservation,
        provider: Provider,
        tokens: u128,
        satoshis: u64,
    ): void {
        const tokens256: u256 = tokens.toU256();

        this.increaseReservedTokens(tokens256);
        this.decreaseRemainingTokens(tokens256);
        this.increaseSatoshisSpent(satoshis);
        provider.addToReservedAmount(tokens);

        reservation.addProvider(
            new ReservationProviderData(
                provider.getQueueIndex(),
                tokens,
                provider.getProviderType(),
            ),
        );

        this.emitLiquidityReservedEvent(provider.getId(), provider.getBtcReceiver(), satoshis);
    }

    private finalizeReservation(reservation: Reservation): void {
        const index: u32 = this.liquidityQueue.addActiveReservation(reservation);
        reservation.setPurgeIndex(index);
        reservation.save();
    }

    private isSmallerThanMinimumReservationAmount(satoshis: u64): boolean {
        return satoshis < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT;
    }

    private limitByAvailableLiquidity(tokens: u256): u256 {
        return SafeMath.min(this.liquidityQueue.availableLiquidity, tokens);
    }

    private limitByReservationCap(tokens: u256): u256 {
        return SafeMath.min(tokens, this.liquidityQueue.getMaximumTokensLeftBeforeCap());
    }

    private getValidQuote(): void {
        this.currentQuote = this.liquidityQueue.quote();
        this.ensureCurrentQuoteValid();
    }

    private increaseReservedTokens(value: u256): void {
        this.reservedTokens = SafeMath.add(this.reservedTokens, value);
    }

    private decreaseRemainingTokens(value: u256): void {
        if (u256.gt(this.remainingTokens, value)) {
            this.remainingTokens = SafeMath.sub(this.remainingTokens, value);
        } else {
            this.remainingTokens = u256.Zero;
        }
    }

    private increaseSatoshisSpent(value: u64): void {
        this.satoshisSpent = SafeMath.add64(this.satoshisSpent, value);
    }

    private emitReservationCreatedEvent(): void {
        Blockchain.emit(new ReservationCreatedEvent(this.reservedTokens, this.satoshisSpent));
    }

    private emitLiquidityReservedEvent(
        providerId: u256,
        btcReceiver: string,
        costInSatoshis: u64,
    ): void {
        Blockchain.emit(new LiquidityReservedEvent(btcReceiver, costInSatoshis, providerId));
    }

    private ensureActivationDelayValid(): void {
        if (this.activationDelay > MAX_ACTIVATION_DELAY) {
            throw new Revert(
                `NATIVE_SWAP: Activation delay cannot be greater than ${MAX_ACTIVATION_DELAY}.`,
            );
        }
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

    private ensureCurrentQuoteValid(): void {
        if (this.currentQuote.isZero()) {
            throw new Revert('Impossible state: Token is worth infinity.');
        }
    }

    private ensureLiquidityValid(): void {
        if (u256.lt(this.liquidityQueue.liquidity, this.liquidityQueue.reservedLiquidity)) {
            throw new Revert('Impossible state: liquidity < reservedLiquidity.');
        }
    }

    private ensureMaximumAmountInNotBelowTradeSize(): void {
        if (this.maximumAmountInSats < MINIMUM_TRADE_SIZE_IN_SAT) {
            throw new Revert(
                `NATIVE_SWAP: Requested amount is below minimum trade size ${this.maximumAmountInSats} < ${MINIMUM_TRADE_SIZE_IN_SAT}.`,
            );
        }
    }

    private ensureMaximumAmountInNotZero(): void {
        if (this.maximumAmountInSats === 0) {
            throw new Revert('NATIVE_SWAP: Maximum amount in cannot be zero.');
        }
    }

    private ensureMinimumReservationMet(tokens: u256): void {
        const satCost: u64 = tokensToSatoshis(tokens, this.currentQuote);

        if (satCost < MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT) {
            throw new Revert(`NATIVE_SWAP: Minimum liquidity not met (${satCost} sat).`);
        }
    }

    private ensureTokenAmountIsValidForLP(tokens: u256): void {
        if (this.forLP && u256.gt(tokens, u128.Max.toU256())) {
            throw new Revert(
                'Impossible state: Add liquidity overflow. You are trying to add to much tokens.',
            );
        }
    }

    private ensureMinimumTokenReserved(): void {
        if (u256.lt(this.reservedTokens, this.minimumAmountOutTokens)) {
            throw new Revert(
                `NATIVE_SWAP: Not enough liquidity reserved; wanted ${this.minimumAmountOutTokens}, got ${this.reservedTokens}, spent ${this.satoshisSpent}, leftover tokens: ${this.remainingTokens}, quote: ${this.currentQuote}.`,
            );
        }
    }

    private ensureNoActiveReservation(reservation: Reservation): void {
        if (reservation.isValid()) {
            throw new Revert(
                'NATIVE_SWAP: You already have an active reservation. Swap or wait for expiration before creating another.',
            );
        }
    }

    private ensureBelowMaxTokensPerReservation(tokens: u256): void {
        if (Blockchain.block.number <= this.liquidityQueue.antiBotExpirationBlock) {
            if (u256.gt(tokens, this.liquidityQueue.maxTokensPerReservation)) {
                throw new Revert('NATIVE_SWAP: Cannot exceed anti-bot max tokens per reservation.');
            }
        }
    }

    private ensureNotOwnLiquidity(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProviderId)) {
            throw new Revert('NATIVE_SWAP: You may not reserve your own liquidity.');
        }
    }

    private ensureStatesAreValid(provider: Provider): void {
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

    private ensurePoolExistsForToken(): void {
        if (this.liquidityQueue.initialLiquidityProviderId.isZero()) {
            throw new Revert('NATIVE_SWAP: No pool exists for token.');
        }
    }

    private ensureSufficientFeesCollected(): void {
        const totalFee: u64 = getTotalFeeCollected();

        if (totalFee < FeeManager.reservationBaseFee) {
            throw new Revert('NATIVE_SWAP: Insufficient fees collected.');
        }
    }

    private ensureNoRepeatedProvider(currentId: u256, lastId: u256): void {
        if (u256.eq(currentId, lastId)) {
            throw new Revert(`Impossible state: repeated provider, ${currentId} === ${lastId}.`);
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
}
