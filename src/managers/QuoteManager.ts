import { Blockchain, Revert, StoredU256Array } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { LIQUIDITY_QUOTE_HISTORY_POINTER } from '../constants/StoredPointers';
import { IQuoteManager } from './interfaces/IQuoteManager';
import { MAXIMUM_VALID_INDEX } from '../constants/Contract';

export class QuoteManager implements IQuoteManager {
    private readonly _quoteHistory: StoredU256Array;

    constructor(tokenIdUint8Array: Uint8Array) {
        this._quoteHistory = new StoredU256Array(
            LIQUIDITY_QUOTE_HISTORY_POINTER,
            tokenIdUint8Array,
        );
    }

    public getBlockQuote(blockNumber: u64): u256 {
        if (blockNumber > <u64>MAXIMUM_VALID_INDEX) {
            throw new Revert('Impossible state: Block number too large for maximum array size.');
        }

        const blockNumberU32: u32 = <u32>Blockchain.block.number;
        return this._quoteHistory.get(blockNumberU32);
    }

    public getValidBlockQuote(blockNumber: u64): u256 {
        if (blockNumber > <u64>MAXIMUM_VALID_INDEX) {
            throw new Revert('Impossible state: Block number too large for maximum array size.');
        }

        const blockNumberU32: u32 = <u32>Blockchain.block.number;
        const quote: u256 = this._quoteHistory.get(blockNumberU32);
        this.ensureQuoteIsValid(quote, blockNumber);

        return quote;
    }

    public setBlockQuote(blockNumber: u64, value: u256): void {
        if (blockNumber > <u64>MAXIMUM_VALID_INDEX) {
            throw new Revert('Impossible state: Block number too large for maximum array size.');
        }

        const blockNumberU32: u32 = <u32>Blockchain.block.number;
        this._quoteHistory.set(blockNumberU32, value);
    }

    public save(): void {
        this._quoteHistory.save();
    }

    private ensureQuoteIsValid(quote: u256, blockNumber: u64): void {
        if (quote.isZero()) {
            throw new Revert(
                `Impossible state: Quote at reservation is zero for block number: ${blockNumber}`,
            );
        }
    }
}
