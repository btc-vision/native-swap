import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../../models/Provider';
import { Reservation } from '../../models/Reservation';
import { Address } from '@btc-vision/btc-runtime/runtime';

export interface ILiquidityQueue {
    token: Address;
    initialLiquidityProviderId: u256;
    virtualBTCReserve: u256;
    virtualTokenReserve: u256;
    deltaTokensAdd: u256;
    deltaBTCBuy: u256;
    deltaTokensBuy: u256;
    readonly availableLiquidity: u256;
    readonly reservedLiquidity: u256;
    readonly liquidity: u256;
    maxTokensPerReservation: u256;
    maxReserves5BlockPercent: u64;
    lastPurgedBlock: u64;
    antiBotExpirationBlock: u64;
    lastVirtualUpdateBlock: u64;
    readonly feesEnabled: bool;
    readonly timeOutEnabled: bool;

    resetProvider(provider: Provider, burnRemainingFunds?: boolean, canceled?: boolean): void;

    getNextProviderWithLiquidity(currentQuote: u256): Provider | null;

    computeFees(totalTokensPurchased: u256, totalSatoshisSpent: u256): u256;

    distributeFee(totalFee: u256, stakingAddress: Address): void;

    quote(): u256;

    getUtilizationRatio(): u256;

    getReservationWithExpirationChecks(): Reservation;

    addToPriorityQueue(provider: Provider): void;

    addToStandardQueue(provider: Provider): void;

    addToRemovalQueue(provider: Provider): void;

    cleanUpQueues(): void;

    addActiveReservation(blockNumber: u64, reservationId: u128): u32;

    initializeInitialLiquidity(
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u128,
        maxReserves5BlockPercent: u64,
    ): void;

    save(): void;

    getMaximumTokensLeftBeforeCap(): u256;

    updateVirtualPoolIfNeeded(): void;

    setBlockQuote(): void;

    increaseVirtualBTCReserve(value: u256): void;

    decreaseVirtualBTCReserve(value: u256): void;

    increaseVirtualTokenReserve(value: u256): void;

    decreaseVirtualTokenReserve(value: u256): void;

    increaseTotalReserve(value: u256): void;

    decreaseTotalReserve(value: u256): void;

    increaseTotalReserved(value: u256): void;

    decreaseTotalReserved(value: u256): void;

    increaseDeltaTokensAdd(value: u256): void;

    increaseDeltaTokensBuy(value: u256): void;

    increaseDeltaBTCBuy(value: u256): void;

    buyTokens(tokensOut: u256, satoshisIn: u256): void;

    getBTCowed(providerId: u256): u256;

    setBTCowed(providerId: u256, value: u256): void;

    increaseBTCowed(providerId: u256, value: u256): void;

    getBTCowedReserved(providerId: u256): u256;

    setBTCowedReserved(providerId: u256, value: u256): void;

    getBTCOwedLeft(providerId: u256): u256;
}
