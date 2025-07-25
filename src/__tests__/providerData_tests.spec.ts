import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper, u256To30Bytes } from '@btc-vision/btc-runtime/runtime';
import { ProviderData } from '../models/ProviderData';
import { PROVIDER_DATA_POINTER } from '../constants/StoredPointers';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    BLOCK_NOT_SET_VALUE,
    INDEX_NOT_SET_VALUE,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
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
        expect(providerData.initialLiquidityProvider).toBeFalsy();
        providerData.initialLiquidityProvider = true;
        expect(providerData.initialLiquidityProvider).toBeTruthy();
    });

    it('setter/getter for listedTokenAtBlock', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.listedTokenAtBlock).toStrictEqual(BLOCK_NOT_SET_VALUE);
        providerData.listedTokenAtBlock = 100;
        expect(providerData.listedTokenAtBlock).toStrictEqual(100);
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

    it('setter/getter for purgedIndex', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.purgedIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
        providerData.purgedIndex = 100;
        expect(providerData.purgedIndex).toStrictEqual(100);
    });

    it('setter/getter for priority', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.priority).toBeFalsy();
        providerData.priority = true;
        expect(providerData.priority).toBeTruthy();
    });

    it('setter/getter for liquidityProvisionAllowed', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.liquidityProvisionAllowed).toBeFalsy();
        providerData.liquidityProvisionAllowed = true;
        expect(providerData.liquidityProvisionAllowed).toBeTruthy();
    });

    it('setter/getter for queueIndex', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData.queueIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
        providerData.queueIndex = 7;
        expect(providerData.queueIndex).toStrictEqual(7);
    });

    it('saves and loads from storage when all flag true', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);

        providerData.initialLiquidityProvider = true;
        providerData.queueIndex = 7;
        providerData.liquidityProvisionAllowed = true;
        providerData.liquidityAmount = u128.fromU64(90);
        providerData.priority = true;
        providerData.active = true;
        providerData.reservedAmount = u128.fromU64(100);
        providerData.purged = true;
        providerData.purgedIndex = 100;
        providerData.listedTokenAtBlock = 101;
        providerData.save();

        const providerData2 = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData2.initialLiquidityProvider).toBeTruthy();
        expect(providerData2.queueIndex).toStrictEqual(7);
        expect(providerData2.liquidityProvisionAllowed).toBeTruthy();
        expect(providerData2.liquidityAmount).toStrictEqual(u128.fromU64(90));
        expect(providerData2.priority).toBeTruthy();
        expect(providerData2.active).toBeTruthy();
        expect(providerData2.purged).toBeTruthy();
        expect(providerData2.reservedAmount).toStrictEqual(u128.fromU64(100));
        expect(providerData2.purgedIndex).toStrictEqual(100);
        expect(providerData2.listedTokenAtBlock).toStrictEqual(101);
    });

    it('saves and loads from storage when all flag false', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);

        providerData.initialLiquidityProvider = false;
        providerData.queueIndex = 7;
        providerData.liquidityProvisionAllowed = false;
        providerData.liquidityAmount = u128.fromU64(90);
        providerData.priority = false;
        providerData.active = false;
        providerData.reservedAmount = u128.fromU64(100);
        providerData.purged = false;
        providerData.purgedIndex = 100;
        providerData.listedTokenAtBlock = 101;
        providerData.save();

        const providerData2 = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        expect(providerData2.initialLiquidityProvider).toBeFalsy();
        expect(providerData2.queueIndex).toStrictEqual(7);
        expect(providerData2.liquidityProvisionAllowed).toBeFalsy();
        expect(providerData2.liquidityAmount).toStrictEqual(u128.fromU64(90));
        expect(providerData2.priority).toBeFalsy();
        expect(providerData2.active).toBeFalsy();
        expect(providerData2.purged).toBeFalsy();
        expect(providerData2.reservedAmount).toStrictEqual(u128.fromU64(100));
        expect(providerData2.purgedIndex).toStrictEqual(100);
        expect(providerData2.listedTokenAtBlock).toStrictEqual(101);
    });

    it('resetListingValues clears listing fields', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        providerData.active = true;
        providerData.priority = true;
        providerData.liquidityProvisionAllowed = true;
        providerData.liquidityAmount = u128.fromU64(20);
        providerData.reservedAmount = u128.fromU64(10);
        providerData.queueIndex = 2;

        providerData.resetListingProviderValues();

        expect(providerData.active).toBeFalsy();
        expect(providerData.priority).toBeFalsy();
        expect(providerData.liquidityProvisionAllowed).toBeFalsy();
        expect(providerData.liquidityAmount).toStrictEqual(u128.Zero);
        expect(providerData.reservedAmount).toStrictEqual(u128.Zero);
        expect(providerData.queueIndex).toBe(INDEX_NOT_SET_VALUE);
    });

    it('resetListingValues clears listing fields except queueIndex when initial provider', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        providerData.active = true;
        providerData.priority = true;
        providerData.liquidityProvisionAllowed = true;
        providerData.liquidityAmount = u128.fromU64(20);
        providerData.reservedAmount = u128.fromU64(10);
        providerData.queueIndex = INITIAL_LIQUIDITY_PROVIDER_INDEX;
        providerData.initialLiquidityProvider = true;

        providerData.resetListingProviderValues();

        expect(providerData.active).toBeFalsy();
        expect(providerData.priority).toBeFalsy();
        expect(providerData.liquidityProvisionAllowed).toBeFalsy();
        expect(providerData.liquidityAmount).toStrictEqual(u128.Zero);
        expect(providerData.reservedAmount).toStrictEqual(u128.Zero);
        expect(providerData.queueIndex).toStrictEqual(INITIAL_LIQUIDITY_PROVIDER_INDEX);
        expect(providerData.initialLiquidityProvider).toBeTruthy();
    });

    it('resetAll calls both resetListingValues and resetLiquidityProviderValues', () => {
        const providerData = new ProviderData(PROVIDER_DATA_POINTER, providerBuffer);
        providerData.active = true;
        providerData.priority = true;
        providerData.liquidityProvisionAllowed = true;
        providerData.liquidityAmount = u128.fromU64(20);
        providerData.reservedAmount = u128.fromU64(10);
        providerData.queueIndex = 2;

        providerData.resetAll();
        expect(providerData.active).toBeFalsy();
        expect(providerData.priority).toBeFalsy();
        expect(providerData.liquidityProvisionAllowed).toBeFalsy();
        expect(providerData.liquidityAmount).toStrictEqual(u128.Zero);
        expect(providerData.reservedAmount).toStrictEqual(u128.Zero);
        expect(providerData.queueIndex).toBe(INDEX_NOT_SET_VALUE);
    });
});
