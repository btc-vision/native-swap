import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders } from '../models/Provider';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { CompletedTrade } from '../models/CompletedTrade';

describe('CompletedTrade tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('getTotalTokensPurchased returns sum of purchased and refunded tokens', () => {
        const trade = new CompletedTrade(
            u256.fromU64(100),
            u256.fromU64(60),
            500,
            50,
            u256.fromU64(15),
        );

        const result = trade.getTotalTokensPurchased();

        expect(result).toStrictEqual(u256.fromU64(75));
    });

    it('getTotalSatoshisSpent returns sum of satoshis spent and refunded', () => {
        const trade = new CompletedTrade(u256.Zero, u256.Zero, 1000, 250, u256.Zero);

        const result = trade.getTotalSatoshisSpent();
        expect(result).toStrictEqual(1250);
    });

    it('handles maximum values without overflow', () => {
        const trade = new CompletedTrade(u256.Max, u256.Max, u64.MAX_VALUE, 0, u256.Zero);

        expect(trade.getTotalTokensPurchased()).toStrictEqual(u256.Max);
        expect(trade.getTotalSatoshisSpent()).toStrictEqual(u64.MAX_VALUE);
    });

    it('getTotalTokensPurchased handles maximum values with overflow', () => {
        expect(() => {
            const trade = new CompletedTrade(u256.Max, u256.Max, u64.MAX_VALUE, 0, u256.One);

            expect(trade.getTotalTokensPurchased()).toStrictEqual(u256.Max);
        }).toThrow();
    });

    it('getTotalSatoshisSpent handles maximum values with overflow', () => {
        expect(() => {
            const trade = new CompletedTrade(u256.Max, u256.Max, u64.MAX_VALUE, 1, u256.Zero);

            expect(trade.getTotalSatoshisSpent()).toStrictEqual(u64.MAX_VALUE);
        }).toThrow();
    });
});
