import { u256 } from '@btc-vision/as-bignum/assembly';

export class CompletedTrade {
    constructor(
        public readonly totalTokensReserved: u256,
        public readonly totalTokensPurchased: u256,
        public readonly totalSatoshisSpent: u256,
        public readonly totalRefundedBTC: u256,
        public readonly totalTokensRefunded: u256,
    ) {}
}
