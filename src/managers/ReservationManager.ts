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
import {
    ALLOW_DIRTY,
    PURGE_AT_LEAST_X_PROVIDERS,
    RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
} from '../constants/Contract';
import { Provider } from '../models/Provider';
import { ProviderTypes } from '../types/ProviderTypes';
import { IProviderManager } from './interfaces/IProviderManager';
import { tokensToSatoshis128 } from '../utils/SatoshisConversion';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { min64 } from '../utils/MathUtils';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { IOwedBTCManager } from './interfaces/IOwedBTCManager';

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
    private readonly quoteManager: IQuoteManager;
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;
    private readonly owedBTCManager: IOwedBTCManager;

    constructor(
        token: Address,
        tokenIdUint8Array: Uint8Array,
        providerManager: IProviderManager,
        quoteManager: IQuoteManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
        owedBTCManager: IOwedBTCManager,
    ) {
        this.token = token;
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.providerManager = providerManager;
        this.quoteManager = quoteManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.owedBTCManager = owedBTCManager;
        this.blocksWithReservations = new StoredU64Array(
            BLOCKS_WITH_RESERVATIONS_POINTER,
            tokenIdUint8Array,
        );
    }

    public addActiveReservation(blockNumber: u64, reservationId: u128): u32 {
        const reservationIndex: u32 = this.addToList(blockNumber, reservationId);
        const reservationActiveIndex: u32 = this.addToActiveList(blockNumber);

        this.ensureReservedIndexMatch(reservationIndex, reservationActiveIndex);
        this.pushBlockIfNotExists(blockNumber);

        return reservationIndex;
    }

    public getActiveReservationListForBlock(blockNumber: u64): StoredBooleanArray {
        const writer: BytesWriter = new BytesWriter(
            U64_BYTE_LENGTH + this.tokenIdUint8Array.length,
        );
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes: Uint8Array = writer.getBuffer();
        return new StoredBooleanArray(ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes);
    }

    public getReservationListForBlock(blockNumber: u64): StoredU128Array {
        const writer: BytesWriter = new BytesWriter(
            U64_BYTE_LENGTH + this.tokenIdUint8Array.length,
        );
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes: Uint8Array = writer.getBuffer();
        return new StoredU128Array(RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes);
    }

    public getReservationActiveAtIndex(blockNumber: u64, index: u32): boolean {
        const activeReservationList: StoredBooleanArray =
            this.getActiveReservationListForBlock(blockNumber);

        return activeReservationList.get(index) ? true : false;
    }

    public getReservationIdAtIndex(blockNumber: u64, index: u32): u128 {
        const reservationList: StoredU128Array = this.getReservationListForBlock(blockNumber);

        return reservationList.get(index);
    }

    public getReservationWithExpirationChecks(sender: Address): Reservation {
        const reservation: Reservation = new Reservation(this.token, sender);
        reservation.ensureCanBeConsumed();

        return reservation;
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
        let touched = false;

        while (
            this.blocksWithReservations.getLength() > 0 &&
            providersPurged < PURGE_AT_LEAST_X_PROVIDERS
        ) {
            const blockNumber = this.blocksWithReservations.get(0);

            if (blockNumber >= maxBlockToPurge) {
                break;
            }

            const remaining = PURGE_AT_LEAST_X_PROVIDERS - providersPurged;
            const purgeResult: PurgedResult = this.purgeBlockIncremental(blockNumber, remaining);

            providersPurged += purgeResult.providersPurged;
            freed = SafeMath.add(freed, purgeResult.freed);

            if (purgeResult.providersPurged > 0) {
                touched = true;
            }

            if (!purgeResult.finished) {
                break;
            }

            this.blocksWithReservations.shift();
        }

        this.blocksWithReservations.save();
        this.providerManager.cleanUpQueues();

        if (touched) {
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

    protected addToActiveList(blockNumber: u64): u32 {
        const reservationActiveList: StoredBooleanArray =
            this.getActiveReservationListForBlock(blockNumber);

        const index: u32 = reservationActiveList.push(true);
        reservationActiveList.save();

        return index;
    }

    protected addToList(blockNumber: u64, reservationId: u128): u32 {
        const reservationList: StoredU128Array = this.getReservationListForBlock(blockNumber);

        const index: u32 = reservationList.push(reservationId);
        reservationList.save();

        return index;
    }

    private ensureRemovalTypeIsValid(queueType: ProviderTypes, provider: Provider): void {
        if (queueType === ProviderTypes.LiquidityRemoval && !provider.isPendingRemoval()) {
            throw new Revert(
                'Impossible state: provider is in removal queue but is not flagged pendingRemoval.',
            );
        }

        if (queueType !== ProviderTypes.LiquidityRemoval && provider.isPendingRemoval()) {
            throw new Revert(
                'Impossible state: provider is flagged pendingRemoval but is not in removal queue',
            );
        }
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

    private ensureReservedAmountValid(provider: Provider, reservedAmount: u128): void {
        if (u128.lt(provider.getReservedAmount(), reservedAmount)) {
            throw new Revert('Impossible state: reserved amount bigger than provider reserved.');
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

    private purgeAndRestoreProvider(provider: Provider, reservedAmount: u128): void {
        provider.subtractFromReservedAmount(reservedAmount);

        //!!!!const availableLiquidity = provider.getAvailableLiquidityAmount();

        /*if (
            u256.lt(availableLiquidity.toU256(), STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)
        ) {
            this.providerManager.resetProvider(provider, false);
        }*/

        this.providerManager.resetProvider(provider, false, false);

        if (!provider.isPurged()) {
            if (provider.getProviderType() === ProviderTypes.Normal) {
                this.providerManager.addToNormalPurgedQueue(provider);
            } else {
                this.providerManager.addToPriorityPurgedQueue(provider);
            }
        }
    }

    private purgeAndRestoreProviderRemovalQueue(
        provider: Provider,
        reservedAmount: u128,
        createdAt: u64,
    ): void {
        //!!!! Roll over block createdAt
        const quote: u256 = this.quoteManager.getValidBlockQuote(createdAt);
        const reservedAmountSatoshis: u64 = tokensToSatoshis128(reservedAmount, quote);
        const actualReservedSatoshis: u64 = this.owedBTCManager.getSatoshisOwedReserved(
            provider.getId(),
        );
        const revertSatoshis: u64 = min64(reservedAmountSatoshis, actualReservedSatoshis);
        const newOwedReserved: u64 = SafeMath.sub64(actualReservedSatoshis, revertSatoshis);

        this.owedBTCManager.setSatoshisOwedReserved(provider.getId(), newOwedReserved);

        // !!!! This is very important that a provider with active liquidity CAN NOT BE A REMOVAL PROVIDER AT THE SAME TIME. OR THIS CHECK WILL FAIL.
        // Should be ok with this
        if (!provider.isRemovalPurged()) {
            this.providerManager.addToRemovalPurgedQueue(provider);
        }
    }

    private purgeBlockIncremental(blockNumber: u64, budgetProviders: u32): PurgedResult {
        const reservations = this.getReservationListForBlock(blockNumber);
        const active = this.getActiveReservationListForBlock(blockNumber);
        const reservationsLength: u32 = reservations.getLength();

        let index: u32 = this.readPurgeCursor(blockNumber);
        let providersPurged: u32 = 0;
        let freed: u256 = u256.Zero;

        while (index < reservationsLength && providersPurged < budgetProviders) {
            if (!active.get(index)) {
                index++;
                continue;
            }

            const resId = reservations.get(index);
            const reservation = Reservation.load(resId);

            this.ensureReservationIsExpired(reservation);

            // TODO!!!!!: We need to track if a reservation was purged in the reservation itself
            //  so someone can not reserve again if his reservation was not purged yet.

            this.ensureReservationPurgeIndexMatch(reservation, index);

            // full reservation purge
            const freedHere = this.restoreReservation(reservation);
            freed = SafeMath.add(freed, freedHere);

            providersPurged += reservation.getProviderCount();

            active.set(index, false);
            index++;
        }

        active.save();

        const finished = index >= reservationsLength;
        if (finished) {
            reservations.reset();
            active.reset();
            this.writePurgeCursor(blockNumber, 0);
        } else {
            this.writePurgeCursor(blockNumber, index);
        }

        return new PurgedResult(freed, providersPurged, finished);
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
            const providerReservationData: ReservationProviderData =
                reservation.getProviderAt(index);

            const provider: Provider = this.providerManager.getProviderFromQueue(
                providerReservationData.providerIndex,
                providerReservationData.providerType,
            );

            this.ensureRemovalTypeIsValid(providerReservationData.providerType, provider);

            if (provider.isPendingRemoval() && providerReservationData.isLiquidityRemoval()) {
                this.purgeAndRestoreProviderRemovalQueue(
                    provider,
                    providerReservationData.providedAmount,
                    reservation.getCreationBlock(),
                );
            } else {
                this.ensureReservedAmountValid(provider, providerReservationData.providedAmount);
                this.purgeAndRestoreProvider(provider, providerReservationData.providedAmount);
            }

            restoredLiquidity = SafeMath.add(
                restoredLiquidity,
                providerReservationData.providedAmount.toU256(),
            );
        }

        // TODO!!!!: VERY IMPORTANT: Make sure that removing the delete does not cause critical issues.

        if (!ALLOW_DIRTY) {
            reservation.delete(true);
        } else {
            // TODO!!!: Check if we can omit reset and just timeout the user, then, once
            //  a new reservation is made, if dirty, we reset it before setting the new values.
            reservation.timeoutUser();
        }

        return restoredLiquidity;
    }

    private writePurgeCursor(blockNumber: u64, index: u32): void {
        const s = this.getPurgeIndexStore(blockNumber);
        s.set(0, index);
        s.save();
    }
}
