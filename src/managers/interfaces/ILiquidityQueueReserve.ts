import { u256 } from '@btc-vision/as-bignum/assembly';

export interface ILiquidityQueueReserve {
    readonly availableLiquidity: u256;
    deltaSatoshisBuy: u64;
    deltaTokensAdd: u256;
    deltaTokensBuy: u256;
    readonly liquidity: u256;
    readonly reservedLiquidity: u256;
    virtualSatoshisReserve: u64;
    virtualTokenReserve: u256;

    addToDeltaSatoshisBuy(value: u64): void;

    addToDeltaTokensAdd(value: u256): void;

    addToDeltaTokensBuy(value: u256): void;

    addToTotalReserve(value: u256): void;

    addToTotalReserved(value: u256): void;

    addToVirtualSatoshisReserve(value: u64): void;

    addToVirtualTokenReserve(value: u256): void;

    subFromTotalReserve(value: u256): void;

    subFromTotalReserved(value: u256): void;

    subFromVirtualSatoshisReserve(value: u64): void;

    subFromVirtualTokenReserve(value: u256): void;
}
