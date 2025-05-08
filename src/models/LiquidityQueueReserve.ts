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
    private readonly _deltaTokensAdd: StoredU256;
    private readonly _deltaSatoshisBuy: StoredU64;
    private readonly _deltaTokensBuy: StoredU256;

    constructor(token: Address, tokenIdUint8Array: Uint8Array) {
        this.tokenId = u256.fromBytes(token, true);
        this._virtualSatoshisReserve = new StoredU64(
            LIQUIDITY_VIRTUAL_BTC_POINTER,
            tokenIdUint8Array,
        );
        this._virtualTokenReserve = new StoredU256(LIQUIDITY_VIRTUAL_T_POINTER, tokenIdUint8Array);
        this._deltaTokensAdd = new StoredU256(DELTA_TOKENS_ADD, tokenIdUint8Array);
        this._deltaSatoshisBuy = new StoredU64(DELTA_BTC_BUY, tokenIdUint8Array);
        this._deltaTokensBuy = new StoredU256(DELTA_TOKENS_BUY, tokenIdUint8Array);
        this._totalReserves = new StoredMapU256(TOTAL_RESERVES_POINTER);
        this._totalReserved = new StoredMapU256(LIQUIDITY_RESERVED_POINTER);
    }

    public get availableLiquidity(): u256 {
        return SafeMath.sub(this.liquidity, this.reservedLiquidity);
    }

    public get deltaTokensAdd(): u256 {
        return this._deltaTokensAdd.value;
    }

    public set deltaTokensAdd(value: u256) {
        this._deltaTokensAdd.value = value;
    }

    public get deltaSatoshisBuy(): u64 {
        return this._deltaSatoshisBuy.get(0);
    }

    public set deltaSatoshisBuy(value: u64) {
        this._deltaSatoshisBuy.set(0, value);
        this._deltaSatoshisBuy.save();
    }

    public get deltaTokensBuy(): u256 {
        return this._deltaTokensBuy.value;
    }

    public set deltaTokensBuy(value: u256) {
        this._deltaTokensBuy.value = value;
    }

    public get liquidity(): u256 {
        return this._totalReserves.get(this.tokenId) || u256.Zero;
    }

    public get reservedLiquidity(): u256 {
        return this._totalReserved.get(this.tokenId) || u256.Zero;
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

    public addToDeltaSatoshisBuy(value: u64): void {
        this.deltaSatoshisBuy = SafeMath.add64(this.deltaSatoshisBuy, value);
    }

    public addToDeltaTokensAdd(value: u256): void {
        this.deltaTokensAdd = SafeMath.add(this.deltaTokensAdd, value);
    }

    public addToDeltaTokensBuy(value: u256): void {
        this.deltaTokensBuy = SafeMath.add(this.deltaTokensBuy, value);
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
