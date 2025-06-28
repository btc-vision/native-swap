import { Reservation } from '../models/Reservation';
import { CompletedTrade } from '../models/CompletedTrade';
import { Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../models/Provider';
import {
    CappedTokensResult,
    satoshisToTokens,
    satoshisToTokens128,
    tokensToSatoshis,
    tokensToSatoshis128,
} from '../utils/SatoshisConversion';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { ProviderTypes } from '../types/ProviderTypes';
import { IProviderManager } from './interfaces/IProviderManager';
import {
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';
import { ProviderActivatedEvent } from '../events/ProviderActivatedEvent';
import { ITradeManager } from './interfaces/ITradeManager';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { min128, min64 } from '../utils/MathUtils';
import { IOwedBTCManager } from './interfaces/IOwedBTCManager';
import { IReservationManager } from './interfaces/IReservationManager';

export class TradeManager implements ITradeManager {
    protected readonly consumedOutputsFromUTXOs: Map<string, u64> = new Map<string, u64>();
    private readonly providerManager: IProviderManager;
    private readonly reservationManager: IReservationManager;
    private readonly quoteManager: IQuoteManager;
    private readonly owedBTCManager: IOwedBTCManager;
    private readonly tokenIdUint8Array: Uint8Array;
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;
    private totalTokensPurchased: u256 = u256.Zero;
    private totalTokensRefunded: u256 = u256.Zero;
    private totalSatoshisSpent: u64 = 0;
    private totalSatoshisRefunded: u64 = 0;
    private tokensReserved: u256 = u256.Zero;
    private quoteAtReservation: u256 = u256.Zero;

    constructor(
        tokenIdUint8Array: Uint8Array,
        quoteManager: IQuoteManager,
        providerManager: IProviderManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        owedBTCManager: IOwedBTCManager,
        reservationManager: IReservationManager,
    ) {
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.quoteManager = quoteManager;
        this.providerManager = providerManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.owedBTCManager = owedBTCManager;
        this.reservationManager = reservationManager;
    }

    public executeTrade(reservation: Reservation): CompletedTrade {
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
                if (providerData.providerType === ProviderTypes.LiquidityRemoval) {
                    this.executeLiquidityRemovalTrade(
                        provider,
                        satoshisSent,
                        providerData.providedAmount,
                    );
                } else {
                    this.executeNormalOrPriorityTrade(
                        provider,
                        providerData.providedAmount,
                        satoshisSent,
                        reservation.isForLiquidityPool(),
                    );
                }
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

    private emitProviderActivatedEvent(provider: Provider): void {
        Blockchain.emit(
            new ProviderActivatedEvent(provider.getId(), provider.getLiquidityAmount(), 0),
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

    private ensureRemovalTypeIsValid(queueType: ProviderTypes, provider: Provider): void {
        if (queueType === ProviderTypes.LiquidityRemoval && !provider.isPendingRemoval()) {
            throw new Revert(
                'Impossible state: provider is in removal queue but is not flagged pendingRemoval.',
            );
        }

        if (queueType !== ProviderTypes.LiquidityRemoval && provider.isPendingRemoval()) {
            throw new Revert(
                'Impossible state: provider is flagged pendingRemoval but is not in removal queue.',
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

    private executeLiquidityRemovalTrade(
        provider: Provider,
        satoshisSent: u64,
        requestedTokens: u128,
    ): void {
        const requestedTokens256: u256 = requestedTokens.toU256();
        const providerId: u256 = provider.getId();
        let owedReserved: u64 = this.owedBTCManager.getSatoshisOwedReserved(providerId);
        const oldOwed: u64 = this.owedBTCManager.getSatoshisOwed(providerId);
        let tokensDesiredRemoval: u256 = satoshisToTokens(satoshisSent, this.quoteAtReservation);

        if (!tokensDesiredRemoval.isZero()) {
            if (u256.lt(tokensDesiredRemoval, requestedTokens256)) {
                // User did not pay enough
                const leftover: u256 = SafeMath.sub(requestedTokens256, tokensDesiredRemoval);

                if (!leftover.isZero()) {
                    const costInSatsLeftover: u64 = tokensToSatoshis(
                        leftover,
                        this.quoteAtReservation,
                    );

                    const revertSats: u64 = min64(costInSatsLeftover, owedReserved);
                    owedReserved = SafeMath.sub64(owedReserved, revertSats);
                }
            }

            let actualSpent: u64 = satoshisSent;
            if (u256.gt(tokensDesiredRemoval, requestedTokens256)) {
                // User paid too much
                tokensDesiredRemoval = requestedTokens256;
                actualSpent = tokensToSatoshis(tokensDesiredRemoval, this.quoteAtReservation);
            }

            const newOwedReserved: u64 = SafeMath.sub64(owedReserved, actualSpent);
            this.owedBTCManager.setSatoshisOwedReserved(providerId, newOwedReserved);

            this.setNewOwedValueAndRemoveIfNeeded(provider, oldOwed, actualSpent);
            this.increaseTotalSatoshisRefunded(actualSpent);
            this.increaseTotalTokensRefunded(tokensDesiredRemoval);
            this.reportUTXOUsed(provider.getBtcReceiver(), satoshisSent);
        } else {
            this.restoreReservedLiquidityForRemovalProvider(providerId, requestedTokens);
        }
    }

    private executeNormalOrPriorityTrade(
        provider: Provider,
        requestedTokens: u128,
        satoshisSent: u64,
        isForLiquidityPool: boolean,
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

            const actualTokensSatoshis: u64 = tokensToSatoshis(
                actualTokens256,
                this.quoteAtReservation,
            );
            provider.subtractFromReservedAmount(requestedTokens);

            if (
                !isForLiquidityPool &&
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
                this.emitProviderActivatedEvent(provider);
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

    private getProvider(providerData: ReservationProviderData): Provider {
        const provider: Provider = this.providerManager.getProviderFromQueue(
            providerData.providerIndex,
            providerData.providerType,
        );

        this.ensureRemovalTypeIsValid(providerData.providerType, provider);

        return provider;
    }

    private getTargetTokens(satoshis: u64, requestedTokens: u128, providerLiquidity: u128): u128 {
        const tokenResult: CappedTokensResult = satoshisToTokens128(
            satoshis,
            this.quoteAtReservation,
        );

        let targetTokens: u128 = min128(tokenResult.tokens, requestedTokens);
        targetTokens = min128(targetTokens, providerLiquidity);

        return targetTokens;
    }

    private getValidBlockQuote(blockNumber: u64): void {
        this.quoteAtReservation = this.quoteManager.getValidBlockQuote(blockNumber);
    }

    private increaseSatoshisSpent(value: u64): void {
        this.totalSatoshisSpent = SafeMath.add64(this.totalSatoshisSpent, value);
    }

    private increaseTotalSatoshisRefunded(value: u64): void {
        this.totalSatoshisRefunded = SafeMath.add64(this.totalSatoshisRefunded, value);
    }

    private increaseTotalTokensPurchased(value: u256): void {
        this.totalTokensPurchased = SafeMath.add(this.totalTokensPurchased, value);
    }

    private increaseTokenReserved(value: u128): void {
        this.tokensReserved = SafeMath.add(this.tokensReserved, value.toU256());
    }

    private increaseTotalTokensRefunded(value: u256): void {
        this.totalTokensRefunded = SafeMath.add(this.totalTokensRefunded, value);
    }

    private noStatsSendToProvider(providerData: ReservationProviderData, provider: Provider): void {
        if (providerData.providerType === ProviderTypes.LiquidityRemoval) {
            this.restoreReservedLiquidityForRemovalProvider(
                provider.getId(),
                providerData.providedAmount,
            );
        } else {
            this.restoreReservedLiquidityForProvider(provider, providerData.providedAmount);
        }
    }

    private deactivateReservation(reservation: Reservation): void {
        this.reservationManager.deactivateReservation(reservation);
    }

    private resetProviderOnDust(provider: Provider): void {
        const satoshis = tokensToSatoshis128(
            provider.getLiquidityAmount(),
            this.quoteAtReservation,
        );

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

    private restoreReservedLiquidityForRemovalProvider(providerId: u256, amount: u128): void {
        const currentOwedReserved: u64 = this.owedBTCManager.getSatoshisOwedReserved(providerId);
        const originalCostInSats: u64 = tokensToSatoshis128(amount, this.quoteAtReservation);
        const revertCostInSats: u64 = min64(originalCostInSats, currentOwedReserved);
        const newReserved = SafeMath.sub64(currentOwedReserved, revertCostInSats);

        this.owedBTCManager.setSatoshisOwedReserved(providerId, newReserved);
    }

    private restoreReservedLiquidityForProvider(provider: Provider, value: u128): void {
        provider.subtractFromReservedAmount(value);
        this.liquidityQueueReserve.subFromTotalReserved(value.toU256());
    }

    private setNewOwedValueAndRemoveIfNeeded(
        provider: Provider,
        currentOwed: u64,
        spent: u64,
    ): void {
        const newOwed = SafeMath.sub64(currentOwed, spent);
        this.owedBTCManager.setSatoshisOwed(provider.getId(), newOwed);

        if (newOwed < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT) {
            this.providerManager.resetProvider(provider, false, false);
        }
    }
}
