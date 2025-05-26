import {
    Address,
    Blockchain,
    Revert,
    SafeMath,
    StoredU256,
    StoredU64,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

import {
    ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
    RESERVATION_SETTINGS_POINTER,
} from '../constants/StoredPointers';

import { Provider } from '../models/Provider';
import { Reservation } from '../models/Reservation';
import {
    MAX_TOTAL_SATOSHIS,
    QUOTE_SCALE,
    VOLATILITY_WINDOW_IN_BLOCKS,
} from '../constants/Contract';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { IProviderManager } from './interfaces/IProviderManager';
import { IReservationManager } from './interfaces/IReservationManager';
import { ILiquidityQueue } from './interfaces/ILiquidityQueue';
import { IDynamicFee } from './interfaces/IDynamicFee';
import { IOwedBTCManager } from './interfaces/IOwedBTCManager';

const ENABLE_FEES: bool = true;

export class LiquidityQueue implements ILiquidityQueue {
    public readonly token: Address;
    protected readonly providerManager: IProviderManager;
    protected readonly liquidityQueueReserve: ILiquidityQueueReserve;
    protected readonly quoteManager: IQuoteManager;
    protected readonly reservationManager: IReservationManager;
    protected readonly owedBTCManager: IOwedBTCManager;
    protected readonly dynamicFee: IDynamicFee;
    private readonly settings: StoredU64;
    private readonly _maxTokensPerReservation: StoredU256;
    private readonly timeoutEnabled: boolean;

    constructor(
        token: Address,
        tokenIdUint8Array: Uint8Array,
        providerManager: IProviderManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        quoteManager: IQuoteManager,
        reservationManager: IReservationManager,
        dynamicFee: IDynamicFee,
        owedBTCManager: IOwedBTCManager,
        purgeOldReservations: boolean,
        timeoutEnabled: boolean = false,
    ) {
        this.token = token;
        this.dynamicFee = dynamicFee;
        this.providerManager = providerManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.quoteManager = quoteManager;
        this.reservationManager = reservationManager;
        this.owedBTCManager = owedBTCManager;

        this._maxTokensPerReservation = new StoredU256(
            ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
            tokenIdUint8Array,
        );

        this.settings = new StoredU64(RESERVATION_SETTINGS_POINTER, tokenIdUint8Array);
        this.timeoutEnabled = timeoutEnabled;

        if (purgeOldReservations) {
            this.lastPurgedBlock = this.reservationManager.purgeReservationsAndRestoreProviders(
                this.lastPurgedBlock,
            );
        }

        this.updateVirtualPoolIfNeeded();
    }

    public get initialLiquidityProviderId(): u256 {
        return this.providerManager.initialLiquidityProviderId;
    }

    public set initialLiquidityProviderId(value: u256) {
        this.providerManager.initialLiquidityProviderId = value;
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

    public get deltaTokensAdd(): u256 {
        return this.liquidityQueueReserve.deltaTokensAdd;
    }

    public set deltaTokensAdd(value: u256) {
        this.liquidityQueueReserve.deltaTokensAdd = value;
    }

    public get deltaSatoshisBuy(): u64 {
        return this.liquidityQueueReserve.deltaSatoshisBuy;
    }

    public set deltaSatoshisBuy(value: u64) {
        this.liquidityQueueReserve.deltaSatoshisBuy = value;
    }

    public get deltaTokensBuy(): u256 {
        return this.liquidityQueueReserve.deltaTokensBuy;
    }

    public set deltaTokensBuy(value: u256) {
        this.liquidityQueueReserve.deltaTokensBuy = value;
    }

    public get availableLiquidity(): u256 {
        return this.liquidityQueueReserve.availableLiquidity;
    }

    public get reservedLiquidity(): u256 {
        return this.liquidityQueueReserve.reservedLiquidity;
    }

    public get liquidity(): u256 {
        return this.liquidityQueueReserve.liquidity;
    }

    public get maxTokensPerReservation(): u256 {
        return this._maxTokensPerReservation.value;
    }

    public set maxTokensPerReservation(value: u256) {
        this._maxTokensPerReservation.value = value;
    }

    public get maxReserves5BlockPercent(): u64 {
        return this.settings.get(0);
    }

    public set maxReserves5BlockPercent(value: u64) {
        this.settings.set(0, value);
    }

    public get lastPurgedBlock(): u64 {
        return this.settings.get(1);
    }

    public set lastPurgedBlock(value: u64) {
        this.settings.set(1, value);
    }

    public get antiBotExpirationBlock(): u64 {
        return this.settings.get(2);
    }

    public set antiBotExpirationBlock(value: u64) {
        this.settings.set(2, value);
    }

    public get lastVirtualUpdateBlock(): u64 {
        return this.settings.get(3);
    }

    public set lastVirtualUpdateBlock(value: u64) {
        this.settings.set(3, value);
    }

    public get feesEnabled(): bool {
        return ENABLE_FEES;
    }

    public get timeOutEnabled(): bool {
        return this.timeoutEnabled;
    }

    public addActiveReservation(reservation: Reservation): u32 {
        return this.reservationManager.addActiveReservation(
            reservation.getCreationBlock(),
            reservation.getId(),
        );
    }

    public addToPriorityQueue(provider: Provider): void {
        this.providerManager.addToPriorityQueue(provider);
    }

    public addToNormalQueue(provider: Provider): void {
        this.providerManager.addToNormalQueue(provider);
    }

    public addToRemovalQueue(provider: Provider): void {
        this.providerManager.addToRemovalQueue(provider);
    }

    public buyTokens(tokensOut: u256, satoshisIn: u64): void {
        this.increaseDeltaSatoshisBuy(satoshisIn);
        this.increaseDeltaTokensBuy(tokensOut);
    }

    public cleanUpQueues(): void {
        this.providerManager.cleanUpQueues();
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

    public distributeFee(totalFee: u256, stakingAddress: Address): void {
        const feeLP: u256 = SafeMath.div(
            SafeMath.mul(totalFee, u256.fromU64(50)),
            u256.fromU64(100),
        );
        const feeMoto: u256 = SafeMath.sub(totalFee, feeLP);

        // Do nothing with half the fee
        this.increaseVirtualTokenReserve(feeLP);

        // Only transfer if the fee is non-zero
        if (feeMoto > u256.Zero) {
            // Send other half of fee to staking contract
            TransferHelper.safeTransfer(this.token, stakingAddress, feeMoto);
            this.decreaseTotalReserve(feeMoto);
        }
    }

    public getSatoshisOwed(providerId: u256): u64 {
        return this.owedBTCManager.getSatoshisOwed(providerId);
    }

    public getSatoshisOwedLeft(providerId: u256): u64 {
        return this.owedBTCManager.getSatoshisOwedLeft(providerId);
    }

    public getSatoshisOwedReserved(providerId: u256): u64 {
        return this.owedBTCManager.getSatoshisOwedReserved(providerId);
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

    public increaseSatoshisOwed(providerId: u256, value: u64): void {
        const owedBefore: u64 = this.getSatoshisOwed(providerId);
        const owedAfter: u64 = SafeMath.add64(owedBefore, value);
        this.setSatoshisOwed(providerId, owedAfter);
    }

    public increaseSatoshisOwedReserved(providerId: u256, value: u64): void {
        const owedReservedBefore: u64 = this.getSatoshisOwedReserved(providerId);
        const owedReservedAfter: u64 = SafeMath.add64(owedReservedBefore, value);
        this.setSatoshisOwedReserved(providerId, owedReservedAfter);
    }

    public increaseDeltaSatoshisBuy(value: u64): void {
        this.liquidityQueueReserve.addToDeltaSatoshisBuy(value);
    }

    public increaseDeltaTokensAdd(value: u256): void {
        this.liquidityQueueReserve.addToDeltaTokensAdd(value);
    }

    public increaseDeltaTokensBuy(value: u256): void {
        this.liquidityQueueReserve.addToDeltaTokensBuy(value);
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

    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        this.providerManager.resetProvider(provider, burnRemainingFunds, canceled);
    }

    // Return number of tokens per satoshi
    public quote(): u256 {
        const T: u256 = this.virtualTokenReserve;
        if (T.isZero()) {
            return u256.Zero;
        }

        if (this.virtualSatoshisReserve === 0) {
            throw new Revert(`Impossible state: Not enough liquidity.`);
        }

        // scaledQuote = T * QUOTE_SCALE / B
        const scaled = SafeMath.mul(T, QUOTE_SCALE);
        return SafeMath.div(scaled, u256.fromU64(this.virtualSatoshisReserve));
    }

    public save(): void {
        this.settings.save();
        this.providerManager.save();
        this.quoteManager.save();
    }

    public setBlockQuote(): void {
        this.quoteManager.setBlockQuote(Blockchain.block.number, this.quote());
    }

    public setSatoshisOwed(providerId: u256, value: u64): void {
        this.owedBTCManager.setSatoshisOwed(providerId, value);
    }

    public setSatoshisOwedReserved(providerId: u256, value: u64): void {
        this.owedBTCManager.setSatoshisOwedReserved(providerId, value);
    }

    public updateVirtualPoolIfNeeded(): void {
        const currentBlock: u64 = Blockchain.block.number;

        if (currentBlock <= this.lastVirtualUpdateBlock) {
            return;
        }

        let B: u256 = u256.fromU64(this.virtualSatoshisReserve);
        let T: u256 = this.virtualTokenReserve;

        // Add tokens from deltaTokensAdd
        const dT_add: u256 = this.deltaTokensAdd;
        if (!dT_add.isZero()) {
            T = SafeMath.add(T, dT_add);
        }

        // apply net "buys"
        const dB_buy: u256 = u256.fromU64(this.deltaSatoshisBuy);
        const dT_buy: u256 = this.deltaTokensBuy;

        if (!dT_buy.isZero()) {
            let Tprime: u256;
            if (u256.ge(dT_buy, T)) {
                Tprime = u256.One;
            } else {
                Tprime = SafeMath.sub(T, dT_buy);
            }

            const numerator: u256 = SafeMath.mul(B, T);
            let Bprime: u256 = SafeMath.div(numerator, Tprime);
            const incB: u256 = SafeMath.sub(Bprime, B);

            if (u256.gt(incB, dB_buy)) {
                Bprime = SafeMath.add(B, dB_buy);

                let newTprime: u256 = SafeMath.div(numerator, Bprime);
                if (u256.lt(newTprime, u256.One)) {
                    newTprime = u256.One;
                }
                Tprime = newTprime;
            }
            B = Bprime;
            T = Tprime;
        }

        if (T.isZero()) {
            T = u256.One;
        }

        //!!!
        if (B > u256.fromU64(u64.MAX_VALUE)) {
            throw new Revert(`Impossible state: New virtual satoshis reserve out of range.`);
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

    private computeInitialSatoshisReserve(initialLiquidity: u256, floorPrice: u256): u64 {
        const reserve: u256 = SafeMath.div(initialLiquidity, floorPrice);

        if (u256.gt(reserve, MAX_TOTAL_SATOSHIS)) {
            throw new Revert(
                'Impossible state: Satoshis reserve out of range. Please adjust initial liquidity or floor price.',
            );
        }

        return reserve.toU64();
    }

    private resetAccumulators(): void {
        this.liquidityQueueReserve.deltaTokensAdd = u256.Zero;
        this.liquidityQueueReserve.deltaTokensBuy = u256.Zero;
        this.liquidityQueueReserve.deltaSatoshisBuy = 0;
    }

    private computeVolatility(
        currentBlock: u64,
        windowSize: u32 = VOLATILITY_WINDOW_IN_BLOCKS,
    ): u256 {
        let volatility: u256 = u256.Zero;

        const blockNumber: u64 = currentBlock % <u64>(u32.MAX_VALUE - 1);
        const currentQuote: u256 = this.quoteManager.getBlockQuote(blockNumber);
        const oldBlock: u64 = (currentBlock - windowSize) % <u64>(u32.MAX_VALUE - 1);
        const oldQuote: u256 = this.quoteManager.getBlockQuote(oldBlock);

        if (!oldQuote.isZero() && !currentQuote.isZero()) {
            let diff = u256.sub(currentQuote, oldQuote);

            if (diff.toI64() < 0) {
                diff = u256.mul(diff, u256.fromI64(-1));
            }

            volatility = SafeMath.div(SafeMath.mul(diff, u256.fromU64(10000)), oldQuote);
        }

        return volatility;
    }
}
