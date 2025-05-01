import { u256 } from '@btc-vision/as-bignum';

export interface ILiquidityQueueReserve {
    virtualBTCReserve: u256;
    virtualTokenReserve: u256;
    deltaTokensAdd: u256;
    deltaBTCBuy: u256;
    deltaTokensBuy: u256;
    readonly availableLiquidity: u256;
    readonly reservedLiquidity: u256;
    readonly liquidity: u256;

    addToVirtualBTCReserve(value: u256): void;

    subFromVirtualBTCReserve(value: u256): void;

    addToVirtualTokenReserve(value: u256): void;

    subVirtualTokenReserve(value: u256): void;

    addToTotalReserve(value: u256): void;

    subFromTotalReserve(value: u256): void;

    addToTotalReserved(value: u256): void;

    subFromTotalReserved(value: u256): void;

    addToDeltaTokensAdd(value: u256): void;

    addToDeltaTokensBuy(value: u256): void;

    addToDeltaBTCBuy(value: u256): void;
}
