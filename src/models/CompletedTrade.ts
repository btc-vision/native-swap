import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';

export class CompletedTrade {
    constructor(
        public readonly totalTokensReserved: u256,
        public readonly totalTokensPurchased: u256,
        public readonly totalSatoshisSpent: u256,
        public readonly totalRefundedBTC: u256,
        public readonly totalTokensRefunded: u256,
    ) {}

    public getTotalTokensPurchased(): u256 {
        return SafeMath.add(this.totalTokensPurchased, this.totalTokensRefunded);
    }

    public getTotalSatoshisSpent(): u256 {
        return SafeMath.add(this.totalSatoshisSpent, this.totalRefundedBTC);
    }
}
