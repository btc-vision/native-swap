import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    Revert,
    StoredU128Array,
    StoredU256Array,
    StoredU32Array,
} from '@btc-vision/btc-runtime/runtime';
import {
    RESERVATION_AMOUNTS,
    RESERVATION_DATA_POINTER,
    RESERVATION_FILL_PRICES,
    RESERVATION_PROVIDER_IDS,
    RESERVATION_TICKS,
} from '../constants/StoredPointers';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ripemd160 } from '@btc-vision/btc-runtime/runtime/env/global';
import { ReservationData } from './ReservationData';
import { ReservationProviderData } from './ReservationProdiverData';

/**
 * A reservation captures one buyer's intent to purchase tokens against a list of
 * providers, recording the FROZEN per-provider fill quote at reserve time. Settlement
 * (in `TradeManager`) uses these stored entries; there is no live global quote.
 *
 * Storage layout (four parallel arrays keyed by `reservationId`):
 *   - `reservedProviderIds: StoredU256Array`  — providerId per entry (RESERVATION_PROVIDER_IDS)
 *   - `reservedAmounts:    StoredU128Array`   — token base units reserved per entry (RESERVATION_AMOUNTS)
 *   - `reservedTicks:      StoredU32Array`    — i32 ticks (two's-complement) per entry (RESERVATION_TICKS)
 *   - `reservedFillPrices: StoredU128Array`   — Q40.88 sats per base unit per entry (RESERVATION_FILL_PRICES)
 *
 * Plus `ReservationData` (`RESERVATION_DATA_POINTER`) holding metadata: activation delay,
 * creation block, expiration block, swapped/purged flags, etc.
 */
export class Reservation {
    private reservationData: ReservationData;
    private reservedProviderIds: StoredU256Array;
    private reservedAmounts: StoredU128Array;
    private reservedTicks: StoredU32Array;
    private reservedFillPrices: StoredU128Array;
    private readonly id: u128;

    /**
     * @constructor
     * @param {Address} token         - The token this reservation targets.
     * @param {Address} owner         - The reservation owner (buyer).
     * @param {Uint8Array} reservationId - Optional pre-computed reservation id; defaults to ripemd160(token||owner).
     */
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
        this.reservedProviderIds = new StoredU256Array(RESERVATION_PROVIDER_IDS, reservationId);
        this.reservedAmounts = new StoredU128Array(RESERVATION_AMOUNTS, reservationId);
        this.reservedTicks = new StoredU32Array(RESERVATION_TICKS, reservationId);
        this.reservedFillPrices = new StoredU128Array(RESERVATION_FILL_PRICES, reservationId);
    }

    /**
     * @method generateId
     * @description Deterministic reservation id = first 16 bytes of `ripemd160(token || owner)`.
     * The 1-in-2^128 collision risk for *active* reservations is acceptable.
     */
    public static generateId(token: Address, owner: Address): Uint8Array {
        const writer: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer.writeAddress(token);
        writer.writeAddress(owner);

        const hash: Uint8Array = ripemd160(writer.getBuffer());
        return hash.slice(0, 16);
    }

    /**
     * @method load
     * @description Reconstruct a reservation from its u128 id alone (used during purge).
     */
    public static load(reservationId: u128): Reservation {
        return new Reservation(Address.zero(), Address.zero(), reservationId.toUint8Array(true));
    }

    /**
     * @method addProvider
     * @description Append a per-provider entry. All four parallel arrays are pushed in lockstep.
     */
    public addProvider(providerData: ReservationProviderData): void {
        this.reservedProviderIds.push(providerData.providerId);
        this.reservedAmounts.push(providerData.providedAmount);
        // i32 → u32 reinterpret (two's-complement) so negative ticks round-trip cleanly
        this.reservedTicks.push(<u32>providerData.tick);
        this.reservedFillPrices.push(providerData.fillPrice);
    }

    /**
     * @method delete
     * @description Wipe all per-entry arrays and reset the metadata. Called on swap completion
     * and on purge.
     *
     * @param {boolean} isTimeout - whether to flag the user with a post-expiration timeout.
     */
    public delete(isTimeout: boolean): void {
        this.reservedProviderIds.reset();
        this.reservedAmounts.reset();
        this.reservedTicks.reset();
        this.reservedFillPrices.reset();
        this.reservationData.reset(isTimeout);
        this.save();
    }

    /**
     * @method ensureCanBeConsumed
     * @description Pre-condition check used by `SwapOperation`: the reservation must be valid
     * (non-expired, has entries) AND past its activation delay.
     */
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

    public getActivationDelay(): u8 { return this.reservationData.activationDelay; }
    public getCreationBlock(): u64 { return this.reservationData.creationBlock; }
    public getExpirationBlock(): u64 { return this.reservationData.expirationBlock; }
    public getId(): u128 { return this.id; }

    /**
     * @method getProviderAt
     * @description Materialize a `ReservationProviderData` from the parallel storage arrays.
     */
    public getProviderAt(index: u32): ReservationProviderData {
        return new ReservationProviderData(
            this.reservedProviderIds.get(index),
            this.reservedAmounts.get(index),
            <i32>this.reservedTicks.get(index), // u32 → i32 reinterpret
            this.reservedFillPrices.get(index),
            this.getCreationBlock(),
        );
    }

    public getProviderCount(): u32 { return this.reservedProviderIds.getLength(); }

    public getPurged(): boolean { return this.reservationData.purged; }
    public getPurgeIndex(): u32 { return this.reservationData.purgeIndex; }
    public getSwapped(): boolean { return this.reservationData.swapped; }
    public getUserTimeoutBlockExpiration(): u64 { return this.reservationData.userTimeoutExpirationBlock; }

    public isDirty(): boolean { return this.reservedProviderIds.getLength() > 0; }
    public isExpired(): boolean { return Blockchain.block.number > this.reservationData.expirationBlock; }
    public isValid(): boolean { return !this.isExpired() && this.reservedProviderIds.getLength() > 0; }

    public save(): void {
        this.reservationData.save();
        this.reservedProviderIds.save();
        this.reservedAmounts.save();
        this.reservedTicks.save();
        this.reservedFillPrices.save();
    }

    public setActivationDelay(value: u8): void { this.reservationData.activationDelay = value; }
    public setCreationBlock(value: u64): void { this.reservationData.creationBlock = value; }
    public setPurged(value: boolean): void { this.reservationData.purged = value; }
    public setPurgeIndex(index: u32): void { this.reservationData.purgeIndex = index; }
    public setSwapped(value: boolean): void { this.reservationData.swapped = value; }
    public timeoutUser(): void { this.reservationData.timeout = true; }

    public toString(): string {
        return `Reservation ${this.getId().toString()} (expirationBlock: ${this.getExpirationBlock()} - block: ${Blockchain.block.number} - entries: ${this.reservedProviderIds.getLength()})`;
    }
}
