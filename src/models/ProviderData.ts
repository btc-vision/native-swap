import { u128 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    BytesReader,
    BytesWriter,
    EMPTY_BUFFER,
    encodePointer,
    U256_BYTE_LENGTH,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
    U8_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { eqUint } from '@btc-vision/btc-runtime/runtime/generic/MapUint8Array';
import { AMOUNT_POINTER } from '../constants/StoredPointers';
import {
    BLOCK_NOT_SET_VALUE,
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
} from '../constants/Contract';

@final
export class ProviderData {
    private readonly pointerBuffer: Uint8Array;
    private readonly amountPointer: Uint8Array;
    private valueLoaded: boolean = false;
    private stateChanged: boolean = false;

    private amountLoaded: boolean = false;
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
        this.amountPointer = encodePointer(AMOUNT_POINTER, subPointer);
    }

    private _toReset: boolean = false;

    /**
     * @method toReset
     * @description Gets if the provider is fulfilled and needs to be resets.
     * @returns {boolean} - true if fulfilled; false if not.
     */
    @inline
    public get toReset(): boolean {
        this.ensureValues();
        return this._toReset;
    }

    /**
     * @method toReset
     * @description Sets if the provider is fulfilled and needs to be resets.
     * @param {boolean} value - true if fulfilled; false if not.
     */
    public set toReset(value: boolean) {
        this.ensureValues();
        if (this._toReset !== value) {
            this._toReset = value;
            this.stateChanged = true;
        }
    }

    // Add this new private field
    private _virtualBTCContribution: u64 = 0;

    // Add getter and setter
    public get virtualBTCContribution(): u64 {
        this.ensureValues();
        return this._virtualBTCContribution;
    }

    public set virtualBTCContribution(value: u64) {
        this.ensureValues();
        if (this._virtualBTCContribution !== value) {
            this._virtualBTCContribution = value;
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

    private _listedTokenAtBlock: u64 = BLOCK_NOT_SET_VALUE;

    /**
     * @method listedTokenAtBlock
     * @description Gets if the block associated with the listing of a token.
     * @returns {u64} - the block number; BLOCK_NOT_SET_VALUE when no block.
     */
    @inline
    public get listedTokenAtBlock(): u64 {
        this.ensureValues();
        return this._listedTokenAtBlock;
    }

    /**
     * @method listedTokenAtBlock
     * @description Sets the block associated with the listing of a token.
     * @param {u64} value - the block number.
     */
    public set listedTokenAtBlock(value: u64) {
        this.ensureValues();

        if (this._listedTokenAtBlock !== value) {
            this._listedTokenAtBlock = value;
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

    private _purged: boolean = false;

    /**
     * @method purged
     * @description Gets if the provider has been purged.
     * @returns {boolean} - true if purged; false if not.
     */
    @inline
    public get purged(): boolean {
        this.ensureValues();
        return this._purged;
    }

    /**
     * @method purged
     * @description Sets the purged states.
     * @param {boolean} value - true if purged; false if not.
     */
    public set purged(value: boolean) {
        this.ensureValues();
        if (this._purged !== value) {
            this._purged = value;
            this.stateChanged = true;
        }
    }

    private _purgedIndex: u32 = INDEX_NOT_SET_VALUE;

    /**
     * @method purgedIndex
     * @description Gets the index of the provider purged index.
     * @returns {u32} - The index of the provider purged index.
     */
    @inline
    public get purgedIndex(): u32 {
        this.ensureValues();
        return this._purgedIndex;
    }

    /**
     * @method purgedIndex
     * @description Sets the index of the provider purged index.
     * @param {u32} value - The index of the provider purged index.
     */
    public set purgedIndex(value: u32) {
        this.ensureValues();
        if (this._purgedIndex !== value) {
            this._purgedIndex = value;
            this.stateChanged = true;
        }
    }

    private _queueIndex: u32 = INDEX_NOT_SET_VALUE;

    /**
     * @method queueIndex
     * @description Gets the index of the provider in the normal/priority queue.
     * @returns {u32} - The index of the provider in the normal/priority queue.
     */
    @inline
    public get queueIndex(): u32 {
        this.ensureValues();
        return this._queueIndex;
    }

    /**
     * @method queueIndex
     * @description Sets the index of the provider in the normal/priority queue.
     * @param {u32} value - The index of the provider in the normal/priority queue.
     */
    public set queueIndex(value: u32) {
        this.ensureValues();
        if (this._queueIndex !== value) {
            this._queueIndex = value;
            this.stateChanged = true;
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
     * @method resetAll
     * @description Reset all values (listing and liquidity provider).
     * @returns {void}
     */
    public resetAll(): void {
        this.resetListingProviderValues();
    }

    /**
     * @method resetListingProviderValues
     * @description Reset only the values used by a listing provider.
     * @returns {void}
     */
    public resetListingProviderValues(): void {
        this.active = false;
        this.priority = false;
        this.toReset = false;
        this.liquidityProvisionAllowed = false;
        this.liquidityAmount = u128.Zero;
        this.reservedAmount = u128.Zero;
        this.purged = false;
        this.purgedIndex = INDEX_NOT_SET_VALUE;
        this.listedTokenAtBlock = BLOCK_NOT_SET_VALUE;

        //!!!
        //this.virtualBTCContribution = 0;?????
        if (this.queueIndex !== INITIAL_LIQUIDITY_PROVIDER_INDEX) {
            this.queueIndex = INDEX_NOT_SET_VALUE;
        }
    }

    /**
     * @method save
     * @description Persists the cached values to storage if any have been modified.
     * @returns {void}
     */
    public save(): void {
        this.saveStateIfChanged();
        this.saveAmountIfChanged();
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

            if (!eqUint(storedData, EMPTY_BUFFER)) {
                this.unpackValues(storedData);
            }

            this.valueLoaded = true;
        }
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

    /**
     * @private
     * @method packValues
     * @description Packs the internal data for storage.
     * @returns {Uint8Array} The packed Uint8Array value.
     */
    private packValues(): Uint8Array {
        const writer: BytesWriter = new BytesWriter(
            U8_BYTE_LENGTH + U32_BYTE_LENGTH + U32_BYTE_LENGTH + U64_BYTE_LENGTH + U64_BYTE_LENGTH,
        );

        const flag: u8 =
            (this._active ? 1 : 0) |
            ((this._priority ? 1 : 0) << 1) |
            ((this._liquidityProvisionAllowed ? 1 : 0) << 2) |
            ((this._initialLiquidityProvider ? 1 : 0) << 3) |
            ((this._purged ? 1 : 0) << 4) |
            ((this._toReset ? 1 : 0) << 5);

        writer.writeU8(flag);
        writer.writeU32(this._queueIndex);
        writer.writeU64(this._listedTokenAtBlock);
        writer.writeU32(this._purgedIndex);
        writer.writeU64(this._virtualBTCContribution);

        return writer.getBuffer();
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
        this._initialLiquidityProvider = ((flag >> 3) & 1) === 1;
        this._purged = ((flag >> 4) & 1) === 1;
        this._toReset = ((flag >> 5) & 1) === 1;

        this._queueIndex = reader.readU32();
        this._listedTokenAtBlock = reader.readU64();
        this._purgedIndex = reader.readU32();
        this._virtualBTCContribution = reader.readU64();
    }
}
