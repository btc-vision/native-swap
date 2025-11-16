import { Reservation } from '../models/Reservation';
import { CompletedTrade } from '../models/CompletedTrade';
import { Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../models/Provider';
import {
    CappedTokensResult,
    satoshisToTokens128,
    tokensToSatoshis,
} from '../utils/SatoshisConversion';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { IProviderManager } from './interfaces/IProviderManager';
import {
    EMIT_PROVIDERCONSUMED_EVENTS,
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
} from '../constants/Contract';
import { ProviderActivatedEvent } from '../events/ProviderActivatedEvent';
import { ITradeManager } from './interfaces/ITradeManager';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { min128 } from '../utils/MathUtils';
import { IReservationManager } from './interfaces/IReservationManager';
import { ProviderTypes } from '../types/ProviderTypes';
import { ProviderConsumedEvent } from '../events/ProviderConsumedEvent';

export class TradeManager implements ITradeManager {
    protected readonly consumedOutputsFromUTXOs: Map<string, u64> = new Map<string, u64>();
    private readonly providerManager: IProviderManager;
    private readonly reservationManager: IReservationManager;
    private readonly quoteManager: IQuoteManager;
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;
    private totalTokensPurchased: u256 = u256.Zero;
    private totalTokensRefunded: u256 = u256.Zero;
    private totalSatoshisSpent: u64 = 0;
    private totalSatoshisRefunded: u64 = 0;
    private tokensReserved: u256 = u256.Zero;
    private quoteToUse: u256 = u256.Zero;

    constructor(
        quoteManager: IQuoteManager,
        providerManager: IProviderManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        reservationManager: IReservationManager,
    ) {
        this.quoteManager = quoteManager;
        this.providerManager = providerManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.reservationManager = reservationManager;
    }

    public executeTradeExpired(reservation: Reservation, currentQuote: u256): CompletedTrade {
        this.ensureQuoteIsValid(currentQuote);
        this.quoteToUse = currentQuote;
        this.deactivateReservation(reservation);
        this.resetTotals();

        const providerCount: u32 = reservation.getProviderCount();

        for (let index: u32 = 0; index < providerCount; index++) {
            const providerData: ReservationProviderData = reservation.getProviderAt(index);

            // Skip if provider has been removed from provider queue due
            // to either a fulfill or a cancel liquidity.
            if (!this.canGetProvider(providerData)) {
                continue;
            }

            const provider: Provider = this.getProvider(providerData);

            // Skip if the provider is fulfilled.
            if (provider.isFulfilled()) {
                continue;
            }

            // Skip if provider is no more active
            if (!provider.isActive()) {
                continue;
            }

            if (!reservation.getPurged()) {
                this.restoreReservedLiquidityForProvider(provider, providerData.providedAmount);
            }

            const satoshisSent: u64 = this.getSatoshisSent(provider.getBtcReceiver());

            if (satoshisSent !== 0) {
                this.tryExecuteNormalOrPriorityTrade(
                    provider,
                    satoshisSent,
                    providerData.providedAmount,
                    currentQuote,
                );
            } else {
                this.addProviderToPurgeQueue(provider);
            }
        }

        reservation.delete(false);

        return new CompletedTrade(
            this.tokensReserved,
            this.totalTokensPurchased,
            this.totalSatoshisSpent,
            this.totalSatoshisRefunded,
            this.totalTokensRefunded,
        );
    }

    public executeTradeNotExpired(reservation: Reservation, currentQuote: u256): CompletedTrade {
        this.ensureReservationIsValid(reservation);
        this.ensurePurgeIndexIsValid(reservation.getPurgeIndex());
        this.getValidBlockQuote(reservation.getCreationBlock());
        this.deactivateReservation(reservation);
        this.resetTotals();

        const providerCount: u32 = reservation.getProviderCount();

        for (let index: u32 = 0; index < providerCount; index++) {
            const providerData: ReservationProviderData = reservation.getProviderAt(index);
            const provider: Provider = this.getProvider(providerData);
            const satoshisSent: u64 = this.getSatoshisSent(provider.getBtcReceiver());

            if (satoshisSent !== 0) {
                this.executeNormalOrPriorityTrade(
                    provider,
                    providerData.providedAmount,
                    satoshisSent,
                    currentQuote,
                );
            } else {
                this.restoreReservedLiquidityForProvider(provider, providerData.providedAmount);
                this.addProviderToPurgeQueue(provider);
            }
        }

        reservation.delete(false);

        return new CompletedTrade(
            this.tokensReserved,
            this.totalTokensPurchased,
            this.totalSatoshisSpent,
            this.totalSatoshisRefunded,
            this.totalTokensRefunded,
        );
    }

    protected reportUTXOUsed(address: string, value: u64): void {
        const consumedAlready = this.consumedOutputsFromUTXOs.has(address)
            ? this.consumedOutputsFromUTXOs.get(address)
            : 0;

        if (consumedAlready === 0) {
            this.consumedOutputsFromUTXOs.set(address, value);
        } else {
            this.consumedOutputsFromUTXOs.set(address, SafeMath.add64(value, consumedAlready));
        }
    }

    protected getSatoshisSent(address: string): u64 {
        let totalSatoshis: u64 = 0;
        const outputs = Blockchain.tx.outputs;

        for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i];

            if (output.to === address) {
                totalSatoshis = SafeMath.add64(totalSatoshis, output.value);
            }
        }

        const consumedSatoshis: u64 = this.consumedOutputsFromUTXOs.has(address)
            ? this.consumedOutputsFromUTXOs.get(address)
            : 0;

        if (totalSatoshis < consumedSatoshis) {
            throw new Revert('Impossible state: Double spend detected.');
        }

        return totalSatoshis - consumedSatoshis;
    }

    private activateProvider(provider: Provider, currentQuote: u256): void {
        provider.allowLiquidityProvision();
        const totalLiquidity: u128 = provider.getLiquidityAmount();

        // Calculate the second half (matching the rounding from listing)
        const halfFloor: u128 = SafeMath.div128(totalLiquidity, u128.fromU32(2));
        const halfCred: u128 = u128.add(halfFloor, u128.and(totalLiquidity, u128.One));

        // EDGE CASE: Handle providers who bypassed normal listing
        if (!currentQuote.isZero() && provider.getVirtualBTCContribution() === 0) {
            // They bypassed listing, so record their FULL value now
            const btcContribution = tokensToSatoshis(totalLiquidity.toU256(), currentQuote);
            provider.setVirtualBTCContribution(btcContribution);

            // Since they bypassed listing, we need to apply BOTH halves now
            this.liquidityQueueReserve.addToTotalTokensSellActivated(totalLiquidity.toU256());
        } else {
            // Normal case: Apply the SECOND 50% of tokens to the virtual reserves
            // (First 50% was already applied during listing)
            this.liquidityQueueReserve.addToTotalTokensSellActivated(halfCred.toU256());
        }

        this.emitProviderActivatedEvent(provider);
    }

    private addProviderToPurgeQueue(provider: Provider): void {
        if (!provider.isPurged() && provider.getQueueIndex() !== INITIAL_LIQUIDITY_PROVIDER_INDEX) {
            if (provider.getProviderType() === ProviderTypes.Normal) {
                this.providerManager.addToNormalPurgedQueue(provider);
            } else {
                this.providerManager.addToPriorityPurgedQueue(provider);
            }
        }
    }

    private canGetProvider(providerData: ReservationProviderData): boolean {
        let result: boolean = false;

        // Initial provider is never in a queue.
        // Otherwise, ensure provider has not been removed from its queue.
        if (providerData.providerIndex === INITIAL_LIQUIDITY_PROVIDER_INDEX) {
            result = true;
        } else if (
            !this.providerManager
                .getIdFromQueue(providerData.providerIndex, providerData.providerType)
                .isZero()
        ) {
            result = true;
        }

        return result;
    }

    private emitProviderActivatedEvent(provider: Provider): void {
        Blockchain.emit(
            new ProviderActivatedEvent(provider.getId(), provider.getLiquidityAmount(), 0),
        );
    }

    private emitProviderConsumedEvent(provider: Provider, amountUsed: u128): void {
        if (EMIT_PROVIDERCONSUMED_EVENTS) {
            Blockchain.emit(new ProviderConsumedEvent(provider.getId(), amountUsed));
        }
    }

    private ensureProviderHasEnoughLiquidity(provider: Provider, tokensDesired: u128): void {
        if (u128.lt(provider.getLiquidityAmount(), tokensDesired)) {
            throw new Revert('Impossible state: liquidity < tokensDesired.');
        }
    }

    private ensurePurgeIndexIsValid(purgeIndex: u32): void {
        if (purgeIndex === INDEX_NOT_SET_VALUE) {
            throw new Revert('Impossible state: purgeIndex is not set.');
        }
    }

    private ensureQuoteIsValid(quote: u256): void {
        if (quote.isZero()) {
            throw new Revert(
                `Impossible state: Current quote is zero for block number: ${Blockchain.block.number}`,
            );
        }
    }

    private ensureReservationIsValid(reservation: Reservation): void {
        if (!reservation.isValid()) {
            throw new Revert(
                'Impossible state: Reservation is invalid but went thru executeTrade.',
            );
        }
    }

    private ensureReservedAmountIsValid(provider: Provider, providedAmount: u128): void {
        if (u128.lt(provider.getReservedAmount(), providedAmount)) {
            throw new Revert(
                `Impossible state: provider.reserved < reservedAmount (${provider.getReservedAmount()} < ${providedAmount}).`,
            );
        }
    }

    private executeNormalOrPriorityTrade(
        provider: Provider,
        requestedTokens: u128,
        satoshisSent: u64,
        currentQuote: u256,
    ): void {
        const actualTokens: u128 = this.getTargetTokens(
            satoshisSent,
            requestedTokens,
            provider.getLiquidityAmount(),
        );

        if (!actualTokens.isZero()) {
            this.ensureReservedAmountIsValid(provider, requestedTokens);
            this.ensureProviderHasEnoughLiquidity(provider, actualTokens);

            const actualTokens256: u256 = actualTokens.toU256();
            const actualTokensSatoshis: u64 = tokensToSatoshis(actualTokens256, this.quoteToUse);

            provider.subtractFromReservedAmount(requestedTokens);
            provider.subtractFromLiquidityAmount(actualTokens);

            if (
                !provider.isLiquidityProvisionAllowed() &&
                provider.getQueueIndex() !== INITIAL_LIQUIDITY_PROVIDER_INDEX
            ) {
                this.activateProvider(provider, currentQuote);
            }

            this.emitProviderConsumedEvent(provider, actualTokens);

            this.reportUTXOUsed(provider.getBtcReceiver(), actualTokensSatoshis);

            // If partial fill, provider liquidity must be available again.
            // If not purged, check if the provider needs to be reset.
            // If purged, the reset will be done by the purge queue later.
            if (u128.lt(actualTokens, requestedTokens)) {
                this.addProviderToPurgeQueue(provider);
            } else if (!provider.isPurged()) {
                this.resetProviderOnDust(provider);
            }

            this.increaseTokenReserved(requestedTokens);
            this.increaseTotalTokensPurchased(actualTokens256);
            this.increaseSatoshisSpent(actualTokensSatoshis);
        } else {
            this.restoreReservedLiquidityForProvider(provider, requestedTokens);
            this.addProviderToPurgeQueue(provider);
        }
    }

    private getMaximumPossibleTargetTokens(
        satoshis: u64,
        providerAvailableLiquidity: u128,
        originalTokenAmount: u128,
    ): u128 {
        const cappedTokenAmount: u128 = min128(originalTokenAmount, providerAvailableLiquidity);
        const tokenResult: CappedTokensResult = satoshisToTokens128(satoshis, this.quoteToUse);

        return min128(tokenResult.tokens, cappedTokenAmount);
    }

    private getProvider(providerData: ReservationProviderData): Provider {
        return this.providerManager.getProviderFromQueue(
            providerData.providerIndex,
            providerData.providerType,
        );
    }

    private getTargetTokens(satoshis: u64, requestedTokens: u128, providerLiquidity: u128): u128 {
        const tokenResult: CappedTokensResult = satoshisToTokens128(satoshis, this.quoteToUse);

        let targetTokens: u128 = min128(tokenResult.tokens, requestedTokens);
        targetTokens = min128(targetTokens, providerLiquidity);

        return targetTokens;
    }

    private getValidBlockQuote(blockNumber: u64): void {
        this.quoteToUse = this.quoteManager.getValidBlockQuote(blockNumber);
    }

    private increaseSatoshisSpent(value: u64): void {
        this.totalSatoshisSpent = SafeMath.add64(this.totalSatoshisSpent, value);
    }

    private increaseTotalTokensPurchased(value: u256): void {
        this.totalTokensPurchased = SafeMath.add(this.totalTokensPurchased, value);
    }

    private increaseTokenReserved(value: u128): void {
        this.tokensReserved = SafeMath.add(this.tokensReserved, value.toU256());
    }

    private deactivateReservation(reservation: Reservation): void {
        this.reservationManager.deactivateReservation(reservation);
    }

    private resetProviderOnDust(provider: Provider): void {
        if (
            !provider.hasReservedAmount() &&
            !Provider.meetsMinimumReservationAmount(provider.getLiquidityAmount(), this.quoteToUse)
        ) {
            this.providerManager.resetProvider(provider, true, false);
        }
    }

    private resetTotals(): void {
        this.totalTokensPurchased = u256.Zero;
        this.totalTokensRefunded = u256.Zero;
        this.tokensReserved = u256.Zero;
        this.totalSatoshisSpent = 0;
        this.totalSatoshisRefunded = 0;
    }

    private restoreReservedLiquidityForProvider(provider: Provider, value: u128): void {
        if (!value.isZero()) {
            provider.subtractFromReservedAmount(value);
            this.liquidityQueueReserve.subFromTotalReserved(value.toU256());
        }
    }

    private tryExecuteNormalOrPriorityTrade(
        provider: Provider,
        satoshisSent: u64,
        originalTokenAmount: u128,
        currentQuote: u256,
    ): void {
        const actualTokens: u128 = this.getMaximumPossibleTargetTokens(
            satoshisSent,
            provider.getAvailableLiquidityAmount(),
            originalTokenAmount,
        );

        if (Provider.meetsMinimumReservationAmount(actualTokens, this.quoteToUse)) {
            this.ensureProviderHasEnoughLiquidity(provider, actualTokens);

            const actualTokens256: u256 = actualTokens.toU256();
            const actualTokensSatoshis: u64 = tokensToSatoshis(actualTokens256, this.quoteToUse);

            if (
                !provider.isLiquidityProvisionAllowed() &&
                provider.getQueueIndex() !== INITIAL_LIQUIDITY_PROVIDER_INDEX
            ) {
                this.activateProvider(provider, currentQuote);
            }

            provider.subtractFromLiquidityAmount(actualTokens);

            this.emitProviderConsumedEvent(provider, actualTokens);
            this.reportUTXOUsed(provider.getBtcReceiver(), actualTokensSatoshis);

            this.increaseTotalTokensPurchased(actualTokens256);
            this.increaseSatoshisSpent(actualTokensSatoshis);
        }

        // Always push the provider to the purge queue.
        // If provider does not have enough remaining liquidity,
        // it will be removed from the purge queue when trying to use it.
        this.addProviderToPurgeQueue(provider);
    }
}
