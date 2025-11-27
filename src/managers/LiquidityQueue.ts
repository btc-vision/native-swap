import { Address, Blockchain, Revert, SafeMath, StoredU256, StoredU64, } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

import {
    ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
    POOL_TYPES_POINTER,
    RESERVATION_SETTINGS_POINTER,
} from '../constants/StoredPointers';

import { addAmountToStakingContract, Provider } from '../models/Provider';
import { Reservation } from '../models/Reservation';
import {
    DEFAULT_STABLE_AMPLIFICATION,
    ENABLE_FEES,
    MAX_PEG_RATE,
    MAX_TOTAL_SATOSHIS,
    MIN_PEG_RATE,
    PEG_RATE_SCALE,
    POOL_TYPE_STABLE,
    POOL_TYPE_STANDARD,
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
import { OP20StableQuery } from '../extern/OP20StableQuery';

class StableSwapResult {
    constructor(
        public newT: u256,
        public newB: u256,
    ) {}
}

export class LiquidityQueue implements ILiquidityQueue {
    public readonly token: Address;

    protected readonly providerManager: IProviderManager;
    protected readonly liquidityQueueReserve: ILiquidityQueueReserve;
    protected readonly quoteManager: IQuoteManager;
    protected readonly reservationManager: IReservationManager;
    protected readonly dynamicFee: IDynamicFee;

    private readonly settings: StoredU64;
    private readonly _maxTokensPerReservation: StoredU256;
    private readonly _poolTypes: StoredU64;
    private readonly timeoutEnabled: boolean;

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
        this._poolTypes = new StoredU64(POOL_TYPES_POINTER, tokenIdUint8Array);
        this.timeoutEnabled = timeoutEnabled;

        this.updateVirtualPoolIfNeeded();

        if (purgeOldReservations && this.virtualSatoshisReserve > 0) {
            this.purgeReservationsAndRestoreProviders(this.quote());
        }
    }

    public get poolType(): u8 {
        return <u8>this._poolTypes.get(0);
    }

    public set poolType(value: u8) {
        this._poolTypes.set(0, <u64>value);
    }

    public get amplification(): u64 {
        const stored = this._poolTypes.get(1);
        return stored === 0 ? DEFAULT_STABLE_AMPLIFICATION : stored;
    }

    public set amplification(value: u64) {
        this._poolTypes.set(1, value);
    }

    public get pegStalenessThreshold(): u64 {
        return this._poolTypes.get(2);
    }

    public set pegStalenessThreshold(value: u64) {
        this._poolTypes.set(2, value);
    }

    public get isStablePool(): bool {
        return this.poolType === POOL_TYPE_STABLE;
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

    public recordTradeVolumes(tokensOut: u256, satoshisIn: u64): void {
        const currentVirtualT = this.virtualTokenReserve;
        const currentVirtualB = u256.fromU64(this.virtualSatoshisReserve);

        const currentPendingSells = this.totalTokensSellActivated;
        const currentPendingBuys = this.totalTokensExchangedForSatoshis;
        const currentPendingBTC = u256.fromU64(this.totalSatoshisExchangedForTokens);

        let projectedT = currentVirtualT;
        let projectedB = currentVirtualB;

        if (!currentPendingSells.isZero()) {
            if (this.isStablePool) {
                const result = this.applyStableSwapSell(
                    currentVirtualT,
                    currentVirtualB,
                    currentPendingSells,
                );
                projectedT = result.newT;
                projectedB = result.newB;
            } else {
                const k = SafeMath.mul(currentVirtualB, currentVirtualT);
                projectedT = SafeMath.add(currentVirtualT, currentPendingSells);
                projectedB = SafeMath.div(k, projectedT);
            }
        }

        const totalBuysAfterThisTrade = SafeMath.add(currentPendingBuys, tokensOut);
        const totalBTCAfterThisTrade = SafeMath.add(currentPendingBTC, u256.fromU64(satoshisIn));

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

        const projectedBAfterBuys = SafeMath.add(projectedB, totalBTCAfterThisTrade);
        if (projectedBAfterBuys > MAX_TOTAL_SATOSHIS) {
            throw new Revert(
                `IMPOSSIBLE STATE: Trade would cause BTC reserve overflow. ` +
                    `Projected BTC after all operations: ${projectedBAfterBuys} > ${MAX_TOTAL_SATOSHIS}`,
            );
        }

        if (tokensOut > this.liquidity) {
            throw new Revert(
                `IMPOSSIBLE STATE: Trade trying to buy ${tokensOut} tokens but total liquidity is only ${this.liquidity}`,
            );
        }

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
        poolType: u8 = POOL_TYPE_STANDARD,
        amplification: u64 = DEFAULT_STABLE_AMPLIFICATION,
        pegStalenessThreshold: u64 = 0,
    ): void {
        this.initialLiquidityProviderId = providerId;
        this.virtualTokenReserve = initialLiquidity.toU256();
        this.virtualSatoshisReserve = this.computeInitialSatoshisReserve(
            this.virtualTokenReserve,
            floorPrice,
        );
        this.maxReserves5BlockPercent = maxReserves5BlockPercent;
        this.poolType = poolType;

        if (poolType === POOL_TYPE_STABLE) {
            this.amplification = amplification;
            this.pegStalenessThreshold = pegStalenessThreshold;
        }
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

    /**
     * Get the current quote (tokens per satoshi, scaled by QUOTE_SCALE).
     *
     * For stable pools, this fetches the peg rate from the token contract
     * and uses StableSwap math centered around that peg.
     */
    public quote(): u256 {
        const TOKEN: u256 = this.virtualTokenReserve;
        const BTC: u64 = this.virtualSatoshisReserve;

        if (TOKEN.isZero()) {
            return u256.Zero;
        }

        if (BTC === 0) {
            throw new Revert(`Impossible state: Not enough liquidity.`);
        }

        // Calculate queue impact - only for standard pools
        // Stable pools use peg rate, queue shouldn't affect price
        if (this.isStablePool) {
            return this.stableQuoteWithPeg(TOKEN, u256.fromU64(BTC));
        }

        const queueImpact = this.calculateQueueImpact();
        const effectiveT = SafeMath.add(TOKEN, queueImpact);

        const scaled = SafeMath.mul(effectiveT, QUOTE_SCALE);
        return SafeMath.div(scaled, u256.fromU64(BTC));
    }

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
        this._poolTypes.save();
    }

    public setBlockQuote(): void {
        this.quoteManager.setBlockQuote(Blockchain.block.number, this.quote());
    }

    public updateVirtualPoolIfNeeded(): void {
        const currentBlock: u64 = Blockchain.block.number;

        const B: u256 = u256.fromU64(this.virtualSatoshisReserve);
        const T: u256 = this.virtualTokenReserve;

        if (this.isStablePool) {
            this.updateVirtualPoolStable(T, B);
        } else {
            this.updateVirtualPoolStandard(T, B);
        }

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

    /**
     * StableSwap quote with peg rate from token contract.
     *
     * The peg rate tells us the target price (satoshis per token).
     * We adjust our virtual reserves to center the StableSwap curve around this peg.
     */
    private stableQuoteWithPeg(T: u256, B: u256): u256 {
        OP20StableQuery.validatePegFreshness(
            this.token,
            this.pegStalenessThreshold,
            Blockchain.block.number,
        );

        const pegRate = OP20StableQuery.getPegRate(this.token);

        // Defensive bounds check - prevent overflow from malicious tokens
        if (pegRate < MIN_PEG_RATE || pegRate > MAX_PEG_RATE) {
            throw new Revert(
                `StableSwap: pegRate out of bounds. Value: ${pegRate}, ` +
                    `expected range: [${MIN_PEG_RATE}, ${MAX_PEG_RATE}]`,
            );
        }

        const A = u256.fromU64(this.amplification);
        const D = this.computeStableD(T, B, A);

        // pegPrice = (PEG_RATE_SCALE * QUOTE_SCALE) / pegRate
        // This gives us the "target" tokens per satoshi at the peg
        const pegPriceScaled = SafeMath.div(SafeMath.mul(PEG_RATE_SCALE, QUOTE_SCALE), pegRate);

        const stablePrice = this.stableQuoteRaw(T, B, A, D);

        // The equilibrium ratio based on peg
        // At equilibrium: T / B = PEG_RATE_SCALE / pegRate (tokens per satoshi)
        // So: targetB = sum * pegRate / (pegRate + PEG_RATE_SCALE)
        //     targetT = sum - targetB
        const sum = SafeMath.add(T, B);
        const targetB = SafeMath.div(
            SafeMath.mul(sum, pegRate),
            SafeMath.add(pegRate, PEG_RATE_SCALE),
        );
        const targetT = SafeMath.sub(sum, targetB);

        if (T.isZero() || B.isZero()) {
            return pegPriceScaled;
        }

        const equilibriumPrice = this.stableQuoteRaw(targetT, targetB, A, D);

        if (equilibriumPrice.isZero()) {
            return pegPriceScaled;
        }

        // Adjust: actual_quote = pegPrice * (stablePrice / equilibriumPrice)
        // This centers the curve around the peg
        return SafeMath.div(SafeMath.mul(pegPriceScaled, stablePrice), equilibriumPrice);
    }

    /**
     * Raw StableSwap quote calculation without peg adjustment.
     * Uses the derivative of the StableSwap invariant to get marginal price.
     *
     * dy/dx = -(4A + D³/(4x²y)) / (4A + D³/(4xy²))
     */
    private stableQuoteRaw(T: u256, B: u256, A: u256, D: u256): u256 {
        const FOUR = u256.fromU32(4);
        const fourA = SafeMath.mul(FOUR, A);

        const D3 = SafeMath.mul(SafeMath.mul(D, D), D);

        // Numerator: 4A + D³ / (4 * T² * B)
        const T2 = SafeMath.mul(T, T);
        const fourT2B = SafeMath.mul(SafeMath.mul(FOUR, T2), B);

        if (fourT2B.isZero()) {
            return u256.Zero;
        }

        const numTerm2 = SafeMath.div(D3, fourT2B);
        const numerator = SafeMath.add(fourA, numTerm2);

        // Denominator: 4A + D³ / (4 * T * B²)
        const B2 = SafeMath.mul(B, B);
        const fourTB2 = SafeMath.mul(SafeMath.mul(FOUR, T), B2);

        if (fourTB2.isZero()) {
            return u256.Zero;
        }

        const denTerm2 = SafeMath.div(D3, fourTB2);
        const denominator = SafeMath.add(fourA, denTerm2);

        if (denominator.isZero()) {
            return u256.Zero;
        }

        return SafeMath.div(SafeMath.mul(numerator, QUOTE_SCALE), denominator);
    }

    /**
     * Compute StableSwap invariant D.
     * D satisfies: A * n^n * sum(x_i) + D = A * D * n^n + D^(n+1) / (n^n * prod(x_i))
     * For n=2: A * 4 * (x + y) + D = A * D * 4 + D^3 / (4 * x * y)
     */
    private computeStableD(x: u256, y: u256, A: u256): u256 {
        const sum = SafeMath.add(x, y);

        if (sum.isZero()) {
            return u256.Zero;
        }

        const FOUR = u256.fromU32(4);
        const TWO = u256.fromU32(2);
        const Ann = SafeMath.mul(A, FOUR);

        let D = sum;
        let prevD: u256;

        for (let i = 0; i < 255; i++) {
            const D2 = SafeMath.mul(D, D);
            const D3 = SafeMath.mul(D2, D);
            const xy4 = SafeMath.mul(SafeMath.mul(x, y), FOUR);

            if (xy4.isZero()) {
                throw new Revert(
                    'StableSwap: Invalid pool state - reserve product is zero. ' +
                        'One or both reserves may be depleted.',
                );
            }

            const D_P = SafeMath.div(D3, xy4);

            prevD = D;

            const numerator = SafeMath.mul(
                SafeMath.add(SafeMath.mul(Ann, sum), SafeMath.mul(D_P, TWO)),
                D,
            );

            const denominator = SafeMath.add(
                SafeMath.mul(SafeMath.sub(Ann, u256.One), D),
                SafeMath.mul(u256.fromU32(3), D_P),
            );

            if (denominator.isZero()) {
                throw new Revert('StableSwap: D computation failed - denominator is zero');
            }

            D = SafeMath.div(numerator, denominator);

            const diff = D > prevD ? SafeMath.sub(D, prevD) : SafeMath.sub(prevD, D);
            if (diff <= u256.One) {
                return D;
            }
        }

        throw new Revert('StableSwap: D did not converge after 255 iterations');
    }

    /**
     * Compute new y given x and D for StableSwap.
     * Newton's method: y = (y² + c) / (2y + b - D)
     */
    private computeStableY(x: u256, D: u256, A: u256): u256 {
        const FOUR = u256.fromU32(4);
        const TWO = u256.fromU32(2);
        const Ann = SafeMath.mul(A, FOUR);

        // c = D³ / (4 * Ann * x)
        const D2 = SafeMath.mul(D, D);
        const D3 = SafeMath.mul(D2, D);
        const c = SafeMath.div(D3, SafeMath.mul(SafeMath.mul(Ann, x), FOUR));

        // b = x + D / Ann
        const b = SafeMath.add(x, SafeMath.div(D, Ann));

        let y = D;
        let prevY: u256;

        for (let i = 0; i < 255; i++) {
            prevY = y;

            const y2 = SafeMath.mul(y, y);
            const numerator = SafeMath.add(y2, c);

            // Defensive check: ensure 2y + b > D to prevent underflow
            const twoYPlusB = SafeMath.add(SafeMath.mul(TWO, y), b);
            if (twoYPlusB <= D) {
                throw new Revert(
                    'StableSwap: Y computation failed - denominator would underflow. ' +
                        `2y + b = ${twoYPlusB}, D = ${D}`,
                );
            }

            const denominator = SafeMath.sub(twoYPlusB, D);

            if (denominator.isZero()) {
                throw new Revert('StableSwap: Y computation failed - denominator is zero');
            }

            y = SafeMath.div(numerator, denominator);

            const diff = y > prevY ? SafeMath.sub(y, prevY) : SafeMath.sub(prevY, y);
            if (diff <= u256.One) {
                return y;
            }
        }

        throw new Revert('StableSwap: Y did not converge after 255 iterations');
    }

    private updateVirtualPoolStandard(T: u256, B: u256): void {
        const initialK = SafeMath.mul(B, T);

        const dT_add: u256 = this.totalTokensSellActivated;
        if (!dT_add.isZero()) {
            T = SafeMath.add(T, dT_add);
            B = SafeMath.div(SafeMath.sub(SafeMath.add(initialK, T), u256.One), T);

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

        const dT_buy: u256 = this.totalTokensExchangedForSatoshis;
        const dB_buy: u256 = u256.fromU64(this.totalSatoshisExchangedForTokens);

        if (!dT_buy.isZero() || !dB_buy.isZero()) {
            if (dT_buy >= T) {
                throw new Revert(
                    `Impossible state: Cannot buy ${dT_buy} tokens, only ${T} available`,
                );
            }

            const k = SafeMath.mul(B, T);
            T = SafeMath.sub(T, dT_buy);
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
    }

    private updateVirtualPoolStable(T: u256, B: u256): void {
        const A = u256.fromU64(this.amplification);
        const D = this.computeStableD(T, B, A);

        const dT_add: u256 = this.totalTokensSellActivated;
        if (!dT_add.isZero()) {
            T = SafeMath.add(T, dT_add);
            B = this.computeStableY(T, D, A);
        }

        const dT_buy: u256 = this.totalTokensExchangedForSatoshis;
        if (!dT_buy.isZero()) {
            if (dT_buy >= T) {
                throw new Revert(
                    `Impossible state: Cannot buy ${dT_buy} tokens, only ${T} available`,
                );
            }
            T = SafeMath.sub(T, dT_buy);
            B = this.computeStableY(T, D, A);
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
    }

    private applyStableSwapSell(T: u256, B: u256, dT: u256): StableSwapResult {
        const A = u256.fromU64(this.amplification);
        const D = this.computeStableD(T, B, A);
        const newT = SafeMath.add(T, dT);
        const newB = this.computeStableY(newT, D, A);

        return new StableSwapResult(newT, newB);
    }

    private calculateQueueImpact(): u256 {
        const queuedTokens = this.liquidity;

        if (queuedTokens.isZero()) {
            return u256.Zero;
        }

        const ratio = SafeMath.add(u256.One, SafeMath.div(queuedTokens, this.virtualTokenReserve));
        const lnValue = preciseLog(ratio);
        const lnSquared = SafeMath.div(SafeMath.mul(lnValue, lnValue), u256.fromU64(1000000));

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

    private resetAccumulators(): void {
        this.liquidityQueueReserve.totalTokensExchangedForSatoshis = u256.Zero;
        this.liquidityQueueReserve.totalTokensSellActivated = u256.Zero;
        this.liquidityQueueReserve.totalSatoshisExchangedForTokens = 0;
    }
}
