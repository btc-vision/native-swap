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
    PERCENT_TOKENS_FOR_PRIORITY_FACTOR_TAX,
    PERCENT_TOKENS_FOR_PRIORITY_QUEUE_TAX,
    QUOTE_SCALE,
    VOLATILITY_WINDOW_IN_BLOCKS,
} from '../constants/Contract';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { IProviderManager } from './interfaces/IProviderManager';
import { IReservationManager } from './interfaces/IReservationManager';
import { ILiquidityQueue } from './interfaces/ILiquidityQueue';
import { IDynamicFee } from './interfaces/IDynamicFee';

const ENABLE_FEES: bool = true;

export class LiquidityQueue implements ILiquidityQueue {
    public readonly token: Address;
    private readonly providerManager: IProviderManager;
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;
    private readonly quoteManager: IQuoteManager;
    private readonly reservationManager: IReservationManager;
    private readonly settings: StoredU64;
    private readonly _maxTokensPerReservation: StoredU256;
    private readonly dynamicFee: IDynamicFee;
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

    public get virtualBTCReserve(): u256 {
        return this.liquidityQueueReserve.virtualBTCReserve;
    }

    public set virtualBTCReserve(value: u256) {
        this.liquidityQueueReserve.virtualBTCReserve = value;
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

    public get deltaBTCBuy(): u256 {
        return this.liquidityQueueReserve.deltaBTCBuy;
    }

    public set deltaBTCBuy(value: u256) {
        this.liquidityQueueReserve.deltaBTCBuy = value;
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

    public getBTCowed(providerId: u256): u256 {
        return this.providerManager.getBTCowed(providerId);
    }

    public setBTCowed(providerId: u256, value: u256): void {
        this.providerManager.setBTCowed(providerId, value);
    }

    public getBTCOwedLeft(providerId: u256): u256 {
        return this.providerManager.getBTCOwedLeft(providerId);
    }

    public increaseBTCowed(providerId: u256, value: u256): void {
        const owedBefore = this.getBTCowed(providerId);
        const owedAfter = SafeMath.add(owedBefore, value);
        this.setBTCowed(providerId, owedAfter);
    }

    public getBTCowedReserved(providerId: u256): u256 {
        return this.providerManager.getBTCowedReserved(providerId);
    }

    public setBTCowedReserved(providerId: u256, value: u256): void {
        this.providerManager.setBTCowedReserved(providerId, value);
    }

    public cleanUpQueues(): void {
        this.providerManager.cleanUpQueues();
    }

    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        this.providerManager.resetProvider(provider, burnRemainingFunds, canceled);
    }

    public computeFees(totalTokensPurchased: u256, totalSatoshisSpent: u256): u256 {
        const utilizationRatio = this.getUtilizationRatio();
        const feeBP = this.dynamicFee.getDynamicFeeBP(totalSatoshisSpent, utilizationRatio);
        return this.dynamicFee.computeFeeAmount(totalTokensPurchased, feeBP);
    }

    public getNextProviderWithLiquidity(currentQuote: u256): Provider | null {
        return this.providerManager.getNextProviderWithLiquidity(currentQuote);
    }

    public getTokensAfterTax(amountIn: u128): u128 {
        const tokensForPriorityQueue: u128 = SafeMath.div128(
            SafeMath.mul128(amountIn, PERCENT_TOKENS_FOR_PRIORITY_QUEUE_TAX),
            PERCENT_TOKENS_FOR_PRIORITY_FACTOR_TAX,
        );

        return SafeMath.sub128(amountIn, tokensForPriorityQueue);
    }

    // Return number of token per satoshi
    public quote(): u256 {
        const T: u256 = this.virtualTokenReserve;
        if (T.isZero()) {
            return u256.Zero;
        }

        if (this.virtualBTCReserve.isZero()) {
            throw new Revert(`Impossible state: Not enough liquidity`);
        }

        // scaledQuote = T * QUOTE_SCALE / B
        const scaled = SafeMath.mul(T, QUOTE_SCALE);
        return SafeMath.div(scaled, this.virtualBTCReserve);
    }

    public addToPriorityQueue(provider: Provider): void {
        this.providerManager.addToPriorityQueue(provider);
    }

    public addToStandardQueue(provider: Provider): void {
        this.providerManager.addToStandardQueue(provider);
    }

    public addToRemovalQueue(provider: Provider): void {
        this.providerManager.addToRemovalQueue(provider);
    }

    public initializeInitialLiquidity(
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u256,
        maxReserves5BlockPercent: u64,
    ): void {
        this.initialLiquidityProviderId = providerId;

        // The contract simulates BTC side:
        this.virtualBTCReserve = SafeMath.div(initialLiquidity, floorPrice);
        this.virtualTokenReserve = initialLiquidity;

        // set max reserves in 5 blocks
        this.maxReserves5BlockPercent = maxReserves5BlockPercent;
    }

    public save(): void {
        this.settings.save();
        this.providerManager.save();
        this.quoteManager.save();
    }

    public buyTokens(tokensOut: u256, satoshisIn: u256): void {
        this.increaseDeltaBTCBuy(satoshisIn);
        this.increaseDeltaTokensBuy(tokensOut);
    }

    public updateVirtualPoolIfNeeded(): void {
        const currentBlock = Blockchain.block.number;

        if (currentBlock <= this.lastVirtualUpdateBlock) {
            return;
        }

        let B = this.virtualBTCReserve;
        let T = this.virtualTokenReserve;

        // Add tokens from deltaTokensAdd
        const dT_add = this.deltaTokensAdd;
        if (!dT_add.isZero()) {
            T = SafeMath.add(T, dT_add);
        }

        // apply net "buys"
        const dB_buy = this.deltaBTCBuy;
        const dT_buy = this.deltaTokensBuy;

        if (!dT_buy.isZero()) {
            let Tprime: u256;
            if (u256.ge(dT_buy, T)) {
                Tprime = u256.One;
            } else {
                Tprime = SafeMath.sub(T, dT_buy);
            }

            const numerator = SafeMath.mul(B, T);
            let Bprime = SafeMath.div(numerator, Tprime);
            const incB = SafeMath.sub(Bprime, B);

            if (u256.gt(incB, dB_buy)) {
                Bprime = SafeMath.add(B, dB_buy);

                let newTprime = SafeMath.div(numerator, Bprime);
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

        this.virtualBTCReserve = B;
        this.virtualTokenReserve = T;
        this.resetAccumulators();

        this.dynamicFee.volatility = this.computeVolatility(
            currentBlock,
            VOLATILITY_WINDOW_IN_BLOCKS,
        );

        this.lastVirtualUpdateBlock = currentBlock;
    }

    public getUtilizationRatio(): u256 {
        const reserved = this.reservedLiquidity;
        const total = this.liquidity;

        if (total.isZero()) {
            return u256.Zero;
        }

        return SafeMath.div(SafeMath.mul(reserved, u256.fromU64(100)), total);
    }

    public getReservationWithExpirationChecks(): Reservation {
        const reservation = new Reservation(this.token, Blockchain.tx.sender);

        reservation.ensureCanBeConsumed();

        return reservation;
    }

    public getMaximumTokensLeftBeforeCap(): u256 {
        const maxPercentage: u256 = u256.fromU64(this.maxReserves5BlockPercent);

        if (this.liquidity.isZero()) {
            return u256.Zero;
        }

        const totalScaled = SafeMath.mul(this.liquidity, QUOTE_SCALE);
        const reservedScaled = SafeMath.mul(this.reservedLiquidity, QUOTE_SCALE);

        const capScaled = SafeMath.div(SafeMath.mul(totalScaled, maxPercentage), u256.fromU32(100));

        let availableScaled = u256.Zero;

        if (reservedScaled < capScaled) {
            availableScaled = SafeMath.div(SafeMath.sub(capScaled, reservedScaled), QUOTE_SCALE);
        }

        return availableScaled;
    }

    public addActiveReservationToList(blockNumber: u64, reservationId: u128): u32 {
        return this.reservationManager.addActiveReservationToList(blockNumber, reservationId);
    }

    public setBlockQuote(): void {
        if (<u64>u32.MAX_VALUE - 1 < Blockchain.block.number) {
            throw new Revert('Impossible state: Block number too large, max array size.');
        }

        const blockNumberU32: u64 = Blockchain.block.number % <u64>(u32.MAX_VALUE - 1);
        this.quoteManager.setBlockQuote(blockNumberU32, this.quote());
    }

    public getBlockQuote(blockNumber: u64): u256 {
        return this.quoteManager.getBlockQuote(blockNumber);
    }

    public increaseVirtualBTCReserve(value: u256): void {
        this.virtualBTCReserve = SafeMath.add(this.virtualBTCReserve, value);
    }

    public decreaseVirtualBTCReserve(value: u256): void {
        this.virtualBTCReserve = SafeMath.sub(this.virtualBTCReserve, value);
    }

    public increaseVirtualTokenReserve(value: u256): void {
        this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, value);
    }

    public decreaseVirtualTokenReserve(value: u256): void {
        this.virtualTokenReserve = SafeMath.sub(this.virtualTokenReserve, value);
    }

    public increaseTotalReserve(value: u256): void {
        this.liquidityQueueReserve.addToTotalReserve(value);
    }

    public decreaseTotalReserve(value: u256): void {
        this.liquidityQueueReserve.subFromTotalReserve(value);
    }

    public increaseTotalReserved(value: u256): void {
        this.liquidityQueueReserve.addToTotalReserved(value);
    }

    public decreaseTotalReserved(value: u256): void {
        this.liquidityQueueReserve.subFromTotalReserved(value);
    }

    public increaseDeltaTokensAdd(value: u256): void {
        this.liquidityQueueReserve.addToDeltaTokensAdd(value);
    }

    public increaseDeltaTokensBuy(value: u256): void {
        this.liquidityQueueReserve.addToDeltaTokensBuy(value);
    }

    public increaseDeltaBTCBuy(value: u256): void {
        this.liquidityQueueReserve.addToDeltaBTCBuy(value);
    }

    public distributeFee(totalFee: u256, stakingAddress: Address): void {
        const feeLP = SafeMath.div(SafeMath.mul(totalFee, u256.fromU64(50)), u256.fromU64(100));
        const feeMoto = SafeMath.sub(totalFee, feeLP);

        // Do nothing with half the fee
        this.increaseVirtualTokenReserve(feeLP);

        // Only transfer if the fee is non-zero
        if (feeMoto > u256.Zero) {
            // Send other half of fee to staking contract
            TransferHelper.safeTransfer(this.token, stakingAddress, feeMoto);
            this.decreaseTotalReserve(feeMoto);
        }
    }

    private resetAccumulators(): void {
        this.liquidityQueueReserve.deltaTokensAdd = u256.Zero;
        this.liquidityQueueReserve.deltaBTCBuy = u256.Zero;
        this.liquidityQueueReserve.deltaTokensBuy = u256.Zero;
    }

    private computeVolatility(
        currentBlock: u64,
        windowSize: u32 = VOLATILITY_WINDOW_IN_BLOCKS,
    ): u256 {
        const blockNumber: u64 = currentBlock % <u64>(u32.MAX_VALUE - 1);
        const currentQuote = this.getBlockQuote(blockNumber);

        // older quote from (currentBlock - windowSize)
        const oldBlock = (currentBlock - windowSize) % <u64>(u32.MAX_VALUE - 1);
        const oldQuote = this.getBlockQuote(oldBlock);

        if (oldQuote.isZero() || currentQuote.isZero()) {
            return u256.Zero;
        }

        let diff = u256.sub(currentQuote, oldQuote);
        if (diff.toI64() < 0) {
            diff = u256.mul(diff, u256.fromI64(-1));
        }

        return SafeMath.div(SafeMath.mul(diff, u256.fromU64(10000)), oldQuote);
    }
}
