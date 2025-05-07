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
import { u256 } from '@btc-vision/as-bignum';
import { ILiquidityQueueReserve } from '../managers/interfaces/ILiquidityQueueReserve';

export class LiquidityQueueReserve implements ILiquidityQueueReserve {
    private readonly tokenId: u256;
    private readonly _virtualBTCReserve: StoredU256;
    private readonly _virtualTokenReserve: StoredU256;
    private readonly _totalReserves: StoredMapU256;
    private readonly _totalReserved: StoredMapU256;
    private readonly _deltaTokensAdd: StoredU256;
    private readonly _deltaBTCBuy: StoredU64;
    private readonly _deltaTokensBuy: StoredU256;

    constructor(token: Address, tokenIdUint8Array: Uint8Array) {
        this.tokenId = u256.fromBytes(token, true);
        this._virtualBTCReserve = new StoredU256(LIQUIDITY_VIRTUAL_BTC_POINTER, tokenIdUint8Array);
        this._virtualTokenReserve = new StoredU256(LIQUIDITY_VIRTUAL_T_POINTER, tokenIdUint8Array);
        this._deltaTokensAdd = new StoredU256(DELTA_TOKENS_ADD, tokenIdUint8Array);
        this._deltaBTCBuy = new StoredU64(DELTA_BTC_BUY, tokenIdUint8Array);
        this._deltaTokensBuy = new StoredU256(DELTA_TOKENS_BUY, tokenIdUint8Array);
        this._totalReserves = new StoredMapU256(TOTAL_RESERVES_POINTER);
        this._totalReserved = new StoredMapU256(LIQUIDITY_RESERVED_POINTER);
    }

    public get virtualBTCReserve(): u256 {
        return this._virtualBTCReserve.value;
    }

    public set virtualBTCReserve(value: u256) {
        this._virtualBTCReserve.value = value;
    }

    public get virtualTokenReserve(): u256 {
        return this._virtualTokenReserve.value;
    }

    public set virtualTokenReserve(value: u256) {
        this._virtualTokenReserve.value = value;
    }

    public get deltaTokensAdd(): u256 {
        return this._deltaTokensAdd.value;
    }

    public set deltaTokensAdd(value: u256) {
        this._deltaTokensAdd.value = value;
    }

    public get deltaBTCBuy(): u64 {
        return this._deltaBTCBuy.get(0);
    }

    public set deltaBTCBuy(value: u64) {
        this._deltaBTCBuy.set(0, value);
        this._deltaBTCBuy.save();
    }

    public get deltaTokensBuy(): u256 {
        return this._deltaTokensBuy.value;
    }

    public set deltaTokensBuy(value: u256) {
        this._deltaTokensBuy.value = value;
    }

    public get availableLiquidity(): u256 {
        return SafeMath.sub(this.liquidity, this.reservedLiquidity);
    }

    public get reservedLiquidity(): u256 {
        return this._totalReserved.get(this.tokenId) || u256.Zero;
    }

    public get liquidity(): u256 {
        return this._totalReserves.get(this.tokenId) || u256.Zero;
    }

    public addToVirtualBTCReserve(value: u256): void {
        this.virtualBTCReserve = SafeMath.add(this.virtualBTCReserve, value);
    }

    public subFromVirtualBTCReserve(value: u256): void {
        this.virtualBTCReserve = SafeMath.sub(this.virtualBTCReserve, value);
    }

    public addToVirtualTokenReserve(value: u256): void {
        this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, value);
    }

    public subFromVirtualTokenReserve(value: u256): void {
        this.virtualTokenReserve = SafeMath.sub(this.virtualTokenReserve, value);
    }

    public addToTotalReserve(value: u256): void {
        const currentReserve: u256 = this._totalReserves.get(this.tokenId);
        const newReserve: u256 = SafeMath.add(currentReserve, value);
        this._totalReserves.set(this.tokenId, newReserve);
    }

    public subFromTotalReserve(value: u256): void {
        const currentReserve: u256 = this._totalReserves.get(this.tokenId);
        const newReserve: u256 = SafeMath.sub(currentReserve, value);
        this._totalReserves.set(this.tokenId, newReserve);
    }

    public addToTotalReserved(value: u256): void {
        const currentReserved: u256 = this._totalReserved.get(this.tokenId);
        const newReserved: u256 = SafeMath.add(currentReserved, value);
        this._totalReserved.set(this.tokenId, newReserved);
    }

    public subFromTotalReserved(value: u256): void {
        const currentReserved: u256 = this._totalReserved.get(this.tokenId);
        const newReserved: u256 = SafeMath.sub(currentReserved, value);
        this._totalReserved.set(this.tokenId, newReserved);
    }

    public addToDeltaTokensAdd(value: u256): void {
        this.deltaTokensAdd = SafeMath.add(this.deltaTokensAdd, value);
    }

    public addToDeltaTokensBuy(value: u256): void {
        this.deltaTokensBuy = SafeMath.add(this.deltaTokensBuy, value);
    }

    public addToDeltaBTCBuy(value: u64): void {
        this.deltaBTCBuy = SafeMath.add64(this.deltaBTCBuy, value);
    }
}
