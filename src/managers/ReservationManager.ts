import { IReservationManager } from './interfaces/IReservationManager';
import { Reservation } from '../models/Reservation';
import {
    Address,
    Blockchain,
    BytesWriter,
    Revert,
    SafeMath,
    StoredBooleanArray,
    StoredU128Array,
    StoredU32,
    StoredU64Array,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER,
    BLOCKS_WITH_RESERVATIONS_POINTER,
    PURGE_RESERVATION_INDEX_POINTER,
    RESERVATION_IDS_BY_BLOCK_POINTER,
} from '../constants/StoredPointers';
import { RESERVATION_EXPIRE_AFTER_IN_BLOCKS } from '../constants/Contract';
import { IProviderManager } from './interfaces/IProviderManager';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { ReservationProviderData } from '../models/ReservationProdiverData';

class PurgedResult {
    constructor(
        public readonly freed: u256,
        public readonly providersPurged: u32,
        public readonly finished: bool,
    ) {}
}

export class ReservationManager implements IReservationManager {
    protected readonly blocksWithReservations: StoredU64Array;
    protected readonly tokenIdUint8Array: Uint8Array;
    private readonly token: Address;
    private readonly providerManager: IProviderManager;
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;
    private readonly atLeastProvidersToPurge: u32;
    private readonly allowDirty: boolean;

    constructor(
        token: Address,
        tokenIdUint8Array: Uint8Array,
        providerManager: IProviderManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        atLeastProvidersToPurge: u32,
        allowDirty: boolean,
    ) {
        this.token = token;
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.providerManager = providerManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.blocksWithReservations = new StoredU64Array(
            BLOCKS_WITH_RESERVATIONS_POINTER,
            tokenIdUint8Array,
        );
        this.atLeastProvidersToPurge = atLeastProvidersToPurge;
        this.allowDirty = allowDirty;
    }

    public addReservation(blockNumber: u64, reservation: Reservation): void {
        const reservationIndex: u32 = this.pushToReservationList(blockNumber, reservation.getId());
        const reservationActiveIndex: u32 = this.pushToActiveList(blockNumber);

        this.ensureReservedIndexMatch(reservationIndex, reservationActiveIndex);
        this.pushBlockIfNotExists(blockNumber);

        reservation.setPurgeIndex(reservationIndex);
        reservation.save();
    }

    public deactivateReservation(reservation: Reservation): void {
        const reservationActiveList = this.getActiveListForBlock(reservation.getCreationBlock());

        reservationActiveList.delete(reservation.getPurgeIndex());
        reservationActiveList.save();
    }

    public getReservationIdAtIndex(blockNumber: u64, index: u32): u128 {
        const reservationList: StoredU128Array = this.getReservationListForBlock(blockNumber);

        return reservationList.get(index);
    }

    public getReservationWithExpirationChecks(owner: Address): Reservation {
        const reservation: Reservation = new Reservation(this.token, owner);
        reservation.ensureCanBeConsumed();

        return reservation;
    }

    public isReservationActiveAtIndex(blockNumber: u64, index: u32): boolean {
        const activeReservationList: StoredBooleanArray = this.getActiveListForBlock(blockNumber);

        return activeReservationList.get(index) ? true : false;
    }

    public purgeReservationsAndRestoreProviders(lastPurgedBlock: u64): u64 {
        const currentBlockNumber: u64 = Blockchain.block.number;

        if (RESERVATION_EXPIRE_AFTER_IN_BLOCKS > currentBlockNumber) {
            return lastPurgedBlock;
        }

        const maxBlockToPurge: u64 = currentBlockNumber - RESERVATION_EXPIRE_AFTER_IN_BLOCKS;

        if (maxBlockToPurge <= lastPurgedBlock) {
            this.providerManager.restoreCurrentIndex();
            return lastPurgedBlock;
        }

        let freed: u256 = u256.Zero;
        let providersPurged: u32 = 0;

        while (
            this.blocksWithReservations.getLength() > 0 &&
            providersPurged < this.atLeastProvidersToPurge
        ) {
            const blockNumber: u64 = this.blocksWithReservations.get(0);

            if (blockNumber >= maxBlockToPurge) {
                break;
            }

            const remaining: u32 = this.atLeastProvidersToPurge - providersPurged;
            const purgeResult: PurgedResult = this.purgeBlockIncremental(blockNumber, remaining);

            providersPurged += purgeResult.providersPurged;
            freed = SafeMath.add(freed, purgeResult.freed);

            if (!purgeResult.finished) {
                break;
            }

            this.blocksWithReservations.shift();
        }

        this.blocksWithReservations.save();
        this.providerManager.cleanUpQueues();

        if (providersPurged > 0) {
            this.liquidityQueueReserve.subFromTotalReserved(freed);
            this.providerManager.resetStartingIndex();
        } else {
            this.providerManager.restoreCurrentIndex();
        }

        const newLastPurgedBlock: u64 =
            this.blocksWithReservations.getLength() > 0
                ? this.blocksWithReservations.get(0) - 1
                : maxBlockToPurge;

        return newLastPurgedBlock;
    }

    protected getActiveListForBlock(blockNumber: u64): StoredBooleanArray {
        const writer: BytesWriter = new BytesWriter(
            U64_BYTE_LENGTH + this.tokenIdUint8Array.length,
        );
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes: Uint8Array = writer.getBuffer();
        return new StoredBooleanArray(ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes);
    }

    protected getReservationListForBlock(blockNumber: u64): StoredU128Array {
        const writer: BytesWriter = new BytesWriter(
            U64_BYTE_LENGTH + this.tokenIdUint8Array.length,
        );

        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes: Uint8Array = writer.getBuffer();
        return new StoredU128Array(RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes);
    }

    protected pushToActiveList(blockNumber: u64): u32 {
        const reservationActiveList: StoredBooleanArray = this.getActiveListForBlock(blockNumber);

        const index: u32 = reservationActiveList.push(true);
        reservationActiveList.save();

        return index;
    }

    protected pushToReservationList(blockNumber: u64, reservationId: u128): u32 {
        const reservationList: StoredU128Array = this.getReservationListForBlock(blockNumber);

        const index: u32 = reservationList.push(reservationId);
        reservationList.save();

        return index;
    }

    private ensureReservationIsExpired(reservation: Reservation): void {
        if (!reservation.isExpired()) {
            throw new Revert(`Impossible state: Reservation still active during purge.`);
        }
    }

    private ensureReservationPurgeIndexMatch(reservation: Reservation, currentIndex: u32): void {
        const purgeIndex: u32 = reservation.getPurgeIndex();

        if (purgeIndex !== currentIndex) {
            throw new Revert(
                `Impossible state: reservation ${reservation.getId()} purge index mismatch (expected: ${currentIndex}, actual: ${purgeIndex})`,
            );
        }
    }

    private ensureReservedIndexMatch(reservationIndex: u32, reservationActiveIndex: u32): void {
        if (reservationIndex !== reservationActiveIndex) {
            throw new Revert('Impossible state: Reservation index mismatch.');
        }
    }

    private getPurgeIndexStore(blockNumber: u64): StoredU32 {
        const writer = new BytesWriter(U64_BYTE_LENGTH + this.tokenIdUint8Array.length);

        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        return new StoredU32(PURGE_RESERVATION_INDEX_POINTER, writer.getBuffer());
    }

    private purgeBlockIncremental(blockNumber: u64, nbProvidersToPurge: u32): PurgedResult {
        const reservations = this.getReservationListForBlock(blockNumber);
        const actives = this.getActiveListForBlock(blockNumber);
        const reservationsLength: u32 = reservations.getLength();

        let index: u32 = this.readPurgeCursor(blockNumber);
        let totalProvidersPurged: u32 = 0;
        let totalFreed: u256 = u256.Zero;

        while (index < reservationsLength && totalProvidersPurged < nbProvidersToPurge) {
            if (actives.get(index)) {
                const reservationId: u128 = reservations.get(index);
                const reservation = Reservation.load(reservationId);

                this.ensureReservationIsExpired(reservation);
                this.ensureReservationPurgeIndexMatch(reservation, index);

                const freed: u256 = this.restoreReservation(reservation);
                totalFreed = SafeMath.add(totalFreed, freed);

                totalProvidersPurged += reservation.getProviderCount();

                actives.set(index, false);
            }

            index++;
        }

        actives.save();

        const finished = index >= reservationsLength;
        if (finished) {
            reservations.reset();
            actives.reset();
            this.writePurgeCursor(blockNumber, 0);
        } else {
            this.writePurgeCursor(blockNumber, index);
        }

        return new PurgedResult(totalFreed, totalProvidersPurged, finished);
    }

    private pushBlockIfNotExists(blockNumber: u64): void {
        let addBlock: boolean = true;
        const length: u32 = this.blocksWithReservations.getLength();

        if (length > 0) {
            addBlock = this.blocksWithReservations.get(length - 1) !== blockNumber;
        }

        if (addBlock) {
            this.blocksWithReservations.push(blockNumber);
            this.blocksWithReservations.save();
        }
    }

    private readPurgeCursor(blockNumber: u64): u32 {
        return this.getPurgeIndexStore(blockNumber).get(0);
    }

    private restoreReservation(reservation: Reservation): u256 {
        let restoredLiquidity: u256 = u256.Zero;
        const providerCount: u32 = reservation.getProviderCount();

        for (let index: u32 = 0; index < providerCount; index++) {
            const data: ReservationProviderData = reservation.getProviderAt(index);

            this.providerManager.purgeAndRestoreProvider(data);

            restoredLiquidity = SafeMath.add(restoredLiquidity, data.providedAmount.toU256());
        }

        // TODO!!!!: VERY IMPORTANT: Make sure that removing the delete does not cause critical issues.

        if (!this.allowDirty) {
            reservation.delete(true);
        } else {
            // TODO!!!: Check if we can omit reset and just timeout the user, then, once
            //  a new reservation is made, if dirty, we reset it before setting the new values.
            reservation.timeoutUser();
            reservation.save();
        }

        return restoredLiquidity;
    }

    private writePurgeCursor(blockNumber: u64, index: u32): void {
        const purgeIndexStore = this.getPurgeIndexStore(blockNumber);
        purgeIndexStore.set(0, index);
        purgeIndexStore.save();
    }
}
