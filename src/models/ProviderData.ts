import { u128 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    BytesReader,
    BytesWriter,
    encodePointer,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U64_BYTE_LENGTH,
    U8_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { AMOUNT_POINTER, LIQUIDITY_PROVIDED_POINTER } from '../constants/StoredPointers';

@final
export class ProviderData {
    private readonly pointerBuffer: Uint8Array;
    private readonly liquidityProvidedPointer: Uint8Array;
    private readonly amountPointer: Uint8Array;
    private valueLoaded: boolean = false;
    private stateChanged: boolean = false;
    private liquidityProvidedLoaded: boolean = false;
    private amountLoaded: boolean = false;
    private liquidityProvidedChanged: boolean = false;
    private amountChanged: boolean = false;

    /**
     * @constructor
     * @param {u16} pointer - The primary pointer identifier.
     * @param subPointer - The sub-pointer for memory slot addressing.
     */
    constructor(pointer: u16, subPointer: Uint8Array) {
        assert(
            subPointer.length <= 30,
            `You must pass a 30 bytes sub-pointer. (UserLiquidity, got ${subPointer.length})`,
        );

        this.pointerBuffer = encodePointer(pointer, subPointer);
        this.liquidityProvidedPointer = encodePointer(LIQUIDITY_PROVIDED_POINTER, subPointer);
        this.amountPointer = encodePointer(AMOUNT_POINTER, subPointer);
    }

    private _removalQueueIndex: u64 = 0;

    /**
     * @method removalQueueIndex
     * @description Gets the index of the provider in the removal queue.
     * @returns {u64} - The index of the provider in the removal queue.
     */
    @inline
    public get removalQueueIndex(): u64 {
        this.ensureValues();
        return this._removalQueueIndex;
    }

    /**
     * @method removalQueueIndex
     * @description Sets the index of the provider in the removal queue.
     * @param {u64} value - The index of the provider in the removal queue.
     */
    public set removalQueueIndex(value: u64) {
        this.ensureValues();
        if (this._removalQueueIndex !== value) {
            this._removalQueueIndex = value;
            this.stateChanged = true;
        }
    }

    private _initialLiquidityProvider: boolean = false;

    /**
     * @method initialLiquidityProvider
     * @description Gets if the provider is an initial liquidity provider.
     * @returns {boolean} - true if an initial liquidity provider; false if not.
     */
    @inline
    public get initialLiquidityProvider(): boolean {
        this.ensureValues();
        return this._initialLiquidityProvider;
    }

    /**
     * @method initialLiquidityProvider
     * @description Set if the provider is an initial liquidity provider.
     * @param {boolean} value - true if an initial liquidity provider; false if not.
     */
    public set initialLiquidityProvider(value: boolean) {
        this.ensureValues();
        if (this._initialLiquidityProvider !== value) {
            this._initialLiquidityProvider = value;
            this.stateChanged = true;
        }
    }

    private _pendingRemoval: boolean = false;

    /**
     * @method pendingRemoval
     * @description Gets if the provider is in pending removal state.
     * @returns {boolean} - true if in pending removal state; false if not.
     */
    @inline
    public get pendingRemoval(): boolean {
        this.ensureValues();
        return this._pendingRemoval;
    }

    /**
     * @method pendingRemoval
     * @description Set if the provider is in pending removal state.
     * @param {boolean} value - true if in pending removal; false if not.
     */
    public set pendingRemoval(value: boolean) {
        this.ensureValues();
        if (this._pendingRemoval !== value) {
            this._pendingRemoval = value;
            this.stateChanged = true;
        }
    }

    private _active: boolean = false;

    /**
     * @method active
     * @description Gets if the provider is active.
     * @returns {boolean} - true if active; false if not.
     */
    @inline
    public get active(): boolean {
        this.ensureValues();
        return this._active;
    }

    /**
     * @method active
     * @description Sets if the provider is active.
     * @param {boolean} value - true if active; false if not.
     */
    public set active(value: boolean) {
        this.ensureValues();
        if (this._active !== value) {
            this._active = value;
            this.stateChanged = true;
        }
    }

    private _priority: boolean = false;

    /**
     * @method priority
     * @description Gets if the provider is a priority provider.
     * @returns {boolean} - true if a priority provider; false if not.
     */
    @inline
    public get priority(): boolean {
        this.ensureValues();
        return this._priority;
    }

    /**
     * @method priority
     * @description Sets if the provider is a priority provider.
     * @param {boolean} value - true if a priority provider; false if not.
     */
    public set priority(value: boolean) {
        this.ensureValues();
        if (this._priority !== value) {
            this._priority = value;
            this.stateChanged = true;
        }
    }

    private _liquidityProvisionAllowed: boolean = false;

    /**
     * @method liquidityProvisionAllowed
     * @description Gets if the provider can provide liquidity.
     * @returns {boolean} - true if can provide liquidity; false if not.
     */
    @inline
    public get liquidityProvisionAllowed(): boolean {
        this.ensureValues();
        return this._liquidityProvisionAllowed;
    }

    /**
     * @method liquidityProvisionAllowed
     * @description Sets if the provider can provide liquidity.
     * @param {boolean} value - true if can provide liquidity; false if not.
     */
    public set liquidityProvisionAllowed(value: boolean) {
        this.ensureValues();
        if (this._liquidityProvisionAllowed !== value) {
            this._liquidityProvisionAllowed = value;
            this.stateChanged = true;
        }
    }

    private _liquidityProvider: boolean = false;

    /**
     * @method liquidityProvider
     * @description Gets if the provider is a liquidity provider.
     * @returns {boolean} - true if a liquidity provider; false if not.
     */
    @inline
    public get liquidityProvider(): boolean {
        this.ensureValues();
        return this._liquidityProvider;
    }

    /**
     * @method liquidityProvider
     * @description Sets if the provider is a liquidity provider.
     * @param {boolean} value - true if a liquidity provider; false if not.
     */
    public set liquidityProvider(value: boolean) {
        this.ensureValues();
        if (this._liquidityProvider !== value) {
            this._liquidityProvider = value;
            this.stateChanged = true;
        }
    }

    private _queueIndex: u64 = 0;

    //!!!!
    /**
     * @method queueIndex
     * @description Gets the index of the provider in the normal/priority queue.
     * @returns {u64} - The index of the provider in the normal/priority queue.
     */
    @inline
    public get queueIndex(): u64 {
        this.ensureValues();
        return this._queueIndex;
    }

    /**
     * @method queueIndex
     * @description Sets the index of the provider in the normal/priority queue.
     * @param {u64} value - The index of the provider in the normal/priority queue.
     */
    public set queueIndex(value: u64) {
        this.ensureValues();
        if (this._queueIndex !== value) {
            this._queueIndex = value;
            this.stateChanged = true;
        }
    }

    private _liquidityProvided: u128 = u128.Zero;

    /**
     * @method liquidityProvided
     * @description Gets the liquidity provided in tokens.
     * @returns {u128} - The liquidity provided in tokens.
     */
    @inline
    public get liquidityProvided(): u128 {
        this.ensureLiquidityProvided();
        return this._liquidityProvided;
    }

    /**
     * @method liquidityProvided
     * @description Sets the liquidity provided in tokens.
     * @param {u128} value - The liquidity provided in tokens.
     */
    public set liquidityProvided(value: u128) {
        this.ensureLiquidityProvided();
        if (!u128.eq(this._liquidityProvided, value)) {
            this._liquidityProvided = value;
            this.liquidityProvidedChanged = true;
        }
    }

    private _liquidityAmount: u128 = u128.Zero;

    /**
     * @method liquidityAmount
     * @description Gets the liquidity amount in tokens.
     * @returns {u128} - The liquidity amount in tokens.
     */
    @inline
    public get liquidityAmount(): u128 {
        this.ensureAmount();
        return this._liquidityAmount;
    }

    /**
     * @method liquidityAmount
     * @description Sets the liquidity amount in tokens.
     * @param {u128} value - The liquidity amount in tokens.
     */
    public set liquidityAmount(value: u128) {
        this.ensureAmount();
        if (!u128.eq(this._liquidityAmount, value)) {
            this._liquidityAmount = value;
            this.amountChanged = true;
        }
    }

    private _reservedAmount: u128 = u128.Zero;

    /**
     * @method reservedAmount
     * @description Gets the reserved amount in tokens.
     * @returns {u128} - The reserved amount in tokens.
     */
    @inline
    public get reservedAmount(): u128 {
        this.ensureAmount();
        return this._reservedAmount;
    }

    /**
     * @method reservedAmount
     * @description Sets the reserved amount in tokens.
     * @param {u128} value - The reserved amount in tokens.
     */
    public set reservedAmount(value: u128) {
        this.ensureAmount();
        if (!u128.eq(this._reservedAmount, value)) {
            this._reservedAmount = value;
            this.amountChanged = true;
        }
    }

    /**
     * @method save
     * @description Persists the cached values to storage if any have been modified.
     * @returns {void}
     */
    public save(): void {
        this.saveStateIfChanged();
        this.saveLiquidityProvidedIfChanged();
        this.saveAmountIfChanged();
    }

    /**
     * @method resetAll
     * @description Reset all values (listing and liquidity provider).
     * @returns {void}
     */
    public resetAll(): void {
        this.resetListingValues();
        this.resetLiquidityProviderValues();
    }

    /**
     * @method resetListingValues
     * @description Reset only the values used by a listing.
     * @returns {void}
     */
    public resetListingValues(): void {
        this.active = false;
        this.priority = false;
        this.liquidityProvisionAllowed = false;
        this.liquidityAmount = u128.Zero;
        this.reservedAmount = u128.Zero;
        this.queueIndex = 0;
    }

    /**
     * @method resetLiquidityProviderValues
     * @description Reset only the values used by a liquidity provider.
     * @returns {void}
     */
    public resetLiquidityProviderValues(): void {
        this.liquidityProvided = u128.Zero;
        this.pendingRemoval = false;
        this.liquidityProvider = false;
        this.removalQueueIndex = 0;
    }

    /**
     * @method saveStateIfChanged
     * @description Persists the states if any have been modified
     * @returns {void}.
     */
    private saveStateIfChanged(): void {
        if (this.stateChanged) {
            const packed: Uint8Array = this.packValues();
            Blockchain.setStorageAt(this.pointerBuffer, packed);
            this.stateChanged = false;
        }
    }

    /**
     * @method saveLiquidityProvidedIfChanged
     * @description Persists the liquidity provided if modified.
     * @returns {void}
     */
    private saveLiquidityProvidedIfChanged(): void {
        if (this.liquidityProvidedChanged) {
            const packed: Uint8Array = this.packLiquidityProvided();
            Blockchain.setStorageAt(this.liquidityProvidedPointer, packed);
            this.liquidityProvidedChanged = false;
        }
    }

    /**
     * @method saveAmountIfChanged
     * @description Persists the liquidity and reserved amount if modified.
     * @returns {void}
     */
    private saveAmountIfChanged(): void {
        if (this.amountChanged) {
            const packed: Uint8Array = this.packAmounts();
            Blockchain.setStorageAt(this.amountPointer, packed);
            this.amountChanged = false;
        }
    }

    /**
     * @private
     * @method ensureLiquidityProvided
     * @description Loads the liquidity provided from storage if needed.
     * @returns {void}
     */
    private ensureLiquidityProvided(): void {
        if (!this.liquidityProvidedLoaded) {
            const storedData: Uint8Array = Blockchain.getStorageAt(this.liquidityProvidedPointer);
            this.unpackLiquidityProvided(storedData);
            this.liquidityProvidedLoaded = true;
        }
    }

    /**
     * @private
     * @method ensureAmount
     * @description Loads the liquidity and reserved amount from storage if needed.
     * @returns {void}
     */
    private ensureAmount(): void {
        if (!this.amountLoaded) {
            const storedData: Uint8Array = Blockchain.getStorageAt(this.amountPointer);
            this.unpackAmounts(storedData);
            this.amountLoaded = true;
        }
    }

    /**
     * @private
     * @method ensureValues
     * @description Loads and unpack the values if needed.
     * @returns {void}
     */
    private ensureValues(): void {
        if (!this.valueLoaded) {
            const storedData: Uint8Array = Blockchain.getStorageAt(this.pointerBuffer);
            this.unpackValues(storedData);
            this.valueLoaded = true;
        }
    }

    /**
     * @private
     * @method unpackValues
     * @description Unpacks the internal data.
     * @param {Uint8Array} packedData - The data to unpack.
     * @returns {void}
     */
    private unpackValues(packedData: Uint8Array): void {
        const reader: BytesReader = new BytesReader(packedData);

        const flag: u8 = reader.readU8();

        this._active = (flag & 1) === 1;
        this._priority = ((flag >> 1) & 1) === 1;
        this._liquidityProvisionAllowed = ((flag >> 2) & 1) === 1;
        this._liquidityProvider = ((flag >> 3) & 1) === 1;
        this._pendingRemoval = ((flag >> 4) & 1) === 1;
        this._initialLiquidityProvider = ((flag >> 5) & 1) === 1;
        this._queueIndex = reader.readU64();
        this._removalQueueIndex = reader.readU64();
    }

    /**
     * @private
     * @method unpackLiquidityProvided
     * @description Unpacks the liquidity amount and reserved amount.
     * @param {Uint8Array} packedData - The data to unpack.
     * @returns {void}
     */
    private unpackLiquidityProvided(packedData: Uint8Array): void {
        const reader: BytesReader = new BytesReader(packedData);
        this._liquidityProvided = reader.readU128();
    }

    /**
     * @private
     * @method unpackAmounts
     * @description Unpacks the liquidity amount and reserved amount.
     * @param {Uint8Array} packedData - The data to unpack.
     * @returns {void}
     */
    private unpackAmounts(packedData: Uint8Array): void {
        const reader: BytesReader = new BytesReader(packedData);
        this._liquidityAmount = reader.readU128();
        this._reservedAmount = reader.readU128();
    }

    /**
     * @private
     * @method packValues
     * @description Packs the internal data for storage.
     * @returns {Uint8Array} The packed Uint8Array value.
     */
    private packValues(): Uint8Array {
        const writer: BytesWriter = new BytesWriter(U8_BYTE_LENGTH + 2 * U64_BYTE_LENGTH);
        const flag =
            (this._active ? 1 : 0) |
            ((this._priority ? 1 : 0) << 1) |
            ((this._liquidityProvisionAllowed ? 1 : 0) << 2) |
            ((this._liquidityProvider ? 1 : 0) << 3) |
            ((this._pendingRemoval ? 1 : 0) << 4) |
            ((this._initialLiquidityProvider ? 1 : 0) << 5);

        writer.writeU8(flag);
        writer.writeU64(this._queueIndex);
        writer.writeU64(this._removalQueueIndex);

        return writer.getBuffer();
    }

    /**
     * @private
     * @method packLiquidityProvided
     * @description Packs the liquidity provided data for storage.
     * @returns {Uint8Array} The packed Uint8Array value.
     */
    private packLiquidityProvided(): Uint8Array {
        const writer: BytesWriter = new BytesWriter(U128_BYTE_LENGTH);
        writer.writeU128(this._liquidityProvided);

        return writer.getBuffer();
    }

    /**
     * @private
     * @method packAmounts
     * @description Packs the liquidity amount and the reserved amount data for storage.
     * @returns {Uint8Array} The packed Uint8Array value.
     */
    private packAmounts(): Uint8Array {
        const writer: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        writer.writeU128(this._liquidityAmount);
        writer.writeU128(this._reservedAmount);

        return writer.getBuffer();
    }
}
