import { ProviderTypes } from '../types/ProviderTypes';
import { u128 } from '@btc-vision/as-bignum/assembly';

export class ReservationProviderData {
    constructor(
        public readonly providerIndex: u64,
        public readonly providedAmount: u128,
        public readonly providerType: ProviderTypes,
    ) {}
}
