import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    Revert,
    StoredU128Array,
    StoredU32Array,
    StoredU8Array,
} from '@btc-vision/btc-runtime/runtime';
import {
    RESERVATION_AMOUNTS,
    RESERVATION_DATA_POINTER,
    RESERVATION_INDEXES,
    RESERVATION_PRIORITY,
} from '../constants/StoredPointers';
import { u128 } from '@btc-vision/as-bignum/assembly';
import { ripemd160 } from '@btc-vision/btc-runtime/runtime/env/global';
import { ReservationData } from './ReservationData';
import { ReservationProviderData } from './ReservationProdiverData';

export class Reservation {
    private reservationData: ReservationData;
    private reservedIndexes: StoredU32Array;
    private reservedValues: StoredU128Array;
    private reservedPriority: StoredU8Array;
    private readonly id: u128;

    public constructor(
        token: Address,
        owner: Address,
        reservationId: Uint8Array = new Uint8Array(0),
    ) {
        if (reservationId.length == 0) {
            reservationId = Reservation.generateId(token, owner);
        }

        this.reservationData = new ReservationData(RESERVATION_DATA_POINTER, reservationId);
        this.id = u128.fromBytes(reservationId, true);
        this.reservedIndexes = new StoredU32Array(RESERVATION_INDEXES, reservationId);
        this.reservedValues = new StoredU128Array(RESERVATION_AMOUNTS, reservationId);
        this.reservedPriority = new StoredU8Array(RESERVATION_PRIORITY, reservationId);
    }

    public static generateId(token: Address, owner: Address): Uint8Array {
        const writer: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer.writeAddress(token);
        writer.writeAddress(owner);

        const hash: Uint8Array = ripemd160(writer.getBuffer());

        // only use the first 16 bytes (fit 128 bits)
        // this is a design choice. the odds that two ACTIVE reservations have the same ID is 1 in 2^128
        return hash.slice(0, 16);
    }

    public static load(reservationId: u128): Reservation {
        return new Reservation(Address.dead(), Address.dead(), reservationId.toUint8Array(true));
    }

    public addProvider(providerData: ReservationProviderData): void {
        this.reservedIndexes.push(providerData.providerIndex);
        this.reservedValues.push(providerData.providedAmount);
        this.reservedPriority.push(<u8>providerData.providerType);
    }

    public delete(isTimeout: boolean): void {
        this.reservedIndexes.reset();
        this.reservedValues.reset();
        this.reservedPriority.reset();
        this.reservationData.reset(isTimeout);

        this.save();
    }

    public ensureCanBeConsumed(): void {
        if (!this.isValid()) {
            throw new Revert('No valid reservation for this address.');
        }

        if (this.getActivationDelay() === 0) {
            if (this.getCreationBlock() === Blockchain.block.number) {
                throw new Revert('Reservation cannot be consumed in the same block');
            }
        } else {
            if (this.getCreationBlock() + this.getActivationDelay() > Blockchain.block.number) {
                throw new Revert(
                    `Too early to consume reservation: (${this.getCreationBlock()}, ${this.getActivationDelay()})`,
                );
            }
        }
    }

    public getActivationDelay(): u8 {
        return this.reservationData.activationDelay;
    }

    public getCreationBlock(): u64 {
        return this.reservationData.creationBlock;
    }

    public getExpirationBlock(): u64 {
        return this.reservationData.expirationBlock;
    }

    public getId(): u128 {
        return this.id;
    }

    public getProviderAt(index: u32): ReservationProviderData {
        return new ReservationProviderData(
            this.reservedIndexes.get(index),
            this.reservedValues.get(index),
            this.reservedPriority.get(index),
            this.getCreationBlock(),
        );
    }

    public getProviderCount(): u32 {
        return this.reservedIndexes.getLength();
    }

    public getPurged(): boolean {
        return this.reservationData.purged;
    }

    public getPurgeIndex(): u32 {
        return this.reservationData.purgeIndex;
    }

    public getSwapped(): boolean {
        return this.reservationData.swapped;
    }

    public getUserTimeoutBlockExpiration(): u64 {
        return this.reservationData.userTimeoutExpirationBlock;
    }

    public isDirty(): boolean {
        return this.reservedIndexes.getLength() > 0;
    }

    public isExpired(): boolean {
        return Blockchain.block.number > this.reservationData.expirationBlock;
    }

    public isValid(): boolean {
        return !this.isExpired() && this.reservedIndexes.getLength() > 0;
    }

    public save(): void {
        this.reservationData.save();
        this.reservedIndexes.save();
        this.reservedValues.save();
        this.reservedPriority.save();
    }

    public setActivationDelay(value: u8): void {
        this.reservationData.activationDelay = value;
    }

    public setCreationBlock(value: u64): void {
        this.reservationData.creationBlock = value;
    }

    public setPurged(value: boolean): void {
        this.reservationData.purged = value;
    }

    public setPurgeIndex(index: u32): void {
        this.reservationData.purgeIndex = index;
    }

    public setSwapped(value: boolean): void {
        this.reservationData.swapped = value;
    }

    public timeoutUser(): void {
        this.reservationData.timeout = true;
    }

    public toString(): string {
        return `Reservation ${this.getId().toString()} (getExpirationBlock: ${this.getExpirationBlock()} - block: ${Blockchain.block.number} - index length: ${this.reservedIndexes.getLength()})`;
    }
}
