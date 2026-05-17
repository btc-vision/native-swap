import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper, u256To30Bytes } from '@btc-vision/btc-runtime/runtime';
import { ProviderData } from '../models/ProviderData';
import { PROVIDER_DATA_POINTER } from '../constants/StoredPointers';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    BLOCK_NOT_SET_VALUE,
    INDEX_NOT_SET_VALUE,
    // INITIAL_LIQUIDITY_PROVIDER_INDEX removed in refactor
} from '../constants/Contract';

const providerBuffer: Uint8Array = u256To30Bytes(u256.fromU64(1111111111111111));
describe('ProviderData tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('throws if subPointer length > 30', () => {
        expect(() => {
            const ptr: u16 = 1;
            const bad = new Uint8Array(31);

            new ProviderData(ptr, bad);
        }).toThrow();
    });

    it('default queueIndex is INDEX_NOT_SET_VALUE', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.queueIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
    });

    it('setter queueIndex marks stateChanged and save writes to storage', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        providerData.queueIndex = 10;
        providerData.save();

        const providerData2 = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData2.queueIndex).toStrictEqual(10);
    });

    it('setter/getter for initialLiquidityProvider', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        // expect on .initialLiquidityProvider removed in refactor
        // initialLiquidityProvider removed in refactor
        // expect on .initialLiquidityProvider removed in refactor
    });

    it('setter/getter for listedTokenAtBlock', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.listedTokenAtBlock).toStrictEqual(BLOCK_NOT_SET_VALUE);
        providerData.listedTokenAtBlock = 100;
        expect(providerData.listedTokenAtBlock).toStrictEqual(100);
    });

    it('setter/getter for virtualBTCContribution', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        // expect on .virtualBTCContribution removed in refactor
        // virtualBTCContribution removed in refactor
        // expect on .virtualBTCContribution removed in refactor
    });

    it('setter/getter for active', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.active).toBeFalsy();
        providerData.active = true;
        expect(providerData.active).toBeTruthy();
    });

    it('setter/getter for purged', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.purged).toBeFalsy();
        providerData.purged = true;
        expect(providerData.purged).toBeTruthy();
    });

    it('setter/getter for toReset', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.toReset).toBeFalsy();
        providerData.toReset = true;
        expect(providerData.toReset).toBeTruthy();
    });

    it('setter/getter for purgedIndex', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.purgedIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
        providerData.purgedIndex = 100;
        expect(providerData.purgedIndex).toStrictEqual(100);
    });

    it('setter/getter for priority', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        // expect on .priority removed in refactor
        // priority removed in refactor
        // expect on .priority removed in refactor
    });

    it('setter/getter for liquidityProvisionAllowed', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        // expect on .liquidityProvisionAllowed removed in refactor
        // liquidityProvisionAllowed removed in refactor
        // expect on .liquidityProvisionAllowed removed in refactor
    });

    it('setter/getter for queueIndex', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.queueIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
        providerData.queueIndex = 7;
        expect(providerData.queueIndex).toStrictEqual(7);
    });

    it('saves and loads from storage when all flag true', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);

        // initialLiquidityProvider removed in refactor
        providerData.queueIndex = 7;
        // liquidityProvisionAllowed removed in refactor
        providerData.liquidityAmount = u128.fromU64(90);
        // priority removed in refactor
        providerData.active = true;
        providerData.reservedAmount = u128.fromU64(100);
        providerData.purged = true;
        providerData.purgedIndex = 100;
        providerData.listedTokenAtBlock = 101;
        providerData.toReset = true;
        // virtualBTCContribution removed in refactor
        providerData.save();

        const providerData2 = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        // expect on .initialLiquidityProvider removed in refactor
        expect(providerData2.queueIndex).toStrictEqual(7);
        // expect on .liquidityProvisionAllowed removed in refactor
        expect(providerData2.liquidityAmount).toStrictEqual(u128.fromU64(90));
        // expect on .priority removed in refactor
        expect(providerData2.active).toBeTruthy();
        expect(providerData2.purged).toBeTruthy();
        expect(providerData2.reservedAmount).toStrictEqual(u128.fromU64(100));
        expect(providerData2.purgedIndex).toStrictEqual(100);
        expect(providerData2.listedTokenAtBlock).toStrictEqual(101);
        expect(providerData2.toReset).toBeTruthy();
        // expect on .virtualBTCContribution removed in refactor
    });

    it('saves and loads from storage when all flag false', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);

        // initialLiquidityProvider removed in refactor
        providerData.queueIndex = 7;
        // liquidityProvisionAllowed removed in refactor
        providerData.liquidityAmount = u128.fromU64(90);
        // priority removed in refactor
        providerData.active = false;
        providerData.reservedAmount = u128.fromU64(100);
        providerData.purged = false;
        providerData.purgedIndex = 100;
        providerData.listedTokenAtBlock = 101;
        providerData.toReset = false;
        // virtualBTCContribution removed in refactor
        providerData.save();

        const providerData2 = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        // expect on .initialLiquidityProvider removed in refactor
        expect(providerData2.queueIndex).toStrictEqual(7);
        // expect on .liquidityProvisionAllowed removed in refactor
        expect(providerData2.liquidityAmount).toStrictEqual(u128.fromU64(90));
        // expect on .priority removed in refactor
        expect(providerData2.active).toBeFalsy();
        expect(providerData2.purged).toBeFalsy();
        expect(providerData2.reservedAmount).toStrictEqual(u128.fromU64(100));
        expect(providerData2.purgedIndex).toStrictEqual(100);
        expect(providerData2.listedTokenAtBlock).toStrictEqual(101);
        expect(providerData2.toReset).toBeFalsy();
        // expect on .virtualBTCContribution removed in refactor
    });

    it('resetListingValues clears listing fields', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        providerData.active = true;
        // priority removed in refactor
        // liquidityProvisionAllowed removed in refactor
        providerData.liquidityAmount = u128.fromU64(20);
        providerData.reservedAmount = u128.fromU64(10);
        providerData.queueIndex = 2;
        providerData.toReset = true;
        providerData.purged = true;
        providerData.purgedIndex = 1;
        providerData.listedTokenAtBlock = 101;
        // virtualBTCContribution removed in refactor
        providerData.resetListingProviderValues();

        expect(providerData.active).toBeFalsy();
        // expect on .priority removed in refactor
        // expect on .liquidityProvisionAllowed removed in refactor
        expect(providerData.liquidityAmount).toStrictEqual(u128.Zero);
        expect(providerData.reservedAmount).toStrictEqual(u128.Zero);
        expect(providerData.queueIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
        expect(providerData.toReset).toBeFalsy();
        expect(providerData.purged).toBeFalsy();
        expect(providerData.purgedIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
        expect(providerData.listedTokenAtBlock).toStrictEqual(BLOCK_NOT_SET_VALUE);
        // Should not reset virtualBTCContribution
        // expect on .virtualBTCContribution removed in refactor
    });

    it('resetListingValues clears listing fields except queueIndex when initial provider', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        providerData.active = true;
        // priority removed in refactor
        // liquidityProvisionAllowed removed in refactor
        providerData.liquidityAmount = u128.fromU64(20);
        providerData.reservedAmount = u128.fromU64(10);
        providerData.queueIndex = 0;
        // initialLiquidityProvider removed in refactor
        providerData.toReset = true;
        providerData.purged = true;
        providerData.purgedIndex = 1;
        providerData.listedTokenAtBlock = 101;
        // virtualBTCContribution removed in refactor
        providerData.resetListingProviderValues();

        expect(providerData.active).toBeFalsy();
        // expect on .priority removed in refactor
        // expect on .liquidityProvisionAllowed removed in refactor
        expect(providerData.liquidityAmount).toStrictEqual(u128.Zero);
        expect(providerData.reservedAmount).toStrictEqual(u128.Zero);
        expect(providerData.queueIndex).toStrictEqual(0);
        // expect on .initialLiquidityProvider removed in refactor
        expect(providerData.toReset).toBeFalsy();
        expect(providerData.purged).toBeFalsy();
        expect(providerData.purgedIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
        expect(providerData.listedTokenAtBlock).toStrictEqual(BLOCK_NOT_SET_VALUE);
        // Should not reset virtualBTCContribution
        // expect on .virtualBTCContribution removed in refactor
    });

    it('resetAll calls both resetListingValues and resetLiquidityProviderValues', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        providerData.active = true;
        // priority removed in refactor
        // liquidityProvisionAllowed removed in refactor
        providerData.liquidityAmount = u128.fromU64(20);
        providerData.reservedAmount = u128.fromU64(10);
        providerData.queueIndex = 2;
        providerData.toReset = true;
        providerData.purged = true;
        providerData.purgedIndex = 1;
        providerData.listedTokenAtBlock = 101;
        // virtualBTCContribution removed in refactor

        providerData.resetAll();
        expect(providerData.active).toBeFalsy();
        // expect on .priority removed in refactor
        // expect on .liquidityProvisionAllowed removed in refactor
        expect(providerData.liquidityAmount).toStrictEqual(u128.Zero);
        expect(providerData.reservedAmount).toStrictEqual(u128.Zero);
        expect(providerData.queueIndex).toBe(INDEX_NOT_SET_VALUE);
        expect(providerData.toReset).toBeFalsy();
        expect(providerData.purged).toBeFalsy();
        expect(providerData.purgedIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
        expect(providerData.listedTokenAtBlock).toStrictEqual(BLOCK_NOT_SET_VALUE);
        // Should not reset virtualBTCContribution
        // expect on .virtualBTCContribution removed in refactor
    });
});
