import { u256 } from '@btc-vision/as-bignum/assembly';

export interface IDynamicFee {
    /** Base fee in basis points (e.g. 20 => 0.20%) */
    baseFeeBP: u64;
    /** Minimum allowed fee in basis points */
    minFeeBP: u64;
    /** Maximum allowed fee in basis points */
    maxFeeBP: u64;

    /** Log-scaling coefficient for trade size */
    alpha: u64;
    /** Volatility coefficient */
    beta: u64;
    /** Utilization coefficient */
    gamma: u64;

    /** Current volatility value (scaled) */
    volatility: u256;

    /**
     * Calculates the dynamic fee in basis points using:
     *  baseFeeBP
     *  + alpha * ln(tradeSize / REF_TRADE_SIZE)
     *  + beta * volatility
     *  + gamma * utilizationRatio
     * then clamps between minFeeBP and maxFeeBP.
     *
     * @param tradeSize — size of the trade in token units
     * @param utilizationRatio — current pool utilization ratio (0–100)
     * @returns fee in basis points
     */
    getDynamicFeeBP(tradeSize: u256, utilizationRatio: u256): u64;

    /**
     * Converts a fee (in basis points) into an absolute amount on a given value:
     *    feeAmount = amount * feeBP / 10000
     *
     * @param amount — base amount (tokens or satoshis)
     * @param feeBP — fee in basis points
     * @returns calculated fee amount
     */
    computeFeeAmount(amount: u256, feeBP: u64): u256;
}
