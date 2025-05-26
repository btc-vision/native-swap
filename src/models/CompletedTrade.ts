import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';

export class CompletedTrade {
    constructor(
        public readonly totalTokensReserved: u256,
        public readonly totalTokensPurchased: u256,
        public readonly totalSatoshisSpent: u64,
        public readonly totalSatoshisRefunded: u64,
        public readonly totalTokensRefunded: u256,
    ) {}

    public getTotalTokensPurchased(): u256 {
        return SafeMath.add(this.totalTokensPurchased, this.totalTokensRefunded);
    }

    public getTotalSatoshisSpent(): u64 {
        return SafeMath.add64(this.totalSatoshisSpent, this.totalSatoshisRefunded);
    }
}
