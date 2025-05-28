import {
    Blockchain,
    BytesReader,
    BytesWriter,
    EMPTY_BUFFER,
    encodePointer,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
    U8_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { eqUint } from '@btc-vision/btc-runtime/runtime/generic/MapUint8Array';
import {
    INDEX_NOT_SET_VALUE,
    RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
    TIMEOUT_AFTER_EXPIRATION_BLOCKS,
} from '../constants/Contract';

@final
export class ReservationData {
    private readonly pointerBuffer: Uint8Array;
    private valueLoaded: bool = false;
    private isChanged: bool = false;

    /**
     * @constructor
     * @param {u16} pointer - The primary pointer identifier.
     * @param subPointer
     */
    constructor(
        public pointer: u16,
        public subPointer: Uint8Array,
    ) {
        assert(
            subPointer.length <= 30,
            `You must pass a 30 bytes sub-pointer. (UserReservation, got ${subPointer.length})`,
        );

        this.pointerBuffer = encodePointer(pointer, subPointer);
    }

    private _activationDelay: u8 = 0;

    /**
     * @method activationDelay
     * @description Gets the activation delay in blocks.
     * @returns {u8} - The activation delay.
     */
    @inline
    public get activationDelay(): u8 {
        this.ensureValues();
        return this._activationDelay;
    }

    /**
     * @method activationDelay
     * @description Sets the activation delay in blocks.
     * @param {u8} value - The activation delay.
     */
    public set activationDelay(value: u8) {
        this.ensureValues();
        if (this._activationDelay !== value) {
            this._activationDelay = value;
            this.isChanged = true;
        }
    }

    private _creationBlock: u64 = 0;

    /**
     * @method creationBlock
     * @description Gets the creation block.
     * @returns {u64} - The creation block.
     */
    @inline
    public get creationBlock(): u64 {
        this.ensureValues();

        return this._creationBlock;
    }

    /**
     * @method creationBlock
     * @description Sets the creation block.
     * @param {u64} value - The creation block.
     */
    public set creationBlock(value: u64) {
        this.ensureValues();

        if (this._creationBlock !== value) {
            this._creationBlock = value;
            this._timeout = false;
            this.isChanged = true;
        }
    }

    /**
     * @method expirationBlock
     * @description Gets the expiration block.
     * @returns {u64} - The expiration block.
     */
    @inline
    public get expirationBlock(): u64 {
        this.ensureValues();

        return this._creationBlock + RESERVATION_EXPIRE_AFTER_IN_BLOCKS;
    }

    private _forLiquidityPool: boolean = false;

    /**
     * @method forLiquidityPool
     * @description Gets if the reservation is for a liquidity pool.
     * @returns {boolean} - true if the reservation is for a liquidity pool; false if not.
     */
    @inline
    public get forLiquidityPool(): boolean {
        this.ensureValues();
        return this._forLiquidityPool;
    }

    /**
     * @method forLiquidityPool
     * @description Sets if the reservation is for a liquidity pool.
     * @param {boolean} value - true if the reservation is for a liquidity pool; false if not.
     */
    public set forLiquidityPool(value: boolean) {
        this.ensureValues();

        if (this._forLiquidityPool !== value) {
            this._forLiquidityPool = value;
            this.isChanged = true;
        }
    }

    private _purgeIndex: u32 = INDEX_NOT_SET_VALUE;

    /**
     * @method purgeIndex
     * @description Gets the reservation index in the reservation array.
     * @returns {u32}
     */
    @inline
    public get purgeIndex(): u32 {
        this.ensureValues();
        return this._purgeIndex;
    }

    /**
     * @method purgeIndex
     * @description Sets the reservation index in the reservation array.
     * @param {u32} value - The purge index.
     */
    public set purgeIndex(value: u32) {
        this.ensureValues();
        if (this._purgeIndex !== value) {
            this._purgeIndex = value;
            this.isChanged = true;
        }
    }

    private _timeout: boolean = false;

    /**
     * @method timeout
     * @description Gets the timeout state.
     * @returns {boolean} true if timeout; false if not.
     */
    @inline
    public get timeout(): boolean {
        this.ensureValues();
        return this._timeout;
    }

    /**
     * @method timeout
     * @description Sets the timeout state.
     * @param {boolean} true to timeout, false to not timeout.
     */
    public set timeout(value: boolean) {
        this.ensureValues();
        if (this._timeout !== value) {
            this._timeout = value;
            this.isChanged = true;
        }
    }

    /**
     * @method userTimeoutExpirationBlock
     * @description Gets the expiration if the user is timed out.
     * @returns {u64} - The timed out expiration block expiration. 0 if no timeout.
     */
    @inline
    public get userTimeoutExpirationBlock(): u64 {
        this.ensureValues();

        if (this.timeout) {
            return this.expirationBlock + TIMEOUT_AFTER_EXPIRATION_BLOCKS;
        } else {
            return 0;
        }
    }

    /**
     * @method reset
     * @description Resets all fields to their default values and marks the state as changed.
     * @param {boolean} isTimeout - true is the reservation is timed out; false if not.
     * @returns {void}
     */
    @inline
    public reset(isTimeout: boolean): void {
        this.forLiquidityPool = false;
        this.purgeIndex = INDEX_NOT_SET_VALUE;
        this.activationDelay = 0;
        this.timeout = isTimeout;

        if (!isTimeout) {
            this.creationBlock = 0;
        }

        this.isChanged = true;
    }

    /**
     * @method save
     * @description Persists the cached values to storage if any have been modified.
     * @returns {void}
     */
    public save(): void {
        if (this.isChanged) {
            const packed: Uint8Array = this.packValues();
            Blockchain.setStorageAt(this.pointerBuffer, packed);

            this.isChanged = false;
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
     * @method packFlags
     * @description Packs the flags into a single U8.
     * @returns The packed flags.
     */
    private packFlags(): u8 {
        let flags: u8 = 0;

        if (this.forLiquidityPool) flags |= 0b1;
        if (this.timeout) flags |= 0b10;

        return flags;
    }

    /**
     * @private
     * @method packValues
     * @description Packs the internal data for storage.
     * @returns The packed Uint8Array value.
     */
    private packValues(): Uint8Array {
        const writer: BytesWriter = new BytesWriter(
            2 * U8_BYTE_LENGTH + U64_BYTE_LENGTH + U32_BYTE_LENGTH,
        );

        writer.writeU8(this.packFlags());
        writer.writeU64(this.creationBlock);
        writer.writeU32(this.purgeIndex);
        writer.writeU8(this.activationDelay);

        return writer.getBuffer();
    }

    /**
     * @private
     * @method unpackFlags
     * @description Unpack the flags from a U8.
     * @param {u8} packedFlags - The flags to unpack.
     * @returns {void}
     */
    private unpackFlags(packedFlags: u8): void {
        this._forLiquidityPool = (packedFlags & 0b1) !== 0;
        this._timeout = (packedFlags & 0b10) !== 0;
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

        this.unpackFlags(reader.readU8());
        this._creationBlock = reader.readU64();
        this._purgeIndex = reader.readU32();
        this._activationDelay = reader.readU8();
    }
}
