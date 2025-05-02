import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    AdvancedStoredString,
    Potential,
    Revert,
    SafeMath,
    u256To30Bytes,
} from '@btc-vision/btc-runtime/runtime';
import { ProviderData } from './ProviderData';
import {
    AMOUNT_POINTER,
    BTC_RECEIVER_ADDRESS_POINTER,
    LIQUIDITY_PROVIDED_POINTER,
    PROVIDER_DATA_POINTER,
} from '../constants/StoredPointers';
import { tokensToSatoshis } from '../utils/SatoshisConversion';
import { STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT } from '../constants/Contract';
import { ProviderTypes } from '../types/ProviderTypes';

export class Provider {
    private readonly providerData: ProviderData;
    private readonly providerBuffer: Uint8Array;
    private fromRemovalQueue: boolean;
    private readonly id: u256;
    private _btcReceiver: Potential<AdvancedStoredString> = null;

    /**
     * @constructor
     * @param {u256} providerId - The provider id.
     */
    constructor(providerId: u256) {
        this.id = providerId;
        this.fromRemovalQueue = false;

        const providerBuffer = u256To30Bytes(providerId);
        this.providerBuffer = providerBuffer;

        this.providerData = new ProviderData(
            PROVIDER_DATA_POINTER,
            LIQUIDITY_PROVIDED_POINTER,
            AMOUNT_POINTER,
            providerBuffer,
        );
    }

    /**
     * @method internalBTCReceiver
     * @description Gets if the btc receiver address. Ensure it is loaded first.
     * @returns {AdvancedStoredString} - the btc receiver address.
     */
    private get internalBTCReceiver(): AdvancedStoredString {
        this.ensureBTCReceiver();

        return this._btcReceiver as AdvancedStoredString;
    }

    /**
     * @method meetsMinimumReservationAmount
     * @description Checks if a given amount of token is greater or equal to the minimum reservation amount in satoshi.
     * @param {u128} tokenAmount - The token amount.
     * @param {u256} currentQuote - The quote to use for the conversion.
     * @returns {boolean} - true if token amount is GE; false if not.
     */
    public static meetsMinimumReservationAmount(tokenAmount: u128, currentQuote: u256): boolean {
        let result: boolean = true;
        const maxCostInSatoshis = tokensToSatoshis(tokenAmount.toU256(), currentQuote);

        if (u256.lt(maxCostInSatoshis, STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)) {
            result = false;
        }

        return result;
    }

    /**
     * @method isInitialLiquidityProvider
     * @description Gets if the provider is an initial liquidity provider.
     * @returns {boolean} - true if an initial liquidity provider; false if not.
     */
    public isInitialLiquidityProvider(): boolean {
        return this.providerData.initialLiquidityProvider;
    }

    /**
     * @method markInitialLiquidityProvider
     * @description Mark the provider as the initial liquidity provider.
     * @returns {void}
     */
    public markInitialLiquidityProvider(): void {
        this.providerData.initialLiquidityProvider = true;
    }

    /**
     * @method clearInitialLiquidityProvider
     * @description Clear the initial liquidity provider.
     * @returns {void}
     */
    public clearInitialLiquidityProvider(): void {
        this.providerData.initialLiquidityProvider = false;
    }

    /**
     * @method getProviderType
     * @description Gets the provider type.
     * @returns {ProviderTypes} - The provider type.
     */
    public getProviderType(): ProviderTypes {
        let providerType: ProviderTypes = ProviderTypes.Normal;

        if (this.isPriority()) {
            providerType = ProviderTypes.Priority;
        } else if (this.isPendingRemoval()) {
            providerType = ProviderTypes.LiquidityRemoval;
        }

        return providerType;
    }

    /**
     * @method isPriority
     * @description Gets the priority state.
     * @returns {boolean} - true if the provider is a priority provider; false if not.
     */
    public isPriority(): boolean {
        return this.providerData.priority;
    }

    /**
     * @method markPriority
     * @description Mark the provider as a priority provider.
     * @returns {void}
     */
    public markPriority(): void {
        this.providerData.priority = true;
    }

    /**
     * @method clearPriority
     * @description Clear the priority state of the provider.
     * @returns {void}
     */
    public clearPriority(): void {
        this.providerData.priority = false;
    }

    /**
     * @method isActive
     * @description Gets the active state.
     * @returns {boolean} - true if the provider is active; false if not.
     */
    public isActive(): boolean {
        return this.providerData.active;
    }

    /**
     * @method activate
     * @description Mark the provider as active.
     * @returns {void}
     */
    public activate(): void {
        this.providerData.active = true;
    }

    /**
     * @method deactivate
     * @description Mark the provider as inactive.
     * @returns {void}
     */
    public deactivate(): void {
        this.providerData.active = false;
    }

    /**
     * @method isLiquidityProvisionAllowed
     * @description Gets if the provider can provide liquidity.
     * @returns {boolean} - true if the provider can provide liquidity; false if not.
     */
    public isLiquidityProvisionAllowed(): boolean {
        return this.providerData.liquidityProvisionAllowed;
    }

    /**
     * @method disallowLiquidityProvision
     * @description Mark the provider as it cannot provide liquidity.
     * @returns {void}
     */
    public disallowLiquidityProvision(): void {
        this.providerData.liquidityProvisionAllowed = false;
    }

    /**
     * @method allowLiquidityProvision
     * @description Mark the provider as it can provide liquidity.
     * @returns {void}
     */
    public allowLiquidityProvision(): void {
        this.providerData.liquidityProvisionAllowed = true;
    }

    /**
     * @method getbtcReceiver
     * @description Gets the btc receiver address.
     * @returns {string} - The btc address.
     */
    public getbtcReceiver(): string {
        return this.internalBTCReceiver.value;
    }

    /**
     * @method setbtcReceiver
     * @description Sts the btc receiver address.
     * @param {string} value - The btc address.
     * @returns {void}.
     */
    public setbtcReceiver(value: string): void {
        this.internalBTCReceiver.value = value;
    }

    /**
     * @method getReservedAmount
     * @description Gets the reserved amount.
     * @returns {u128} - The reserved amount.
     */
    public getReservedAmount(): u128 {
        return this.providerData.reservedAmount;
    }

    /**
     * @method setReservedAmount
     * @description Sets the reserved amount.
     * @param {u128} value - The reserved amount.
     * @returns {void}
     */
    public setReservedAmount(value: u128): void {
        this.providerData.reservedAmount = value;
    }

    /**
     * @method addToReservedAmount
     * @description Add a value to the reserved amount.
     * @param {u128} value - The value to add.
     * @returns {void}
     */
    public addToReservedAmount(value: u128): void {
        this.providerData.reservedAmount = SafeMath.add128(this.providerData.reservedAmount, value);
    }

    /**
     * @method subtractFromReservedAmount
     * @description Subtract a value to the reserved amount.
     * @param {u128} value - The value to subtract.
     * @returns {void}
     */
    public subtractFromReservedAmount(value: u128): void {
        this.providerData.reservedAmount = SafeMath.sub128(this.providerData.reservedAmount, value);
    }

    /**
     * @method canCoverReservedAmount
     * @description Gets if the reserved amount is valid (<= liquidity amount).
     * @returns {boolean} - true if reserved amount is valid; false if not.
     */
    public canCoverReservedAmount(): boolean {
        return u128.lt(this.getLiquidityAmount(), this.getReservedAmount()) ? false : true;
    }

    /**
     * @method hasReservedAmount
     * @description Gets if the reserved amount is not Zero.
     * @returns {boolean} - true if not Zero; false if Zero.
     */
    public hasReservedAmount(): boolean {
        return !this.providerData.reservedAmount.isZero();
    }

    /**
     * @method getLiquidityAmount
     * @description Gets the liquidity amount.
     * @returns {u128} - The liquidity amount.
     */
    public getLiquidityAmount(): u128 {
        return this.providerData.liquidityAmount;
    }

    /**
     * @method setLiquidityAmount
     * @description Sets the liquidity amount.
     * @param {u128} value - The liquidity amount.
     * @returns {void}
     */
    public setLiquidityAmount(value: u128): void {
        this.providerData.liquidityAmount = value;
    }

    /**
     * @method hasLiquidityAmount
     * @description Gets if the liquidityAmount amount is not Zero.
     * @returns {boolean} - true if not Zero; false if Zero.
     */
    public hasLiquidityAmount(): boolean {
        return !this.providerData.liquidityAmount.isZero();
    }

    /**
     * @method subtractFromLiquidityAmount
     * @description Subtract a value to the liquidity amount.
     * @param {u128} value - The value to subtract.
     * @returns {void}
     */
    public subtractFromLiquidityAmount(value: u128): void {
        this.providerData.liquidityAmount = SafeMath.sub128(
            this.providerData.liquidityAmount,
            value,
        );
    }

    /**
     * @method getAvailableLiquidityAmount
     * @description Gets the available liquidity amount.
     * @returns {u128} The available liquidity.
     */
    public getAvailableLiquidityAmount(): u128 {
        if (!this.canCoverReservedAmount()) {
            throw new Revert(
                `Impossible state: liquidity < reserved for provider ${this.getId()}.`,
            );
        }

        return SafeMath.sub128(this.getLiquidityAmount(), this.getReservedAmount());
    }

    /**
     * @method getLiquidityProvided
     * @description Gets the liquidity provided.
     * @returns {u256} - The liquidity provided.
     */
    public getLiquidityProvided(): u256 {
        return this.providerData.liquidityProvided;
    }

    /**
     * @method setLiquidityProvided
     * @description Sets the liquidity provided.
     * @param {u256} value - The liquidity provided.
     * @returns {void}
     */
    public setLiquidityProvided(value: u256): void {
        this.providerData.liquidityProvided = value;
    }

    /**
     * @method addToLiquidityProvided
     * @description Add a value to the liquidity amount.
     * @param {u256} value - The value to add.
     * @returns {void}
     */
    public addToLiquidityProvided(value: u256): void {
        this.providerData.liquidityProvided = SafeMath.add(
            this.providerData.liquidityProvided,
            value,
        );
    }

    /**
     * @method isLiquidityProvider
     * @description Gets if the provider is a liquidity provider.
     * @returns {boolean} - true if a liquidity provider; false if not.
     */
    public isLiquidityProvider(): boolean {
        return this.providerData.liquidityProvider;
    }

    /**
     * @method markLiquidityProvider
     * @description Mark a provider as a liquidity provider.
     * @returns {void}
     */
    public markLiquidityProvider(): void {
        this.providerData.liquidityProvider = true;
    }

    /**
     * @method ClearLiquidityProvider
     * @description Clear the liquidity provider state of a provider.
     * @returns {void}
     */
    public clearLiquidityProvider(): void {
        this.providerData.liquidityProvider = false;
    }

    /**
     * @method isPendingRemoval
     * @description Gets if a provider is a pending removal.
     * @returns {boolean} - true if pending removal; false if not.
     */
    public isPendingRemoval(): boolean {
        return this.providerData.pendingRemoval;
    }

    /**
     * @method markPendingRemoval
     * @description Mark a provider as pending removal.
     * @returns {void}
     */
    public markPendingRemoval(): void {
        this.providerData.pendingRemoval = true;
    }

    /**
     * @method clearPendingRemoval
     * @description Clear the pending removal state of a provider.
     * @returns {void}
     */
    public clearPendingRemoval(): void {
        this.providerData.pendingRemoval = false;
    }

    /**
     * @method getQueueIndex
     * @description Gets the provider index in the normal/priority provider queue.
     * @returns {u64} - The provider index in the normal/priority provider queue.
     */
    public getQueueIndex(): u64 {
        return this.providerData.queueIndex;
    }

    /**
     * @method setQueueIndex
     * @description Sets the provider index in the normal/priority provider queue.
     * @param {u64} value - The provider index in the normal/priority provider queue.
     * @returns {void}
     */
    public setQueueIndex(value: u64): void {
        this.providerData.queueIndex = value;
    }

    /**
     * @method getRemovalQueueIndex
     * @description Gets the provider index in the removal provider queue.
     * @returns {u64} - The provider index in the removal provider queue.
     */
    public getRemovalQueueIndex(): u64 {
        return this.providerData.removalQueueIndex;
    }

    /**
     * @method setRemovalQueueIndex
     * @description Sets the provider index in the removal provider queue.
     * @param {u64} value - The provider index in the removal provider queue.
     * @returns {void}
     */
    public setRemovalQueueIndex(value: u64): void {
        this.providerData.removalQueueIndex = value;
    }

    /**
     * @method getId
     * @description Gets the provider id.
     * @returns {u256} - The provider id.
     */
    public getId(): u256 {
        return this.id;
    }

    /**
     * @method isFromRemovalQueue
     * @description Gets if a provider is from the removal queue.
     * @returns {boolean} - true if from the removal queue; false if not.
     */
    public isFromRemovalQueue(): boolean {
        return this.fromRemovalQueue;
    }

    /**
     * @method markFromRemovalQueue
     * @description Marks a provider is from the removal queue.
     * @returns {void}
     */
    public markFromRemovalQueue(): void {
        this.fromRemovalQueue = true;
    }

    /**
     * @method clearFromRemovalQueue
     * @description Unmarks a provider is from the removal queue.
     * @returns {void}
     */
    public clearFromRemovalQueue(): void {
        this.fromRemovalQueue = false;
    }

    /**
     * @method resetAll
     * @description Reset all provider fields.
     * @returns {void}
     */
    public resetAll(): void {
        this.providerData.resetAll();
    }

    /**
     * @method resetLiquidityProviderValues
     * @description Reset all fields related to the liquidity providing.
     * @returns {void}
     */
    public resetLiquidityProviderValues(): void {
        this.providerData.resetLiquidityProviderValues();
    }

    /**
     * @method resetListingValues
     * @description Reset all fields related to the listing.
     * @returns {void}
     */
    public resetListingValues(): void {
        this.providerData.resetListingValues();
    }

    /**
     * @method save
     * @description Save the provider information.
     * @returns {void}
     */
    public save(): void {
        this.providerData.save();
    }

    /**
     * @method ensureBTCReceiver
     * @description Make sure the btc receiver is loaded from storage.
     * @returns {void}
     */
    private ensureBTCReceiver(): void {
        if (this._btcReceiver === null) {
            const loader = new AdvancedStoredString(
                BTC_RECEIVER_ADDRESS_POINTER,
                this.providerBuffer,
            );
            this._btcReceiver = loader;
        }
    }
}

const cache: Array<Provider> = new Array<Provider>();

function findProvider(id: u256): Provider | null {
    for (let i: i32 = 0; i < cache.length; i++) {
        if (u256.eq(cache[i].getId(), id)) {
            return cache[i];
        }
    }

    return null;
}

export function saveAllProviders(): void {
    for (let i: i32 = 0; i < cache.length; i++) {
        cache[i].save();
    }
}

export function clearCachedProviders(): void {
    cache.length = 0;
}

export function getProviderCacheLength(): number {
    return cache.length;
}

export function getProvider(providerId: u256): Provider {
    let provider = findProvider(providerId);

    if (provider === null) {
        provider = new Provider(providerId);

        cache.push(provider);
    }

    return provider;
}
