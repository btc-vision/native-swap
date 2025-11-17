import { Address, Blockchain, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    addAmountToStakingContract,
    clearCachedProviders,
    clearPendingStakingContractAmount,
    getPendingStakingContractAmount,
    getProvider,
    getProviderCacheLength,
    Provider,
    saveAllProviders,
    transferPendingAmountToStakingContract,
} from '../models/Provider';
import {
    addressToPointerU256,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    testStackingContractAddress,
    tokenAddress1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { BLOCK_NOT_SET_VALUE, INDEX_NOT_SET_VALUE } from '../constants/Contract';
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
            provider.setLiquidityAmount(liquidity);
            provider.setReservedAmount(reserved);
            provider.setBtcReceiver(btcReceiver);
            provider.allowLiquidityProvision();

            const provider2: Provider = getProvider(providerId);

            expect(provider2).toBe(provider);
            expect(provider2.getLiquidityAmount()).toStrictEqual(liquidity);
            expect(provider2.getReservedAmount()).toStrictEqual(reserved);
            expect(provider2.getAvailableLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(liquidity, reserved),
            );
            expect(provider2.getBtcReceiver()).toStrictEqual(btcReceiver);
            expect(provider2.isLiquidityProvisionAllowed()).toBeTruthy();
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
            expect(provider2.getLiquidityAmount()).toStrictEqual(liquidity);
            expect(provider2.getReservedAmount()).toStrictEqual(reserved);
            expect(provider2.getAvailableLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(liquidity, reserved),
            );
            expect(provider2.getBtcReceiver()).toStrictEqual(btcReceiver);
            expect(provider2.isLiquidityProvisionAllowed()).toBeTruthy();
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
            expect(loadedProvider1.getLiquidityAmount()).toStrictEqual(liquidity1);
            expect(loadedProvider1.getReservedAmount()).toStrictEqual(reserved1);
            expect(loadedProvider1.getAvailableLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(liquidity1, reserved1),
            );
            expect(loadedProvider1.getBtcReceiver()).toStrictEqual(btcReceiver1);
            expect(loadedProvider1.isLiquidityProvisionAllowed()).toBeTruthy();
            expect(loadedProvider1.isActive()).toBeTruthy();
            expect(loadedProvider1.isPriority()).toBeTruthy();

            const loadedProvider3: Provider = getProvider(providerId3);
            expect(loadedProvider3).not.toBe(provider3);
            expect(loadedProvider3.getLiquidityAmount()).toStrictEqual(liquidity3);
            expect(loadedProvider3.getReservedAmount()).toStrictEqual(reserved3);
            expect(loadedProvider3.getAvailableLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(liquidity3, reserved3),
            );
            expect(loadedProvider3.getBtcReceiver()).toStrictEqual(btcReceiver3);
            expect(loadedProvider3.isLiquidityProvisionAllowed()).toBeTruthy();
            expect(loadedProvider3.isActive()).toBeTruthy();
            expect(loadedProvider3.isPriority()).toBeFalsy();

            const loadedProvider2: Provider = getProvider(providerId2);
            expect(loadedProvider2).not.toBe(provider2);
            expect(loadedProvider2.getLiquidityAmount()).toStrictEqual(liquidity2);
            expect(loadedProvider2.getReservedAmount()).toStrictEqual(reserved2);
            expect(loadedProvider2.getAvailableLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(liquidity2, reserved2),
            );
            expect(loadedProvider2.getBtcReceiver()).toStrictEqual(btcReceiver2);
            expect(loadedProvider2.isLiquidityProvisionAllowed()).toBeTruthy();
            expect(loadedProvider2.isActive()).toBeTruthy();
            expect(loadedProvider2.isPriority()).toBeFalsy();
        });

        it('should create a new provider when provider id does not exists', () => {
            const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
            const provider: Provider = getProvider(providerId);

            expect(provider.getId()).toStrictEqual(providerId);
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getBtcReceiver()).toStrictEqual('');
            expect(provider.isLiquidityProvisionAllowed()).toBeFalsy();
            expect(provider.isActive()).toBeFalsy();
            expect(provider.isPriority()).toBeFalsy();
        });
    });

    describe('Provider – staking contract accumulator behavior', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
            clearPendingStakingContractAmount();
        });

        it('should add to and get the pendingStakingContractAmount', () => {
            addAmountToStakingContract(u256.fromU64(1000));
            addAmountToStakingContract(u256.fromU64(2999));
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromU64(3999));
        });

        it('should transfer the pendingStakingContractAmount to the staking contract when amount > 0', () => {
            addAmountToStakingContract(u256.fromU64(1000));
            addAmountToStakingContract(u256.fromU64(2999));
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromU64(3999));

            transferPendingAmountToStakingContract(tokenAddress1, testStackingContractAddress);
            expect(TransferHelper.transferCalled).toBeTruthy();
        });

        it('should not transfer the pendingStakingContractAmount to the staking contract when amount = 0', () => {
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);

            transferPendingAmountToStakingContract(tokenAddress1, testStackingContractAddress);
            expect(TransferHelper.transferCalled).toBeFalsy();
        });

        it('should fail if staking contract address is not specified when calling pendingStakingContractAmount with amount > 0', () => {
            addAmountToStakingContract(u256.fromU64(1000));
            addAmountToStakingContract(u256.fromU64(2999));
            expect(getPendingStakingContractAmount()).toStrictEqual(u256.fromU64(3999));

            expect(() => {
                transferPendingAmountToStakingContract(tokenAddress1, Address.zero());
            }).toThrow();
        });
    });

    describe('Provider – has helpers and canCoverReservedAmount()', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('hasReservedAmount reflect non‑zero', () => {
            const provider: Provider = new Provider(u256.fromU64(40));

            expect(provider.hasReservedAmount()).toBeFalsy();

            provider.setReservedAmount(u128.fromU64(8));

            expect(provider.hasReservedAmount()).toBeTruthy();
        });

        it('hasLiquidityAmount reflect non‑zero', () => {
            const provider: Provider = new Provider(u256.fromU64(40));

            expect(provider.hasLiquidityAmount()).toBeFalsy();

            provider.setLiquidityAmount(u128.fromU64(12));

            expect(provider.hasLiquidityAmount()).toBeTruthy();
        });

        it('canCoverReservedAmount returns true when liquidity ≥ reserved', () => {
            const provider: Provider = new Provider(u256.fromU64(40));

            provider.setLiquidityAmount(u128.fromU64(10));
            provider.setReservedAmount(u128.fromU64(10));
            expect(provider.canCoverReservedAmount()).toBeTruthy();
        });
    });

    describe('Provider – liquidity amount helpers', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
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
            expect(() => {
                const provider: Provider = new Provider(u256.fromU64(101));
                const amount: u128 = u128.fromU64(15);
                const amount2: u128 = u128.fromU64(25);
                provider.setLiquidityAmount(amount);
                provider.setReservedAmount(amount2);
                provider.getAvailableLiquidityAmount();
            }).toThrow();
        });

        it('subtractFromLiquidityAmount decreases value', () => {
            const provider = new Provider(u256.fromU64(41));

            provider.setLiquidityAmount(u128.fromU64(20));
            provider.subtractFromLiquidityAmount(u128.fromU64(5));
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(15));
        });

        it('subtractFromLiquidityAmount underflow throws', () => {
            expect(() => {
                const provider = new Provider(u256.fromU64(41));
                provider.setLiquidityAmount(u128.fromU64(3));

                provider.subtractFromLiquidityAmount(u128.fromU64(4));
            }).toThrow();
        });
    });

    describe('Provider – initialLiquidityProvider flag', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('mark/clear initialLiquidityProvider', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            provider.markInitialLiquidityProvider();
            expect(provider.isInitialLiquidityProvider()).toBeTruthy();
            provider.clearInitialLiquidityProvider();
            expect(provider.isInitialLiquidityProvider()).toBeFalsy();
        });
    });

    describe('Provider – listedTokenAtBlock', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('get/set listed token at block', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            expect(provider.getListedTokenAtBlock()).toStrictEqual(BLOCK_NOT_SET_VALUE);
            provider.setListedTokenAtBlock(999);
            expect(provider.getListedTokenAtBlock()).toStrictEqual(999);
        });
    });

    describe('Provider – purged index', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('get/set purged index', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            provider.setPurgedIndex(888);
            expect(provider.getPurgedIndex()).toStrictEqual(888);
        });
    });

    describe('Provider – purged flag', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('mark/clear purged flag', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            provider.markPurged();
            expect(provider.isPurged()).toBeTruthy();
            provider.clearPurged();
            expect(provider.isPurged()).toBeFalsy();
        });
    });

    describe('Provider – priority flag', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('mark/clear priority flag', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            provider.markPriority();
            expect(provider.isPriority()).toBeTruthy();
            provider.clearPriority();
            expect(provider.isPriority()).toBeFalsy();
        });
    });

    describe('Provider – active flag', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('mark/clear active flag', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            provider.activate();
            expect(provider.isActive()).toBeTruthy();
            provider.deactivate();
            expect(provider.isActive()).toBeFalsy();
        });
    });

    describe('Provider – provider types', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('is Normal type', () => {
            const provider: Provider = new Provider(u256.fromU64(42));
            expect(provider.getProviderType()).toStrictEqual(ProviderTypes.Normal);
        });

        it('is Priority type', () => {
            const provider: Provider = new Provider(u256.fromU64(42));
            provider.markPriority();
            expect(provider.getProviderType()).toStrictEqual(ProviderTypes.Priority);
        });
    });

    describe('Provider – liquidity provision allowed flag', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('mark/clear liquidity provision allowed', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            provider.allowLiquidityProvision();
            expect(provider.isLiquidityProvisionAllowed()).toBeTruthy();
            provider.disallowLiquidityProvision();
            expect(provider.isLiquidityProvisionAllowed()).toBeFalsy();
        });
    });

    describe('Provider – BTC receiver', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('set/get btc receiver', () => {
            const provider: Provider = new Provider(u256.fromU64(42));
            provider.setBtcReceiver('abcde');
            expect(provider.getBtcReceiver()).toStrictEqual('abcde');
        });
    });

    describe('Provider – resetListingValues / resetLiquidityProviderValues / resetAll', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('resetListingValues clears listing related fields', () => {
            const provider: Provider = new Provider(u256.fromU64(42));
            provider.activate();
            provider.markPriority();
            provider.allowLiquidityProvision();
            provider.setLiquidityAmount(u128.fromU64(25));
            provider.setReservedAmount(u128.fromU64(5));
            provider.setQueueIndex(9);

            provider.resetListingProviderValues();

            expect(provider.isActive()).toBeFalsy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isLiquidityProvisionAllowed()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('resetAll clears both listing fields', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            provider.activate();
            provider.markPriority();
            provider.allowLiquidityProvision();
            provider.setLiquidityAmount(u128.fromU64(25));
            provider.setReservedAmount(u128.fromU64(5));
            provider.setQueueIndex(9);
            provider.resetAll();
            expect(provider.isActive()).toBeFalsy();
            expect(provider.isPriority()).toBeFalsy();
            expect(provider.isLiquidityProvisionAllowed()).toBeFalsy();
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });
    });

    describe('Provider – meetsMinimumReservationAmount false path', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('returns false when cost < strict minimum', () => {
            const res: boolean = Provider.meetsMinimumReservationAmount(
                u128.fromU64(10),
                u256.fromU64(8000000),
            );
            expect(res).toBeFalsy();
        });

        it('returns false when token amount = 0', () => {
            const res: boolean = Provider.meetsMinimumReservationAmount(
                u128.Zero,
                u256.fromU64(8000000),
            );
            expect(res).toBeFalsy();
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
            expect(() => {
                const provider: Provider = new Provider(u256.fromU64(104));
                provider.setReservedAmount(u128.fromU64(3));

                provider.subtractFromReservedAmount(u128.fromU64(5));
            }).toThrow();
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

        it('setQueueIndex updates value', () => {
            const provider: Provider = new Provider(u256.fromU64(101));
            const index: u32 = 5;
            provider.setQueueIndex(index);
            expect(provider.getQueueIndex()).toStrictEqual(index);
        });
    });
});
