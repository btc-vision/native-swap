import { Reservation } from '../models/Reservation';
import { CompletedTrade } from '../models/CompletedTrade';
import {
    Blockchain,
    BytesWriter,
    Revert,
    SafeMath,
    StoredBooleanArray,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
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
import { ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER } from '../constants/StoredPointers';
import { ProviderTypes } from '../types/ProviderTypes';
import { IProviderManager } from './interfaces/IProviderManager';
import {
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';
import { ActivateProviderEvent } from '../events/ActivateProviderEvent';
import { ITradeManager } from './interfaces/ITradeManager';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { min128, min64 } from '../utils/MathUtils';

export class TradeManager implements ITradeManager {
    private readonly providerManager: IProviderManager;
    private readonly quoteManager: IQuoteManager;
    private readonly tokenIdUint8Array: Uint8Array;
    private readonly consumedOutputsFromUTXOs: Map<string, u64> = new Map<string, u64>();
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;
    private totalTokensPurchased: u256 = u256.Zero;
    private totalTokensRefunded = u256.Zero;
    private totalSatoshisSpent: u64 = 0;
    private totalSatoshisRefunded: u64 = 0;
    private tokensReserved: u256 = u256.Zero;
    private quoteAtReservation: u256 = u256.Zero;

    constructor(
        tokenIdUint8Array: Uint8Array,
        quoteManager: IQuoteManager,
        providerManager: IProviderManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
    ) {
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.quoteManager = quoteManager;
        this.providerManager = providerManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
    }

    public executeTrade(reservation: Reservation): CompletedTrade {
        this.ensureReservationIsValid(reservation);
        this.ensurePurgeIndexIsValid(reservation.getPurgeIndex());
        this.getValidBlockQuote(reservation.getCreationBlock());
        this.removeReservationFromActiveList(reservation);
        this.resetTotals();

        const providerCount: u64 = reservation.getProviderCount();

        for (let index = 0; index < providerCount; index++) {
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

    private executeLiquidityRemovalTrade(
        provider: Provider,
        satoshisSent: u64,
        requestedTokens: u128,
    ): void {
        const providerId: u256 = provider.getId();
        let owedReserved: u64 = this.providerManager.getBTCowedReserved(providerId);
        const oldOwed: u64 = this.providerManager.getBTCowed(providerId);
        let tokensDesiredRemoval: u256 = satoshisToTokens(satoshisSent, this.quoteAtReservation);
        //!!!! On remove combien de token max????

        // Partial fill
        if (!tokensDesiredRemoval.isZero()) {
            // User did not pay enough
            const leftover: u256 = SafeMath.sub(requestedTokens, tokensDesiredRemoval);
            if (!leftover.isZero()) {
                const costInSatsLeftover: u256 = tokensToSatoshis(
                    leftover,
                    this.quoteAtReservation,
                );
                const revertSats: u256 = SafeMath.min(costInSatsLeftover, owedReserved);

                owedReserved = SafeMath.sub(owedReserved, revertSats);
            }

            // User paid too much
            let actualSpent: u64 = satoshisSent;
            if (u256.gt(tokensDesiredRemoval, requestedTokens)) {
                tokensDesiredRemoval = requestedTokens;
                actualSpent = tokensToSatoshis(tokensDesiredRemoval, this.quoteAtReservation);
            }

            const newOwedReserved: u256 = SafeMath.sub(owedReserved, actualSpent);
            this.providerManager.setBTCowedReserved(providerId, newOwedReserved);

            this.setNewOwedValueAndRemoveIfNeeded(provider, oldOwed, newOwedReserved);
            this.increaseTotalSatoshisRefunded(actualSpent);
            this.increaseTotalTokensRefunded(tokensDesiredRemoval);
            this.reportUTXOUsed(provider.getBtcReceiver(), satoshisSent);
        } else {
            //!!! Ca marche pas.... c'est pas des owedReserved qu'on restore mais des tokens dans la function????
            this.restoreReservedLiquidityForRemovalProvider(
                providerId,
                requestedTokens,
                owedReserved,
            );
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

        if (!actualTokens.isZero()) {
            this.ensureReservedAmountIsValid(provider, requestedTokens);
            this.ensureProviderHasEnoughLiquidity(provider, actualTokens);

            const actualTokensSatoshis: u64 = tokensToSatoshis128(
                actualTokens,
                this.quoteAtReservation,
            );
            provider.subtractFromReservedAmount(requestedTokens);

            if (
                !isForLiquidityPool &&
                !provider.isLiquidityProvisionAllowed() &&
                provider.getQueueIndex() !== INITIAL_LIQUIDITY_PROVIDER_INDEX
            ) {
                provider.allowLiquidityProvision();
                this.liquidityQueueReserve.addToDeltaTokensAdd(
                    provider.getLiquidityAmount().toU256(),
                );
                this.emitActivateProviderEvent(provider);
            }

            provider.subtractFromLiquidityAmount(actualTokens);

            this.resetProviderOnDust(provider);
            this.increaseTokenReserved(requestedTokens);
            this.increaseTotalTokensPurchased(actualTokens.toU256());
            this.increaseSatoshisSpent(actualTokensSatoshis);
            this.reportUTXOUsed(provider.getBtcReceiver(), actualTokensSatoshis);
        } else {
            this.restoreReservedLiquidityForProvider(provider, requestedTokens);
        }
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

    private restoreReservedLiquidityForRemovalProvider(providerId: u256, amount: u128): void {
        const currentOwedReserved: u64 = this.providerManager.getBTCowedReserved(providerId);
        const originalCostInSats: u64 = tokensToSatoshis128(amount, this.quoteAtReservation);
        const revertCostInSats: u64 = min64(originalCostInSats, currentOwedReserved);
        const newReserved = SafeMath.sub64(currentOwedReserved, revertCostInSats);

        this.providerManager.setBTCowedReserved(providerId, newReserved);
    }

    private resetTotals(): void {
        this.totalTokensPurchased = u256.Zero;
        this.totalTokensRefunded = u256.Zero;
        this.tokensReserved = u256.Zero;
        this.totalSatoshisSpent = 0;
        this.totalSatoshisRefunded = 0;
    }

    private getProvider(providerData: ReservationProviderData): Provider {
        const provider: Provider = this.providerManager.getProviderFromQueue(
            providerData.providerIndex,
            providerData.providerType,
        );

        this.ensureRemovalTypeIsValid(providerData.providerType, provider);

        return provider;
    }

    private getActiveReservationListForBlock(blockNumber: u64): StoredBooleanArray {
        const writer = new BytesWriter(U64_BYTE_LENGTH + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes = writer.getBuffer();
        return new StoredBooleanArray(ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes);
    }

    private removeReservationFromActiveList(reservation: Reservation): void {
        const reservationActiveList = this.getActiveReservationListForBlock(
            reservation.getCreationBlock(),
        );
        reservationActiveList.delete(reservation.getPurgeIndex());
        reservationActiveList.save();
    }

    private getSatoshisSent(address: string): u64 {
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

    private restoreReservedLiquidityForProvider(provider: Provider, value: u128): void {
        provider.subtractFromReservedAmount(value);
        this.liquidityQueueReserve.subFromTotalReserved(value.toU256());
    }

    private reportUTXOUsed(address: string, value: u64): void {
        const consumedAlready = this.consumedOutputsFromUTXOs.has(address)
            ? this.consumedOutputsFromUTXOs.get(address)
            : 0;

        if (consumedAlready === 0) {
            this.consumedOutputsFromUTXOs.set(address, value);
        } else {
            this.consumedOutputsFromUTXOs.set(address, SafeMath.add64(value, consumedAlready));
        }
    }

    private resetProviderOnDust(provider: Provider): void {
        const satoshis = tokensToSatoshis128(
            provider.getLiquidityAmount(),
            this.quoteAtReservation,
        );

        if (satoshis < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT) {
            this.providerManager.resetProvider(provider, false);
        }
    }

    private setNewOwedValueAndRemoveIfNeeded(
        provider: Provider,
        currentOwed: u64,
        spent: u64,
    ): void {
        const newOwed = SafeMath.sub64(currentOwed, spent);
        this.providerManager.setBTCowed(provider.getId(), newOwed);

        if (newOwed < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT) {
            this.providerManager.removePendingLiquidityProviderFromRemovalQueue(provider);
        }
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

    private getValidBlockQuote(blockNumber: u64): void {
        this.quoteAtReservation = this.quoteManager.getValidBlockQuote(blockNumber);
    }

    private ensureProviderHasEnoughLiquidity(provider: Provider, tokensDesired: u128): void {
        if (u128.lt(provider.getLiquidityAmount(), tokensDesired)) {
            throw new Revert('Impossible state: liquidity < tokensDesired.');
        }
    }

    private ensureReservedAmountIsValid(provider: Provider, providedAmount: u128): void {
        if (u128.lt(provider.getReservedAmount(), providedAmount)) {
            throw new Revert(
                `Impossible state: provider.reserved < reservedAmount (${provider.getReservedAmount()} < ${providedAmount}).`,
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

    private ensurePurgeIndexIsValid(purgeIndex: u64): void {
        //!!!! CHECK MAX_VALUE
        if (purgeIndex === u64.MAX_VALUE) {
            throw new Revert('Impossible state: purgeIndex is MAX_VALUE.');
        }
    }

    private emitActivateProviderEvent(provider: Provider): void {
        Blockchain.emit(
            new ActivateProviderEvent(provider.getId(), provider.getLiquidityAmount(), 0),
        );
    }
}
