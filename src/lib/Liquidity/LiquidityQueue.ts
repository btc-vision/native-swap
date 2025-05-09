import {
    Address,
    Blockchain,
    BytesWriter,
    Revert,
    SafeMath,
    StoredBooleanArray,
    StoredU128Array,
    StoredU256,
    StoredU256Array,
    StoredU64,
    StoredU64Array,
    TransactionOutput,
    TransferHelper,
    u256To30Bytes,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

import {
    ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER,
    ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
    BLOCKS_WITH_RESERVATIONS_POINTER,
    DELTA_BTC_BUY,
    DELTA_TOKENS_ADD,
    DELTA_TOKENS_BUY,
    INDEXED_PROVIDER_POINTER,
    LIQUIDITY_QUOTE_HISTORY_POINTER,
    LIQUIDITY_RESERVED_POINTER,
    LIQUIDITY_VIRTUAL_BTC_POINTER,
    LIQUIDITY_VIRTUAL_T_POINTER,
    RESERVATION_IDS_BY_BLOCK_POINTER,
    RESERVATION_SETTINGS_POINTER,
    TOTAL_RESERVES_POINTER,
} from '../StoredPointers';

import { StoredMapU256 } from '../../stored/StoredMapU256';
import { getProvider, Provider } from '../Provider';
import { LIQUIDITY_REMOVAL_TYPE, NORMAL_TYPE, PRIORITY_TYPE, Reservation } from '../Reservation';
import { CompletedTrade } from '../CompletedTrade';
import { DynamicFee } from '../DynamicFee';
import { ProviderManager } from './ProviderManager';
import { QUOTE_SCALE, satoshisToTokens, tokensToSatoshis } from '../../utils/NativeSwapUtils';
import { ActivateProviderEvent } from '../../events/ActivateProviderEvent';

const ENABLE_FEES: bool = true;

export class LiquidityQueue {
    // Reservation settings
    public static RESERVATION_EXPIRE_AFTER: u64 = 10; //5;
    public static VOLATILITY_WINDOW_BLOCKS: u32 = 5;
    public static STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(600);

    public static MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(1000);
    public static MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY: u256 = u256.fromU32(10_000);
    public static MINIMUM_TRADE_SIZE_IN_SATOSHIS: u256 = u256.fromU32(10_000);
    public static PERCENT_TOKENS_FOR_PRIORITY_QUEUE: u128 = u128.fromU32(30);
    public static PERCENT_TOKENS_FOR_PRIORITY_FACTOR: u128 = u128.fromU32(1000);
    public static TIMEOUT_AFTER_EXPIRATION: u8 = 5; // 5 blocks timeout

    public readonly tokenId: u256;
    protected _providerManager: ProviderManager;

    // "virtual" reserves
    private readonly _virtualBTCReserve: StoredU256;
    private readonly _virtualTokenReserve: StoredU256;

    // We'll keep p0 in a pointer
    private readonly _quoteHistory: StoredU256Array;
    private readonly _totalReserves: StoredMapU256;
    private readonly _totalReserved: StoredMapU256;

    // We'll store the last block updated
    private readonly _settings: StoredU64;
    private readonly _maxTokenPerSwap: StoredU256;

    // "delta" accumulators - used in updated stepwise logic
    private readonly _deltaTokensAdd: StoredU256;
    private readonly _deltaBTCBuy: StoredU256;
    private readonly _deltaTokensBuy: StoredU256;

    private consumedOutputsFromUTXOs: Map<string, u64> = new Map<string, u64>();

    private readonly _dynamicFee: DynamicFee;
    private readonly _timeoutEnabled: boolean;

    private _blocksWithReservations: StoredU64Array;

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
        purgeOldReservations: boolean,
        timeoutEnabled: boolean = false,
    ) {
        this.tokenId = u256.fromBytes(token, true);

        this._dynamicFee = new DynamicFee(tokenIdUint8Array);
        this._providerManager = new ProviderManager(
            token,
            tokenIdUint8Array,
            LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        this._quoteHistory = new StoredU256Array(
            LIQUIDITY_QUOTE_HISTORY_POINTER,
            tokenIdUint8Array,
        );

        // virtual reserves
        this._virtualBTCReserve = new StoredU256(LIQUIDITY_VIRTUAL_BTC_POINTER, tokenIdUint8Array);
        this._virtualTokenReserve = new StoredU256(LIQUIDITY_VIRTUAL_T_POINTER, tokenIdUint8Array);

        // accumulators
        this._deltaTokensAdd = new StoredU256(DELTA_TOKENS_ADD, tokenIdUint8Array);
        this._deltaBTCBuy = new StoredU256(DELTA_BTC_BUY, tokenIdUint8Array);
        this._deltaTokensBuy = new StoredU256(DELTA_TOKENS_BUY, tokenIdUint8Array);

        this._maxTokenPerSwap = new StoredU256(
            ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
            tokenIdUint8Array,
        );

        this._totalReserves = new StoredMapU256(TOTAL_RESERVES_POINTER);
        this._totalReserved = new StoredMapU256(LIQUIDITY_RESERVED_POINTER);

        this._settings = new StoredU64(RESERVATION_SETTINGS_POINTER, tokenIdUint8Array);
        this._timeoutEnabled = timeoutEnabled;

        this._blocksWithReservations = new StoredU64Array(
            BLOCKS_WITH_RESERVATIONS_POINTER,
            tokenIdUint8Array,
        );

        if (purgeOldReservations) {
            this.purgeReservationsAndRestoreProviders();
        }

        this.updateVirtualPoolIfNeeded();
    }

    public get volatility(): u256 {
        return this._dynamicFee.volatility;
    }

    public get initialLiquidityProvider(): u256 {
        return this._providerManager.initialLiquidityProvider;
    }

    public set initialLiquidityProvider(value: u256) {
        this._providerManager.initialLiquidityProvider = value;
    }

    public get virtualBTCReserve(): u256 {
        return this._virtualBTCReserve.value;
    }

    public set virtualBTCReserve(value: u256) {
        this._virtualBTCReserve.value = value;
    }

    public get virtualTokenReserve(): u256 {
        return this._virtualTokenReserve.value;
    }

    public set virtualTokenReserve(value: u256) {
        this._virtualTokenReserve.value = value;
    }

    public get deltaTokensAdd(): u256 {
        return this._deltaTokensAdd.value;
    }

    public set deltaTokensAdd(val: u256) {
        this._deltaTokensAdd.value = val;
    }

    public get deltaBTCBuy(): u256 {
        return this._deltaBTCBuy.value;
    }

    public set deltaBTCBuy(val: u256) {
        this._deltaBTCBuy.value = val;
    }

    public get deltaTokensBuy(): u256 {
        return this._deltaTokensBuy.value;
    }

    public set deltaTokensBuy(val: u256) {
        this._deltaTokensBuy.value = val;
    }

    public get reservedLiquidity(): u256 {
        return this._totalReserved.get(this.tokenId) || u256.Zero;
    }

    public get liquidity(): u256 {
        return this._totalReserves.get(this.tokenId) || u256.Zero;
    }

    public get maxTokensPerReservation(): u256 {
        return this._maxTokenPerSwap.value;
    }

    public set maxTokensPerReservation(value: u256) {
        this._maxTokenPerSwap.value = value;
    }

    public get maxReserves5BlockPercent(): u64 {
        return this._settings.get(0);
    }

    public set maxReserves5BlockPercent(value: u64) {
        this._settings.set(0, value);
    }

    public get lastPurgedBlock(): u64 {
        return this._settings.get(1);
    }

    public set lastPurgedBlock(value: u64) {
        this._settings.set(1, value);
    }

    public get antiBotExpirationBlock(): u64 {
        return this._settings.get(2);
    }

    public set antiBotExpirationBlock(value: u64) {
        this._settings.set(2, value);
    }

    public get lastVirtualUpdateBlock(): u64 {
        return this._settings.get(3);
    }

    public set lastVirtualUpdateBlock(value: u64) {
        this._settings.set(3, value);
    }

    public get feesEnabled(): bool {
        return ENABLE_FEES;
    }

    public get timeOutEnabled(): bool {
        return this._timeoutEnabled;
    }

    public cleanUpQueues(): void {
        this._providerManager.cleanUpQueues();
    }

    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        this._providerManager.resetProvider(provider, burnRemainingFunds, canceled);
    }

    public computeFees(totalTokensPurchased: u256, totalSatoshisSpent: u256): u256 {
        const utilizationRatio = this.getUtilizationRatio();
        const feeBP = this._dynamicFee.getDynamicFeeBP(totalSatoshisSpent, utilizationRatio);
        return this._dynamicFee.computeFeeAmount(totalTokensPurchased, feeBP);
    }

    public getNextProviderWithLiquidity(currentQuote: u256): Provider | null {
        return this._providerManager.getNextProviderWithLiquidity(currentQuote);
    }

    public getTokensAfterTax(amountIn: u128): u128 {
        const tokensForPriorityQueue: u128 = SafeMath.div128(
            SafeMath.mul128(amountIn, LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_QUEUE),
            LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_FACTOR,
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
            throw new Revert(`NOT_ENOUGH_LIQUIDITY`);
        }

        // scaledQuote = T * QUOTE_SCALE / B
        const scaled = SafeMath.mul(T, QUOTE_SCALE);
        return SafeMath.div(scaled, this.virtualBTCReserve);
    }

    public saveIndexForProvider(providerId: u256, index: u64): void {
        const store = new StoredU64(INDEXED_PROVIDER_POINTER, u256To30Bytes(providerId));
        store.set(0, index);
        store.save();
    }

    public addToPriorityQueue(providerId: u256): void {
        const index = this._providerManager.addToPriorityQueue(providerId);
        this.saveIndexForProvider(providerId, index);
    }

    public addToStandardQueue(providerId: u256): void {
        const index = this._providerManager.addToStandardQueue(providerId);
        this.saveIndexForProvider(providerId, index);
    }

    public addToRemovalQueue(providerId: u256): void {
        this._providerManager.addToRemovalQueue(providerId);
    }

    public initializeInitialLiquidity(
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u256,
        maxReserves5BlockPercent: u64,
    ): void {
        this.initialLiquidityProvider = providerId;

        // The contract simulates BTC side:
        this.virtualBTCReserve = SafeMath.div(initialLiquidity, floorPrice);
        this.virtualTokenReserve = initialLiquidity;

        // set max reserves in 5 blocks
        this.maxReserves5BlockPercent = maxReserves5BlockPercent;
    }

    public save(): void {
        this._settings.save();
        this._providerManager.save();
        this._quoteHistory.save();
    }

    public buyTokens(tokensOut: u256, satoshisIn: u256): void {
        // accumulate
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

        this._dynamicFee.volatility = this.computeVolatility(
            currentBlock,
            LiquidityQueue.VOLATILITY_WINDOW_BLOCKS,
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

    public executeTrade(reservation: Reservation): CompletedTrade {
        if (reservation.valid() === false) {
            throw new Revert('Impossible state: Reservation is invalid but went thru executeTrade');
        }

        // Gather the tx outputs to see how much BTC was actually sent to each provider's address.
        const outputs: TransactionOutput[] = Blockchain.tx.outputs;

        // The quoted price at the time of reservation
        const blockNumber: u64 = reservation.createdAt % <u64>(u32.MAX_VALUE - 1);
        const quoteAtReservation = this.getBlockQuote(blockNumber);
        if (quoteAtReservation.isZero()) {
            throw new Revert(
                `Quote at reservation is zero. (createdAt: ${blockNumber}, quoteAtReservation: ${quoteAtReservation})`,
            );
        }

        // Retrieve arrays (provider indexes, amounts, queue types)
        const reservedIndexes: u32[] = reservation.getReservedIndexes();
        const reservedValues: u128[] = reservation.getReservedValues();
        const queueTypes: u8[] = reservation.getQueueTypes();
        const reservationForLP = reservation.reservedLP;

        // Mark the reservation as used.
        const purgeIndex = <u64>reservation.getPurgeIndex();
        if (purgeIndex === <u64>u32.MAX_VALUE) {
            throw new Revert('Impossible state: purgeIndex is MAX_VALUE');
        }

        const reservationActiveList = this.getActiveReservationListForBlock(reservation.createdAt);
        reservationActiveList.delete(purgeIndex);
        reservationActiveList.save();

        // **Important**: we delete the reservation record now
        // (since we have all needed info in local variables)
        reservation.delete(false);

        // Track totals
        let totalTokensPurchased = u256.Zero;
        let totalSatoshisSpent = u256.Zero;
        let totalRefundedBTC = u256.Zero;
        let totalTokensRefunded = u256.Zero;
        let tokensReserved = u256.Zero;

        for (let i = 0; i < reservedIndexes.length; i++) {
            const providerIndex: u64 = reservedIndexes[i];
            const reservedAmount: u128 = reservedValues[i];
            const queueType: u8 = queueTypes[i];

            const provider: Provider = this.getProviderFromQueue(providerIndex, queueType);
            if (queueType === LIQUIDITY_REMOVAL_TYPE && !provider.pendingRemoval) {
                throw new Revert(
                    'Impossible state: removal queue when provider is not flagged pendingRemoval.',
                );
            }

            let satoshisSent = this.findAmountForAddressInOutputUTXOs(
                outputs,
                provider.btcReceiver,
            );

            if (satoshisSent.isZero()) {
                this.noStatsSendToProvider(queueType, reservedAmount, quoteAtReservation, provider);
                continue;
            }

            tokensReserved = SafeMath.add(tokensReserved, reservedAmount.toU256());

            // Convert satoshis -> tokens
            let tokensDesired = satoshisToTokens(satoshisSent, quoteAtReservation);

            if (queueType === LIQUIDITY_REMOVAL_TYPE) {
                // (These tokens are not in provider.liquidity.)
                // We clamp satoshisSent by how much is actually in _lpBTCowedReserved
                const owedReserved = this.getBTCowedReserved(provider.providerId);
                let actualSpent = SafeMath.min(satoshisSent, owedReserved);

                // Also clamp by oldOwed if provider has partially switched from removal
                const oldOwed = this.getBTCowed(provider.providerId);
                if (u256.lt(oldOwed, actualSpent)) {
                    const difference = SafeMath.sub(actualSpent, oldOwed);
                    actualSpent = SafeMath.sub(actualSpent, difference);
                }

                // Convert that spent amount to tokens
                let tokensDesiredRem = satoshisToTokens(actualSpent, quoteAtReservation);
                tokensDesiredRem = SafeMath.min(tokensDesiredRem, reservedAmount.toU256());

                if (tokensDesiredRem.isZero()) {
                    // If zero => revert the entire chunk from _lpBTCowedReserved
                    const costInSats = tokensToSatoshis(
                        reservedAmount.toU256(),
                        quoteAtReservation,
                    );

                    const revertSats = SafeMath.min(costInSats, owedReserved);
                    const newReserved = SafeMath.sub(owedReserved, revertSats);
                    this.setBTCowedReserved(provider.providerId, newReserved);
                    continue;
                } else {
                    // partial leftover
                    const leftover = SafeMath.sub128(reservedAmount, tokensDesiredRem.toU128());
                    if (!leftover.isZero()) {
                        const costInSatsLeftover = tokensToSatoshis(
                            leftover.toU256(),
                            quoteAtReservation,
                        );

                        const owedReservedNow = this.getBTCowedReserved(provider.providerId);
                        const revertSats = SafeMath.min(costInSatsLeftover, owedReservedNow);
                        const newOwedReserved = SafeMath.sub(owedReservedNow, revertSats);
                        this.setBTCowedReserved(provider.providerId, newOwedReserved);
                    }
                }

                // final: remove from _lpBTCowedReserved
                const newOwedReserved = SafeMath.sub(owedReserved, actualSpent);
                this.setBTCowedReserved(provider.providerId, newOwedReserved);

                const newOwed = SafeMath.sub(oldOwed, actualSpent);
                this.setBTCowed(provider.providerId, newOwed);

                // If fully (or almost) paid => remove from removal queue
                if (u256.lt(newOwed, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                    this._providerManager.removePendingLiquidityProviderFromRemovalQueue(
                        provider,
                        provider.indexedAt,
                    );
                }

                // The user "receives" tokensDesiredRem from the removal queue
                totalRefundedBTC = SafeMath.add(totalRefundedBTC, actualSpent);
                totalTokensRefunded = SafeMath.add(totalTokensRefunded, tokensDesiredRem);

                this.reportUTXOUsed(provider.btcReceiver, actualSpent.toU64());
            } else {
                // we need to do it for one first time
                tokensDesired = SafeMath.min(tokensDesired, reservedAmount.toU256());
                tokensDesired = SafeMath.min(tokensDesired, provider.liquidity.toU256());

                if (tokensDesired.isZero()) {
                    // if zero => ignore entire chunk
                    this.restoreReservedLiquidityForProvider(provider, reservedAmount);
                    tokensReserved = SafeMath.sub(tokensReserved, reservedAmount.toU256());
                    continue;
                }

                if (u128.lt(provider.reserved, reservedAmount)) {
                    throw new Revert(
                        `Impossible state: provider.reserved < reservedAmount (${provider.reserved} < ${reservedAmount})`,
                    );
                }

                // Convert the purchased portion to satoshis
                satoshisSent = tokensToSatoshis(tokensDesired, quoteAtReservation);

                provider.decreaseReserved(reservedAmount);

                const tokensDesiredU128 = tokensDesired.toU128();

                // Actually consume tokens from provider.liquidity
                if (u128.lt(provider.liquidity, tokensDesiredU128)) {
                    throw new Revert('Impossible state: liquidity < tokensDesired');
                }

                // Enable provider liquidity, must be done before the subtraction
                if (
                    !reservationForLP &&
                    !provider.canProvideLiquidity() &&
                    provider.indexedAt !== u32.MAX_VALUE
                ) {
                    provider.enableLiquidityProvision();

                    // track that we effectively "added" them to the virtual pool
                    this.increaseDeltaTokensAdd(provider.liquidity.toU256());

                    this.emitActivateProviderEvent(provider);
                }

                provider.decreaseLiquidity(tokensDesiredU128);

                this.resetProviderOnDust(provider, quoteAtReservation);

                // Accumulate user stats
                totalTokensPurchased = SafeMath.add(totalTokensPurchased, tokensDesired);
                totalSatoshisSpent = SafeMath.add(totalSatoshisSpent, satoshisSent);

                this.reportUTXOUsed(provider.btcReceiver, satoshisSent.toU64());
            }
        }

        return new CompletedTrade(
            tokensReserved,
            totalTokensPurchased,
            totalSatoshisSpent,
            totalRefundedBTC,
            totalTokensRefunded,
        );
    }

    public getReservationWithExpirationChecks(): Reservation {
        const reservation = new Reservation(this.token, Blockchain.tx.sender);
        if (!reservation.valid()) {
            throw new Revert('No valid reservation for this address.');
        }

        if (reservation.getActivationDelay() === 0) {
            if (reservation.createdAt === Blockchain.block.number) {
                throw new Revert('Cannot be consumed in the same block');
            }
        } else {
            if (
                reservation.createdAt + reservation.getActivationDelay() >
                Blockchain.block.number
            ) {
                throw new Revert(
                    `Too early: (${reservation.createdAt}, ${reservation.getActivationDelay()})`,
                );
            }
        }

        return reservation;
    }

    public getBTCowed(providerId: u256): u256 {
        return this._providerManager.getBTCowed(providerId);
    }

    public setBTCowed(providerId: u256, amount: u256): void {
        this._providerManager.setBTCowed(providerId, amount);
    }

    public increaseBTCowed(providerId: u256, amount: u256): void {
        const owedBefore = this.getBTCowed(providerId);
        const owedAfter = SafeMath.add(owedBefore, amount);
        this.setBTCowed(providerId, owedAfter);
    }

    public getBTCowedReserved(providerId: u256): u256 {
        return this._providerManager.getBTCowedReserved(providerId);
    }

    public setBTCowedReserved(providerId: u256, amount: u256): void {
        this._providerManager.setBTCowedReserved(providerId, amount);
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
        const reservationList = this.getReservationListForBlock(blockNumber);
        reservationList.push(reservationId);
        reservationList.save();

        const reservationActiveList = this.getActiveReservationListForBlock(blockNumber);
        reservationActiveList.push(true);
        reservationActiveList.save();

        const reservationIndex: u32 = <u32>(reservationList.getLength() - 1);
        const reservationActiveIndex: u32 = <u32>(reservationActiveList.getLength() - 1);

        const reservationList2 = this.getReservationListForBlock(blockNumber);
        if (reservationList2.get(reservationIndex) !== reservationId) {
            throw new Revert('Reservation mismatch');
        }

        assert(
            reservationIndex === reservationActiveIndex,
            'Impossible state: Reservation index mismatch',
        );

        this.pushBlockIfNotExists(blockNumber);

        return reservationIndex;
    }

    public getReservationListForBlock(blockNumber: u64): StoredU128Array {
        const writer = new BytesWriter(8 + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes = writer.getBuffer();
        return new StoredU128Array(RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes);
    }

    public getActiveReservationListForBlock(blockNumber: u64): StoredBooleanArray {
        const writer = new BytesWriter(8 + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes = writer.getBuffer();
        return new StoredBooleanArray(ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes);
    }

    public setBlockQuote(): void {
        if (<u64>u32.MAX_VALUE - 1 < Blockchain.block.number) {
            throw new Revert('Block number too large, max array size.');
        }

        const blockNumberU32: u64 = Blockchain.block.number % <u64>(u32.MAX_VALUE - 1);
        this._quoteHistory.set(blockNumberU32, this.quote());
    }

    public getBlockQuote(blockNumber: u64): u256 {
        return this._quoteHistory.get(blockNumber);
    }

    public increaseVirtualBTCReserve(amount: u256): void {
        this.virtualBTCReserve = SafeMath.add(this.virtualBTCReserve, amount);
    }

    public decreaseVirtualBTCReserve(amount: u256): void {
        this.virtualBTCReserve = SafeMath.sub(this.virtualBTCReserve, amount);
    }

    public increaseVirtualTokenReserve(amount: u256): void {
        this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, amount);
    }

    public decreaseVirtualTokenReserve(amount: u256): void {
        this.virtualTokenReserve = SafeMath.sub(this.virtualTokenReserve, amount);
    }

    public increaseTotalReserve(amount: u256): void {
        const currentReserve = this._totalReserves.get(this.tokenId);
        const newReserve = SafeMath.add(currentReserve, amount);
        this._totalReserves.set(this.tokenId, newReserve);
    }

    public decreaseTotalReserve(amount: u256): void {
        const currentReserve = this._totalReserves.get(this.tokenId);
        const newReserve = SafeMath.sub(currentReserve, amount);
        this._totalReserves.set(this.tokenId, newReserve);
    }

    public increaseTotalReserved(amount: u256): void {
        const currentReserved = this._totalReserved.get(this.tokenId);
        const newReserved = SafeMath.add(currentReserved, amount);
        this._totalReserved.set(this.tokenId, newReserved);
    }

    public decreaseTotalReserved(amount: u256): void {
        const currentReserved = this._totalReserved.get(this.tokenId);
        const newReserved = SafeMath.sub(currentReserved, amount);

        this._totalReserved.set(this.tokenId, newReserved);
    }

    public increaseDeltaTokensAdd(amount: u256): void {
        this.deltaTokensAdd = SafeMath.add(this.deltaTokensAdd, amount);
    }

    public increaseDeltaTokensBuy(amount: u256): void {
        this.deltaTokensBuy = SafeMath.add(this.deltaTokensBuy, amount);
    }

    public increaseDeltaBTCBuy(amount: u256): void {
        this.deltaBTCBuy = SafeMath.add(this.deltaBTCBuy, amount);
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

    protected purgeReservationsAndRestoreProviders(): void {
        const currentBlockNumber: u64 = Blockchain.block.number;
        if (LiquidityQueue.RESERVATION_EXPIRE_AFTER > currentBlockNumber) {
            return;
        }

        // The "latest" block we should purge
        const maxBlockToPurge: u64 = currentBlockNumber - LiquidityQueue.RESERVATION_EXPIRE_AFTER;

        // If we can't purge anything yet, skip
        if (maxBlockToPurge <= this.lastPurgedBlock) {
            this._providerManager.restoreCurrentIndex();
            return;
        }

        let totalFreed: u256 = u256.Zero;
        let updatedOne = false;

        // We'll remove from _blocksWithReservations all blocks < maxBlockToPurge
        const length = this._blocksWithReservations.getLength();

        let i: u64 = 0;
        while (i < length) {
            const blockNumber = this._blocksWithReservations.get(i);

            // If the blockNumber is >= maxBlockToPurge, stop
            if (blockNumber >= maxBlockToPurge) {
                break;
            }

            // Purge that block
            const freed = this.purgeBlock(blockNumber);
            if (!freed.isZero()) {
                updatedOne = true;
                totalFreed = SafeMath.add(totalFreed, freed);
            }

            i++;
        }

        // We can remove the blocks we processed from the front (0..i-1)
        let toRemove = i;
        while (toRemove > 0 && this._blocksWithReservations.getLength() > 0) {
            this._blocksWithReservations.shift();

            toRemove--;
        }

        // Save the updated array
        this._blocksWithReservations.save();

        // If we freed anything, decrease totalReserved
        if (updatedOne) {
            this.decreaseTotalReserved(totalFreed);
            this._providerManager.resetStartingIndex();
        } else {
            this._providerManager.restoreCurrentIndex();
        }

        // Mark that we've processed up to (but not including) maxBlockToPurge
        this.lastPurgedBlock = maxBlockToPurge;
    }

    private emitActivateProviderEvent(provider: Provider): void {
        Blockchain.emit(
            new ActivateProviderEvent(provider.providerId, provider.liquidity, u128.Zero),
        );
    }

    private purgeBlock(blockNumber: u64): u256 {
        const reservationList = this.getReservationListForBlock(blockNumber);
        const activeIds: StoredBooleanArray = this.getActiveReservationListForBlock(blockNumber);

        const length = reservationList.getLength();
        let totalFreed = u256.Zero;

        for (let i: u32 = 0; i < length; i++) {
            if (!activeIds.get(i)) {
                continue;
            }

            const reservationId = reservationList.get(i);
            const reservation = Reservation.load(reservationId);
            const purgeIndex = reservation.getPurgeIndex();

            this.ensureReservationPurgeIndexMatch(reservation.reservationId, purgeIndex, i);

            // Double-check it is indeed expired
            assert(
                reservation.expired(),
                `Impossible state: Reservation still active during purge.`,
            );

            // Same logic you had: restore providers, remove reservation, etc.
            const freedAmount = this.restoreReservation(reservation);
            totalFreed = SafeMath.add(totalFreed, freedAmount);
        }

        // Reset these arrays so the block becomes effectively empty
        reservationList.reset();
        activeIds.reset();

        return totalFreed;
    }

    private restoreReservation(reservation: Reservation): u256 {
        const reservedIndexes: u32[] = reservation.getReservedIndexes();
        const reservedValues: u128[] = reservation.getReservedValues();
        const queueTypes: u8[] = reservation.getQueueTypes();

        let restoredLiquidity: u256 = u256.Zero;

        for (let j = 0; j < reservedIndexes.length; j++) {
            const providerIndex: u64 = reservedIndexes[j];
            const reservedAmount: u128 = reservedValues[j];
            const queueType: u8 = queueTypes[j];

            const provider: Provider = this.getProviderFromQueue(providerIndex, queueType);

            if (provider.pendingRemoval && queueType === LIQUIDITY_REMOVAL_TYPE) {
                this.purgeAndRestoreProviderRemovalQueue(
                    provider.providerId,
                    reservedAmount,
                    reservation.createdAt,
                );
            } else {
                this.ensureValidReservedAmount(provider, reservedAmount);
                this.purgeAndRestoreProvider(provider, reservedAmount);
            }

            restoredLiquidity = SafeMath.add(restoredLiquidity, reservedAmount.toU256());
        }

        reservation.delete(true);

        return restoredLiquidity;
    }

    private pushBlockIfNotExists(blockNumber: u64): void {
        const len = this._blocksWithReservations.getLength();
        if (len > 0) {
            const lastBlock = this._blocksWithReservations.get(len - 1);
            if (lastBlock === blockNumber) {
                return;
            }
        }

        this._blocksWithReservations.push(blockNumber);
        this._blocksWithReservations.save();
    }

    private resetProviderOnDust(provider: Provider, quoteAtReservation: u256): void {
        const satLeftValue = tokensToSatoshis(provider.liquidity.toU256(), quoteAtReservation);

        if (u256.lt(satLeftValue, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
            this._providerManager.resetProvider(provider, false);
        }
    }

    private resetAccumulators(): void {
        this.deltaTokensAdd = u256.Zero;
        this.deltaBTCBuy = u256.Zero;
        this.deltaTokensBuy = u256.Zero;
    }

    private computeVolatility(
        currentBlock: u64,
        windowSize: u32 = LiquidityQueue.VOLATILITY_WINDOW_BLOCKS,
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

    private restoreReservedLiquidityForProvider(provider: Provider, reserved: u128): void {
        provider.decreaseReserved(reserved);

        this.decreaseTotalReserved(reserved.toU256());
    }

    private getProviderIfFromQueue(providerIndex: u64, type: u8): u256 {
        switch (type) {
            case NORMAL_TYPE: {
                return this._providerManager.getFromStandardQueue(providerIndex);
            }
            case PRIORITY_TYPE: {
                return this._providerManager.getFromPriorityQueue(providerIndex);
            }
            case LIQUIDITY_REMOVAL_TYPE: {
                return this._providerManager.getFromRemovalQueue(providerIndex);
            }
            default: {
                throw new Revert('Invalid reservation type');
            }
        }
    }

    private getProviderFromQueue(providerIndex: u64, type: u8): Provider {
        const isInitialLiquidity = providerIndex === u32.MAX_VALUE;
        const providerId: u256 = isInitialLiquidity
            ? this._providerManager.initialLiquidityProvider
            : this.getProviderIfFromQueue(providerIndex, type);

        if (providerId.isZero()) {
            throw new Revert(
                `Impossible state: Cannot load provider. Index: ${providerIndex} Type: ${type}. Pool corrupted.`,
            );
        }

        const provider = getProvider(providerId);
        provider.indexedAt = providerIndex;

        return provider;
    }

    private findAmountForAddressInOutputUTXOs(outputs: TransactionOutput[], address: string): u256 {
        let amount: u64 = 0;
        for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i];
            if (output.to === address) {
                amount += output.value;
            }
        }

        const consumed: u64 = this.consumedOutputsFromUTXOs.has(address)
            ? this.consumedOutputsFromUTXOs.get(address)
            : 0;

        if (amount < consumed) {
            throw new Revert('Impossible state: Double spend detected');
        }

        return u256.fromU64(amount - consumed);
    }

    private reportUTXOUsed(addy: string, amount: u64): void {
        const consumedAlready = this.consumedOutputsFromUTXOs.has(addy)
            ? this.consumedOutputsFromUTXOs.get(addy)
            : 0;

        if (consumedAlready === 0) {
            this.consumedOutputsFromUTXOs.set(addy, amount);
        } else {
            this.consumedOutputsFromUTXOs.set(addy, SafeMath.add64(amount, consumedAlready));
        }
    }

    private noStatsSendToProvider(
        queueType: u8,
        reservedAmount: u128,
        quoteAtReservation: u256,
        provider: Provider,
    ): void {
        // If this is a removal provider, we also revert that portion
        //         from _lpBTCowedReserved (since it never got paid).
        if (queueType === LIQUIDITY_REMOVAL_TYPE) {
            // Convert 'reservedAmount' back to sat (approx) using the original quote
            const costInSats = tokensToSatoshis(reservedAmount.toU256(), quoteAtReservation);

            // clamp by actual owedReserved
            const owedReserved = this.getBTCowedReserved(provider.providerId);
            const revertSats = SafeMath.min(costInSats, owedReserved);

            // reduce the owedReserved by revertSats
            const newReserved = SafeMath.sub(owedReserved, revertSats);

            this.setBTCowedReserved(provider.providerId, newReserved);
        } else {
            this.restoreReservedLiquidityForProvider(provider, reservedAmount);
        }
    }

    private purgeAndRestoreProviderRemovalQueue(
        providerId: u256,
        reservedAmount: u128,
        createdAt: u64,
    ): void {
        const blockNumber: u64 = createdAt % <u64>(u32.MAX_VALUE - 1);
        const currentQuoteAtThatTime = this.getBlockQuote(blockNumber);

        if (currentQuoteAtThatTime.isZero()) {
            throw new Revert('Impossible state: No quote at block.');
        }

        // figure out how many sat was associated with 'reservedAmount'
        const costInSats = tokensToSatoshis(reservedAmount.toU256(), currentQuoteAtThatTime);

        // clamp by actual `_lpBTCowedReserved`
        const wasReservedSats = this.getBTCowedReserved(providerId);
        const revertSats = SafeMath.min(costInSats, wasReservedSats);

        // remove from owedReserved
        const newOwedReserved = SafeMath.sub(wasReservedSats, revertSats);
        this.setBTCowedReserved(providerId, newOwedReserved);
    }

    private purgeAndRestoreProvider(provider: Provider, reservedAmount: u128): void {
        provider.decreaseReserved(reservedAmount);

        const availableLiquidity = SafeMath.sub128(provider.liquidity, provider.reserved);

        if (
            u128.lt(
                availableLiquidity,
                LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT.toU128(),
            )
        ) {
            this._providerManager.resetProvider(provider, false);
        }
    }

    private ensureReservationPurgeIndexMatch(
        reservationId: u128,
        reservationPurgeIndex: u32,
        currentIndex: u32,
    ): void {
        if (reservationPurgeIndex !== currentIndex) {
            throw new Revert(
                `Impossible state: reservation ${reservationId} purge index mismatch (expected: ${currentIndex}, actual: ${reservationPurgeIndex})`,
            );
        }
    }

    private ensureValidReservedAmount(provider: Provider, reservedAmount: u128): void {
        if (u128.lt(provider.reserved, reservedAmount)) {
            throw new Revert('Impossible state: reserved amount bigger than provider reserve');
        }
    }
}
