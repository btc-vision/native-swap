import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    Potential,
    Revert,
    StoredU256Array,
} from '@btc-vision/btc-runtime/runtime';
import { addAmountToStakingContract, getProvider, Provider } from '../models/Provider';
import { INDEX_NOT_SET_VALUE, MAXIMUM_VALID_INDEX } from '../constants/Contract';
import { ProviderTypes } from '../types/ProviderTypes';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { ProviderFulfilledEvent } from '../events/ProviderFulfilledEvent';

export class ProviderQueue {
    protected readonly token: Address;
    protected readonly queue: StoredU256Array;
    protected readonly enableIndexVerification: boolean;
    protected readonly maximumNumberOfProvider: u32;
    protected readonly liquidityQueueReserve: ILiquidityQueueReserve;

    constructor(
        token: Address,
        pointer: u16,
        subPointer: Uint8Array,
        enableIndexVerification: boolean,
        maximumNumberOfProvider: u32,
        liquidityQueueReserve: ILiquidityQueueReserve,
    ) {
        this.queue = new StoredU256Array(pointer, subPointer, MAXIMUM_VALID_INDEX);
        this.token = token;
        this.enableIndexVerification = enableIndexVerification;
        this.maximumNumberOfProvider = maximumNumberOfProvider;
        this.liquidityQueueReserve = liquidityQueueReserve;
    }

    protected _currentIndex: u32 = 0;

    public get currentIndex(): u32 {
        return this._currentIndex;
    }

    public get length(): u32 {
        return this.queue.getLength();
    }

    public get startingIndex(): u32 {
        return this.queue.startingIndex();
    }

    public add(provider: Provider): u32 {
        this.ensureMaximumProviderCountNotReached(ProviderTypes.Normal);

        const index: u32 = this.queue.push(provider.getId(), true);
        provider.setQueueIndex(index);

        return index;
    }

    public cleanUp(previousStartingIndex: u32, currentQuote: u256): u32 {
        const length: u32 = this.length;
        let index: u32 = previousStartingIndex;

        while (index < length) {
            const providerId: u256 = this.queue.get_physical(index);

            if (!providerId.isZero()) {
                const provider: Provider = getProvider(providerId);
                const meetMinLiquidity = Provider.meetsMinimumReservationAmount(
                    provider.getAvailableLiquidityAmount(),
                    currentQuote,
                );

                if (!meetMinLiquidity) {
                    if (provider.hasReservedAmount() || provider.isPurged()) {
                        // TODO: IMPORTANT! IF THE USER COMPLETE HIS SWAP WITH THE RESERVED TOKENS AND THE PROVIDER
                        //  HAS DUST LEFT, HE SHOULD BE RESET AND THE DURST BURNED!
                        /*const worthSat = tokensToSatoshis128(
                            provider.getAvailableLiquidityAmount(),
                            currentQuote,
                        );

                        Blockchain.log(
                            `----- Provider at index ${index} does not meet minimum reservation. Skipping from queue. (${provider.getAvailableLiquidityAmount()} tokens left, worth ${worthSat} sat, quote: ${currentQuote}). Will get restored eventually from the purge queue. -----`,
                        );*/
                    } else {
                        /*Blockchain.log(
                            `!---! Resetting provider at index ${index}. Minimum liquidity not met. !---!`,
                        );*/

                        // This provider must be purged safely.
                        this.resetProvider(provider);
                    }
                } else {
                    if (provider.isActive()) {
                        this.queue.setStartingIndex(index);
                        break;
                    } else {
                        throw new Revert(
                            `Impossible state: Provider is no longer active and should have been removed from normal/priority queue. ProviderId: ${providerId}`,
                        );
                    }
                }
            } else {
                this.queue.setStartingIndex(index);
            }

            index++;
        }

        return index === 0 ? index : index - 1;
    }

    public getAt(index: u32): u256 {
        return this.queue.get_physical(index);
    }

    public getNextWithLiquidity(currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;

        this.ensureStartingIndexIsValid();
        this.initializeCurrentIndex();

        const length: u32 = this.length;

        while (this._currentIndex < length && result === null) {
            const candidate: Provider | null = this.tryNextCandidate(currentQuote);
            if (candidate !== null) {
                result = candidate;
            }

            this._currentIndex++;
        }

        return result;
    }

    public getQueue(): StoredU256Array {
        return this.queue;
    }

    public remove(provider: Provider): void {
        this.queue.delete_physical(provider.getQueueIndex());
        provider.setQueueIndex(INDEX_NOT_SET_VALUE);
    }

    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        if (burnRemainingFunds && canceled) {
            throw new Revert(
                'Invalid parameters: Cannot burn remaining funds when canceling a listing.',
            );
        }

        let liquidityToBurn: u256 = u256.Zero;
        this.ensureProviderNotAlreadyPurged(provider);

        // ENTRY-PRICE TRACKING: Get the BTC contribution before modifications
        const btcContribution = provider.getVirtualBTCContribution();
        const hasContribution = btcContribution > 0;

        if (burnRemainingFunds && provider.hasLiquidityAmount()) {
            liquidityToBurn = provider.getLiquidityAmount().toU256();

            // Remove from total reserve (accounting only)
            this.liquidityQueueReserve.subFromTotalReserve(liquidityToBurn);
            this.liquidityQueueReserve.subFromVirtualTokenReserve(liquidityToBurn);

            addAmountToStakingContract(liquidityToBurn);

            // We don't adjust BTC here because the burned tokens were not traded for any BTC.
        }

        // ENTRY-PRICE TRACKING: Remove the entry-price BTC contribution
        // This represents the baseline liquidity depth this provider contributed
        if (hasContribution) {
            // CRITICAL FIX: Only remove BTC contribution if it's a cancellation
            // For normal trades, the BTC contribution should NOT be removed from reserves
            if (canceled) {
                // We're canceling a listing, so reverse the virtual BTC adjustment
                if (this.liquidityQueueReserve.virtualSatoshisReserve >= btcContribution) {
                    this.liquidityQueueReserve.subFromVirtualSatoshisReserve(btcContribution);
                }
            }

            // Always clear the tracking value regardless of canceled status
            provider.setVirtualBTCContribution(0);
        }

        if (!provider.isInitialLiquidityProvider()) {
            this.queue.delete_physical(provider.getQueueIndex());
        }

        provider.resetListingProviderValues();

        Blockchain.emit(
            new ProviderFulfilledEvent(provider.getId(), canceled, false, liquidityToBurn),
        );
    }

    public restoreCurrentIndex(index: u32): void {
        this._currentIndex = index;
    }

    public save(): void {
        this.queue.save();
    }

    protected ensureMaximumProviderCountNotReached(queueType: ProviderTypes): void {
        if (this.queue.getLength() === this.maximumNumberOfProvider) {
            throw new Revert(
                `Impossible state: Maximum number of providers reached for ${queueType} queue.`,
            );
        }
    }

    protected ensureProviderNotAlreadyPurged(provider: Provider): void {
        if (provider.isPurged()) {
            throw new Revert(
                `Impossible state: Provider has already been purged. ProviderId: ${provider.getId()}`,
            );
        }
    }

    protected ensureProviderLiquidityIsValid(provider: Provider): void {
        if (u128.lt(provider.getLiquidityAmount(), provider.getReservedAmount())) {
            throw new Revert(
                `Impossible state: Provider liquidity < reserved. ProviderId: ${provider.getId()}.`,
            );
        }
    }

    protected ensureProviderIsNotInPurgeQueue(provider: Provider): void {
        if (provider.isPurged()) {
            throw new Revert(
                `Impossible state: Provider is in purge queue but purge queue is empty. ProviderId: ${provider.getId()} (indexed at ${provider.getQueueIndex()}, purgedAt: ${provider.getPurgedIndex()}).`,
            );
        }
    }

    protected ensureStartingIndexIsValid(): void {
        if (this.startingIndex > this.length) {
            throw new Revert('Impossible state: Starting index exceeds queue length.');
        }
    }

    protected initializeCurrentIndex(): void {
        if (this._currentIndex === 0) {
            this._currentIndex = this.startingIndex;
        }
    }

    protected isEligible(provider: Provider): boolean {
        const isActive: boolean = provider.isActive();

        if (isActive) {
            this.ensureProviderIsNotPriority(provider);
            this.ensureProviderLiquidityIsValid(provider);
        }

        return isActive;
    }

    protected tryNextCandidate(currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const providerId: u256 = this.queue.get_physical(this._currentIndex);

        if (!providerId.isZero()) {
            const provider: Provider = getProvider(providerId);

            if (this.isEligible(provider)) {
                result = this.returnProvider(provider, this._currentIndex, currentQuote);
            }
        }

        return result;
    }

    private ensureProviderIsNotInitialProvider(provider: Provider): void {
        if (provider.isInitialLiquidityProvider()) {
            throw new Revert(
                'Impossible state: Initial liquidity provider cannot be returned from any provider queue.',
            );
        }
    }

    private ensureProviderIsNotPriority(provider: Provider): void {
        if (provider.isPriority()) {
            throw new Revert(
                `Impossible state: Priority provider cannot be in normal queue. ProviderId: ${provider.getId()}.`,
            );
        }
    }

    private ensureQueueIndexMatchIndex(provider: Provider, index: u32): void {
        if (provider.getQueueIndex() !== index) {
            throw new Revert(
                `Impossible state: Provider queue index (${provider.getQueueIndex()}) does not match index (${index}). ProviderId: ${provider.getId()}`,
            );
        }
    }

    private performIndexVerification(provider: Provider, index: u32): void {
        this.ensureQueueIndexMatchIndex(provider, index);
        this.ensureProviderIsNotInitialProvider(provider);
    }

    // TODO: Possible optimization. we could verify to check if we want to skip an index but this adds complexity, but it could save gas.
    private returnProvider(provider: Provider, index: u32, currentQuote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const availableLiquidity: u128 = provider.getAvailableLiquidityAmount();

        if (availableLiquidity.isZero()) {
            return null;
        }

        if (this.enableIndexVerification) {
            this.performIndexVerification(provider, index);
        }

        if (Provider.meetsMinimumReservationAmount(availableLiquidity, currentQuote)) {
            this.ensureProviderIsNotInPurgeQueue(provider);
            result = provider;
        } else if (!provider.hasReservedAmount()) {
            this.resetProvider(provider);
        }

        return result;
    }
}
