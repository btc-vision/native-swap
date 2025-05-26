import { u256 } from '@btc-vision/as-bignum/assembly';

export interface ILiquidityQueueReserve {
    readonly availableLiquidity: u256;
    liquidity: u256;
    readonly reservedLiquidity: u256;
    totalSatoshisExchangedForTokens: u64;
    totalTokensExchangedForSatoshis: u256;
    totalTokensSellActivated: u256;
    virtualSatoshisReserve: u64;
    virtualTokenReserve: u256;

    addToTotalReserve(value: u256): void;

    addToTotalReserved(value: u256): void;

    addToTotalSatoshisExchangedForTokens(value: u64): void;

    addToTotalTokensExchangedForSatoshis(value: u256): void;

    addToTotalTokensSellActivated(value: u256): void;

    addToVirtualSatoshisReserve(value: u64): void;

    addToVirtualTokenReserve(value: u256): void;

    subFromTotalReserve(value: u256): void;

    subFromTotalReserved(value: u256): void;

    subFromVirtualSatoshisReserve(value: u64): void;

    subFromVirtualTokenReserve(value: u256): void;
}
