import { u256 } from '@btc-vision/as-bignum/assembly';

export interface IQuoteManager {
    getBlockQuote(blockNumber: u64): u256;

    getValidBlockQuote(blockNumber: u64): u256;

    setBlockQuote(blockNumber: u64, value: u256): void;

    save(): void;
}
