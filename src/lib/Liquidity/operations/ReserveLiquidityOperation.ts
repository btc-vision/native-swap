import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import { Address, Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { LIQUIDITY_REMOVAL_TYPE, NORMAL_TYPE, PRIORITY_TYPE, Reservation } from '../../Reservation';
import { LiquidityReservedEvent } from '../../../events/LiquidityReservedEvent';
import { MAX_RESERVATION_AMOUNT_PROVIDER } from '../../../data-types/UserLiquidity';
import { ReservationCreatedEvent } from '../../../events/ReservationCreatedEvent';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { FeeManager } from '../../FeeManager';
import {
    getTotalFeeCollected,
    satoshisToTokens,
    tokensToSatoshis,
} from '../../../utils/NativeSwapUtils';
import { Provider } from '../../Provider';
import {
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    NOT_DEFINED_PROVIDER_INDEX,
} from '../../../data-types/Constants';

export class ReserveLiquidityOperation extends BaseOperation {
    public static MaxActivationDelay: u8 = 3;
    private readonly buyer: Address;
    private readonly maximumAmountIn: u256;
    private readonly minimumAmountOut: u256;
    private readonly providerId: u256;
    private readonly forLP: bool;
    private readonly activationDelay: u8;

    constructor(
        liquidityQueue: LiquidityQueue,
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
        this.ensureNotOwnLiquidity();
        this.ensureValidActivationDelay(this.activationDelay);
        this.ensureMaximumAmountInNotZero(this.maximumAmountIn);
        this.ensureMaximumAmountInNotBelowTradeSize(this.maximumAmountIn);
        this.ensurePoolExistsForToken(this.liquidityQueue);

        const totalFee = getTotalFeeCollected();
        this.ensureSufficientFeesCollected(totalFee);

        const reservation = new Reservation(this.liquidityQueue.token, this.buyer);
        this.ensureUserNotTimedOut(reservation);
        this.ensureReservationNotValid(reservation);

        const currentQuote = this.liquidityQueue.quote();
        this.ensureCurrentQuoteIsValid(currentQuote);

        this.ensureNoBots();
        this.ensureEnoughLiquidity();

        let tokensRemaining: u256 = this.computeTokenRemaining(currentQuote);
        let tokensReserved: u256 = u256.Zero;
        let satSpent: u256 = u256.Zero;
        let lastIndex: u64 = <u64>NOT_DEFINED_PROVIDER_INDEX;
        let lastProviderId: u256 = u256.Zero;

        // Loop over providers while tokensRemaining > 0
        let i: u32 = 0;
        while (!tokensRemaining.isZero()) {
            let tokensRemainingInSatoshis = tokensToSatoshis(tokensRemaining, currentQuote);

            if (
                u256.lt(
                    tokensRemainingInSatoshis,
                    LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
                )
            ) {
                break;
            }

            const provider = this.liquidityQueue.getNextProviderWithLiquidity(currentQuote);
            if (provider === null) {
                break;
            }

            if (provider.indexedAt === NOT_DEFINED_PROVIDER_INDEX) {
                throw new Revert(
                    `Impossible state: provider ${provider.providerId} has NOT_DEFINED_PROVIDER_INDEX index`,
                );
            }

            // If we see repeated MAX_VALUE => break
            if (
                provider.indexedAt === INITIAL_LIQUIDITY_PROVIDER_INDEX &&
                lastIndex === INITIAL_LIQUIDITY_PROVIDER_INDEX
            ) {
                break;
            }

            if (provider.providerId === lastProviderId) {
                throw new Revert(
                    `Impossible state: repeated provider, ${provider.providerId} === ${lastProviderId}, i=${i}`,
                );
            }

            lastProviderId = provider.providerId;
            lastIndex = provider.indexedAt;
            i++;

            if (provider.pendingRemoval) {
                if (!provider.isLp) {
                    throw new Revert(
                        `Impossible state: provider ${provider.providerId} cannot be in pending removal state and not be a LP`,
                    );
                }

                if (!provider.fromRemovalQueue) {
                    throw new Revert(
                        `Impossible state: provider ${provider.providerId} cannot be in pending removal state and not be marked as coming from removal queue`,
                    );
                }
            }

            // CASE A: REMOVAL-QUEUE PROVIDER
            if (provider.pendingRemoval && provider.isLp && provider.fromRemovalQueue) {
                const owed = this.liquidityQueue.getBTCowed(provider.providerId);
                const currentReserved = this.liquidityQueue.getBTCowedReserved(provider.providerId);

                tokensRemainingInSatoshis = SafeMath.min(
                    tokensRemainingInSatoshis,
                    SafeMath.sub(owed, currentReserved),
                );

                let reserveAmount = satoshisToTokens(tokensRemainingInSatoshis, currentQuote);

                if (reserveAmount.isZero()) {
                    continue;
                }

                reserveAmount = SafeMath.min(reserveAmount, tokensRemaining);

                tokensReserved = SafeMath.add(tokensReserved, reserveAmount);
                satSpent = SafeMath.add(satSpent, tokensRemainingInSatoshis);
                tokensRemaining = SafeMath.sub(tokensRemaining, reserveAmount);

                // Move owed to owedReserved
                const newReserved = SafeMath.add(currentReserved, tokensRemainingInSatoshis);
                this.liquidityQueue.setBTCowedReserved(provider.providerId, newReserved);

                // Record the reservation
                reservation.reserveAtIndex(
                    <u32>provider.indexedAt,
                    reserveAmount.toU128(),
                    LIQUIDITY_REMOVAL_TYPE,
                );

                // Handle purge queue
                this.handleProviderPurgeQueues(provider, currentQuote, LIQUIDITY_REMOVAL_TYPE);

                this.emitLiquidityReservedEvent(
                    provider.providerId,
                    provider.btcReceiver,
                    tokensRemainingInSatoshis.toU128(),
                );
            } else {
                // CASE B: NORMAL / PRIORITY PROVIDER
                const providerLiquidity = SafeMath.sub128(
                    provider.liquidity,
                    provider.reserved,
                ).toU256();

                const maxCostInSatoshis = tokensToSatoshis(providerLiquidity, currentQuote);

                // Verify the reserveAmount is smaller than u120 maximum.
                let reserveAmount = SafeMath.min(
                    SafeMath.min(providerLiquidity, tokensRemaining),
                    MAX_RESERVATION_AMOUNT_PROVIDER.toU256(),
                );

                let costInSatoshis = tokensToSatoshis(reserveAmount, currentQuote);

                const leftoverSats = SafeMath.sub(maxCostInSatoshis, costInSatoshis);
                if (u256.lt(leftoverSats, LiquidityQueue.MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                    costInSatoshis = maxCostInSatoshis;
                }

                reserveAmount = satoshisToTokens(costInSatoshis, currentQuote);
                if (reserveAmount.isZero()) {
                    continue;
                }

                const reserveAmountU128 = reserveAmount.toU128();
                provider.increaseReserved(reserveAmountU128);

                tokensReserved = SafeMath.add(tokensReserved, reserveAmount);
                satSpent = SafeMath.add(satSpent, costInSatoshis);

                // Reduce tokensRemaining
                if (u256.gt(tokensRemaining, reserveAmount)) {
                    tokensRemaining = SafeMath.sub(tokensRemaining, reserveAmount);
                } else {
                    tokensRemaining = u256.Zero;
                }

                const type = provider.isPriority() ? PRIORITY_TYPE : NORMAL_TYPE;
                reservation.reserveAtIndex(<u32>provider.indexedAt, reserveAmountU128, type);

                // Handle purge queue
                this.handleProviderPurgeQueues(provider, currentQuote, type);

                this.emitLiquidityReservedEvent(
                    provider.providerId,
                    provider.btcReceiver,
                    costInSatoshis.toU128(),
                );
            }
        }

        // If we didn't reserve enough
        if (u256.lt(tokensReserved, this.minimumAmountOut)) {
            throw new Revert(
                `NATIVE_SWAP: Not enough liquidity reserved; wanted ${this.minimumAmountOut}, got ${tokensReserved}, spent ${satSpent}, leftover tokens: ${tokensRemaining}, quote: ${currentQuote}`,
            );
        }

        this.liquidityQueue.increaseTotalReserved(tokensReserved);

        reservation.setActivationDelay(this.activationDelay);
        reservation.reservedLP = this.forLP;
        reservation.setExpirationBlock(
            Blockchain.block.number + LiquidityQueue.RESERVATION_EXPIRE_AFTER,
        );

        const index: u32 = this.liquidityQueue.addActiveReservationToList(
            Blockchain.block.number,
            reservation.reservationId,
        );

        reservation.setPurgeIndex(index);
        reservation.save();

        this.liquidityQueue.setBlockQuote();
        this.emitReservationCreatedEvent(tokensReserved, satSpent);
    }

    private handleProviderPurgeQueues(provider: Provider, currentQuote: u256, type: u8): void {
        if (!provider.hasBeenPurged()) {
            return;
        }

        let hasEnoughLiquidityLeft: bool = false;
        if (type === LIQUIDITY_REMOVAL_TYPE) {
            // TODO: Verify if there is enough owed BTC left to refund, the fixed version is in the refactor version. Will be empty for now
        } else {
            hasEnoughLiquidityLeft = this.liquidityQueue.hasEnoughLiquidityLeftProvider(
                provider,
                currentQuote,
            );
        }

        if (!hasEnoughLiquidityLeft) {
            this.liquidityQueue.removeFromPurgeQueue(provider);
        }

        return;
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

    private ensureReservationNotValid(reservation: Reservation): void {
        if (reservation.expired()) {
            if (reservation.isDirty()) {
                reservation.delete(false); // Ensure this is always before a timeout check.
            }
        } else {
            throw new Revert(
                'NATIVE_SWAP: You already have an active reservation. Swap or wait for expiration before creating another',
            );
        }
    }

    private ensureUserNotTimedOut(reservation: Reservation): void {
        const userTimeoutUntilBlock: u64 = reservation.userTimeoutBlockExpiration;
        if (
            Blockchain.block.number <= userTimeoutUntilBlock &&
            this.liquidityQueue.timeOutEnabled
        ) {
            throw new Revert('NATIVE_SWAP: User is timed out');
        }
    }

    private ensureCurrentQuoteIsValid(currentQuote: u256): void {
        if (currentQuote.isZero()) {
            throw new Revert('Impossible state: Token is worth infinity');
        }
    }

    private ensureNoBots(): void {
        if (Blockchain.block.number <= this.liquidityQueue.antiBotExpirationBlock) {
            if (u256.gt(this.maximumAmountIn, this.liquidityQueue.maxTokensPerReservation)) {
                throw new Revert('NATIVE_SWAP: Cannot exceed anti-bot max tokens/reservation');
            }
        }
    }

    private ensureEnoughLiquidity(): void {
        if (u256.lt(this.liquidityQueue.liquidity, this.liquidityQueue.reservedLiquidity)) {
            throw new Revert('Impossible state: liquidity < reservedLiquidity');
        }
    }

    private computeTokenRemaining(currentQuote: u256): u256 {
        let tokensRemaining: u256 = satoshisToTokens(this.maximumAmountIn, currentQuote);

        const totalAvailableLiquidity = SafeMath.sub(
            this.liquidityQueue.liquidity,
            this.liquidityQueue.reservedLiquidity,
        );

        if (u256.lt(totalAvailableLiquidity, tokensRemaining)) {
            tokensRemaining = totalAvailableLiquidity;
        }

        const maxTokensLeftBeforeCap = this.liquidityQueue.getMaximumTokensLeftBeforeCap();
        tokensRemaining = SafeMath.min(tokensRemaining, maxTokensLeftBeforeCap);

        if (tokensRemaining.isZero()) {
            throw new Revert('NATIVE_SWAP: Not enough liquidity available');
        }

        const satCostTokenRemaining = tokensToSatoshis(tokensRemaining, currentQuote);

        if (u256.lt(satCostTokenRemaining, LiquidityQueue.MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
            if (tokensRemaining === maxTokensLeftBeforeCap) {
                throw new Revert(
                    `NATIVE_SWAP: Maximum reservation limit reached. Try again later.`,
                );
            }

            throw new Revert(
                `NATIVE_SWAP: Minimum liquidity not met (${satCostTokenRemaining} sat)`,
            );
        }

        return tokensRemaining;
    }

    private ensureMaximumAmountInNotZero(maximumAmountIn: u256): void {
        if (maximumAmountIn.isZero()) {
            throw new Revert('NATIVE_SWAP: Maximum amount in cannot be zero');
        }
    }

    private ensureMaximumAmountInNotBelowTradeSize(maximumAmountIn: u256): void {
        if (u256.lt(maximumAmountIn, LiquidityQueue.MINIMUM_TRADE_SIZE_IN_SATOSHIS)) {
            throw new Revert(
                `NATIVE_SWAP: Requested amount is below minimum trade size ${maximumAmountIn} < ${LiquidityQueue.MINIMUM_TRADE_SIZE_IN_SATOSHIS}`,
            );
        }
    }

    private ensureValidActivationDelay(activationDelay: u8): void {
        if (activationDelay > ReserveLiquidityOperation.MaxActivationDelay) {
            throw new Revert(
                `NATIVE_SWAP: Activation delay cannot be greater than ${ReserveLiquidityOperation.MaxActivationDelay}`,
            );
        }
    }

    private ensurePoolExistsForToken(queue: LiquidityQueue): void {
        if (queue.initialLiquidityProvider.isZero()) {
            throw new Revert('NATIVE_SWAP: No pool exists for token');
        }
    }

    private ensureSufficientFeesCollected(totalFee: u64): void {
        if (totalFee < FeeManager.RESERVATION_BASE_FEE) {
            throw new Revert('NATIVE_SWAP: Insufficient fees collected');
        }
    }

    private ensureNotOwnLiquidity(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProvider)) {
            throw new Revert('NATIVE_SWAP: You may not reserve your own liquidity');
        }
    }
}
