import { u256 } from '@btc-vision/as-bignum/assembly';

/**
 * Tracks the contract's liquidity bookkeeping for a single token:
 *   - `liquidity`        : total tokens custodied by the contract for this token
 *   - `reservedLiquidity`: tokens currently locked behind active reservations
 *   - `availableLiquidity` = liquidity - reservedLiquidity
 *
 * Virtual reserves and exchange totals (the AMM machinery) are gone in NativeSwap.
 */
export interface ILiquidityQueueReserve {
    readonly availableLiquidity: u256;
    liquidity: u256;
    readonly reservedLiquidity: u256;

    addToTotalReserve(value: u256): void;
    addToTotalReserved(value: u256): void;
    subFromTotalReserve(value: u256): void;
    subFromTotalReserved(value: u256): void;
}
