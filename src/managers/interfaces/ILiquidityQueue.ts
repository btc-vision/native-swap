import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../../models/Provider';
import { Reservation } from '../../models/Reservation';
import { Address } from '@btc-vision/btc-runtime/runtime';

export interface ILiquidityQueue {
    antiBotExpirationBlock: u64;
    readonly availableLiquidity: u256;
    deltaSatoshisBuy: u64;
    deltaTokensAdd: u256;
    deltaTokensBuy: u256;
    readonly feesEnabled: bool;
    initialLiquidityProviderId: u256;
    lastPurgedBlock: u64;
    lastVirtualUpdateBlock: u64;
    readonly liquidity: u256;
    maxReserves5BlockPercent: u64;
    maxTokensPerReservation: u256;
    readonly reservedLiquidity: u256;
    readonly timeOutEnabled: bool;
    token: Address;
    virtualSatoshisReserve: u64;
    virtualTokenReserve: u256;

    addActiveReservation(reservation: Reservation): u32;

    addToPriorityQueue(provider: Provider): void;

    addToRemovalQueue(provider: Provider): void;

    addToNormalQueue(provider: Provider): void;

    buyTokens(tokensOut: u256, satoshisIn: u64): void;

    cleanUpQueues(): void;

    computeFees(totalTokensPurchased: u256, totalSatoshisSpent: u64): u256;

    decreaseTotalReserve(value: u256): void;

    decreaseTotalReserved(value: u256): void;

    decreaseVirtualSatoshisReserve(value: u64): void;

    decreaseVirtualTokenReserve(value: u256): void;

    distributeFee(totalFee: u256, stakingAddress: Address): void;

    getBTCowed(providerId: u256): u64;

    getBTCOwedLeft(providerId: u256): u64;

    getBTCowedReserved(providerId: u256): u64;

    getMaximumTokensLeftBeforeCap(): u256;

    getNextProviderWithLiquidity(currentQuote: u256): Provider | null;

    getReservationWithExpirationChecks(): Reservation;

    getUtilizationRatio(): u256;

    increaseBTCowed(providerId: u256, value: u64): void;

    increaseBTCowedReserved(providerId: u256, value: u64): void;

    increaseDeltaSatoshisBuy(value: u64): void;

    increaseDeltaTokensAdd(value: u256): void;

    increaseDeltaTokensBuy(value: u256): void;

    increaseTotalReserve(value: u256): void;

    increaseTotalReserved(value: u256): void;

    increaseVirtualSatoshisReserve(value: u64): void;

    increaseVirtualTokenReserve(value: u256): void;

    initializeInitialLiquidity(
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u128,
        maxReserves5BlockPercent: u64,
    ): void;

    resetProvider(provider: Provider, burnRemainingFunds?: boolean, canceled?: boolean): void;

    quote(): u256;

    save(): void;

    setBlockQuote(): void;

    setBTCowed(providerId: u256, value: u64): void;

    setBTCowedReserved(providerId: u256, value: u64): void;

    updateVirtualPoolIfNeeded(): void;
}
