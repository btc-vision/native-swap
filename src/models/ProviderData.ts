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
import { BLOCK_NOT_SET_VALUE, INDEX_NOT_SET_VALUE } from '../constants/Contract';

@final
export class ProviderData {
    private readonly pointerBuffer: Uint8Array;
    private readonly amountPointer: Uint8Array;
    private valueLoaded: boolean = false;
    private stateChanged: boolean = false;

    private amountLoaded: boolean = false;
    private amountChanged: boolean = false;

    constructor(pointer: u16, subPointer: Uint8Array) {
        assert(
            subPointer.length <= 30,
            `You must pass a 30 bytes sub-pointer. (got ${subPointer.length})`,
        );

        this.pointerBuffer = encodePointer(pointer, subPointer);
        this.amountPointer = encodePointer(AMOUNT_POINTER, subPointer);
    }

    // ------------------------------------------------------------------------
    // Flags
    // ------------------------------------------------------------------------

    private _active: boolean = false;
    @inline public get active(): boolean {
        this.ensureValues();
        return this._active;
    }
    public set active(value: boolean) {
        this.ensureValues();
        if (this._active !== value) {
            this._active = value;
            this.stateChanged = true;
        }
    }

    /** Provider has been pushed to their tick's purged sub-queue (fast-path re-allocation). */
    private _purged: boolean = false;
    @inline public get purged(): boolean {
        this.ensureValues();
        return this._purged;
    }
    public set purged(value: boolean) {
        this.ensureValues();
        if (this._purged !== value) {
            this._purged = value;
            this.stateChanged = true;
        }
    }

    /** Provider has been moved to the global fulfilled queue and is awaiting reset. */
    private _toReset: boolean = false;
    @inline public get toReset(): boolean {
        this.ensureValues();
        return this._toReset;
    }
    public set toReset(value: boolean) {
        this.ensureValues();
        if (this._toReset !== value) {
            this._toReset = value;
            this.stateChanged = true;
        }
    }

    // ------------------------------------------------------------------------
    // Tick & queue position
    // ------------------------------------------------------------------------

    /** The tick this provider is listed at. Set by listLiquidity / createPool / updateListing. */
    private _priceTick: i32 = 0;
    @inline public get priceTick(): i32 {
        this.ensureValues();
        return this._priceTick;
    }
    public set priceTick(value: i32) {
        this.ensureValues();
        if (this._priceTick !== value) {
            this._priceTick = value;
            this.stateChanged = true;
        }
    }

    /**
     * Position inside FIFO[priceTick]. Replaces the old `queueIndex` semantically.
     * Kept as `queueIndex` getter/setter alias for compatibility.
     */
    private _tickFifoIndex: u32 = INDEX_NOT_SET_VALUE;
    @inline public get tickFifoIndex(): u32 {
        this.ensureValues();
        return this._tickFifoIndex;
    }
    public set tickFifoIndex(value: u32) {
        this.ensureValues();
        if (this._tickFifoIndex !== value) {
            this._tickFifoIndex = value;
            this.stateChanged = true;
        }
    }
    @inline public get queueIndex(): u32 {
        return this.tickFifoIndex;
    }
    public set queueIndex(value: u32) {
        this.tickFifoIndex = value;
    }

    /** Position inside purged[priceTick] sub-queue. INDEX_NOT_SET_VALUE if not purged. */
    private _purgedIndex: u32 = INDEX_NOT_SET_VALUE;
    @inline public get purgedIndex(): u32 {
        this.ensureValues();
        return this._purgedIndex;
    }
    public set purgedIndex(value: u32) {
        this.ensureValues();
        if (this._purgedIndex !== value) {
            this._purgedIndex = value;
            this.stateChanged = true;
        }
    }

    // ------------------------------------------------------------------------
    // Freeze invariant: latestReservedUntilBlock
    // ------------------------------------------------------------------------

    /**
     * Max expiration block across every reservation that has ever touched this provider.
     * Updated monotonically on every reserve via `Provider.bumpLatestReservedUntilBlock`.
     * Used as the safe "unlock block" for cancel/update guards. See plan: Cancel & update semantics.
     */
    private _latestReservedUntilBlock: u64 = 0;
    @inline public get latestReservedUntilBlock(): u64 {
        this.ensureValues();
        return this._latestReservedUntilBlock;
    }
    public set latestReservedUntilBlock(value: u64) {
        this.ensureValues();
        if (this._latestReservedUntilBlock !== value) {
            this._latestReservedUntilBlock = value;
            this.stateChanged = true;
        }
    }

    // ------------------------------------------------------------------------
    // Block of first listing (used for events / debugging)
    // ------------------------------------------------------------------------

    private _listedTokenAtBlock: u64 = BLOCK_NOT_SET_VALUE;
    @inline public get listedTokenAtBlock(): u64 {
        this.ensureValues();
        return this._listedTokenAtBlock;
    }
    public set listedTokenAtBlock(value: u64) {
        this.ensureValues();
        if (this._listedTokenAtBlock !== value) {
            this._listedTokenAtBlock = value;
            this.stateChanged = true;
        }
    }

    // ------------------------------------------------------------------------
    // Token amounts (stored in a separate slot)
    // ------------------------------------------------------------------------

    private _liquidityAmount: u128 = u128.Zero;
    @inline public get liquidityAmount(): u128 {
        this.ensureAmount();
        return this._liquidityAmount;
    }
    public set liquidityAmount(value: u128) {
        this.ensureAmount();
        if (!u128.eq(this._liquidityAmount, value)) {
            this._liquidityAmount = value;
            this.amountChanged = true;
        }
    }

    private _reservedAmount: u128 = u128.Zero;
    @inline public get reservedAmount(): u128 {
        this.ensureAmount();
        return this._reservedAmount;
    }
    public set reservedAmount(value: u128) {
        this.ensureAmount();
        if (!u128.eq(this._reservedAmount, value)) {
            this._reservedAmount = value;
            this.amountChanged = true;
        }
    }

    // ------------------------------------------------------------------------
    // Lifecycle helpers
    // ------------------------------------------------------------------------

    public resetAll(): void {
        this.resetListingProviderValues();
    }

    /**
     * Reset all listing-related fields. Called by withdrawListing and the lazy purge
     * reset path. Does NOT clear `latestReservedUntilBlock` automatically — the caller
     * (WithdrawListingOperation) explicitly clears it after the freeze guard passes.
     */
    public resetListingProviderValues(): void {
        this.active = false;
        this.toReset = false;
        this.liquidityAmount = u128.Zero;
        this.reservedAmount = u128.Zero;
        this.purged = false;
        this.purgedIndex = INDEX_NOT_SET_VALUE;
        this.tickFifoIndex = INDEX_NOT_SET_VALUE;
        this.priceTick = 0;
        this.listedTokenAtBlock = BLOCK_NOT_SET_VALUE;
        this.latestReservedUntilBlock = 0;
    }

    public save(): void {
        this.saveStateIfChanged();
        this.saveAmountIfChanged();
    }

    // ------------------------------------------------------------------------
    // Storage I/O
    // ------------------------------------------------------------------------

    private ensureAmount(): void {
        if (!this.amountLoaded) {
            const storedData: Uint8Array = Blockchain.getStorageAt(this.amountPointer);
            this.unpackAmounts(storedData);
            this.amountLoaded = true;
        }
    }

    private ensureValues(): void {
        if (!this.valueLoaded) {
            const storedData: Uint8Array = Blockchain.getStorageAt(this.pointerBuffer);
            if (!eqUint(storedData, EMPTY_BUFFER)) {
                this.unpackValues(storedData);
            }
            this.valueLoaded = true;
        }
    }

    private packAmounts(): Uint8Array {
        const writer: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        writer.writeU128(this._liquidityAmount);
        writer.writeU128(this._reservedAmount);
        return writer.getBuffer();
    }

    /**
     * Layout (32 bytes packed into one storage slot):
     *   1 byte  flag bits:
     *     bit 0 = active
     *     bit 1 = purged
     *     bit 2 = toReset
     *   4 bytes tickFifoIndex (u32)
     *   4 bytes purgedIndex (u32)
     *   4 bytes priceTick (i32 stored as u32, two's-complement)
     *   8 bytes listedTokenAtBlock (u64)
     *   8 bytes latestReservedUntilBlock (u64)
     *   = 1 + 4 + 4 + 4 + 8 + 8 = 29 bytes (fits in a 32-byte slot)
     */
    private packValues(): Uint8Array {
        const writer: BytesWriter = new BytesWriter(
            U8_BYTE_LENGTH +
                U32_BYTE_LENGTH +
                U32_BYTE_LENGTH +
                U32_BYTE_LENGTH +
                U64_BYTE_LENGTH +
                U64_BYTE_LENGTH,
        );

        const flag: u8 =
            (this._active ? 1 : 0) | ((this._purged ? 1 : 0) << 1) | ((this._toReset ? 1 : 0) << 2);

        writer.writeU8(flag);
        writer.writeU32(this._tickFifoIndex);
        writer.writeU32(this._purgedIndex);
        writer.writeI32(this._priceTick);
        writer.writeU64(this._listedTokenAtBlock);
        writer.writeU64(this._latestReservedUntilBlock);

        return writer.getBuffer();
    }

    private saveAmountIfChanged(): void {
        if (this.amountChanged) {
            const packed: Uint8Array = this.packAmounts();
            Blockchain.setStorageAt(this.amountPointer, packed);
            this.amountChanged = false;
        }
    }

    private saveStateIfChanged(): void {
        if (this.stateChanged) {
            const packed: Uint8Array = this.packValues();
            Blockchain.setStorageAt(this.pointerBuffer, packed);
            this.stateChanged = false;
        }
    }

    private unpackAmounts(packedData: Uint8Array): void {
        const reader: BytesReader = new BytesReader(packedData);
        this._liquidityAmount = reader.readU128();
        this._reservedAmount = reader.readU128();
    }

    private unpackValues(packedData: Uint8Array): void {
        const reader: BytesReader = new BytesReader(packedData);

        const flag: u8 = reader.readU8();
        this._active = (flag & 1) === 1;
        this._purged = ((flag >> 1) & 1) === 1;
        this._toReset = ((flag >> 2) & 1) === 1;

        this._tickFifoIndex = reader.readU32();
        this._purgedIndex = reader.readU32();
        this._priceTick = reader.readI32();
        this._listedTokenAtBlock = reader.readU64();
        this._latestReservedUntilBlock = reader.readU64();
    }
}
