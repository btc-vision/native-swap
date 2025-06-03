import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';
import { slash } from '../utils/Slashing';

describe('Slashing tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('Reservation – constructor', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should handle when delta < delta0', () => {
            const amount: u128 = u128.fromU32(1000);
            const delta: u64 = 10;
            const delta0: u64 = 100;
            const rampUp: u64 = 10;

            const result = slash(amount, delta, delta0, rampUp);

            expect(result).toStrictEqual(u128.fromU32(500));
        });

        it('should handle when delta >= delta0 and delta-delat0 >= rampUp', () => {
            const amount: u128 = u128.fromU32(1000);
            const delta: u64 = 1000;
            const delta0: u64 = 100;
            const rampUp: u64 = 10;

            const result = slash(amount, delta, delta0, rampUp);

            expect(result).toStrictEqual(u128.fromU32(900));
        });

        it('should handle when delta >= delta0 and delta-delat0 < rampUp', () => {
            const amount: u128 = u128.fromU32(1000);
            const delta: u64 = 1000;
            const delta0: u64 = 100;
            const rampUp: u64 = 910;

            const result = slash(amount, delta, delta0, rampUp);

            expect(result).toStrictEqual(u128.fromU32(895));
        });
    });
});
