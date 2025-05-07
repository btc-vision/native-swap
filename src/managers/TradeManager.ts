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
import { u128, u256 } from '@btc-vision/as-bignum';
import { Provider } from '../models/Provider';
import { satoshisToTokens, tokensToSatoshis } from '../utils/SatoshisConversion';
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

export class TradeManager implements ITradeManager {
    private readonly providerManager: IProviderManager;
    private readonly quoteManager: IQuoteManager;
    private readonly tokenIdUint8Array: Uint8Array;
    private readonly consumedOutputsFromUTXOs: Map<string, u256> = new Map<string, u256>();
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;
    private totalTokensPurchased = u256.Zero;
    private totalSatoshisSpent = u256.Zero;
    private totalRefundedBTC = u256.Zero;
    private totalTokensRefunded = u256.Zero;
    private tokensReserved = u256.Zero;
    private quoteAtReservation = u256.Zero;

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
        this.getValidQuote(reservation.getCreationBlock());
        this.removeReservationFromActiveList(reservation);
        this.resetTotals();

        const providerCount = reservation.getProviderCount();

        for (let index = 0; index < providerCount; index++) {
            const providerData = reservation.getProviderAt(index);
            const provider: Provider = this.getProvider(providerData);
            const satoshisSent = this.getSathosisSent(provider.getBtcReceiver());

            if (!satoshisSent.isZero()) {
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
            this.totalRefundedBTC,
            this.totalTokensRefunded,
        );
    }

    private executeLiquidityRemovalTrade(
        provider: Provider,
        satoshisSent: u256,
        requestedTokens: u128,
    ): void {
        const providerId: u256 = provider.getId();
        let owedReserved: u256 = this.providerManager.getBTCowedReserved(providerId);
        const oldOwed: u256 = this.providerManager.getBTCowed(providerId);
        let tokensDesiredRemoval: u256 = satoshisToTokens(satoshisSent, this.quoteAtReservation);

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
            let actualSpent: u256 = satoshisSent;
            if (u256.gt(tokensDesiredRemoval, requestedTokens)) {
                tokensDesiredRemoval = requestedTokens;
                actualSpent = tokensToSatoshis(tokensDesiredRemoval, this.quoteAtReservation);
            }

            const newOwedReserved: u256 = SafeMath.sub(owedReserved, actualSpent);
            this.providerManager.setBTCowedReserved(providerId, newOwedReserved);

            this.setNewOwedValueCleanQueueIfNeeded(provider, oldOwed, newOwedReserved);
            this.increaseTotalRefundedBTC(actualSpent);
            this.increaseTotalTokensRefunded(tokensDesiredRemoval);
            this.reportUTXOUsed(provider.getBtcReceiver(), satoshisSent);
        } else {
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
        satoshisSent: u256,
        isForLiquidityPool: boolean,
    ): void {
        const actualTokens: u256 = this.getTargetTokens(
            satoshisSent,
            requestedTokens,
            provider.getLiquidityAmount(),
        );

        if (!actualTokens.isZero()) {
            this.ensureReservedAmountIsValid(provider, requestedTokens);
            this.ensureProviderHasEnoughLiquidity(provider, actualTokens);

            const tokensDesiredSatoshis: u256 = tokensToSatoshis(
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
                this.liquidityQueueReserve.addToDeltaTokensAdd(provider.getLiquidityAmount());
                this.emitActivateProviderEvent(provider);
            }

            provider.subtractFromLiquidityAmount(actualTokens);

            this.resetProviderOnDust(provider, this.quoteAtReservation);
            this.increaseTokenReserved(requestedTokens);
            this.increaseTotalTokensPurchased(actualTokens);
            this.increaseSatoshisSpent(tokensDesiredSatoshis);
            this.reportUTXOUsed(provider.getBtcReceiver(), tokensDesiredSatoshis);
        } else {
            this.restoreReservedLiquidityForProvider(provider, requestedTokens);
        }
    }

    private getTargetTokens(
        satoshisSent: u256,
        requestedTokens: u128,
        providerLiquidity: u128,
    ): u256 {
        let targetTokens = satoshisToTokens(satoshisSent, this.quoteAtReservation);
        targetTokens = SafeMath.min(targetTokens, requestedTokens);
        targetTokens = SafeMath.min(targetTokens, providerLiquidity);

        return targetTokens;
    }

    private restoreReservedLiquidityForRemovalProvider(
        providerId: u256,
        amount: u256,
        owedReserved: u256,
    ): void {
        const originalCostInSats = tokensToSatoshis(amount, this.quoteAtReservation);
        const costToRevertInSats = SafeMath.min(originalCostInSats, owedReserved);
        const newReserved = SafeMath.sub(owedReserved, costToRevertInSats);
        this.providerManager.setBTCowedReserved(providerId, newReserved);
    }

    private resetTotals(): void {
        this.totalTokensPurchased = u256.Zero;
        this.totalSatoshisSpent = u256.Zero;
        this.totalRefundedBTC = u256.Zero;
        this.totalTokensRefunded = u256.Zero;
        this.tokensReserved = u256.Zero;
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

    private getSathosisSent(address: string): u256 {
        let amount: u256 = u256.Zero;
        const outputs = Blockchain.tx.outputs;

        for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i];

            if (output.to === address) {
                amount = SafeMath.add(amount, u256.fromU64(output.value));
            }
        }

        const consumed: u256 = this.consumedOutputsFromUTXOs.has(address)
            ? this.consumedOutputsFromUTXOs.get(address)
            : u256.Zero;

        if (amount < consumed) {
            throw new Revert('Impossible state: Double spend detected');
        }

        return u256.sub(amount, consumed);
    }

    private noStatsSendToProvider(providerData: ReservationProviderData, provider: Provider): void {
        if (providerData.providerType === ProviderTypes.LiquidityRemoval) {
            const owedReserved = this.providerManager.getBTCowedReserved(provider.getId());
            this.restoreReservedLiquidityForRemovalProvider(
                provider.getId(),
                providerData.providedAmount,
                owedReserved,
            );
        } else {
            this.restoreReservedLiquidityForProvider(provider, providerData.providedAmount);
        }
    }

    private restoreReservedLiquidityForProvider(provider: Provider, amount: u128): void {
        provider.subtractFromReservedAmount(amount);
        this.liquidityQueueReserve.subFromTotalReserved(amount);
    }

    private reportUTXOUsed(addy: string, amount: u256): void {
        const consumedAlready = this.consumedOutputsFromUTXOs.has(addy)
            ? this.consumedOutputsFromUTXOs.get(addy)
            : 0;

        if (consumedAlready === 0) {
            this.consumedOutputsFromUTXOs.set(addy, amount);
        } else {
            this.consumedOutputsFromUTXOs.set(addy, SafeMath.add(amount, consumedAlready));
        }
    }

    private resetProviderOnDust(provider: Provider, quoteAtReservation: u256): void {
        const satLeftValue = tokensToSatoshis(provider.getLiquidityAmount(), quoteAtReservation);

        if (u256.lt(satLeftValue, STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)) {
            this.providerManager.resetProvider(provider, false);
        }
    }

    private setNewOwedValueCleanQueueIfNeeded(
        provider: Provider,
        oldValue: u256,
        spent: u256,
    ): void {
        const newOwed = SafeMath.sub(oldValue, spent);
        this.providerManager.setBTCowed(provider.getId(), newOwed);

        if (u256.lt(newOwed, STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)) {
            this.providerManager.removePendingLiquidityProviderFromRemovalQueue(provider);
        }
    }

    private increaseSatoshisSpent(value: u256): void {
        this.totalSatoshisSpent = SafeMath.add(this.totalSatoshisSpent, value);
    }

    private increaseTotalTokensPurchased(value: u256): void {
        this.totalTokensPurchased = SafeMath.add(this.totalTokensPurchased, value);
    }

    private increaseTokenReserved(value: u128): void {
        this.tokensReserved = SafeMath.add(this.tokensReserved, value.toU256());
    }

    private increaseTotalRefundedBTC(value: u256): void {
        this.totalRefundedBTC = SafeMath.add(this.totalRefundedBTC, value);
    }

    private increaseTotalTokensRefunded(value: u256): void {
        this.totalTokensRefunded = SafeMath.add(this.totalTokensRefunded, value);
    }

    private getValidQuote(blockNumber: u64): void {
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
            throw new Revert('Impossible state: Reservation is invalid but went thru executeTrade');
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
            new ActivateProviderEvent(provider.getId(), provider.getLiquidityAmount(), u256.Zero),
        );
    }
}
