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
    StoredU64Array,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum';
import {
    ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER,
    BLOCKS_WITH_RESERVATIONS_POINTER,
    RESERVATION_IDS_BY_BLOCK_POINTER,
} from '../constants/StoredPointers';
import {
    RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT,
} from '../constants/Contract';
import { Provider } from '../models/Provider';
import { ProviderTypes } from '../types/ProviderTypes';
import { IProviderManager } from './interfaces/IProviderManager';
import { tokensToSatoshis } from '../utils/SatoshisConversion';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';

export class ReservationManager implements IReservationManager {
    private readonly token: Address;
    private readonly tokenIdUint8Array: Uint8Array;
    private readonly blocksWithReservations: StoredU64Array;
    private readonly providerManager: IProviderManager;
    private readonly quoteManager: IQuoteManager;
    private readonly liquidityQueueReserve: ILiquidityQueueReserve;

    constructor(
        token: Address,
        tokenIdUint8Array: Uint8Array,
        providerManager: IProviderManager,
        quoteManager: IQuoteManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
    ) {
        this.token = token;
        this.tokenIdUint8Array = tokenIdUint8Array;
        this.providerManager = providerManager;
        this.quoteManager = quoteManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
        this.blocksWithReservations = new StoredU64Array(
            BLOCKS_WITH_RESERVATIONS_POINTER,
            tokenIdUint8Array,
        );
    }

    public getReservationWithExpirationChecks(sender: Address): Reservation {
        const reservation = new Reservation(this.token, sender);
        reservation.ensureCanBeConsumed();

        return reservation;
    }

    public addActiveReservation(blockNumber: u64, reservationId: u128): u64 {
        const reservationIndex = this.addToList(blockNumber, reservationId);
        const reservationActiveIndex = this.addToActiveList(blockNumber);

        this.ensureReservedIndexMatch(reservationIndex, reservationActiveIndex);
        this.pushBlockIfNotExists(blockNumber);

        return reservationIndex;
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

        const totalFreed = this.purgeBlocksWithReservations(maxBlockToPurge);

        if (!totalFreed.isZero()) {
            this.liquidityQueueReserve.subFromTotalReserved(totalFreed);
            this.providerManager.resetStartingIndex();
        } else {
            this.providerManager.restoreCurrentIndex();
        }

        return maxBlockToPurge;
    }

    private addToList(blockNumber: u64, reservationId: u128): u64 {
        const reservationList = this.getReservationListForBlock(blockNumber);
        reservationList.push(reservationId);
        reservationList.save();

        return reservationList.getLength() - 1;
    }

    private addToActiveList(blockNumber: u64): u64 {
        const reservationActiveList = this.getActiveReservationListForBlock(blockNumber);
        reservationActiveList.push(true);
        reservationActiveList.save();

        return reservationActiveList.getLength() - 1;
    }

    private getReservationListForBlock(blockNumber: u64): StoredU128Array {
        const writer = new BytesWriter(U64_BYTE_LENGTH + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes = writer.getBuffer();
        return new StoredU128Array(RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes);
    }

    private getActiveReservationListForBlock(blockNumber: u64): StoredBooleanArray {
        const writer = new BytesWriter(U64_BYTE_LENGTH + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes = writer.getBuffer();
        return new StoredBooleanArray(ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes);
    }

    private pushBlockIfNotExists(blockNumber: u64): void {
        const length = this.blocksWithReservations.getLength();

        if (length > 0) {
            const lastBlock = this.blocksWithReservations.get(length - 1);

            if (lastBlock !== blockNumber) {
                this.blocksWithReservations.push(blockNumber);
                this.blocksWithReservations.save();
            }
        }
    }

    private purgeBlock(blockNumber: u64): u256 {
        const reservationList = this.getReservationListForBlock(blockNumber);
        const activeIds = this.getActiveReservationListForBlock(blockNumber);

        const length = reservationList.getLength();
        let totalFreed = u256.Zero;

        for (let index: u64 = 0; index < length; index++) {
            if (activeIds.get(index)) {
                const reservationId = reservationList.get(index);
                const reservation = Reservation.load(reservationId);
                const purgeIndex = reservation.getPurgeIndex();

                this.ensureReservationPurgeIndexMatch(reservation.getId(), purgeIndex, index);
                this.ensureReservationIsExpired(reservation);

                const freedAmount = this.restoreReservation(reservation);
                totalFreed = SafeMath.add(totalFreed, freedAmount);
            }
        }

        reservationList.reset();
        activeIds.reset();

        return totalFreed;
    }

    private restoreReservation(reservation: Reservation): u256 {
        let restoredLiquidity: u256 = u256.Zero;
        const providerCount = reservation.getProviderCount();

        for (let index = 0; index < providerCount; index++) {
            const providerReservationData = reservation.getProviderAt(index);

            const provider: Provider = this.providerManager.getProviderFromQueue(
                providerReservationData.providerIndex,
                providerReservationData.providerType,
            );

            this.ensureRemovalTypeIsValid(providerReservationData.providerType, provider);

            if (
                provider.isPendingRemoval() &&
                providerReservationData.providerType === ProviderTypes.LiquidityRemoval
            ) {
                this.purgeAndRestoreProviderRemovalQueue(
                    provider.getId(),
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

        reservation.delete(true);

        return restoredLiquidity;
    }

    private purgeAndRestoreProviderRemovalQueue(
        providerId: u256,
        reservedAmount: u128,
        createdAt: u64,
    ): void {
        const quote = this.quoteManager.getValidBlockQuote(createdAt);
        const costInSats = tokensToSatoshis(reservedAmount.toU256(), quote);
        const wasReservedSats = this.providerManager.getBTCowedReserved(providerId);
        const revertSats = SafeMath.min(costInSats, wasReservedSats);
        const newOwedReserved = SafeMath.sub(wasReservedSats, revertSats);

        this.providerManager.setBTCowedReserved(providerId, newOwedReserved);
    }

    private purgeAndRestoreProvider(provider: Provider, reservedAmount: u128): void {
        provider.subtractFromReservedAmount(reservedAmount);

        const availableLiquidity = provider.getAvailableLiquidityAmount();

        //!!! Is availableLiquidity satoshis???
        if (
            u256.lt(availableLiquidity.toU256(), STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT)
        ) {
            this.providerManager.resetProvider(provider, false);
        }
    }

    private purgeBlocksWithReservations(maxBlockToPurge: u64): u256 {
        let totalFreed: u256 = u256.Zero;
        const length = this.blocksWithReservations.getLength();

        let count: u64 = 0;
        for (let index: u64 = 0; index < length; index++) {
            const blockNumber = this.blocksWithReservations.get(index);

            if (blockNumber >= maxBlockToPurge) {
                break;
            }

            const freed = this.purgeBlock(blockNumber);

            if (!freed.isZero()) {
                totalFreed = SafeMath.add(totalFreed, freed);
            }

            count++;
        }

        for (
            let index: u64 = 0;
            index < count && this.blocksWithReservations.getLength() > 0;
            index++
        ) {
            this.blocksWithReservations.shift();
        }

        this.blocksWithReservations.save();

        return totalFreed;
    }

    private ensureReservationPurgeIndexMatch(
        reservationId: u128,
        reservationPurgeIndex: u64,
        currentIndex: u64,
    ): void {
        if (reservationPurgeIndex !== currentIndex) {
            throw new Revert(
                `Impossible state: reservation ${reservationId} purge index mismatch (expected: ${currentIndex}, actual: ${reservationPurgeIndex})`,
            );
        }
    }

    private ensureReservationIsExpired(reservation: Reservation): void {
        if (!reservation.isExpired()) {
            throw new Revert(`Impossible state: Reservation still active during purge`);
        }
    }

    private ensureRemovalTypeIsValid(queueType: ProviderTypes, provider: Provider): void {
        if (queueType === ProviderTypes.LiquidityRemoval && !provider.isPendingRemoval()) {
            throw new Revert(
                'Impossible state: provider is in removal queue but is not flagged pendingRemoval',
            );
        }

        if (queueType !== ProviderTypes.LiquidityRemoval && provider.isPendingRemoval()) {
            throw new Revert(
                'Impossible state: provider is flagged pendingRemoval but is not in removal queue',
            );
        }
    }

    private ensureReservedAmountValid(provider: Provider, reservedAmount: u128): void {
        if (u128.lt(provider.getReservedAmount(), reservedAmount)) {
            throw new Revert('Impossible state: reserved amount bigger than provider reserved');
        }
    }

    private ensureReservedIndexMatch(reservationIndex: u64, reservationActiveIndex: u64): void {
        if (reservationIndex !== reservationActiveIndex) {
            throw new Revert('Impossible state: Reservation index mismatch');
        }
    }
}
