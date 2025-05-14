import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    StoredU128Array,
    StoredU32Array,
    StoredU8Array,
} from '@btc-vision/btc-runtime/runtime';
import {
    RESERVATION_AMOUNTS,
    RESERVATION_ID_POINTER,
    RESERVATION_INDEXES,
    RESERVATION_PRIORITY,
} from './StoredPointers';
import { u128 } from '@btc-vision/as-bignum/assembly';
import { UserReservation } from '../data-types/UserReservation';
import { LiquidityQueue } from './Liquidity/LiquidityQueue';
import { ripemd160 } from '@btc-vision/btc-runtime/runtime/env/global';

export const NORMAL_TYPE: u8 = 0;
export const PRIORITY_TYPE: u8 = 1;
export const LIQUIDITY_REMOVAL_TYPE: u8 = 2;

export class Reservation {
    public reservedIndexes: StoredU32Array;
    public reservedValues: StoredU128Array;
    public reservedPriority: StoredU8Array;

    public reservationId: u128;
    public userReservation: UserReservation;

    public constructor(
        token: Address,
        owner: Address,
        reservationId: Uint8Array = new Uint8Array(0),
    ) {
        if (reservationId.length == 0) {
            reservationId = Reservation.generateId(token, owner);
        }

        this.userReservation = new UserReservation(RESERVATION_ID_POINTER, reservationId);
        this.reservationId = u128.fromBytes(reservationId, true);
        this.reservedIndexes = new StoredU32Array(RESERVATION_INDEXES, reservationId);
        this.reservedValues = new StoredU128Array(RESERVATION_AMOUNTS, reservationId);
        this.reservedPriority = new StoredU8Array(RESERVATION_PRIORITY, reservationId);
    }

    public get createdAt(): u64 {
        const block: u64 = this.expirationBlock();

        // No opnet transaction under block 100
        if (block <= LiquidityQueue.RESERVATION_EXPIRE_AFTER) {
            return 0;
        } else {
            return block - LiquidityQueue.RESERVATION_EXPIRE_AFTER;
        }
    }

    public get userTimeoutBlockExpiration(): u64 {
        return this.userReservation.getUserTimeoutBlockExpiration();
    }

    public get reservedLP(): bool {
        return this.userReservation.reservedForLiquidityPool;
    }

    public set reservedLP(value: bool) {
        this.userReservation.reservedForLiquidityPool = value;
    }

    public static load(reservationId: u128): Reservation {
        return new Reservation(Address.dead(), Address.dead(), reservationId.toUint8Array(true));
    }

    public static generateId(token: Address, owner: Address): Uint8Array {
        const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer.writeAddress(token);
        writer.writeAddress(owner);

        // only use the first 16 bytes (fit 128 bits)
        // this is a design choice. the odds that two ACTIVE reservations have the same ID is 1 in 2^128
        const hash = ripemd160(writer.getBuffer());
        return hash.slice(0, 16);
    }

    public setPurgeIndex(index: u32): void {
        this.userReservation.setPurgeIndex(index);
    }

    public getPurgeIndex(): u32 {
        return this.userReservation.getPurgeIndex();
    }

    public setActivationDelay(delay: u8): void {
        this.userReservation.setActivationDelay(delay);
    }

    public getActivationDelay(): u8 {
        return this.userReservation.getActivationDelay();
    }

    public timeout(): void {
        this.userReservation.timeout();
    }

    public isDirty(): bool {
        return this.reservedIndexes.getLength() > 0;
    }

    public save(): void {
        this.userReservation.save();
        this.reservedIndexes.save();
        this.reservedValues.save();
        this.reservedPriority.save();
    }

    public expired(): bool {
        return Blockchain.block.number > this.userReservation.getExpirationBlock();
    }

    public setExpirationBlock(block: u64): void {
        this.userReservation.setExpirationBlock(block);
    }

    public valid(): bool {
        return !this.expired() && this.reservedIndexes.getLength() > 0;
    }

    public expirationBlock(): u64 {
        return this.userReservation.getExpirationBlock();
    }

    public delete(isTimeout: boolean): void {
        this.reservedIndexes.reset();
        this.reservedValues.reset();
        this.reservedPriority.reset();
        this.userReservation.reset(isTimeout);

        this.save();
    }

    public reserveAtIndex(index: u32, amount: u128, type: u8): void {
        this.reservedIndexes.push(index);
        this.reservedValues.push(amount);
        this.reservedPriority.push(type);
    }

    public getQueueTypes(): u8[] {
        return this.reservedPriority.getAll(0, this.reservedPriority.getLength());
    }

    public getReservedIndexes(): u32[] {
        return this.reservedIndexes.getAll(0, this.reservedIndexes.getLength());
    }

    public getReservedValues(): u128[] {
        return this.reservedValues.getAll(0, this.reservedValues.getLength() as u32);
    }

    public toString(): string {
        return `Reservation ${this.reservationId.toString()} (getExpirationBlock: ${this.userReservation.getExpirationBlock()} - block: ${Blockchain.block.number} - index length: ${this.reservedIndexes.getLength()})`;
    }
}
