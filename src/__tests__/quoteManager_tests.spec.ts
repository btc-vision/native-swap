import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { QuoteManager } from '../managers/QuoteManager';
import { tokenIdUint8Array1 } from './test_helper';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { MAXIMUM_VALID_INDEX } from '../constants/Contract';

describe('QuoteManager tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('getBlockQuote returns 0 if unset', () => {
        const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
        expect(manager.getBlockQuote(100)).toStrictEqual(u256.Zero);
    });

    it('setBlockQuote stores the value', () => {
        const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
        manager.setBlockQuote(100, u256.fromU64(888));
        expect(manager.getBlockQuote(100)).toStrictEqual(u256.fromU64(888));
    });

    it('getBlockQuote throws if block > MAXIMUM_VALID_INDEX', () => {
        expect(() => {
            const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
            manager.getBlockQuote(MAXIMUM_VALID_INDEX + 1);
        }).toThrow();
    });

    it('getBlockQuote works at MAXIMUM_VALID_INDEX', () => {
        const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
        manager.setBlockQuote(MAXIMUM_VALID_INDEX, u256.fromU64(77));
        expect(manager.getBlockQuote(MAXIMUM_VALID_INDEX)).toStrictEqual(u256.fromU64(77));
    });

    it('setBlockQuote throws if block > MAXIMUM_VALID_INDEX', () => {
        expect(() => {
            const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
            manager.setBlockQuote(MAXIMUM_VALID_INDEX + 1, u256.fromU64(1));
        }).toThrow();
    });

    it('setBlockQuote works at MAXIMUM_VALID_INDEX', () => {
        const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
        manager.setBlockQuote(MAXIMUM_VALID_INDEX, u256.fromU64(55));
        expect(manager.getBlockQuote(MAXIMUM_VALID_INDEX)).toStrictEqual(u256.fromU64(55));
    });

    it('getValidBlockQuote returns correct value if quote is valid', () => {
        const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
        manager.setBlockQuote(123, u256.fromU64(999));
        expect(manager.getValidBlockQuote(123)).toStrictEqual(u256.fromU64(999));
    });

    it('getValidBlockQuote throws if quote is zero', () => {
        expect(() => {
            const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
            manager.getValidBlockQuote(123);
        }).toThrow();
    });

    it('getValidBlockQuote throws if block > MAXIMUM_VALID_INDEX', () => {
        expect(() => {
            const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
            manager.getValidBlockQuote(MAXIMUM_VALID_INDEX + 1);
        }).toThrow();
    });

    it('getValidBlockQuote returns valid quote at MAXIMUM_VALID_INDEX', () => {
        const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
        manager.setBlockQuote(MAXIMUM_VALID_INDEX, u256.fromU64(88));
        expect(manager.getValidBlockQuote(MAXIMUM_VALID_INDEX)).toStrictEqual(u256.fromU64(88));
    });

    it('save persists all values', () => {
        const manager: QuoteManager = new QuoteManager(tokenIdUint8Array1);
        manager.setBlockQuote(10, u256.fromU64(10));
        manager.setBlockQuote(MAXIMUM_VALID_INDEX, u256.fromU64(20));
        manager.save();

        const manager2 = new QuoteManager(tokenIdUint8Array1);
        expect(manager2.getBlockQuote(10)).toStrictEqual(u256.fromU64(10));
        expect(manager2.getBlockQuote(MAXIMUM_VALID_INDEX)).toStrictEqual(u256.fromU64(20));
    });
});
