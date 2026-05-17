import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    AdvancedStoredString,
    Blockchain,
    Potential,
    Revert,
    SafeMath,
    TransferHelper,
    u256To30Bytes,
} from '@btc-vision/btc-runtime/runtime';
import { ProviderData } from './ProviderData';
import { BTC_RECEIVER_ADDRESS_POINTER, PROVIDER_DATA_POINTER } from '../constants/StoredPointers';
import { TickMath } from '../utils/TickMath';
import { STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT } from '../constants/Contract';

/**
 * A liquidity provider. Owns one listing in `FIFO[priceTick]`.
 *
 * Identity is the `providerId: u256` (typically derived off-chain from `(token, sender)`).
 * The provider is keyed in storage by `u256To30Bytes(providerId)` and lazy-loads its state
 * from `ProviderData`.
 *
 * Lifecycle (high level):
 *   1. Listed   — `active = true`, present in `FIFO[priceTick]` at index `tickFifoIndex`.
 *   2. Reserved — buyer reservations land in `reservedAmount` and bump `latestReservedUntilBlock`.
 *   3. Purged   — when a reservation against this provider expires unswapped, the provider
 *                 is pushed to `purged[priceTick]` (fast-path re-allocation) with `purged = true`.
 *   4. Fulfilled — when remaining liquidity drops below dust, marked `toReset = true` and
 *                 enqueued onto the global fulfilled queue. Lazy-cleared by
 *                 `resetFulfilledProviders(count)`.
 */
export class Provider {
    private readonly providerData: ProviderData;
    private readonly providerBuffer: Uint8Array;
    private readonly id: u256;
    private _btcReceiver: Potential<AdvancedStoredString> = null;

    /**
     * @constructor
     * @param {u256} providerId - The provider id (encoding sender + token off-chain).
     */
    constructor(providerId: u256) {
        this.id = providerId;

        const providerBuffer: Uint8Array = u256To30Bytes(providerId);
        this.providerBuffer = providerBuffer;

        this.providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
    }

    /**
     * @method internalBTCReceiver
     * @description Lazy accessor for the BTC receiver string (CSV P2WSH address).
     * @returns {AdvancedStoredString} - the storage-backed string.
     */
    private get internalBTCReceiver(): AdvancedStoredString {
        this.ensureBTCReceiver();
        return this._btcReceiver as AdvancedStoredString;
    }

    // ========================================================================
    // Minimum-value gate (NON-NEGOTIABLE)
    // ========================================================================

    /**
     * @method meetsMinimumReservationAmountAtTick
     * @description Returns true iff a hypothetical reservation of `tokenAmount` base units
     * priced at `tick` is worth at least `STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT`
     * (= 1,000 sats) — the per-provider reservation floor. Below this, the reserve walk breaks.
     *
     * @param {u128} tokenAmount - Token base units the buyer wants to reserve from a provider at this tick.
     * @param {i32}  tick        - The provider's tick.
     * @returns {boolean} true if `(tokenAmount * tickToPrice(tick)) >> 88 >= 1_000`.
     */
    public static meetsMinimumReservationAmountAtTick(tokenAmount: u128, tick: i32): boolean {
        if (tokenAmount.isZero()) return false;
        const fillPrice: u128 = TickMath.tickToPrice(tick);
        const sats: u64 = TickMath.tokensToSatoshis(tokenAmount, fillPrice);
        return sats >= STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT;
    }

    // ========================================================================
    // Active / lifecycle flags
    // ========================================================================

    /**
     * @method isActive
     * @description Whether this provider has an active listing in some `FIFO[priceTick]`.
     */
    public isActive(): boolean {
        return this.providerData.active;
    }

    /** Mark the provider as actively listed. */
    public activate(): void {
        this.providerData.active = true;
    }

    /** Mark the provider as inactive (e.g., after withdraw). */
    public deactivate(): void {
        this.providerData.active = false;
    }

    /**
     * @method toReset
     * @description Whether the provider sits in the global fulfilled queue waiting to be
     * fully purged from storage by `resetFulfilledProviders(count)`.
     */
    public toReset(): boolean {
        return this.providerData.toReset;
    }

    /** Enqueue this provider for the global fulfilled queue (dust cleanup path). */
    public markToReset(): void {
        this.providerData.toReset = true;
    }

    /** Clear the toReset flag (after the lazy reset path completes). */
    public clearToReset(): void {
        this.providerData.toReset = false;
    }

    /**
     * @method isPurged
     * @description Whether the provider is currently sitting in `purged[priceTick]`
     * (fast-path re-allocation queue after a reservation against them expired).
     */
    public isPurged(): boolean {
        return this.providerData.purged;
    }

    /** Mark the provider as residing in the per-tick purged sub-queue. */
    public markPurged(): void {
        this.providerData.purged = true;
    }

    /** Clear the purged flag (when removed from the purged sub-queue). */
    public clearPurged(): void {
        this.providerData.purged = false;
    }

    // ========================================================================
    // Tick & queue position
    // ========================================================================

    /** @returns {i32} The tick this provider listed at. */
    public getPriceTick(): i32 {
        return this.providerData.priceTick;
    }
    public setPriceTick(value: i32): void {
        this.providerData.priceTick = value;
    }

    /** @returns {u32} Position inside `FIFO[priceTick]`. */
    public getTickFifoIndex(): u32 {
        return this.providerData.tickFifoIndex;
    }
    public setTickFifoIndex(value: u32): void {
        this.providerData.tickFifoIndex = value;
    }

    /** Compatibility alias for `tickFifoIndex` (legacy call sites use `queueIndex`). */
    public getQueueIndex(): u32 {
        return this.providerData.queueIndex;
    }
    public setQueueIndex(value: u32): void {
        this.providerData.queueIndex = value;
    }

    /** @returns {u32} Position inside `purged[priceTick]`, or INDEX_NOT_SET_VALUE if not purged. */
    public getPurgedIndex(): u32 {
        return this.providerData.purgedIndex;
    }
    public setPurgedIndex(value: u32): void {
        this.providerData.purgedIndex = value;
    }

    // ========================================================================
    // Freeze invariant: latestReservedUntilBlock
    // ========================================================================

    /**
     * @method getLatestReservedUntilBlock
     * @description Max expiration block across every reservation that has ever been
     * written against this provider. Updated monotonically by `bumpLatestReservedUntilBlock`.
     * Used as the safe "unlock block" for `withdrawListing` / `updateListing`:
     *   - frozen iff `Blockchain.block.number <= latestReservedUntilBlock`
     *   - unfrozen iff `Blockchain.block.number > latestReservedUntilBlock`
     */
    public getLatestReservedUntilBlock(): u64 {
        return this.providerData.latestReservedUntilBlock;
    }

    /**
     * @method bumpLatestReservedUntilBlock
     * @description Monotonic non-decreasing update. Called from `applyReservation` in the
     * reserve walk with `reservation.expirationBlock`. Only assigns if the new value
     * exceeds the current bound — once set, it only ever grows.
     *
     * @param {u64} value - Candidate new bound (typically `reservation.expirationBlock`).
     */
    public bumpLatestReservedUntilBlock(value: u64): void {
        if (value > this.providerData.latestReservedUntilBlock) {
            this.providerData.latestReservedUntilBlock = value;
        }
    }

    /**
     * @method isListingFrozen
     * @description True iff the listing is within its freeze window. Cancel/update guards
     * use this. Also see `WithdrawListingOperation` for the withdraw-mode bypass.
     */
    public isListingFrozen(): boolean {
        return Blockchain.block.number <= this.providerData.latestReservedUntilBlock;
    }

    // ========================================================================
    // Block of first listing (informational, used in events)
    // ========================================================================

    public getListedTokenAtBlock(): u64 {
        return this.providerData.listedTokenAtBlock;
    }
    public setListedTokenAtBlock(value: u64): void {
        this.providerData.listedTokenAtBlock = value;
    }

    // ========================================================================
    // Token amounts (base units, u128)
    // ========================================================================

    /** @returns {u128} Tokens currently locked by active reservations against this provider. */
    public getReservedAmount(): u128 {
        return this.providerData.reservedAmount;
    }
    public setReservedAmount(value: u128): void {
        this.providerData.reservedAmount = value;
    }

    public addToReservedAmount(value: u128): void {
        this.providerData.reservedAmount = SafeMath.add128(this.providerData.reservedAmount, value);
    }

    public subtractFromReservedAmount(value: u128): void {
        this.providerData.reservedAmount = SafeMath.sub128(this.providerData.reservedAmount, value);
    }

    public canCoverReservedAmount(): boolean {
        return !u128.lt(this.getLiquidityAmount(), this.getReservedAmount());
    }

    public hasReservedAmount(): boolean {
        return !this.providerData.reservedAmount.isZero();
    }

    /** @returns {u128} Total tokens this provider has listed (reserved + available). */
    public getLiquidityAmount(): u128 {
        return this.providerData.liquidityAmount;
    }
    public setLiquidityAmount(value: u128): void {
        this.providerData.liquidityAmount = value;
    }

    public addToLiquidityAmount(value: u128): void {
        this.providerData.liquidityAmount = SafeMath.add128(
            this.providerData.liquidityAmount,
            value,
        );
    }

    public hasLiquidityAmount(): boolean {
        return !this.providerData.liquidityAmount.isZero();
    }

    public subtractFromLiquidityAmount(value: u128): void {
        this.providerData.liquidityAmount = SafeMath.sub128(
            this.providerData.liquidityAmount,
            value,
        );
    }

    /**
     * @method getAvailableLiquidityAmount
     * @description liquidity - reserved. Reverts if the invariant `liquidity >= reserved` is broken
     * (impossible state — would indicate a bug in reservation accounting).
     */
    public getAvailableLiquidityAmount(): u128 {
        if (!this.canCoverReservedAmount()) {
            throw new Revert(
                `Impossible state: liquidity < reserved for provider ${this.getId()}.`,
            );
        }
        return SafeMath.sub128(this.getLiquidityAmount(), this.getReservedAmount());
    }

    // ========================================================================
    // BTC receiver (CSV P2WSH)
    // ========================================================================

    /** @returns {string} The provider's CSV P2WSH receiver address (where buyers send sats). */
    public getBtcReceiver(): string {
        return this.internalBTCReceiver.value;
    }
    public setBtcReceiver(value: string): void {
        this.internalBTCReceiver.value = value;
    }

    // ========================================================================
    // Identity
    // ========================================================================

    public getId(): u256 {
        return this.id;
    }

    // ========================================================================
    // Lifecycle
    // ========================================================================

    /** Reset everything. Currently equivalent to `resetListingProviderValues`. */
    public resetAll(): void {
        this.providerData.resetAll();
    }

    /**
     * @method resetListingProviderValues
     * @description Wipe all listing state. Called by `WithdrawListingOperation` after the
     * freeze guard passes, and by the lazy reset path. Also clears the BTC receiver string.
     */
    public resetListingProviderValues(): void {
        this.providerData.resetListingProviderValues();
        this.setBtcReceiver('');
    }

    /** Persist any in-memory changes to storage. Called by `saveAllProviders` at txn commit. */
    public save(): void {
        this.providerData.save();
    }

    private ensureBTCReceiver(): void {
        if (this._btcReceiver === null) {
            this._btcReceiver = new AdvancedStoredString(
                BTC_RECEIVER_ADDRESS_POINTER,
                this.providerBuffer,
            );
        }
    }
}

// ============================================================================
// Module-local provider cache + staking pending amount helpers
// ============================================================================

let cache: Array<Provider> = new Array<Provider>();
let pendingStakingContractAmount: u256 = u256.Zero;

function findProvider(id: u256): Provider | null {
    for (let i: i32 = 0; i < cache.length; i++) {
        if (u256.eq(cache[i].getId(), id)) {
            return cache[i];
        }
    }
    return null;
}

/** Persist every cached Provider — called by `NativeSwap.onExecutionCompleted`. */
export function saveAllProviders(): void {
    for (let i: i32 = 0; i < cache.length; i++) {
        cache[i].save();
    }
}

/** Drop the in-memory provider cache. Used by tests. */
export function clearCachedProviders(): void {
    cache = [];
}

export function getProviderCacheLength(): number {
    return cache.length;
}

/** Cache-aware loader. The same providerId returns the same Provider instance per txn. */
export function getProvider(providerId: u256): Provider {
    let provider = findProvider(providerId);
    if (provider === null) {
        provider = new Provider(providerId);
        cache.push(provider);
    }
    return provider;
}

/** Reset the staking pending amount accumulator. Used by tests. */
export function clearPendingStakingContractAmount(): void {
    pendingStakingContractAmount = u256.Zero;
}

/**
 * Queue an amount to be transferred to the staking contract on commit. The 0.3% swap fee
 * routes through here. The actual transfer happens in `transferPendingAmountToStakingContract`.
 */
export function addAmountToStakingContract(amount: u256): void {
    pendingStakingContractAmount = SafeMath.add(pendingStakingContractAmount, amount);
}

/** Transfer the accumulated staking-bound balance. Called by `NativeSwap.onExecutionCompleted`. */
export function transferPendingAmountToStakingContract(
    tokenAddress: Address,
    stakingContractAddress: Address,
): void {
    if (!pendingStakingContractAmount.isZero()) {
        if (stakingContractAddress.isZero()) {
            throw new Revert('NATIVE_SWAP: Staking contract address is not set.');
        }
        TransferHelper.transfer(tokenAddress, stakingContractAddress, pendingStakingContractAmount);
        pendingStakingContractAmount = u256.Zero;
    }
}

export function getPendingStakingContractAmount(): u256 {
    return pendingStakingContractAmount;
}
