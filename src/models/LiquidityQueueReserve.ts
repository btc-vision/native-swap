import {
    Address,
    SafeMath,
    StoredMapU256,
    StoredU256,
    StoredU64,
} from '@btc-vision/btc-runtime/runtime';
import {
    DELTA_BTC_BUY,
    DELTA_TOKENS_ADD,
    DELTA_TOKENS_BUY,
    LIQUIDITY_RESERVED_POINTER,
    LIQUIDITY_VIRTUAL_BTC_POINTER,
    LIQUIDITY_VIRTUAL_T_POINTER,
    TOTAL_RESERVES_POINTER,
} from '../constants/StoredPointers';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { ILiquidityQueueReserve } from '../managers/interfaces/ILiquidityQueueReserve';

export class LiquidityQueueReserve implements ILiquidityQueueReserve {
    private readonly tokenId: u256;
    private readonly _virtualSatoshisReserve: StoredU64;
    private readonly _virtualTokenReserve: StoredU256;
    private readonly _totalReserves: StoredMapU256;
    private readonly _totalReserved: StoredMapU256;
    private readonly _totalTokensSellActivated: StoredU256;
    private readonly _totalSatoshisExchangedForTokens: StoredU64;
    private readonly _totalTokensExchangedForSatoshis: StoredU256;

    constructor(token: Address, tokenIdUint8Array: Uint8Array) {
        this.tokenId = u256.fromBytes(token, true);
        this._virtualSatoshisReserve = new StoredU64(
            LIQUIDITY_VIRTUAL_BTC_POINTER,
            tokenIdUint8Array,
        );
        this._virtualTokenReserve = new StoredU256(LIQUIDITY_VIRTUAL_T_POINTER, tokenIdUint8Array);
        this._totalTokensSellActivated = new StoredU256(DELTA_TOKENS_ADD, tokenIdUint8Array);
        this._totalSatoshisExchangedForTokens = new StoredU64(DELTA_BTC_BUY, tokenIdUint8Array);
        this._totalTokensExchangedForSatoshis = new StoredU256(DELTA_TOKENS_BUY, tokenIdUint8Array);
        this._totalReserves = new StoredMapU256(TOTAL_RESERVES_POINTER);
        this._totalReserved = new StoredMapU256(LIQUIDITY_RESERVED_POINTER);
    }

    public get availableLiquidity(): u256 {
        return SafeMath.sub(this.liquidity, this.reservedLiquidity);
    }

    public get liquidity(): u256 {
        return this._totalReserves.get(this.tokenId);
    }

    public set liquidity(value: u256) {
        this._totalReserves.set(this.tokenId, value);
    }

    public get reservedLiquidity(): u256 {
        return this._totalReserved.get(this.tokenId);
    }

    public get totalSatoshisExchangedForTokens(): u64 {
        return this._totalSatoshisExchangedForTokens.get(0);
    }

    public set totalSatoshisExchangedForTokens(value: u64) {
        this._totalSatoshisExchangedForTokens.set(0, value);
        this._totalSatoshisExchangedForTokens.save();
    }

    public get totalTokensExchangedForSatoshis(): u256 {
        return this._totalTokensExchangedForSatoshis.value;
    }

    public set totalTokensExchangedForSatoshis(value: u256) {
        this._totalTokensExchangedForSatoshis.value = value;
    }

    public get totalTokensSellActivated(): u256 {
        return this._totalTokensSellActivated.value;
    }

    public set totalTokensSellActivated(value: u256) {
        this._totalTokensSellActivated.value = value;
    }

    public get virtualSatoshisReserve(): u64 {
        return this._virtualSatoshisReserve.get(0);
    }

    public set virtualSatoshisReserve(value: u64) {
        this._virtualSatoshisReserve.set(0, value);
        this._virtualSatoshisReserve.save();
    }

    public get virtualTokenReserve(): u256 {
        return this._virtualTokenReserve.value;
    }

    public set virtualTokenReserve(value: u256) {
        this._virtualTokenReserve.value = value;
    }

    public addToTotalReserve(value: u256): void {
        const currentReserve: u256 = this._totalReserves.get(this.tokenId);
        const newReserve: u256 = SafeMath.add(currentReserve, value);
        this._totalReserves.set(this.tokenId, newReserve);
    }

    public addToTotalReserved(value: u256): void {
        const currentReserved: u256 = this._totalReserved.get(this.tokenId);
        const newReserved: u256 = SafeMath.add(currentReserved, value);
        this._totalReserved.set(this.tokenId, newReserved);
    }

    public addToTotalSatoshisExchangedForTokens(value: u64): void {
        this.totalSatoshisExchangedForTokens = SafeMath.add64(
            this.totalSatoshisExchangedForTokens,
            value,
        );
    }

    public addToTotalTokensExchangedForSatoshis(value: u256): void {
        this.totalTokensExchangedForSatoshis = SafeMath.add(
            this.totalTokensExchangedForSatoshis,
            value,
        );
    }

    public addToTotalTokensSellActivated(value: u256): void {
        this.totalTokensSellActivated = SafeMath.add(this.totalTokensSellActivated, value);
    }

    public addToVirtualSatoshisReserve(value: u64): void {
        this.virtualSatoshisReserve = SafeMath.add64(this.virtualSatoshisReserve, value);
    }

    public addToVirtualTokenReserve(value: u256): void {
        this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, value);
    }

    public subFromTotalReserve(value: u256): void {
        const currentReserve: u256 = this._totalReserves.get(this.tokenId);
        const newReserve: u256 = SafeMath.sub(currentReserve, value);
        this._totalReserves.set(this.tokenId, newReserve);
    }

    public subFromTotalReserved(value: u256): void {
        const currentReserved: u256 = this._totalReserved.get(this.tokenId);
        const newReserved: u256 = SafeMath.sub(currentReserved, value);
        this._totalReserved.set(this.tokenId, newReserved);
    }

    public subFromVirtualSatoshisReserve(value: u64): void {
        this.virtualSatoshisReserve = SafeMath.sub64(this.virtualSatoshisReserve, value);
    }

    public subFromVirtualTokenReserve(value: u256): void {
        this.virtualTokenReserve = SafeMath.sub(this.virtualTokenReserve, value);
    }
}
