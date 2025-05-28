import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Provider } from '../../models/Provider';
import { Reservation } from '../../models/Reservation';
import { Address } from '@btc-vision/btc-runtime/runtime';

export interface ILiquidityQueue {
    antiBotExpirationBlock: u64;
    readonly availableLiquidity: u256;
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
    totalSatoshisExchangedForTokens: u64;
    totalTokensExchangedForSatoshis: u256;
    totalTokensSellActivated: u256;
    virtualSatoshisReserve: u64;
    virtualTokenReserve: u256;

    accruePenalty(penalty: u128): void;

    addReservation(reservation: Reservation): void;

    addToNormalQueue(provider: Provider): void;

    addToPriorityQueue(provider: Provider): void;

    addToRemovalQueue(provider: Provider): void;

    buyTokens(tokensOut: u256, satoshisIn: u64): void;

    computeFees(totalTokensPurchased: u256, totalSatoshisSpent: u64): u256;

    decreaseTotalReserve(value: u256): void;

    decreaseTotalReserved(value: u256): void;

    decreaseVirtualSatoshisReserve(value: u64): void;

    decreaseVirtualTokenReserve(value: u256): void;

    distributeFee(totalFee: u256, stakingAddress: Address): void;

    isReservationActiveAtIndex(blockNumber: u64, index: u32): boolean;

    getSatoshisOwed(providerId: u256): u64;

    getSatoshisOwedLeft(providerId: u256): u64;

    getSatoshisOwedReserved(providerId: u256): u64;

    getMaximumTokensLeftBeforeCap(): u256;

    getNextProviderWithLiquidity(quote: u256): Provider | null;

    getReservationIdAtIndex(blockNumber: u64, index: u32): u128;

    getReservationWithExpirationChecks(): Reservation;

    getUtilizationRatio(): u256;

    hasEnoughLiquidityLeftProvider(provider: Provider, quote: u256): boolean;

    increaseSatoshisOwed(providerId: u256, value: u64): void;

    increaseSatoshisOwedReserved(providerId: u256, value: u64): void;

    increaseTotalSatoshisExchangedForTokens(value: u64): void;

    increaseTotalTokensExchangedForSatoshis(value: u256): void;

    increaseTotalTokensSellActivated(value: u256): void;

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

    purgeReservationsAndRestoreProviders(): void;

    quote(): u256;

    removeFromPurgeQueue(provider: Provider): void;

    removeFromRemovalPurgeQueue(provider: Provider): void;

    resetProvider(provider: Provider, burnRemainingFunds: boolean, canceled: boolean): void; //false,true

    save(): void;

    setBlockQuote(): void;

    setSatoshisOwed(providerId: u256, value: u64): void;

    setSatoshisOwedReserved(providerId: u256, value: u64): void;

    updateVirtualPoolIfNeeded(): void;
}
