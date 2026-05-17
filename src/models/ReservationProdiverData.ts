import { u128, u256 } from '@btc-vision/as-bignum/assembly';

/**
 * One per-provider entry inside a `Reservation`. Captures the *frozen* fill quote
 * for that provider — settlement uses these stored values, not a live global quote.
 *
 * Fields:
 *   - providerId        : direct u256 ID (no more index-into-queue lookups)
 *   - providedAmount    : token base units reserved from this provider
 *   - tick              : the tick at which the provider was sitting when reserved
 *   - fillPrice         : Q40.88 sats per base unit at that tick (frozen at reserve time)
 *   - creationBlock     : reservation creation block (for purge cursor / event payloads)
 *
 * No `providerType` — priority is gone. No `providerIndex` — we store providerId directly.
 */
export class ReservationProviderData {
    constructor(
        public readonly providerId: u256,
        public readonly providedAmount: u128,
        public readonly tick: i32,
        public readonly fillPrice: u128,
        public readonly creationBlock: u64,
    ) {}
}
