import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { ProviderTypes } from '../types/ProviderTypes';
import { u128 } from '@btc-vision/as-bignum/assembly';
import { ReservationProviderData } from '../models/ReservationProdiverData';

describe('ReservationProviderData tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('constructor sets providerIndex, providedAmount, and providerType correctly', () => {
        const index: u32 = 7;
        const amount: u128 = u128.fromU64(12345);
        const type: ProviderTypes = ProviderTypes.Normal;
        const creationBlock = 100;

        const data = new ReservationProviderData(index, amount, type, creationBlock);

        expect(data.providerIndex).toStrictEqual(index);
        expect(data.providedAmount).toStrictEqual(amount);
        expect(data.providerType).toStrictEqual(type);
        expect(data.creationBlock).toStrictEqual(creationBlock);
    });

    it('returns true when providerType is LiquidityRemoval', () => {
        const data = new ReservationProviderData(
            1 as u32,
            u128.fromU64(0),
            ProviderTypes.LiquidityRemoval,
            100,
        );

        expect(data.isLiquidityRemoval()).toBeTruthy();
    });

    it('returns false when providerType is not LiquidityRemoval', () => {
        const data = new ReservationProviderData(
            2 as u32,
            u128.fromU64(999),
            ProviderTypes.Normal,
            100,
        );

        expect(data.isLiquidityRemoval()).toBeFalsy();
    });
});
