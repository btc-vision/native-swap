import {
    Blockchain,
    BytesReader,
    BytesWriter,
    EMPTY_BUFFER,
    encodePointer,
} from '@btc-vision/btc-runtime/runtime';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import { eqUint } from '@btc-vision/btc-runtime/runtime/generic/MapUint8Array';

@final
export class UserReservation {
    private readonly pointerBuffer: Uint8Array;

    private expirationBlock: u64 = 0;
    private priorityIndex: u64 = 0;
    private purgeIndex: u32 = u32.MAX_VALUE;
    private activationDelay: u8 = 0;

    private isTimeout: bool = false;
    private reservedLP: bool = false;

    // Flags to manage state
    private isLoaded: bool = false;
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

    public get reservedForLiquidityPool(): bool {
        this.ensureValues();
        return this.reservedLP;
    }

    public set reservedForLiquidityPool(value: bool) {
        this.ensureValues();

        if (this.reservedLP != value) {
            this.reservedLP = value;
            this.isChanged = true;
        }
    }

    public static getPackDefaultValue(): Uint8Array {
        const bytes = new Uint8Array(32);
        for (let i: i32 = 0; i < 17; i++) {
            bytes[i] = 0x00;
        }

        for (let i: i32 = 17; i < 21; i++) {
            bytes[i] = 0xff;
        }

        for (let i: i32 = 21; i < 32; i++) {
            bytes[i] = 0x00;
        }

        return bytes;
    }

    /**
     * @method getExpirationBlock
     * @description Retrieves the expiration block.
     * @returns {u64} - The expiration block.
     */
    @inline
    public getExpirationBlock(): u64 {
        this.ensureValues();

        return this.expirationBlock;
    }

    /**
     * @method setExpirationBlock
     * @description Sets the expiration block.
     * @param {u64} block - The expiration block to set.
     */
    @inline
    public setExpirationBlock(block: u64): void {
        this.ensureValues();
        if (this.expirationBlock != block) {
            this.expirationBlock = block;
            this.isTimeout = false;
            this.isChanged = true;
        }
    }

    /**
     * @method timeout
     * @description Timeout the user.
     * @returns {void} - Timeout the user.
     */
    @inline
    public timeout(): void {
        this.ensureValues();
        this.isTimeout = true;
        this.isChanged = true;
    }

    /**
     * @method getUserTimeoutBlockExpiration
     * @description Retrieves the user timeout if any.
     * @returns {u64} - The user timeout block expiration.
     */
    @inline
    public getUserTimeoutBlockExpiration(): u64 {
        this.ensureValues();

        if (this.isTimeout) {
            return this.expirationBlock + LiquidityQueue.TIMEOUT_AFTER_EXPIRATION;
        } else {
            return 0;
        }
    }

    /**
     * @method save
     * @description Persists the cached values to storage if any have been modified.
     */
    public save(): void {
        if (this.isChanged) {
            const packed = this.packValues();
            Blockchain.setStorageAt(this.pointerBuffer, packed);

            this.isChanged = false;
        }
    }

    /**
     * @method setPurgeIndex
     * @description Set purge index.
     * @returns {void}
     */
    @inline
    public setPurgeIndex(index: u32): void {
        this.ensureValues();
        if (this.purgeIndex != index) {
            this.purgeIndex = index;
            this.isChanged = true;
        }
    }

    /**
     * @method getPurgeIndex
     * @description Get purge index.
     * @returns {u32}
     */
    @inline
    public getPurgeIndex(): u32 {
        this.ensureValues();
        return this.purgeIndex;
    }

    @inline
    public getActivationDelay(): u8 {
        this.ensureValues();
        return this.activationDelay;
    }

    @inline
    public setActivationDelay(delay: u8): void {
        this.ensureValues();
        if (this.activationDelay != delay) {
            this.activationDelay = delay;
            this.isChanged = true;
        }
    }

    /**
     * @method reset
     * @description Resets all fields to their default values and marks the state as changed.
     */
    @inline
    public reset(isTimeout: boolean): void {
        this.priorityIndex = 0;
        this.reservedLP = false;
        this.purgeIndex = u32.MAX_VALUE;
        this.activationDelay = 0;
        this.isTimeout = isTimeout;

        if (!isTimeout) {
            this.expirationBlock = 0;
        }

        this.isChanged = true;
    }

    /**
     * @method toBytes
     * @description Returns the packed u256 value as a byte array.
     * @returns data {Uint8Array} - The packed u256 value in byte form.
     */
    @inline
    public toBytes(): Uint8Array {
        this.ensureValues();
        return this.packValues();
    }

    private unpackFlags(flag: u8): void {
        this.reservedLP = !!(flag & 0b1);
        this.isTimeout = !!(flag & 0b10);
    }

    private packFlags(): u8 {
        let flags: u8 = 0;

        if (this.reservedLP) flags |= 0b1;
        if (this.isTimeout) flags |= 0b10;

        return flags;
    }

    /**
     * @private
     * @method ensureValues
     * @description Loads and unpacks the u256 value from storage into the internal fields.
     */
    private ensureValues(): void {
        if (!this.isLoaded) {
            let storedData: Uint8Array = Blockchain.getStorageAt(this.pointerBuffer);

            if (eqUint(storedData, EMPTY_BUFFER)) {
                storedData = UserReservation.getPackDefaultValue();
            }

            const reader = new BytesReader(storedData);

            // Unpack flags (1 byte)
            this.unpackFlags(reader.readU8());

            // Unpack expirationBlock (8 bytes, little endian)
            this.expirationBlock = reader.readU64();

            // Unpack priorityIndex (8 bytes, little endian)
            this.priorityIndex = reader.readU64();

            // Unpack purgeIndex (4 bytes, little endian)
            this.purgeIndex = reader.readU32();

            // Unpack activation delay (1 byte, little endian)
            this.activationDelay = reader.readU8();

            this.isLoaded = true;
        }
    }

    /**
     * @private
     * @method packValues
     * @description Packs the internal fields into a single u256 value for storage.
     * @returns {Uint8Array} - The packed u256 value.
     */
    private packValues(): Uint8Array {
        const writer = new BytesWriter(32);

        // Pack flags (1 byte)
        writer.writeU8(this.packFlags());

        // Pack expirationBlock (8 bytes, little endian)
        writer.writeU64(this.expirationBlock);

        // Pack priorityIndex (8 bytes, little endian)
        writer.writeU64(this.priorityIndex);

        // Pack purgeIndex (4 bytes, little endian)
        writer.writeU32(this.purgeIndex);

        // Pack activationDelay (1 byte)
        writer.writeU8(this.activationDelay);

        return writer.getBuffer();
    }
}
