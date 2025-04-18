import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Potential, SafeMath, StoredU64, u256To30Bytes } from '@btc-vision/btc-runtime/runtime';
import { AdvancedStoredString } from '../stored/AdvancedStoredString';
import { UserLiquidity } from '../data-types/UserLiquidity';
import {
    INDEXED_PROVIDER_POINTER,
    LIQUIDITY_PROVIDER_POINTER,
    PROVIDER_ADDRESS_POINTER,
    PROVIDER_LIQUIDITY_POINTER,
} from './StoredPointers';

export class Provider {
    public providerId: u256;
    public fromRemovalQueue: bool = false;

    private readonly userLiquidity: UserLiquidity;
    private readonly providerBuffer: Uint8Array;

    constructor(providerId: u256) {
        this.providerId = providerId;

        // discard 2 bytes.
        const providerBuffer = u256To30Bytes(providerId);
        this.providerBuffer = providerBuffer;

        this.userLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerBuffer,
        );
    }

    public _indexedAt: u64 = 0;

    public get indexedAt(): u64 {
        return this._indexedAt;
    }

    public set indexedAt(value: u64) {
        this._indexedAt = value;
    }

    public get pendingRemoval(): boolean {
        return this.userLiquidity.pendingRemoval;
    }

    public set pendingRemoval(value: boolean) {
        this.userLiquidity.pendingRemoval = value;
    }

    public get isLp(): boolean {
        return this.userLiquidity.isLp();
    }

    public set isLp(value: boolean) {
        this.userLiquidity.setIsLp(value);
    }

    public get liquidityProvided(): u256 {
        return this.userLiquidity.getLiquidityProvided();
    }

    public set liquidityProvided(value: u256) {
        this.userLiquidity.setLiquidityProvided(value);
    }

    public get liquidity(): u128 {
        return this.userLiquidity.getLiquidityAmount();
    }

    public set liquidity(value: u128) {
        this.userLiquidity.setLiquidityAmount(value);
    }

    public get reserved(): u128 {
        return this.userLiquidity.getReservedAmount();
    }

    public set reserved(value: u128) {
        this.userLiquidity.setReservedAmount(value);
    }

    private _btcReceiver: Potential<AdvancedStoredString> = null;

    public get btcReceiver(): string {
        return this.loaderReceiver.value;
    }

    public set btcReceiver(value: string) {
        this.loaderReceiver.value = value;
    }

    private get loaderReceiver(): AdvancedStoredString {
        if (this._btcReceiver === null) {
            const loader = new AdvancedStoredString(PROVIDER_ADDRESS_POINTER, this.providerBuffer);
            this._btcReceiver = loader;

            return loader;
        }

        return this._btcReceiver as AdvancedStoredString;
    }

    public loadIndexedAt(): void {
        const store = new StoredU64(INDEXED_PROVIDER_POINTER, this.providerBuffer);
        this._indexedAt = store.get(0);
    }

    public increaseLiquidityProvided(amount: u256): void {
        this.liquidityProvided = SafeMath.add(this.liquidityProvided, amount);
    }

    public decreaseLiquidity(amount: u128): void {
        this.liquidity = SafeMath.sub128(this.liquidity, amount);
    }

    public increaseReserved(amount: u128): void {
        this.reserved = SafeMath.add128(this.reserved, amount);
    }

    public decreaseReserved(amount: u128): void {
        this.reserved = SafeMath.sub128(this.reserved, amount);
    }

    public enableLiquidityProvision(): void {
        this.userLiquidity.setCanProvideLiquidity(true);
    }

    public canProvideLiquidity(): boolean {
        return this.userLiquidity.canProvideLiquidity();
    }

    public haveLiquidity(): boolean {
        return !this.liquidity.isZero();
    }

    public haveReserved(): boolean {
        return !this.reserved.isZero();
    }

    public isActive(): bool {
        return this.userLiquidity.getActiveFlag() === 1;
    }

    public setActive(value: bool, priority: bool): void {
        this.userLiquidity.setActiveFlag(value ? 1 : 0);
        this.userLiquidity.setPriorityFlag(priority ? 1 : 0);
    }

    public isPriority(): boolean {
        return this.userLiquidity.getPriorityFlag();
    }

    public resetAll(): void {
        this.userLiquidity.resetAll();
    }

    public resetLPValues(): void {
        this.userLiquidity.resetLPValues();
    }

    public resetListingValues(): void {
        this.userLiquidity.resetListingValues();
    }

    public save(): void {
        this.userLiquidity.save();
    }
}

const cache: Array<Provider> = new Array<Provider>();

function findProvider(id: u256): Provider | null {
    for (let i: i32 = 0; i < cache.length; i++) {
        if (u256.eq(cache[i].providerId, id)) {
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

/**
 * @function getProvider
 * @description Retrieves a Provider using the u256 key. Creates and caches a new Provider if not found.
 * @param {u256} providerId - The provider's u256 identifier.
 * @returns {Provider} - The retrieved or newly created Provider.
 */
export function getProvider(providerId: u256): Provider {
    let provider = findProvider(providerId);

    if (provider === null) {
        provider = new Provider(providerId);

        cache.push(provider);
    }

    return provider;
}
