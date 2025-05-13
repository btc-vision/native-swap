import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    clearCachedProviders,
    getProvider,
    getProviderCacheLength,
    Provider,
    saveAllProviders,
} from '../models/Provider';
import {
    addressToPointerU256,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    tokenAddress1,
} from './test_helper';
import { INDEX_NOT_SET_VALUE } from '../constants/Contract';
import { ProviderTypes } from '../types/ProviderTypes';

describe('Provider tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('Provider – cache behavior', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('should get a cached provider when provider id exists', () => {
            const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
            const provider: Provider = getProvider(providerId);
            const btcReceiver: string = 'e123e2d23d233';
            const liquidityProvided: u128 = u128.fromU64(129292);
            const liquidity: u128 = u128.fromU64(131292);
            const reserved: u128 = u128.fromU64(12918);

            provider.activate();
            provider.markPriority();
            provider.markPendingRemoval();
            provider.markLiquidityProvider();
            provider.setLiquidityProvided(liquidityProvided);
            provider.setLiquidityAmount(liquidity);
            provider.setReservedAmount(reserved);
            provider.setBtcReceiver(btcReceiver);
            provider.allowLiquidityProvision();

            const provider2: Provider = getProvider(providerId);

            expect(provider2).toBe(provider);
            expect(provider2.isPendingRemoval()).toBeTruthy();
            expect(provider2.isLiquidityProvider()).toBeTruthy();
            expect(provider2.getLiquidityProvided()).toStrictEqual(liquidityProvided);
            expect(provider2.getAvailableLiquidityAmount()).toStrictEqual(liquidity);
            expect(provider2.getReservedAmount()).toStrictEqual(reserved);
            expect(provider2.getBtcReceiver()).toStrictEqual(btcReceiver);
            expect(provider2.allowLiquidityProvision()).toBeTruthy();
            expect(provider2.isActive()).toBeTruthy();
            expect(provider2.isPriority()).toBeTruthy();
        });

        it('should load a saved provider when provider id exists but not cached', () => {
            const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
            const provider: Provider = getProvider(providerId);
            const btcReceiver: string = 'e123e2d23d233';
            const liquidityProvided: u128 = u128.fromU64(129292);
            const liquidity: u128 = u128.fromU64(131292);
            const reserved: u128 = u128.fromU64(12918);

            provider.activate();
            provider.markPriority();
            provider.markPendingRemoval();
            provider.markLiquidityProvider();
            provider.setLiquidityProvided(liquidityProvided);
            provider.setLiquidityAmount(liquidity);
            provider.setReservedAmount(reserved);
            provider.setBtcReceiver(btcReceiver);
            provider.allowLiquidityProvision();

            saveAllProviders();
            clearCachedProviders();
            const cacheLength: number = getProviderCacheLength();
            expect(cacheLength).toStrictEqual(0);

            const provider2: Provider = getProvider(providerId);

            expect(provider2).not.toBe(provider);
            expect(provider2.isPendingRemoval()).toBeTruthy();
            expect(provider2.isLiquidityProvider()).toBeTruthy();
            expect(provider2.getLiquidityProvided()).toStrictEqual(liquidityProvided);
            expect(provider2.getAvailableLiquidityAmount()).toStrictEqual(liquidity);
            expect(provider2.getReservedAmount()).toStrictEqual(reserved);
            expect(provider2.getBtcReceiver()).toStrictEqual(btcReceiver);
            expect(provider2.allowLiquidityProvision()).toBeTruthy();
            expect(provider2.isActive()).toBeTruthy();
            expect(provider2.isPriority()).toBeTruthy();
        });

        it('should load 3 different saved providers when providers id exists but not cached', () => {
            const providerId1: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
            const provider1: Provider = getProvider(providerId1);
            const btcReceiver1: string = 'e123e2d23d233';
            const liquidityProvided1: u128 = u128.fromU64(129292);
            const liquidity1: u128 = u128.fromU64(131292);
            const reserved1: u128 = u128.fromU64(12918);

            provider1.activate();
            provider1.markPriority();
            provider1.markPendingRemoval();
            provider1.markLiquidityProvider();
            provider1.setLiquidityProvided(liquidityProvided1);
            provider1.setLiquidityAmount(liquidity1);
            provider1.setReservedAmount(reserved1);
            provider1.setBtcReceiver(btcReceiver1);
            provider1.allowLiquidityProvision();

            const providerId2: u256 = addressToPointerU256(providerAddress2, tokenAddress1);
            const provider2: Provider = getProvider(providerId2);
            const btcReceiver2: string = 'd03kd339idjkdi';
            const liquidityProvided2: u128 = u128.fromU64(837343);
            const liquidity2: u128 = u128.fromU64(56252);
            const reserved2: u128 = u128.fromU64(32837);

            provider2.activate();
            provider2.clearPriority();
            provider2.clearPendingRemoval();
            provider2.markLiquidityProvider();
            provider2.setLiquidityProvided(liquidityProvided2);
            provider2.setLiquidityAmount(liquidity2);
            provider2.setReservedAmount(reserved2);
            provider2.setBtcReceiver(btcReceiver2);
            provider2.allowLiquidityProvision();

            const providerId3: u256 = addressToPointerU256(providerAddress3, tokenAddress1);
            const provider3: Provider = getProvider(providerId3);
            const btcReceiver3: string = 'peiekje0393';
            const liquidityProvided3: u128 = u128.fromU64(624262);
            const liquidity3: u128 = u128.fromU64(126367);
            const reserved3: u128 = u128.fromU64(49484);

            provider3.activate();
            provider3.clearPriority();
            provider3.markPendingRemoval();
            provider3.clearLiquidityProvider();
            provider3.setLiquidityProvided(liquidityProvided3);
            provider3.setLiquidityAmount(liquidity3);
            provider3.setReservedAmount(reserved3);
            provider3.setBtcReceiver(btcReceiver3);
            provider3.allowLiquidityProvision();

            saveAllProviders();
            clearCachedProviders();

            const cacheLength: number = getProviderCacheLength();
            expect(cacheLength).toStrictEqual(0);

            const loadedProvider1: Provider = getProvider(providerId1);
            expect(loadedProvider1).not.toBe(provider1);
            expect(loadedProvider1.isPendingRemoval()).toBeTruthy();
            expect(loadedProvider1.isLiquidityProvider()).toBeTruthy();
            expect(loadedProvider1.getLiquidityProvided()).toStrictEqual(liquidityProvided1);
            expect(loadedProvider1.getAvailableLiquidityAmount()).toStrictEqual(liquidity1);
            expect(loadedProvider1.getReservedAmount()).toStrictEqual(reserved1);
            expect(loadedProvider1.getBtcReceiver()).toStrictEqual(btcReceiver1);
            expect(loadedProvider1.allowLiquidityProvision()).toBeTruthy();
            expect(loadedProvider1.isActive()).toBeTruthy();
            expect(loadedProvider1.isPriority()).toBeTruthy();

            const loadedProvider3: Provider = getProvider(providerId3);
            expect(loadedProvider3).not.toBe(provider3);
            expect(loadedProvider3.isPendingRemoval()).toBeTruthy();
            expect(loadedProvider3.isLiquidityProvider()).toBeFalsy();
            expect(loadedProvider3.getLiquidityProvided()).toStrictEqual(liquidityProvided3);
            expect(loadedProvider3.getAvailableLiquidityAmount()).toStrictEqual(liquidity3);
            expect(loadedProvider3.getReservedAmount()).toStrictEqual(reserved3);
            expect(loadedProvider3.getBtcReceiver()).toStrictEqual(btcReceiver3);
            expect(loadedProvider3.allowLiquidityProvision()).toBeTruthy();
            expect(loadedProvider3.isActive()).toBeTruthy();
            expect(loadedProvider3.isPriority()).toBeFalsy();

            const loadedProvider2: Provider = getProvider(providerId2);
            expect(loadedProvider2).not.toBe(provider2);
            expect(loadedProvider2.isPendingRemoval()).toBeFalsy();
            expect(loadedProvider2.isLiquidityProvider()).toBeTruthy();
            expect(loadedProvider2.getLiquidityProvided()).toStrictEqual(liquidityProvided2);
            expect(loadedProvider2.getAvailableLiquidityAmount()).toStrictEqual(liquidity2);
            expect(loadedProvider2.getReservedAmount()).toStrictEqual(reserved2);
            expect(loadedProvider2.getBtcReceiver()).toStrictEqual(btcReceiver2);
            expect(loadedProvider2.allowLiquidityProvision()).toBeTruthy();
            expect(loadedProvider2.isActive()).toBeTruthy();
            expect(loadedProvider2.isPriority()).toBeFalsy();
        });

        it('should create a new provider when provider id does not exists', () => {
            const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
            const provider: Provider = getProvider(providerId);

            expect(provider.getId()).toStrictEqual(providerId);
            expect(provider.isPendingRemoval()).toBeFalsy();
            expect(provider.isLiquidityProvider()).toBeFalsy();
            expect(provider.getLiquidityProvided()).toStrictEqual(u128.Zero);
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getBtcReceiver()).toStrictEqual('');
            expect(provider.allowLiquidityProvision()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();
            expect(provider.isPriority()).toBeFalsy();
        });
    });

    describe('Provider – has helpers and canCoverReservedAmount()', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            provider = new Provider(u256.fromU64(40));
        });

        it('hasReservedAmount reflect non‑zero', () => {
            expect(provider.hasReservedAmount()).toBeFalsy();

            provider.setReservedAmount(u128.fromU64(8));

            expect(provider.hasReservedAmount()).toBeTruthy();
        });

        it('hasLiquidityAmount reflect non‑zero', () => {
            expect(provider.hasLiquidityAmount()).toBeFalsy();

            provider.setLiquidityAmount(u128.fromU64(12));

            expect(provider.hasLiquidityAmount()).toBeTruthy();
        });

        it('canCoverReservedAmount returns true when liquidity ≥ reserved', () => {
            provider.setLiquidityAmount(u128.fromU64(10));
            provider.setReservedAmount(u128.fromU64(10));
            expect(provider.canCoverReservedAmount()).toBeTruthy();
        });
    });

    describe('Provider – liquidity amount helpers', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(41));
        });

        it('setLiquidityAmount updates value', () => {
            const provider: Provider = new Provider(u256.fromU64(101));
            const amount: u128 = u128.fromU64(15);
            provider.setLiquidityAmount(amount);
            expect(provider.getLiquidityAmount()).toStrictEqual(amount);
        });

        it('getAvailableLiquidityAmount return value', () => {
            const provider: Provider = new Provider(u256.fromU64(101));
            const amount: u128 = u128.fromU64(15);
            const amount2: u128 = u128.fromU64(5);
            provider.setLiquidityAmount(amount);
            provider.setReservedAmount(amount2);
            expect(provider.getAvailableLiquidityAmount()).toStrictEqual(u128.fromU64(10));
        });

        it('getAvailableLiquidityAmount throws on underflow', () => {
            expect<() => void>(() => {
                const provider: Provider = new Provider(u256.fromU64(101));
                const amount: u128 = u128.fromU64(15);
                const amount2: u128 = u128.fromU64(25);
                provider.setLiquidityAmount(amount);
                provider.setReservedAmount(amount2);
                provider.getAvailableLiquidityAmount();
            }).toThrow();
        });

        it('subtractFromLiquidityAmount decreases value', () => {
            provider.setLiquidityAmount(u128.fromU64(20));
            provider.subtractFromLiquidityAmount(u128.fromU64(5));
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(15));
        });

        it('subtractFromLiquidityAmount underflow throws', () => {
            expect<() => void>(() => {
                provider.setLiquidityAmount(u128.fromU64(3));

                provider.subtractFromLiquidityAmount(u128.fromU64(4));
            }).toThrow();
        });
    });

    describe('Provider – initialLiquidityProvider flag', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(42));
        });

        it('mark/clear initialLiquidityProvider', () => {
            provider.markInitialLiquidityProvider();
            expect(provider.isInitialLiquidityProvider()).toBeTruthy();
            provider.clearInitialLiquidityProvider();
            expect(provider.isInitialLiquidityProvider()).toBeFalsy();
        });
    });

    describe('Provider – priority flag', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(42));
        });

        it('mark/clear priority flag', () => {
            provider.markPriority();
            expect(provider.isPriority()).toBeTruthy();
            provider.clearPriority();
            expect(provider.isPriority()).toBeFalsy();
        });
    });

    describe('Provider – active flag', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(42));
        });

        it('mark/clear active flag', () => {
            provider.activate();
            expect(provider.isActive()).toBeTruthy();
            provider.deactivate();
            expect(provider.isActive()).toBeFalsy();
        });
    });

    describe('Provider – provider types', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(42));
        });

        it('is Normal type', () => {
            expect(provider.getProviderType()).toStrictEqual(ProviderTypes.Normal);
        });

        it('is Priority type', () => {
            provider.markPriority();
            expect(provider.getProviderType()).toStrictEqual(ProviderTypes.Priority);
        });

        it('is LiquidityRemoval type', () => {
            provider.markPendingRemoval();
            expect(provider.getProviderType()).toStrictEqual(ProviderTypes.LiquidityRemoval);
        });
    });

    describe('Provider – liquidity provision allowed flag', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(42));
        });

        it('mark/clear liquidity provision allowed', () => {
            provider.allowLiquidityProvision();
            expect(provider.isLiquidityProvisionAllowed()).toBeTruthy();
            provider.disallowLiquidityProvision();
            expect(provider.isLiquidityProvisionAllowed()).toBeFalsy();
        });
    });

    describe('Provider – pending removal flag', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(42));
        });

        it('mark/clear pending removal', () => {
            provider.markPendingRemoval();
            expect(provider.isPendingRemoval()).toBeTruthy();
            provider.clearPendingRemoval();
            expect(provider.isPendingRemoval()).toBeFalsy();
        });
    });

    describe('Provider – BTC receiver', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(42));
        });

        it('mark/clear liquidity provision allowed', () => {
            provider.setBtcReceiver('abcde');
            expect(provider.getBtcReceiver()).toStrictEqual('abcde');
        });
    });

    describe('Provider – liquidity provider flag', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(42));
        });

        it('mark/clear liquidity provider', () => {
            provider.markLiquidityProvider();
            expect(provider.isLiquidityProvider()).toBeTruthy();
            provider.clearLiquidityProvider();
            expect(provider.isLiquidityProvider()).toBeFalsy();
        });
    });

    describe('Provider – fromRemovalQueue flag', () => {
        let provider: Provider;
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(42));
        });

        it('mark and clear fromRemovalQueue', () => {
            provider.markFromRemovalQueue();
            expect(provider.isFromRemovalQueue()).toBeTruthy();
            provider.clearFromRemovalQueue();
            expect(provider.isFromRemovalQueue()).toBeFalsy();
        });
    });

    describe('Provider – resetListingValues / resetLiquidityProviderValues / resetAll', () => {
        let provider: Provider;

        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();

            provider = new Provider(u256.fromU64(42));
        });

        it('resetListingValues clears listing related fields', () => {
            provider.activate();
            provider.markPriority();
            provider.allowLiquidityProvision();
            provider.setLiquidityAmount(u128.fromU64(25));
            provider.setReservedAmount(u128.fromU64(5));
            provider.setQueueIndex(9);

            provider.resetListingValues();

            expect(provider.isActive()).toBeFalsy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isLiquidityProvisionAllowed()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('resetLiquidityProviderValues clears provider related fields', () => {
            provider.markLiquidityProvider();
            provider.setLiquidityProvided(u128.fromU64(30));
            provider.markPendingRemoval();
            provider.setRemovalQueueIndex(5);

            provider.resetLiquidityProviderValues();

            expect(provider.isLiquidityProvider()).toBeFalsy();
            expect(provider.getLiquidityProvided()).toStrictEqual(u128.Zero);
            expect(provider.isPendingRemoval()).toBeFalsy();
            expect(provider.getRemovalQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('resetAll clears both listing and provider fields', () => {
            provider.activate();
            provider.markLiquidityProvider();
            provider.resetAll();
            expect(provider.isActive()).toBeFalsy();
            expect(provider.isLiquidityProvider()).toBeFalsy();
        });
    });

    describe('Provider – meetsMinimumReservationAmount false path', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('returns false when cost ≥ strict minimum', () => {
            const res = Provider.meetsMinimumReservationAmount(
                u128.fromU64(1000),
                u256.fromU64(800),
            );
            expect<bool>(res).toBeFalsy();
        });
    });

    describe('Provider – Reserved Amount helpers', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('default reserved amount is zero', () => {
            const provider: Provider = new Provider(u256.fromU64(100));
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
        });

        it('setReservedAmount updates value', () => {
            const provider: Provider = new Provider(u256.fromU64(101));
            const amount: u128 = u128.fromU64(15);
            provider.setReservedAmount(amount);
            expect(provider.getReservedAmount()).toStrictEqual(amount);
        });

        it('addToReservedAmount increments existing value', () => {
            const provider: Provider = new Provider(u256.fromU64(102));
            provider.setReservedAmount(u128.fromU64(10));
            provider.addToReservedAmount(u128.fromU64(7));
            expect(provider.getReservedAmount()).toStrictEqual(u128.fromU64(17));
        });

        it('subtractFromReservedAmount decrements value', () => {
            const provider: Provider = new Provider(u256.fromU64(103));
            provider.setReservedAmount(u128.fromU64(20));
            provider.subtractFromReservedAmount(u128.fromU64(5));
            expect(provider.getReservedAmount()).toStrictEqual(u128.fromU64(15));
        });

        it('subtractFromReservedAmount underflow throws', () => {
            expect<() => void>(() => {
                const provider: Provider = new Provider(u256.fromU64(104));
                provider.setReservedAmount(u128.fromU64(3));

                provider.subtractFromReservedAmount(u128.fromU64(5));
            }).toThrow();
        });
    });

    describe('Provider – Liquidity Provided helpers', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('default liquidity provided amount is zero', () => {
            const provider: Provider = new Provider(u256.fromU64(100));
            expect(provider.getLiquidityProvided()).toStrictEqual(u128.Zero);
        });

        it('setLiquidityProvided updates value', () => {
            const provider: Provider = new Provider(u256.fromU64(101));
            const amount: u128 = u128.fromU64(15);
            provider.setLiquidityProvided(amount);
            expect(provider.getLiquidityProvided()).toStrictEqual(amount);
        });

        it('addToLiquidityProvided increments existing value', () => {
            const provider: Provider = new Provider(u256.fromU64(102));
            provider.setLiquidityProvided(u128.fromU64(10));
            provider.addToLiquidityProvided(u128.fromU64(7));
            expect(provider.getLiquidityProvided()).toStrictEqual(u128.fromU64(17));
        });
    });

    describe('Provider – Queue index', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('default queue index is INDEX_NOT_SET_VALUE', () => {
            const provider: Provider = new Provider(u256.fromU64(100));
            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('default removal queue index is INDEX_NOT_SET_VALUE', () => {
            const provider: Provider = new Provider(u256.fromU64(100));
            expect(provider.getRemovalQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('setQueueIndex updates value', () => {
            const provider: Provider = new Provider(u256.fromU64(101));
            const index: u32 = 5;
            provider.setQueueIndex(index);
            expect(provider.getQueueIndex()).toStrictEqual(index);
        });

        it('setRemovalQueueIndex updates value', () => {
            const provider: Provider = new Provider(u256.fromU64(101));
            const index: u32 = 7;
            provider.setRemovalQueueIndex(index);
            expect(provider.getRemovalQueueIndex()).toStrictEqual(index);
        });
    });
});

/*


    it('should correctly set provider pending state', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.pendingRemoval = true;

        expect(provider.pendingRemoval).toStrictEqual(true);
    });

    it('should correctly set provider liquidity provider state', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.isLp = true;

        expect(provider.isLp).toStrictEqual(true);
    });

    it('should correctly set provider liquidityProvided value', () => {
        const liquidityProvided: u256 = u256.fromU64(983736);
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.liquidityProvided = liquidityProvided;

        expect(provider.liquidityProvided).toStrictEqual(liquidityProvided);
    });

    it('should correctly set provider liquidity value', () => {
        const liquidity: u128 = u128.fromU64(1827272);
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.liquidity = liquidity;

        expect(provider.liquidity).toStrictEqual(liquidity);
    });

    it('should correctly set provider reserved value', () => {
        const reserved: u128 = u128.fromU64(4434534);
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.reserved = reserved;

        expect(provider.reserved).toStrictEqual(reserved);
    });

    it('should correctly set provider btcReceiver value', () => {
        const btcReceiver: string = '0d1121291209u09hs282';
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.btcReceiver = btcReceiver;

        expect(provider.btcReceiver).toStrictEqual(btcReceiver);
    });

    it('should correctly set provider enableLiquidityProvision state', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.enableLiquidityProvision();

        expect(provider.canProvideLiquidity()).toStrictEqual(true);
    });

    it('should correctly set provider active and priority state to true', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.setActive(true, true);

        expect(provider.isActive()).toStrictEqual(true);
        expect(provider.isPriority()).toStrictEqual(true);
    });

    it('should correctly set provider active state to true and priority state to false', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.setActive(true, false);

        expect(provider.isActive()).toStrictEqual(true);
        expect(provider.isPriority()).toStrictEqual(false);
    });

    it('should correctly set provider active state to false and priority state to true', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.setActive(false, true);

        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(true);
    });

    it('should correctly set provider active state to false and priority state to false', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.setActive(false, false);

        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(false);
    });



});
*/