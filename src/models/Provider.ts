import { u256 } from '@btc-vision/as-bignum/assembly';
import { Potential, SafeMath, u256To30Bytes } from '@btc-vision/btc-runtime/runtime';
import { AdvancedStoredString } from '../storage/AdvancedStoredString';
import { ProviderData } from './ProviderData';
import {
    BTC_RECEIVER_ADDRESS_POINTER,
    LIQUIDITY_AMOUNT_POINTER,
    LIQUIDITY_PROVIDED_POINTER,
    PROVIDER_DATA_POINTER,
    RESERVED_AMOUNT_POINTER,
} from '../constants/StoredPointers';

export class Provider {
    private readonly providerData: ProviderData;
    private readonly providerBuffer: Uint8Array;
    private fromRemovalQueue: boolean;
    private readonly id: u256;
    private _btcReceiver: Potential<AdvancedStoredString> = null;

    constructor(providerId: u256) {
        this.id = providerId;
        this.fromRemovalQueue = false;

        // discard 2 bytes. ??? WHY!!!!
        const providerBuffer = u256To30Bytes(providerId);
        this.providerBuffer = providerBuffer;

        this.providerData = new ProviderData(
            PROVIDER_DATA_POINTER,
            LIQUIDITY_PROVIDED_POINTER,
            LIQUIDITY_AMOUNT_POINTER,
            RESERVED_AMOUNT_POINTER,
            providerBuffer,
        );
    }

    private get internalBTCReceiver(): AdvancedStoredString {
        this.ensureBTCReceiver();

        return this._btcReceiver as AdvancedStoredString;
    }

    public isPriority(): boolean {
        return this.providerData.priority;
    }

    public setPriority(): void {
        this.providerData.priority = true;
    }

    public removePriority(): void {
        this.providerData.priority = false;
    }

    public isActive(): boolean {
        return this.providerData.active;
    }

    public activate(): void {
        this.providerData.active = true;
    }

    public deactivate(): void {
        this.providerData.active = false;
    }

    public disallowLiquidityProvision(): void {
        this.providerData.liquidityProvisionAllowed = false;
    }

    public allowLiquidityProvision(): void {
        this.providerData.liquidityProvisionAllowed = true;
    }

    public isLiquidityProvisionAllowed(): boolean {
        return this.providerData.liquidityProvisionAllowed;
    }

    public getbtcReceiver(): string {
        return this.internalBTCReceiver.value;
    }

    public setbtcReceiver(value: string): void {
        this.internalBTCReceiver.value = value;
    }

    public getReservedAmount(): u256 {
        return this.providerData.reservedAmount;
    }

    public setReservedAmount(value: u256): void {
        this.providerData.reservedAmount = value;
    }

    public addToReservedAmount(value: u256): void {
        this.providerData.reservedAmount = SafeMath.add(this.providerData.reservedAmount, value);
    }

    public substractFromReservedAmount(value: u256): void {
        this.providerData.reservedAmount = SafeMath.sub(this.providerData.reservedAmount, value);
    }

    public hasReservedAmount(): boolean {
        return !this.providerData.reservedAmount.isZero();
    }

    public getLiquidityAmount(): u256 {
        return this.providerData.liquidityAmount;
    }

    public setLiquidityAmount(value: u256): void {
        this.providerData.liquidityAmount = value;
    }

    public hasLiquidityAmount(): boolean {
        return !this.providerData.liquidityAmount.isZero();
    }

    public substractFromLiquidityAmount(value: u256): void {
        this.providerData.liquidityAmount = SafeMath.sub(this.providerData.liquidityAmount, value);
    }

    public getLiquidityProvided(): u256 {
        return this.providerData.liquidityProvided;
    }

    public setLiquidityProvided(value: u256): void {
        this.providerData.liquidityProvided = value;
    }

    public addToLiquidityProvided(value: u256): void {
        this.providerData.liquidityProvided = SafeMath.add(
            this.providerData.liquidityProvided,
            value,
        );
    }

    public isLiquidityProvider(): boolean {
        return this.providerData.liquidityProvider;
    }

    public enableLiquidityProvider(): void {
        this.providerData.liquidityProvider = true;
    }

    public disableLiquidityProvider(): void {
        this.providerData.liquidityProvider = false;
    }

    public markPendingRemoval(): void {
        this.providerData.pendingRemoval = true;
    }

    public clearPendingRemoval(): void {
        this.providerData.pendingRemoval = false;
    }

    public isPendingRemoval(): boolean {
        return this.providerData.pendingRemoval;
    }

    public getQueueIndex(): u64 {
        return this.providerData.queueIndex;
    }

    public setQueueIndex(value: u64): void {
        this.providerData.queueIndex = value;
    }

    public getId(): u256 {
        return this.id;
    }

    public isFromRemovalQueue(): boolean {
        return this.fromRemovalQueue;
    }

    public markFromRemovalQueue(): void {
        this.fromRemovalQueue = true;
    }

    public clearFromRemovalQueue(): void {
        this.fromRemovalQueue = false;
    }

    public resetAll(): void {
        this.providerData.resetAll();
    }

    public resetLiquidityProviderValues(): void {
        this.providerData.resetLiquidityProviderValues();
    }

    public resetListingValues(): void {
        this.providerData.resetListingValues();
    }

    public save(): void {
        this.providerData.save();
    }

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
