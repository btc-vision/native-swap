import {
    Address,
    Blockchain,
    Potential,
    Revert,
    SafeMath,
    StoredU256,
    StoredU64,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

import {
    ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
    RESERVATION_SETTINGS_POINTER,
} from '../constants/StoredPointers';

import { addAmountToStakingContract, Provider } from '../models/Provider';
import { Reservation } from '../models/Reservation';
import {
    ENABLE_FEES,
    MAX_TOTAL_SATOSHIS,
    QUOTE_SCALE,
    TEN_THOUSAND_U256,
    VOLATILITY_WINDOW_IN_BLOCKS,
} from '../constants/Contract';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { IProviderManager } from './interfaces/IProviderManager';
import { IReservationManager } from './interfaces/IReservationManager';
import { ILiquidityQueue } from './interfaces/ILiquidityQueue';
import { IDynamicFee } from './interfaces/IDynamicFee';
import { preciseLog } from '../utils/MathUtils';

export class LiquidityQueue implements ILiquidityQueue {
    public readonly token: Address;

    protected readonly providerManager: IProviderManager;
    protected readonly liquidityQueueReserve: ILiquidityQueueReserve;
    protected readonly quoteManager: IQuoteManager;
    protected readonly reservationManager: IReservationManager;
    protected readonly dynamicFee: IDynamicFee;

    private readonly settings: StoredU64;
    private readonly _maxTokensPerReservation: StoredU256;
    private readonly timeoutEnabled: boolean;
    private _calculatedQuote: Potential<u256> = null;

    constructor(
        token: Address,
        tokenIdUint8Array: Uint8Array,
        providerManager: IProviderManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        quoteManager: IQuoteManager,
        reservationManager: IReservationManager,
        dynamicFee: IDynamicFee,
        purgeOldReservations: boolean,
        timeoutEnabled: boolean = false,
    ) {
        this.token = token;
        this.dynamicFee = dynamicFee;
        this.providerManager = providerManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.quoteManager = quoteManager;
        this.reservationManager = reservationManager;

        this._maxTokensPerReservation = new StoredU256(
            ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
            tokenIdUint8Array,
        );

        this.settings = new StoredU64(RESERVATION_SETTINGS_POINTER, tokenIdUint8Array);
        this.timeoutEnabled = timeoutEnabled;

        this.updateVirtualPoolIfNeeded();

        if (purgeOldReservations && this.virtualSatoshisReserve > 0) {
            this.purgeReservationsAndRestoreProviders(this.quote());
        }
    }

    public get antiBotExpirationBlock(): u64 {
        return this.settings.get(2);
    }

    public set antiBotExpirationBlock(value: u64) {
        this.settings.set(2, value);
    }

    public get availableLiquidity(): u256 {
        return this.liquidityQueueReserve.availableLiquidity;
    }

    public get feesEnabled(): bool {
        return ENABLE_FEES;
    }

    public get initialLiquidityProviderId(): u256 {
        return this.providerManager.initialLiquidityProviderId;
    }

    public set initialLiquidityProviderId(value: u256) {
        this.providerManager.initialLiquidityProviderId = value;
    }

    public get lastPurgedBlock(): u64 {
        return this.settings.get(1);
    }

    public set lastPurgedBlock(value: u64) {
        this.settings.set(1, value);
    }

    public get lastVirtualUpdateBlock(): u64 {
        return this.settings.get(3);
    }

    public set lastVirtualUpdateBlock(value: u64) {
        this.settings.set(3, value);
    }

    public get liquidity(): u256 {
        return this.liquidityQueueReserve.liquidity;
    }

    public get maxReserves5BlockPercent(): u64 {
        return this.settings.get(0);
    }

    public set maxReserves5BlockPercent(value: u64) {
        this.settings.set(0, value);
    }

    public get maxTokensPerReservation(): u256 {
        return this._maxTokensPerReservation.value;
    }

    public set maxTokensPerReservation(value: u256) {
        this._maxTokensPerReservation.value = value;
    }

    public get reservedLiquidity(): u256 {
        return this.liquidityQueueReserve.reservedLiquidity;
    }

    public get totalTokensSellActivated(): u256 {
        return this.liquidityQueueReserve.totalTokensSellActivated;
    }

    public set totalTokensSellActivated(value: u256) {
        this.liquidityQueueReserve.totalTokensSellActivated = value;
    }

    public get totalSatoshisExchangedForTokens(): u64 {
        return this.liquidityQueueReserve.totalSatoshisExchangedForTokens;
    }

    public set totalSatoshisExchangedForTokens(value: u64) {
        this.liquidityQueueReserve.totalSatoshisExchangedForTokens = value;
    }

    public get totalTokensExchangedForSatoshis(): u256 {
        return this.liquidityQueueReserve.totalTokensExchangedForSatoshis;
    }

    public set totalTokensExchangedForSatoshis(value: u256) {
        this.liquidityQueueReserve.totalTokensExchangedForSatoshis = value;
    }

    public get timeOutEnabled(): bool {
        return this.timeoutEnabled;
    }

    public get virtualSatoshisReserve(): u64 {
        return this.liquidityQueueReserve.virtualSatoshisReserve;
    }

    public set virtualSatoshisReserve(value: u64) {
        this.liquidityQueueReserve.virtualSatoshisReserve = value;
    }

    public get virtualTokenReserve(): u256 {
        return this.liquidityQueueReserve.virtualTokenReserve;
    }

    public set virtualTokenReserve(value: u256) {
        this.liquidityQueueReserve.virtualTokenReserve = value;
    }

    /*public accruePenalty(penalty: u128, half: u128): void {
        if (!penalty.isZero()) {
            this.ensurePenaltyNotLessThanHalf(penalty, half);

            const penaltyU256: u256 = penalty.toU256();
            const penaltyLeft = SafeMath.sub128(penalty, half);
            const penaltyLeftU256: u256 = penaltyLeft.toU256();

            this.decreaseTotalReserve(penaltyU256);
            if (!penaltyLeftU256.isZero()) {
                // Get current state BEFORE modifications
                const currentBTC = u256.fromU64(this.virtualSatoshisReserve);
                const currentTokens = this.virtualTokenReserve;

                if (!currentBTC.isZero() && !currentTokens.isZero()) {
                    // Calculate BTC to remove BEFORE modifying tokens
                    const btcToRemove = SafeMath.div(
                        SafeMath.mul(penaltyLeftU256, currentBTC),
                        currentTokens,
                    );

                    // Now remove BOTH
                    this.decreaseVirtualTokenReserve(penaltyLeftU256);

                    if (
                        !btcToRemove.isZero() &&
                        btcToRemove.toU64() <= this.virtualSatoshisReserve
                    ) {
                        this.decreaseVirtualSatoshisReserve(btcToRemove.toU64());
                    }
                }
            }

            addAmountToStakingContract(penaltyU256);
        }
    }*/

    public addReservation(reservation: Reservation): void {
        this.reservationManager.addReservation(reservation.getCreationBlock(), reservation);
    }

    public addToNormalQueue(provider: Provider): void {
        this.providerManager.addToNormalQueue(provider);
    }

    public addToPriorityQueue(provider: Provider): void {
        this.providerManager.addToPriorityQueue(provider);
    }

    public blockWithReservationsLength(): u32 {
        return this.reservationManager.blockWithReservationsLength();
    }

    /*public recordTradeVolumes(tokensOut: u256, satoshisIn: u64): void {
        this.increaseTotalSatoshisExchangedForTokens(satoshisIn);
        this.increaseTotalTokensExchangedForSatoshis(tokensOut);
    }*/

    public recordTradeVolumes(tokensOut: u256, satoshisIn: u64): void {
        // Get current state
        const currentVirtualT = this.virtualTokenReserve;
        const currentVirtualB = u256.fromU64(this.virtualSatoshisReserve);

        // Get current accumulators
        const currentPendingSells = this.totalTokensSellActivated;
        const currentPendingBuys = this.totalTokensExchangedForSatoshis;
        const currentPendingBTC = u256.fromU64(this.totalSatoshisExchangedForTokens);

        // Calculate what would happen in next update
        // Apply pending sells (maintains constant product)
        let projectedT = currentVirtualT;
        let projectedB = currentVirtualB;

        if (!currentPendingSells.isZero()) {
            const k = SafeMath.mul(currentVirtualB, currentVirtualT);
            projectedT = SafeMath.add(currentVirtualT, currentPendingSells);
            projectedB = SafeMath.div(k, projectedT);
        }

        // Check if buys (including this new trade) would exceed projected reserves
        const totalBuysAfterThisTrade = SafeMath.add(currentPendingBuys, tokensOut);
        const totalBTCAfterThisTrade = SafeMath.add(currentPendingBTC, u256.fromU64(satoshisIn));

        // Critical check: Would the buys exceed available tokens?
        if (totalBuysAfterThisTrade >= projectedT) {
            throw new Revert(
                `IMPOSSIBLE STATE: Trade would cause virtual pool exhaustion. ` +
                    `Current virtual T: ${currentVirtualT}, B: ${currentVirtualB}. ` +
                    `Pending sells to apply: ${currentPendingSells}. ` +
                    `Projected T after sells: ${projectedT}. ` +
                    `Current pending buys: ${currentPendingBuys}. ` +
                    `This trade size: ${tokensOut}. ` +
                    `Total buys would be: ${totalBuysAfterThisTrade}. ` +
                    `This exceeds projected reserves (${totalBuysAfterThisTrade} >= ${projectedT})`,
            );
        }

        // Additional sanity check: Would BTC reserves overflow?
        const projectedBAfterBuys = SafeMath.add(projectedB, totalBTCAfterThisTrade);
        if (projectedBAfterBuys > MAX_TOTAL_SATOSHIS) {
            throw new Revert(
                `IMPOSSIBLE STATE: Trade would cause BTC reserve overflow. ` +
                    `Projected BTC after all operations: ${projectedBAfterBuys} > ${MAX_TOTAL_SATOSHIS}`,
            );
        }

        // Additional sanity check: Is the trade size itself reasonable?
        if (tokensOut > this.liquidity) {
            throw new Revert(
                `IMPOSSIBLE STATE: Trade trying to buy ${tokensOut} tokens but total liquidity is only ${this.liquidity}`,
            );
        }

        // All checks passed - safe to record
        this.increaseTotalSatoshisExchangedForTokens(satoshisIn);
        this.increaseTotalTokensExchangedForSatoshis(tokensOut);
    }

    public resetFulfilledProviders(count: u32): u32 {
        return this.providerManager.resetFulfilledProviders(count);
    }

    public computeFees(totalTokensPurchased: u256, totalSatoshisSpent: u64): u256 {
        const utilizationRatio = this.getUtilizationRatio();
        const feeBP = this.dynamicFee.getDynamicFeeBP(totalSatoshisSpent, utilizationRatio);

        return this.dynamicFee.computeFeeAmount(totalTokensPurchased, feeBP);
    }

    public decreaseTotalReserve(value: u256): void {
        this.liquidityQueueReserve.subFromTotalReserve(value);
    }

    public decreaseTotalReserved(value: u256): void {
        this.liquidityQueueReserve.subFromTotalReserved(value);
    }

    public decreaseVirtualSatoshisReserve(value: u64): void {
        this.virtualSatoshisReserve = SafeMath.sub64(this.virtualSatoshisReserve, value);
    }

    public decreaseVirtualTokenReserve(value: u256): void {
        this.virtualTokenReserve = SafeMath.sub(this.virtualTokenReserve, value);
    }

    public distributeFee(totalFee: u256): void {
        this.decreaseTotalReserve(totalFee);
        addAmountToStakingContract(totalFee);
    }

    public getMaximumTokensLeftBeforeCap(): u256 {
        if (this.liquidity.isZero()) {
            return u256.Zero;
        }

        const maxPercentage: u256 = u256.fromU64(this.maxReserves5BlockPercent);
        const totalScaled = SafeMath.mul(this.liquidity, QUOTE_SCALE);
        const reservedScaled = SafeMath.mul(this.reservedLiquidity, QUOTE_SCALE);
        const capScaled = SafeMath.div(SafeMath.mul(totalScaled, maxPercentage), u256.fromU32(100));

        let availableScaled = u256.Zero;
        if (reservedScaled < capScaled) {
            availableScaled = SafeMath.div(SafeMath.sub(capScaled, reservedScaled), QUOTE_SCALE);
        }

        return availableScaled;
    }

    public getNextProviderWithLiquidity(quote: u256): Provider | null {
        return this.providerManager.getNextProviderWithLiquidity(quote);
    }

    public getNormalQueueStartingIndex(): u32 {
        return this.providerManager.normalQueueStartingIndex;
    }

    public getPriorityQueueStartingIndex(): u32 {
        return this.providerManager.priorityQueueStartingIndex;
    }

    public getProviderQueueData(): Uint8Array {
        return this.providerManager.getQueueData();
    }

    public getReservationIdAtIndex(blockNumber: u64, index: u32): u128 {
        return this.reservationManager.getReservationIdAtIndex(blockNumber, index);
    }

    public getReservationWithExpirationChecks(): Reservation {
        const reservation = new Reservation(this.token, Blockchain.tx.sender);
        reservation.ensureCanBeConsumed();

        return reservation;
    }

    public getUtilizationRatio(): u256 {
        if (this.liquidity.isZero()) {
            return u256.Zero;
        }

        return SafeMath.div(
            SafeMath.mul(this.reservedLiquidity, u256.fromU64(100)),
            this.liquidity,
        );
    }

    public increaseTotalSatoshisExchangedForTokens(value: u64): void {
        this.liquidityQueueReserve.addToTotalSatoshisExchangedForTokens(value);
    }

    public increaseTotalTokensExchangedForSatoshis(value: u256): void {
        this.liquidityQueueReserve.addToTotalTokensExchangedForSatoshis(value);
    }

    public increaseTotalTokensSellActivated(value: u256): void {
        this.liquidityQueueReserve.addToTotalTokensSellActivated(value);
    }

    public increaseTotalReserve(value: u256): void {
        this.liquidityQueueReserve.addToTotalReserve(value);
    }

    public increaseTotalReserved(value: u256): void {
        this.liquidityQueueReserve.addToTotalReserved(value);
    }

    public increaseVirtualSatoshisReserve(value: u64): void {
        this.virtualSatoshisReserve = SafeMath.add64(this.virtualSatoshisReserve, value);
    }

    public increaseVirtualTokenReserve(value: u256): void {
        this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, value);
    }

    public initializeInitialLiquidity(
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u128,
        maxReserves5BlockPercent: u64,
    ): void {
        this.initialLiquidityProviderId = providerId;
        this.virtualTokenReserve = initialLiquidity.toU256();
        this.virtualSatoshisReserve = this.computeInitialSatoshisReserve(
            this.virtualTokenReserve,
            floorPrice,
        );
        this.maxReserves5BlockPercent = maxReserves5BlockPercent;
    }

    public isReservationActiveAtIndex(blockNumber: u64, index: u32): boolean {
        return this.reservationManager.isReservationActiveAtIndex(blockNumber, index);
    }

    public cleanUpQueues(currentQuote: u256): void {
        this.providerManager.cleanUpQueues(currentQuote);
    }

    public purgeReservationsAndRestoreProviders(currentQuote: u256): void {
        this.lastPurgedBlock = this.reservationManager.purgeReservationsAndRestoreProviders(
            this.lastPurgedBlock,
            currentQuote,
        );
    }

    // Return number of tokens per satoshi
    public quote(): u256 {
        /*
        if (this._calculatedQuote) {
            return this._calculatedQuote as u256;
        }

        this._calculatedQuote = this.calculateQuote();
        return this._calculatedQuote as u256;
        */
        const TOKEN: u256 = this.virtualTokenReserve;
        const BTC: u64 = this.virtualSatoshisReserve;

        if (TOKEN.isZero()) {
            return u256.Zero;
        }

        if (BTC === 0) {
            throw new Revert(`Impossible state: Not enough liquidity.`);
        }

        // Calculate queue impact
        const queueImpact = this.calculateQueueImpact();

        // Add impact to token reserves ONLY for price calculation
        const effectiveT = SafeMath.add(TOKEN, queueImpact);
        const scaled = SafeMath.mul(effectiveT, QUOTE_SCALE);

        return SafeMath.div(scaled, u256.fromU64(BTC));
    }

    /*public reCalcQuote(): void {
        this._calculatedQuote = this.calculateQuote();
    }*/

    public removeFromNormalQueue(provider: Provider): void {
        this.providerManager.removeFromNormalQueue(provider);
    }

    public removeFromPriorityQueue(provider: Provider): void {
        this.providerManager.removeFromPriorityQueue(provider);
    }

    public removeFromPurgeQueue(provider: Provider): void {
        this.providerManager.removeFromPurgeQueue(provider);
    }

    public resetProvider(provider: Provider, burnRemainingFunds: boolean): void {
        this.providerManager.resetProvider(provider, burnRemainingFunds);
    }

    public save(): void {
        this.settings.save();
        this.providerManager.save();
        this.quoteManager.save();
    }

    public setBlockQuote(): void {
        //this.reCalcQuote();
        this.quoteManager.setBlockQuote(Blockchain.block.number, this.quote());
    }

    public updateVirtualPoolIfNeeded(): void {
        const currentBlock: u64 = Blockchain.block.number;

        let B: u256 = u256.fromU64(this.virtualSatoshisReserve);
        let T: u256 = this.virtualTokenReserve;

        const initialK = SafeMath.mul(B, T);

        // Add tokens from deltaTokensAdd (SELL SIDE)
        const dT_add: u256 = this.totalTokensSellActivated;
        if (!dT_add.isZero()) {
            T = SafeMath.add(T, dT_add);

            // Ceiling division to preserve k: ceil(k / T) = (k + T - 1) / T
            B = SafeMath.div(SafeMath.sub(SafeMath.add(initialK, T), u256.One), T);

            // Verify K is maintained
            const newK = SafeMath.mul(B, T);
            const diff =
                newK > initialK ? SafeMath.sub(newK, initialK) : SafeMath.sub(initialK, newK);

            const relativeTolerance = SafeMath.div(initialK, u256.fromU64(100000));
            if (diff > relativeTolerance) {
                throw new Revert(
                    `Constant product broken after adding liquidity. Initial k: ${initialK}, New k: ${newK}`,
                );
            }
        }

        // Apply net "buys" (BUY SIDE)
        const dT_buy: u256 = this.totalTokensExchangedForSatoshis;
        const dB_buy: u256 = u256.fromU64(this.totalSatoshisExchangedForTokens);

        if (!dT_buy.isZero() || !dB_buy.isZero()) {
            if (dT_buy >= T) {
                throw new Revert(
                    `Impossible state: Cannot buy ${dT_buy} tokens, only ${T} available`,
                );
            }

            // Get k after sells were applied
            const k = SafeMath.mul(B, T);

            // Remove tokens bought
            T = SafeMath.sub(T, dT_buy);

            // Ceiling division to preserve k: ceil(k / T) = (k + T - 1) / T
            B = SafeMath.div(SafeMath.sub(SafeMath.add(k, T), u256.One), T);
        }

        if (T.isZero()) {
            T = u256.One;
        }

        if (B > MAX_TOTAL_SATOSHIS) {
            throw new Revert(
                `Impossible state: New virtual satoshis reserve out of range. Value: ${B}`,
            );
        }

        this.virtualSatoshisReserve = B.toU64();
        this.virtualTokenReserve = T;
        this.resetAccumulators();

        this.dynamicFee.volatility = this.computeVolatility(
            currentBlock,
            VOLATILITY_WINDOW_IN_BLOCKS,
        );

        this.lastVirtualUpdateBlock = currentBlock;
    }

    protected computeVolatility(
        currentBlock: u64,
        windowSize: u32 = VOLATILITY_WINDOW_IN_BLOCKS,
    ): u256 {
        let volatility: u256 = u256.Zero;

        const currentQuote: u256 = this.quoteManager.getBlockQuote(currentBlock);
        const oldBlock: u64 = currentBlock - windowSize;
        const oldQuote: u256 = this.quoteManager.getBlockQuote(oldBlock);

        if (!oldQuote.isZero() && !currentQuote.isZero()) {
            let diff = u256.sub(currentQuote, oldQuote);

            if (diff.toI64() < 0) {
                diff = u256.mul(diff, u256.fromI64(-1));
            }

            volatility = SafeMath.div(SafeMath.mul(diff, TEN_THOUSAND_U256), oldQuote);
        }

        return volatility;
    }

    private calculateQueueImpact(): u256 {
        const queuedTokens = this.liquidity;

        if (queuedTokens.isZero()) {
            return u256.Zero;
        }

        // Calculate ratio = 1 + Q/T
        const ratio = SafeMath.add(u256.One, SafeMath.div(queuedTokens, this.virtualTokenReserve));
        const lnValue = preciseLog(ratio);
        const lnSquared = SafeMath.div(SafeMath.mul(lnValue, lnValue), u256.fromU64(1000000));

        // Impact = T * ln(1 + Q/T)^2 / 1e6
        return SafeMath.div(
            SafeMath.mul(this.virtualTokenReserve, lnSquared),
            u256.fromU64(1000000),
        );
    }

    private computeInitialSatoshisReserve(initialLiquidity: u256, floorPrice: u256): u64 {
        const reserve: u256 = SafeMath.div(initialLiquidity, floorPrice);

        if (u256.gt(reserve, MAX_TOTAL_SATOSHIS)) {
            throw new Revert(
                `Impossible state: Satoshis reserve out of range. Please adjust initial liquidity or floor price. Value: ${reserve}`,
            );
        }

        return reserve.toU64();
    }

    private ensurePenaltyNotLessThanHalf(penalty: u128, half: u128): void {
        if (u128.lt(penalty, half)) {
            throw new Revert(
                `Penalty is less than half: ${penalty.toString()} < ${half.toString()}`,
            );
        }
    }

    private resetAccumulators(): void {
        this.liquidityQueueReserve.totalTokensExchangedForSatoshis = u256.Zero;
        this.liquidityQueueReserve.totalTokensSellActivated = u256.Zero;
        this.liquidityQueueReserve.totalSatoshisExchangedForTokens = 0;
    }
}
