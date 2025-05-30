import { Revert, StoredU256Array } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { LIQUIDITY_QUOTE_HISTORY_POINTER } from '../constants/StoredPointers';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { MAXIMUM_QUOTE_INDEX } from '../constants/Contract';

export class QuoteManager implements IQuoteManager {
    private readonly _quoteHistory: StoredU256Array;

    constructor(tokenIdUint8Array: Uint8Array) {
        this._quoteHistory = new StoredU256Array(
            LIQUIDITY_QUOTE_HISTORY_POINTER,
            tokenIdUint8Array,
        );
    }

    /**
     * Retrieves the stored quote for a given block.
     * @param {u64} blockNumber — the block height at which the quote was saved
     * @returns {u256} - the quote recorded at that block
     */
    public getBlockQuote(blockNumber: u64): u256 {
        const blockNumberU32: u32 = <u32>(blockNumber % MAXIMUM_QUOTE_INDEX);

        return this._quoteHistory.get(blockNumberU32);
    }

    /**
     * Retrieves the stored quote for a given block. If the quote is Zero the functions throw.
     * @param {u64} blockNumber — the block height at which the quote was saved
     * @returns {u256} - the quote recorded at that block
     */
    public getValidBlockQuote(blockNumber: u64): u256 {
        const quote: u256 = this.getBlockQuote(blockNumber);
        this.ensureQuoteIsValid(quote, blockNumber);

        return quote;
    }

    /**
     * Stores the quote for the current block.
     * @param {u64} blockNumber — the block height at which the quote was saved
     * @param {u256} value — the quote
     * @returns {void}
     */
    public setBlockQuote(blockNumber: u64, value: u256): void {
        const blockNumberU32: u32 = <u32>(blockNumber % MAXIMUM_QUOTE_INDEX);
        const currentQuote: u256 = this._quoteHistory.get(blockNumberU32);

        if (!u256.eq(currentQuote, value)) {
            this._quoteHistory.set(blockNumberU32, value);
        }
    }

    /**
     * Persists any in-memory changes to storage.
     * @returns {void}
     */
    public save(): void {
        this._quoteHistory.save();
    }

    /**
     * Ensure the quote is not 0. If the quote is 0, Revert.
     * @param {u256} quote — the quote
     * @param {u64} blockNumber — the block number at which the quote was saved
     * @returns {void}
     */
    private ensureQuoteIsValid(quote: u256, blockNumber: u64): void {
        if (quote.isZero()) {
            throw new Revert(
                `Impossible state: Quote at reservation is zero for block number: ${blockNumber}`,
            );
        }
    }
}
