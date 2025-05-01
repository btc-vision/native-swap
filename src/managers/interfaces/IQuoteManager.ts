import { u256 } from '@btc-vision/as-bignum/assembly';

export interface IQuoteManager {
    /**
     * Retrieves the stored quote for a given block.
     * @param {u64} blockNumber — the block height at which the quote was saved
     * @returns {u256} - the quote recorded at that block
     */
    getBlockQuote(blockNumber: u64): u256;

    /**
     * Stores the quote for the current block.
     * @param {u64} blockNumber — the block height at which the quote was saved
     * @param {u256} value — the quote
     * @returns {void}
     */
    setBlockQuote(blockNumber: u64, value: u256): void;

    /**
     * Persists any in-memory changes to storage.
     * @returns {void}
     */
    save(): void;
}
