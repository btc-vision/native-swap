import { StoredU256Array } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum';
import { LIQUIDITY_QUOTE_HISTORY_POINTER } from '../constants/StoredPointers';
import { IQuoteManager } from './interfaces/IQuoteManager';

export class QuoteManager implements IQuoteManager {
    private readonly _quoteHistory: StoredU256Array;

    constructor(tokenIdUint8Array: Uint8Array) {
        this._quoteHistory = new StoredU256Array(
            LIQUIDITY_QUOTE_HISTORY_POINTER,
            tokenIdUint8Array,
        );
    }

    public getBlockQuote(blockNumber: u64): u256 {
        return this._quoteHistory.get(blockNumber);
    }

    public setBlockQuote(blockNumber: u64, value: u256): void {
        this._quoteHistory.set(blockNumber, value);
    }

    public save(): void {
        this._quoteHistory.save();
    }
}
