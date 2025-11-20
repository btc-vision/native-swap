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
import { EMIT_PURGE_EVENTS, RESERVATION_EXPIRE_AFTER_IN_BLOCKS } from '../constants/Contract';
import { IProviderManager } from './interfaces/IProviderManager';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { ReservationPurgedEvent } from '../events/ReservationPurgedEvent';

export class PurgedResult {
    constructor(
        public readonly freed: u256,
        public readonly providersPurged: u32,
        public readonly finished: bool,
    ) {}
}

export class ReservationManager implements IReservationManager {
    protected readonly blocksWithReservations: StoredU64Array;
    protected readonly tokenIdUint8Array: Uint8Array;
    protected atLeastProvidersToPurge: u32;
    private readonly token: Address;
    private readonly providerManager: IProviderManager;
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;

    constructor(
        token: Address,
        tokenIdUint8Array: Uint8Array,
        providerManager: IProviderManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        atLeastProvidersToPurge: u32,
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
    }

    public addReservation(blockNumber: u64, reservation: Reservation): void {
        const reservationIndex: u32 = this.pushToReservationList(blockNumber, reservation.getId());
        const reservationActiveIndex: u32 = this.pushToActiveList(blockNumber);

        this.ensureReservedIndexMatch(reservationIndex, reservationActiveIndex);
        this.pushBlockIfNotExists(blockNumber);

        reservation.setPurgeIndex(reservationIndex);
        reservation.save();
    }

    public blockWithReservationsLength(): u32 {
        return this.blocksWithReservations.getLength();
    }

    public deactivateReservation(reservation: Reservation): void {
        const reservationActiveList = this.getActiveListForBlock(reservation.getCreationBlock());
        reservationActiveList.set(reservation.getPurgeIndex(), false);
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

        return !!activeReservationList.get(index);
    }

    public purgeReservationsAndRestoreProviders(lastPurgedBlock: u64, currentQuote: u256): u64 {
        const currentBlockNumber: u64 = Blockchain.block.number;

        if (currentBlockNumber <= RESERVATION_EXPIRE_AFTER_IN_BLOCKS) {
            return lastPurgedBlock;
        }

        const maxBlockToPurge: u64 = currentBlockNumber - RESERVATION_EXPIRE_AFTER_IN_BLOCKS;
        if (maxBlockToPurge <= lastPurgedBlock) {
            this.providerManager.restoreCurrentIndex();
            return lastPurgedBlock;
        }

        if (this.blocksWithReservations.getLength() === 0) {
            this.providerManager.restoreCurrentIndex();
            return maxBlockToPurge;
        }

        let freed: u256 = u256.Zero;
        let providersPurged: u32 = 0;
        let touched = false; // deleted at least one reservation
        let shifted = false; // dropped at least one whole block

        while (
            this.blocksWithReservations.getLength() > 0 &&
            providersPurged < this.atLeastProvidersToPurge
        ) {
            const blk = this.blocksWithReservations.get(0);

            // block must be strictly older than the grace window
            if (blk >= maxBlockToPurge) {
                break;
            }

            const budget: u32 = this.atLeastProvidersToPurge - providersPurged;
            const res: PurgedResult = this.purgeBlockIncremental(blk, budget, currentQuote);

            providersPurged += res.providersPurged;
            freed = SafeMath.add(freed, res.freed);
            touched = touched || res.providersPurged > 0;

            if (res.finished) {
                this.blocksWithReservations.shift();
                shifted = true;
                continue;
            }

            if (res.providersPurged === 0) {
                // nothing more to do this round
                break;
            }
        }

        if (shifted || touched) {
            this.blocksWithReservations.save();
        }

        this.providerManager.cleanUpQueues(currentQuote);

        if (touched) {
            this.liquidityQueueReserve.subFromTotalReserved(freed);
            this.providerManager.resetStartingIndex();
        } else {
            this.providerManager.restoreCurrentIndex();
        }

        let newLastPurgedBlock: u64 = lastPurgedBlock;
        if (shifted) {
            if (this.blocksWithReservations.getLength() === 0) {
                newLastPurgedBlock = maxBlockToPurge; // queue empty
            } else {
                const head = this.blocksWithReservations.get(0); // > maxBlock
                newLastPurgedBlock = head > 0 ? head - 1 : 0; // under-flow guard
            }
        }

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

    private purgeBlockIncremental(
        blockNumber: u64,
        nbProvidersToPurge: u32,
        quote: u256,
    ): PurgedResult {
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

                const providerCount: u32 = reservation.getProviderCount();
                const freed: u256 = this.restoreReservation(reservation, providerCount, quote);
                totalFreed = SafeMath.add(totalFreed, freed);
                totalProvidersPurged += providerCount;

                actives.set(index, false);

                if (EMIT_PURGE_EVENTS) {
                    Blockchain.emit(
                        new ReservationPurgedEvent(
                            reservationId,
                            index,
                            Blockchain.block.number,
                            blockNumber,
                            providerCount,
                            freed,
                        ),
                    );
                }
            }

            index++;
        }

        actives.save();

        const finished = index >= reservationsLength;
        if (finished) {
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

    private restoreReservation(reservation: Reservation, providerCount: u32, quote: u256): u256 {
        let restoredLiquidity: u256 = u256.Zero;

        for (let index: u32 = 0; index < providerCount; index++) {
            const data: ReservationProviderData = reservation.getProviderAt(index);

            this.providerManager.purgeAndRestoreProvider(data, quote);

            restoredLiquidity = SafeMath.add(restoredLiquidity, data.providedAmount.toU256());
        }

        reservation.setPurged(true);
        reservation.timeoutUser();
        reservation.save();

        return restoredLiquidity;
    }

    private writePurgeCursor(blockNumber: u64, index: u32): void {
        const purgeIndexStore = this.getPurgeIndexStore(blockNumber);
        purgeIndexStore.set(0, index);
        purgeIndexStore.save();
    }
}
