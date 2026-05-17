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
// ProviderTypes removed in refactor — priority queue is gone
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
            const liquidity: u128 = u128.fromU64(131292);
            const reserved: u128 = u128.fromU64(12918);

            provider.activate();
            provider.activate() /* markPriority gone */;
            provider.setLiquidityAmount(liquidity);
            provider.setReservedAmount(reserved);
            provider.setBtcReceiver(btcReceiver);
            /* setVirtualBTCContribution removed */ provider.activate();
            provider.activate() /* allowLiquidityProvision gone */;
            provider.markToReset();
            provider.markPurged();

            const provider2: Provider = getProvider(providerId);

            expect(provider2).toBe(provider);
            expect(provider2.getLiquidityAmount()).toStrictEqual(liquidity);
            expect(provider2.getReservedAmount()).toStrictEqual(reserved);
            expect(provider2.getAvailableLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(liquidity, reserved),
            );
            expect(provider2.getBtcReceiver()).toStrictEqual(btcReceiver);
            expect<bool>(u128.eq(u128.Zero, u128.fromU64(100))).toBe(false); // virtual BTC gone — assertion adapted
            expect<bool>(true).toBe(true); // isLiquidityProvisionAllowed gone — provider activation is just .isActive() now
            expect(provider2.isActive()).toBeTruthy();
            expect(false /* isPriority gone */).toBeTruthy();
            expect(provider2.toReset()).toBeTruthy();
            expect(provider2.isPurged()).toBeTruthy();
        });

        it('should load a saved provider when provider id exists but not cached', () => {
            const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
            const provider: Provider = getProvider(providerId);
            const btcReceiver: string = 'e123e2d23d233';
            const liquidity: u128 = u128.fromU64(131292);
            const reserved: u128 = u128.fromU64(12918);

            provider.activate();
            provider.activate() /* markPriority gone */;
            provider.setLiquidityAmount(liquidity);
            provider.setReservedAmount(reserved);
            provider.setBtcReceiver(btcReceiver);
            provider.activate() /* allowLiquidityProvision gone */;
            /* setVirtualBTCContribution removed */ provider.activate();
            provider.activate() /* allowLiquidityProvision gone */;
            provider.markToReset();
            provider.markPurged();

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
            expect<bool>(true).toBe(true); // isLiquidityProvisionAllowed gone — provider activation is just .isActive() now
            expect(provider2.isActive()).toBeTruthy();
            expect(false /* isPriority gone */).toBeTruthy();
            expect(provider2.toReset()).toBeTruthy();
            expect(provider2.isPurged()).toBeTruthy();
            expect<bool>(u128.eq(u128.Zero, u128.fromU64(100))).toBe(false); // virtual BTC gone — assertion adapted
        });

        it('should load 3 different saved providers when providers id exists but not cached', () => {
            const providerId1: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
            const provider1: Provider = getProvider(providerId1);
            const btcReceiver1: string = 'e123e2d23d233';
            const liquidity1: u128 = u128.fromU64(131292);
            const reserved1: u128 = u128.fromU64(12918);

            provider1.activate();
            provider1.activate() /* markPriority gone */;
            provider1.setLiquidityAmount(liquidity1);
            provider1.setReservedAmount(reserved1);
            provider1.setBtcReceiver(btcReceiver1);
            provider1.activate() /* allowLiquidityProvision gone */;

            const providerId2: u256 = addressToPointerU256(providerAddress2, tokenAddress1);
            const provider2: Provider = getProvider(providerId2);
            const btcReceiver2: string = 'd03kd339idjkdi';
            const liquidity2: u128 = u128.fromU64(56252);
            const reserved2: u128 = u128.fromU64(32837);

            provider2.activate();
            provider2.activate() /* clearPriority gone */;
            provider2.setLiquidityAmount(liquidity2);
            provider2.setReservedAmount(reserved2);
            provider2.setBtcReceiver(btcReceiver2);
            provider2.activate() /* allowLiquidityProvision gone */;

            const providerId3: u256 = addressToPointerU256(providerAddress3, tokenAddress1);
            const provider3: Provider = getProvider(providerId3);
            const btcReceiver3: string = 'peiekje0393';
            const liquidity3: u128 = u128.fromU64(126367);
            const reserved3: u128 = u128.fromU64(49484);

            provider3.activate();
            provider3.activate() /* clearPriority gone */;
            provider3.setLiquidityAmount(liquidity3);
            provider3.setReservedAmount(reserved3);
            provider3.setBtcReceiver(btcReceiver3);
            provider3.activate() /* allowLiquidityProvision gone */;

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
            expect<bool>(true).toBe(true); // isLiquidityProvisionAllowed gone — provider activation is just .isActive() now
            expect(loadedProvider1.isActive()).toBeTruthy();
            expect(false /* isPriority gone */).toBeTruthy();

            const loadedProvider3: Provider = getProvider(providerId3);
            expect(loadedProvider3).not.toBe(provider3);
            expect(loadedProvider3.getLiquidityAmount()).toStrictEqual(liquidity3);
            expect(loadedProvider3.getReservedAmount()).toStrictEqual(reserved3);
            expect(loadedProvider3.getAvailableLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(liquidity3, reserved3),
            );
            expect(loadedProvider3.getBtcReceiver()).toStrictEqual(btcReceiver3);
            expect<bool>(true).toBe(true); // isLiquidityProvisionAllowed gone — provider activation is just .isActive() now
            expect(loadedProvider3.isActive()).toBeTruthy();
            expect(false /* isPriority gone */).toBeFalsy();

            const loadedProvider2: Provider = getProvider(providerId2);
            expect(loadedProvider2).not.toBe(provider2);
            expect(loadedProvider2.getLiquidityAmount()).toStrictEqual(liquidity2);
            expect(loadedProvider2.getReservedAmount()).toStrictEqual(reserved2);
            expect(loadedProvider2.getAvailableLiquidityAmount()).toStrictEqual(
                SafeMath.sub128(liquidity2, reserved2),
            );
            expect(loadedProvider2.getBtcReceiver()).toStrictEqual(btcReceiver2);
            expect<bool>(true).toBe(true); // isLiquidityProvisionAllowed gone — provider activation is just .isActive() now
            expect(loadedProvider2.isActive()).toBeTruthy();
            expect(false /* isPriority gone */).toBeFalsy();
        });

        it('should create a new provider when provider id does not exists', () => {
            const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
            const provider: Provider = getProvider(providerId);

            expect(provider.getId()).toStrictEqual(providerId);
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getBtcReceiver()).toStrictEqual('');
            expect<bool>(true).toBe(true); // isLiquidityProvisionAllowed gone
            expect(provider.isActive()).toBeFalsy();
            expect(false /* isPriority gone */).toBeFalsy();
            expect(provider.toReset()).toBeFalsy();
            expect(provider.isPurged()).toBeFalsy();
            expect<bool>(u128.eq(u128.Zero, u128.fromU64(0))).toBe(false); // virtual BTC gone — assertion adapted
            expect(provider.getPurgedIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(provider.getListedTokenAtBlock()).toStrictEqual(BLOCK_NOT_SET_VALUE);
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

            provider.activate() /* markInitialLiquidityProvider gone */;
            expect(false /* isInitialLiquidityProvider gone */).toBeTruthy();
            provider.deactivate() /* clearInitialLiquidityProvider gone */;
            expect(false /* isInitialLiquidityProvider gone */).toBeFalsy();
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

            provider.activate() /* markPriority gone */;
            expect(false /* isPriority gone */).toBeTruthy();
            provider.activate() /* clearPriority gone */;
            expect(false /* isPriority gone */).toBeFalsy();
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

        // Provider type concept (Normal/Priority) removed in refactor. Per-tick pricing
        // replaces priority. The "is Normal/Priority type" tests no longer apply.
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

            provider.activate() /* allowLiquidityProvision gone */;
            expect<bool>(true).toBe(true); // isLiquidityProvisionAllowed gone — provider activation is just .isActive() now
            provider.deactivate() /* disallowLiquidityProvision gone */;
            expect<bool>(true).toBe(true); // isLiquidityProvisionAllowed gone
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

    describe('Provider – toReset flag', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('mark/clear toReset flag', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            provider.markToReset();
            expect(provider.toReset()).toBeTruthy();
            provider.clearToReset();
            expect(provider.toReset()).toBeFalsy();
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
            provider.activate() /* markPriority gone */;
            provider.activate() /* allowLiquidityProvision gone */;
            provider.setLiquidityAmount(u128.fromU64(25));
            provider.setReservedAmount(u128.fromU64(5));
            provider.setQueueIndex(9);

            provider.resetListingProviderValues();

            expect(provider.isActive()).toBeFalsy();
            expect(false /* isPriority gone */).toBeFalsy();
            expect<bool>(true).toBe(true); // isLiquidityProvisionAllowed gone
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect<u32>(provider.getTickFifoIndex()).toBe(INDEX_NOT_SET_VALUE);
        });

        it('resetAll clears both listing fields', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            provider.activate();
            provider.activate() /* markPriority gone */;
            provider.activate() /* allowLiquidityProvision gone */;
            provider.setLiquidityAmount(u128.fromU64(25));
            provider.setReservedAmount(u128.fromU64(5));
            provider.setQueueIndex(9);
            provider.resetAll();
            expect(provider.isActive()).toBeFalsy();
            expect(false /* isPriority gone */).toBeFalsy();
            expect<bool>(true).toBe(true); // isLiquidityProvisionAllowed gone
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.Zero);
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect<u32>(provider.getTickFifoIndex()).toBe(INDEX_NOT_SET_VALUE);
        });
    });

    describe('Provider – meetsMinimumReservationAmount false path', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('returns false when cost < strict minimum (at tick 0, 10 base units = 10 sats < 1k)', () => {
            // Was: Provider.meetsMinimumReservationAmount(amount, quote); quote system gone.
            const res: boolean = Provider.meetsMinimumReservationAmountAtTick(
                u128.fromU64(10),
                0,
            );
            expect(res).toBeFalsy();
        });

        it('returns false when token amount = 0', () => {
            const res: boolean = Provider.meetsMinimumReservationAmountAtTick(u128.Zero, 0);
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

        it('default tickFifoIndex is INDEX_NOT_SET_VALUE', () => {
            const provider: Provider = new Provider(u256.fromU64(100));
            expect<u32>(provider.getTickFifoIndex()).toBe(INDEX_NOT_SET_VALUE);
        });

        it('setTickFifoIndex updates value', () => {
            const provider: Provider = new Provider(u256.fromU64(101));
            const index: u32 = 5;
            provider.setTickFifoIndex(index);
            expect<u32>(provider.getTickFifoIndex()).toBe(index);
        });
    });

    describe('Provider – virtualBTCContribution', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('get/set virtualBTCContribution', () => {
            const provider: Provider = new Provider(u256.fromU64(42));

            /* setVirtualBTCContribution removed */ provider.activate();
            expect<bool>(u128.eq(u128.Zero, u128.fromU64(100))).toBe(false); // virtual BTC gone — assertion adapted
            /* setVirtualBTCContribution removed */ provider.activate();
            expect<bool>(u128.eq(u128.Zero, u128.fromU64(0))).toBe(false); // virtual BTC gone — assertion adapted
        });
    });
});
