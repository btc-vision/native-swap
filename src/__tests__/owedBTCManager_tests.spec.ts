import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '../../../btc-runtime/runtime';
import { OwedBTCManager } from '../managers/OwedBTCManager';
import { createProviderId, providerAddress1, tokenAddress1 } from './test_helper';
import { u256 } from '@btc-vision/as-bignum/assembly';

describe('OwedBTCManager tests', () => {
    let manager: OwedBTCManager;
    let providerId: u256;

    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();

        manager = new OwedBTCManager();
        providerId = createProviderId(providerAddress1, tokenAddress1);
    });

    it('returns zero for getSatoshisOwed when not set', () => {
        expect(manager.getSatoshisOwed(providerId)).toStrictEqual(0);
    });

    it('returns correct value for getSatoshisOwed after set', () => {
        manager.setSatoshisOwed(providerId, 500);
        expect(manager.getSatoshisOwed(providerId)).toStrictEqual(500);
    });

    it('returns zero for getSatoshisOwedReserved when not set', () => {
        expect(manager.getSatoshisOwedReserved(providerId)).toStrictEqual(0);
    });

    it('returns correct value for getSatoshisOwedReserved after set', () => {
        manager.setSatoshisOwedReserved(providerId, 200);
        expect(manager.getSatoshisOwedReserved(providerId)).toStrictEqual(200);
    });

    it('returns correct satoshis left when owed > reserved', () => {
        manager.setSatoshisOwed(providerId, 500);
        manager.setSatoshisOwedReserved(providerId, 200);
        expect(manager.getSatoshisOwedLeft(providerId)).toStrictEqual(300);
    });

    it('returns zero for getSatoshisOwedLeft if both owed and reserved are unset', () => {
        expect(manager.getSatoshisOwedLeft(providerId)).toStrictEqual(0);
    });

    it('returns full owed amount when reserved is zero', () => {
        manager.setSatoshisOwed(providerId, 700);
        expect(manager.getSatoshisOwedLeft(providerId)).toStrictEqual(700);
    });

    it('throws on underflow if reserved > owed', () => {
        expect<() => void>(() => {
            manager.setSatoshisOwed(providerId, 300);
            manager.setSatoshisOwedReserved(providerId, 500);
            manager.getSatoshisOwedLeft(providerId);
        }).toThrow();
    });
});
