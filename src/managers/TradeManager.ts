import { Reservation } from '../models/Reservation';
import { CompletedTrade } from '../models/CompletedTrade';
import { Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../models/Provider';
import {
    CappedTokensResult,
    satoshisToTokens128,
    tokensToSatoshis,
    tokensToSatoshis128,
} from '../utils/SatoshisConversion';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { IProviderManager } from './interfaces/IProviderManager';
import {
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';
import { ActivateProviderEvent } from '../events/ActivateProviderEvent';
import { ITradeManager } from './interfaces/ITradeManager';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { min128 } from '../utils/MathUtils';
import { IReservationManager } from './interfaces/IReservationManager';

export class TradeManager implements ITradeManager {
    protected readonly consumedOutputsFromUTXOs: Map<string, u64> = new Map<string, u64>();
    private readonly providerManager: IProviderManager;
    private readonly reservationManager: IReservationManager;
    private readonly quoteManager: IQuoteManager;
    private readonly tokenIdUint8Array: Uint8Array;
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;
    private totalTokensPurchased: u256 = u256.Zero;
    private totalTokensRefunded: u256 = u256.Zero;
    private totalSatoshisSpent: u64 = 0;
    private totalSatoshisRefunded: u64 = 0;
    private tokensReserved: u256 = u256.Zero;
    private quoteToUse: u256 = u256.Zero;

    constructor(
        tokenIdUint8Array: Uint8Array,
        quoteManager: IQuoteManager,
        providerManager: IProviderManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        reservationManager: IReservationManager,
    ) {
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.quoteManager = quoteManager;
        this.providerManager = providerManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.reservationManager = reservationManager;
    }

    public executeTradeExpired(reservation: Reservation, currentQuote: u256): CompletedTrade {
        this.quoteToUse = currentQuote;
        this.resetTotals();

        const providerCount: u32 = reservation.getProviderCount();

        for (let index: u32 = 0; index < providerCount; index++) {
            const providerData: ReservationProviderData = reservation.getProviderAt(index);
            const provider: Provider = this.getProvider(providerData);
            const satoshisSent: u64 = this.getSatoshisSent(provider.getBtcReceiver());

            if (satoshisSent !== 0) {
                this.tryExecuteNormalOrPriorityTrade(provider, satoshisSent);
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

    public executeTradeNotExpired(reservation: Reservation): CompletedTrade {
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
                );
            } else {
                this.noStatsSendToProvider(providerData, provider);
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

    private emitActivateProviderEvent(provider: Provider): void {
        Blockchain.emit(
            new ActivateProviderEvent(provider.getId(), provider.getLiquidityAmount(), 0),
        );
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
    ): void {
        const actualTokens: u128 = this.getTargetTokens(
            satoshisSent,
            requestedTokens,
            provider.getLiquidityAmount(),
        );

        const actualTokens256: u256 = actualTokens.toU256();

        if (!actualTokens.isZero()) {
            this.ensureReservedAmountIsValid(provider, requestedTokens);
            this.ensureProviderHasEnoughLiquidity(provider, actualTokens);

            const actualTokensSatoshis: u64 = tokensToSatoshis(actualTokens256, this.quoteToUse);
            provider.subtractFromReservedAmount(requestedTokens);

            if (
                !provider.isLiquidityProvisionAllowed() &&
                provider.getQueueIndex() !== INITIAL_LIQUIDITY_PROVIDER_INDEX
            ) {
                provider.allowLiquidityProvision();
                const totalLiquidity: u128 = provider.getLiquidityAmount();

                // floor(totalLiquidity / 2)
                const halfFloor: u128 = SafeMath.div128(totalLiquidity, u128.fromU32(2));

                // CEIL = floor + (totalLiquidity & 1)
                const halfCred: u128 = u128.add(
                    halfFloor,
                    u128.and(totalLiquidity, u128.One), // adds 1 iff odd
                );

                // track that we virtually added those tokens to the pool
                this.liquidityQueueReserve.addToTotalTokensSellActivated(halfCred.toU256());
                this.emitActivateProviderEvent(provider);
            }

            provider.subtractFromLiquidityAmount(actualTokens);

            this.resetProviderOnDust(provider);
            this.increaseTokenReserved(requestedTokens);
            this.increaseTotalTokensPurchased(actualTokens256);
            this.increaseSatoshisSpent(actualTokensSatoshis);
            this.reportUTXOUsed(provider.getBtcReceiver(), actualTokensSatoshis);
        } else {
            this.restoreReservedLiquidityForProvider(provider, requestedTokens);
        }
    }

    private getMaximumPossibleTargetTokens(satoshis: u64, providerLiquidity: u128): u128 {
        const tokenResult: CappedTokensResult = satoshisToTokens128(satoshis, this.quoteToUse);

        const targetTokens = min128(tokenResult.tokens, providerLiquidity);

        return targetTokens;
    }

    private getProvider(providerData: ReservationProviderData): Provider {
        const provider: Provider = this.providerManager.getProviderFromQueue(
            providerData.providerIndex,
            providerData.providerType,
        );

        return provider;
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

    private noStatsSendToProvider(providerData: ReservationProviderData, provider: Provider): void {
        this.restoreReservedLiquidityForProvider(provider, providerData.providedAmount);
    }

    private deactivateReservation(reservation: Reservation): void {
        this.reservationManager.deactivateReservation(reservation);
    }

    private resetProviderOnDust(provider: Provider): void {
        const satoshis = tokensToSatoshis128(provider.getLiquidityAmount(), this.quoteToUse);

        if (satoshis < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT) {
            this.providerManager.resetProvider(provider, false, false);
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
        provider.subtractFromReservedAmount(value);
        this.liquidityQueueReserve.subFromTotalReserved(value.toU256());
    }

    private tryExecuteNormalOrPriorityTrade(provider: Provider, satoshisSent: u64): void {
        const actualTokens: u128 = this.getMaximumPossibleTargetTokens(
            satoshisSent,
            provider.getAvailableLiquidityAmount(),
        );

        const actualTokens256: u256 = actualTokens.toU256();

        if (!actualTokens.isZero()) {
            this.ensureProviderHasEnoughLiquidity(provider, actualTokens);

            const actualTokensSatoshis: u64 = tokensToSatoshis(actualTokens256, this.quoteToUse);

            if (
                !provider.isLiquidityProvisionAllowed() &&
                provider.getQueueIndex() !== INITIAL_LIQUIDITY_PROVIDER_INDEX
            ) {
                provider.allowLiquidityProvision();
                const totalLiquidity: u128 = provider.getLiquidityAmount();

                // floor(totalLiquidity / 2)
                const halfFloor: u128 = SafeMath.div128(totalLiquidity, u128.fromU32(2));

                // CEIL = floor + (totalLiquidity & 1)
                const halfCred: u128 = u128.add(
                    halfFloor,
                    u128.and(totalLiquidity, u128.One), // adds 1 iff odd
                );

                // track that we virtually added those tokens to the pool
                this.liquidityQueueReserve.addToTotalTokensSellActivated(halfCred.toU256());
                this.emitActivateProviderEvent(provider);
            }

            provider.subtractFromLiquidityAmount(actualTokens);

            this.resetProviderOnDust(provider);
            this.increaseTokenReserved(actualTokens); //!!!!????
            this.increaseTotalTokensPurchased(actualTokens256);
            this.increaseSatoshisSpent(actualTokensSatoshis);
            this.reportUTXOUsed(provider.getBtcReceiver(), actualTokensSatoshis);
        }
    }
}
