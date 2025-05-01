import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath, StoredU256 } from '@btc-vision/btc-runtime/runtime';
import { VOLATILITY_POINTER } from '../constants/StoredPointers';
import { IDynamicFee } from './interfaces/IDynamicFee';

const REF_TRADE_SIZE: u256 = u256.fromU64(200_000);

export class DynamicFee implements IDynamicFee {
    public baseFeeBP: u64; // 20 => 0.20%
    public minFeeBP: u64; // 15 => 0.15%
    public maxFeeBP: u64; // 150 => 1.50%

    public alpha: u64; // used for ln(tradeSize/reference)
    public beta: u64; // used for volatility
    public gamma: u64; // used for utilization

    // store volatility in scaled form
    private readonly _volatility: StoredU256;

    constructor(tokenId: Uint8Array) {
        this.baseFeeBP = 20; // 0.20%
        this.minFeeBP = 15; // 0.15%
        this.maxFeeBP = 150; // 1.50%

        this.alpha = 20; // bigger => stronger log effect
        this.beta = 15;
        this.gamma = 3;

        this._volatility = new StoredU256(VOLATILITY_POINTER, tokenId);
    }

    public get volatility(): u256 {
        return this._volatility.value;
    }

    public set volatility(vol: u256) {
        this._volatility.value = vol;
    }

    /**
     * The "log-based" dynamic fee formula:
     * Fee% = clamp(
     *   baseFeeBP
     *   + alpha * ln( tradeSize / REF_TRADE_SIZE )
     *   + beta * volatility
     *   + gamma * utilization,
     *   minFeeBP,
     *   maxFeeBP
     * )
     *
     * We'll do everything in integer BPS, so final is e.g. 30 => 0.30%.
     *
     * Because SafeMath.log256(...) returns a scaled ln (1e6 => ln * 1,000,000),
     * we must decode that carefully to keep it consistent with alpha.
     */
    public getDynamicFeeBP(tradeSize: u256, utilizationRatio: u256): u64 {
        let feeBP = this.baseFeeBP;

        let ratio = SafeMath.div(tradeSize, REF_TRADE_SIZE);

        if (ratio.isZero()) {
            ratio = u256.One;
        }

        const logScaled: u256 = SafeMath.approxLog(ratio);

        const alphaComponent: u64 = (this.alpha * logScaled.toU64()) / 1_000_000;

        feeBP += alphaComponent;

        const volBP: u64 = this.volatility.toU64();
        feeBP += (this.beta * volBP) / 10000;

        const utilBP: u64 = utilizationRatio.toU64();
        feeBP += (this.gamma * utilBP) / 10;

        if (feeBP < this.minFeeBP) {
            feeBP = this.minFeeBP;
        }

        if (feeBP > this.maxFeeBP) {
            feeBP = this.maxFeeBP;
        }

        return feeBP;
    }

    /**
     * Convert basis points to an actual token or satoshi fee
     * e.g. fee = (amount * feeBP) / 10000
     */
    public computeFeeAmount(amount: u256, feeBP: u64): u256 {
        return SafeMath.div(SafeMath.mul(amount, u256.fromU64(feeBP)), u256.fromU64(10000));
    }
}
