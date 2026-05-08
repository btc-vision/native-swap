import { Address, SafeMath, StoredMapU256 } from '@btc-vision/btc-runtime/runtime';
import {
    LIQUIDITY_RESERVED_POINTER,
    TOTAL_RESERVES_POINTER,
} from '../constants/StoredPointers';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { ILiquidityQueueReserve } from '../managers/interfaces/ILiquidityQueueReserve';

/**
 * Liquidity bookkeeping per token. Two storage-backed counters:
 *   - `liquidity`         (TOTAL_RESERVES_POINTER, keyed by tokenId)
 *   - `reservedLiquidity` (LIQUIDITY_RESERVED_POINTER, keyed by tokenId)
 *
 * Invariant: `liquidity = sum(provider.liquidityAmount for all providers of this token)`.
 * This holds because every `+=` to a provider's liquidity goes through `addToTotalReserve`,
 * and every `-=` (settlement, fee, withdraw) goes through `subFromTotalReserve`.
 *
 * Virtual reserves and exchange totals from the old AMM design are gone.
 */
export class LiquidityQueueReserve implements ILiquidityQueueReserve {
    private readonly tokenId: u256;
    private readonly _totalReserves: StoredMapU256;
    private readonly _totalReserved: StoredMapU256;

    constructor(token: Address, _tokenIdUint8Array: Uint8Array) {
        this.tokenId = u256.fromBytes(token, true);
        this._totalReserves = new StoredMapU256(TOTAL_RESERVES_POINTER);
        this._totalReserved = new StoredMapU256(LIQUIDITY_RESERVED_POINTER);
    }

    /** Tokens not currently locked by any active reservation. */
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

    public addToTotalReserve(value: u256): void {
        const currentReserve: u256 = this._totalReserves.get(this.tokenId);
        this._totalReserves.set(this.tokenId, SafeMath.add(currentReserve, value));
    }

    public addToTotalReserved(value: u256): void {
        const currentReserved: u256 = this._totalReserved.get(this.tokenId);
        this._totalReserved.set(this.tokenId, SafeMath.add(currentReserved, value));
    }

    public subFromTotalReserve(value: u256): void {
        const currentReserve: u256 = this._totalReserves.get(this.tokenId);
        this._totalReserves.set(this.tokenId, SafeMath.sub(currentReserve, value));
    }

    public subFromTotalReserved(value: u256): void {
        const currentReserved: u256 = this._totalReserved.get(this.tokenId);
        this._totalReserved.set(this.tokenId, SafeMath.sub(currentReserved, value));
    }
}
