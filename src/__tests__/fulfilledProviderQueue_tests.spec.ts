import {
    clearCachedProviders,
    clearPendingStakingContractAmount,
    getPendingStakingContractAmount,
    Provider,
} from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { NORMAL_QUEUE_FULFILLED, NORMAL_QUEUE_POINTER } from '../constants/StoredPointers';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import {
    createProvider,
    createProviders,
    providerAddress1,
    TestFulfilledProviderQueue,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { ProviderQueue } from '../managers/ProviderQueue';
import {
    MAXIMUM_NUMBER_OF_PROVIDERS,
    MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS_BEFORE_QUEUING,
} from '../constants/Contract';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

class TestInstances {
    static initialTotalReserve: u256 = u256.fromU32(100000000);
    static initialVirtualTokenReserve: u256 = u256.fromU32(100000000);
    public fulfilledQueue: TestFulfilledProviderQueue;
    public liquidityReserve: LiquidityQueueReserve;
    public normalProviderQueue: ProviderQueue;

    constructor(
        fulfilledQueue: TestFulfilledProviderQueue,
        liquidityReserve: LiquidityQueueReserve,
        normalProviderQueue: ProviderQueue,
    ) {
        this.fulfilledQueue = fulfilledQueue;
        this.liquidityReserve = liquidityReserve;
        this.normalProviderQueue = normalProviderQueue;
    }
}

function createTestInstances(): TestInstances {
    const liquidityReserve = new LiquidityQueueReserve(tokenAddress1, tokenIdUint8Array1);
    liquidityReserve.addToTotalReserve(TestInstances.initialTotalReserve);
    liquidityReserve.addToVirtualTokenReserve(TestInstances.initialVirtualTokenReserve);

    const normalProviderQueue = new ProviderQueue(
        tokenAddress1,
        NORMAL_QUEUE_POINTER,
        tokenIdUint8Array1,
        true,
        MAXIMUM_NUMBER_OF_PROVIDERS,
        liquidityReserve,
        MAXIMUM_NUMBER_OF_PURGED_PROVIDER_TO_RESETS_BEFORE_QUEUING,
    );

    const fulfilledQueue = new TestFulfilledProviderQueue(
        NORMAL_QUEUE_FULFILLED,
        tokenIdUint8Array1,
        liquidityReserve,
    );

    return new TestInstances(fulfilledQueue, liquidityReserve, normalProviderQueue);
}

describe('Fulfilled provider queue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
        clearPendingStakingContractAmount();
    });

    describe('add', () => {
        it('should add provider index to queue', () => {
            const instances: TestInstances = createTestInstances();
            const providerIndex: u32 = 42;

            instances.fulfilledQueue.add(providerIndex);

            expect(instances.fulfilledQueue.getQueue.getLength()).toStrictEqual(1);
            expect(instances.fulfilledQueue.getQueue.get(0)).toStrictEqual(providerIndex);
        });

        it('should add multiple provider indices', () => {
            const instances: TestInstances = createTestInstances();
            const indices: u32[] = [1, 5, 10, 100, 1000];

            for (let i: i32 = 0; i < indices.length; i++) {
                instances.fulfilledQueue.add(indices[i]);
            }

            expect(instances.fulfilledQueue.getQueue.getLength()).toStrictEqual(indices.length);
            for (let i: i32 = 0; i < indices.length; i++) {
                expect(instances.fulfilledQueue.getQueue.get(i)).toStrictEqual(indices[i]);
            }
        });
    });

    describe('reset', () => {
        describe('with fulfilled providers', () => {
            it('should reset single provider successfully', () => {
                const instances: TestInstances = createTestInstances();

                const provider1: Provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    false,
                );
                provider1.clearInitialLiquidityProvider();
                provider1.markToReset();
                provider1.setVirtualBTCContribution(1000);
                const liquidity: u256 = provider1.getLiquidityAmount().toU256();

                instances.normalProviderQueue.add(provider1);
                instances.fulfilledQueue.add(provider1.getQueueIndex());

                const resetCount: u32 = instances.fulfilledQueue.reset(
                    1,
                    instances.normalProviderQueue,
                );
                expect(resetCount).toStrictEqual(1);
                expect(provider1.isActive()).toBeFalsy();
                expect(provider1.getVirtualBTCContribution()).toStrictEqual(0);
                expect(instances.liquidityReserve.virtualTokenReserve).toStrictEqual(
                    TestInstances.initialVirtualTokenReserve,
                );
                expect(instances.liquidityReserve.liquidity).toStrictEqual(
                    TestInstances.initialTotalReserve,
                );
                expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
                expect(instances.fulfilledQueue.getQueue.getLength()).toStrictEqual(0);
                expect(instances.normalProviderQueue.getQueue().getLength()).toStrictEqual(1);
            });

            it('should reset multiple providers', () => {
                const instances: TestInstances = createTestInstances();
                const count: u8 = 5;
                const providers: Provider[] = createProviders(count, 0, false, false, false);
                const liquidity: u256[] = [];

                for (let i: u8 = 0; i < count; i++) {
                    const provider: Provider = providers[i];
                    provider.clearInitialLiquidityProvider();
                    provider.setVirtualBTCContribution(1000);
                    provider.markToReset();
                    liquidity.push(provider.getLiquidityAmount().toU256());
                    instances.normalProviderQueue.add(provider);
                    instances.fulfilledQueue.add(provider.getQueueIndex());
                }

                const liquiditySum: u256 = liquidity.reduce(
                    (acc: u256, current: u256) => (acc = u256.add(acc, current)),
                    u256.Zero,
                );

                const resetCount: u32 = instances.fulfilledQueue.reset(
                    count,
                    instances.normalProviderQueue,
                );
                expect(resetCount).toStrictEqual(count);

                expect(instances.liquidityReserve.virtualTokenReserve).toStrictEqual(
                    TestInstances.initialVirtualTokenReserve,
                );
                expect(instances.liquidityReserve.liquidity).toStrictEqual(
                    TestInstances.initialTotalReserve,
                );
                expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
                expect(instances.fulfilledQueue.getQueue.getLength()).toStrictEqual(0);
                expect(instances.normalProviderQueue.getQueue().getLength()).toStrictEqual(count);

                providers.forEach((provider) => {
                    expect(provider.isActive()).toBeFalsy();
                    expect(provider.getVirtualBTCContribution()).toStrictEqual(0);
                });
            });

            it('should handle count greater than queue length', () => {
                const instances: TestInstances = createTestInstances();
                const count: u8 = 5;
                const providers: Provider[] = createProviders(count, 0, false, false, false);
                const liquidity: u256[] = [];

                for (let i: u8 = 0; i < count; i++) {
                    const provider: Provider = providers[i];
                    provider.clearInitialLiquidityProvider();
                    provider.setVirtualBTCContribution(1000);
                    provider.markToReset();
                    liquidity.push(provider.getLiquidityAmount().toU256());
                    instances.normalProviderQueue.add(provider);
                    instances.fulfilledQueue.add(provider.getQueueIndex());
                }

                const resetCount: u32 = instances.fulfilledQueue.reset(
                    count + 5,
                    instances.normalProviderQueue,
                );
                expect(resetCount).toStrictEqual(count);
                expect(instances.fulfilledQueue.getQueue.getLength()).toStrictEqual(0);
                expect(instances.normalProviderQueue.getQueue().getLength()).toStrictEqual(count);
            });

            it('should handle zero count', () => {
                const instances: TestInstances = createTestInstances();
                const count: u8 = 5;
                const providers: Provider[] = createProviders(count, 0, false, false, false);
                const liquidity: u256[] = [];

                for (let i: u8 = 0; i < count; i++) {
                    const provider: Provider = providers[i];
                    provider.clearInitialLiquidityProvider();
                    provider.setVirtualBTCContribution(1000);
                    provider.markToReset();
                    liquidity.push(provider.getLiquidityAmount().toU256());
                    instances.normalProviderQueue.add(provider);
                    instances.fulfilledQueue.add(provider.getQueueIndex());
                }

                const resetCount = instances.fulfilledQueue.reset(0, instances.normalProviderQueue);
                expect(resetCount).toStrictEqual(0);
                expect(instances.fulfilledQueue.getQueue.getLength()).toStrictEqual(count);
                expect(instances.normalProviderQueue.getQueue().getLength()).toStrictEqual(count);
            });

            it('should handle empty queue', () => {
                const instances: TestInstances = createTestInstances();
                const resetCount: u32 = instances.fulfilledQueue.reset(
                    5,
                    instances.normalProviderQueue,
                );
                expect(resetCount).toBe(0);
                expect(instances.fulfilledQueue.getQueue.getLength()).toStrictEqual(0);
                expect(instances.normalProviderQueue.getQueue().getLength()).toStrictEqual(0);
            });

            it('should skip removal for initial liquidity provider', () => {
                const instances: TestInstances = createTestInstances();
                const provider1: Provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    false,
                );
                provider1.markInitialLiquidityProvider();
                provider1.markToReset();
                provider1.setVirtualBTCContribution(1000);
                const liquidity: u256 = provider1.getLiquidityAmount().toU256();

                instances.normalProviderQueue.add(provider1);
                instances.fulfilledQueue.add(provider1.getQueueIndex());

                const resetCount: u32 = instances.fulfilledQueue.reset(
                    1,
                    instances.normalProviderQueue,
                );
                expect(resetCount).toStrictEqual(1);
                expect(provider1.isActive()).toBeFalsy();
                expect(provider1.getVirtualBTCContribution()).toStrictEqual(0);
                expect(instances.liquidityReserve.virtualTokenReserve).toStrictEqual(
                    TestInstances.initialVirtualTokenReserve,
                );
                expect(instances.liquidityReserve.liquidity).toStrictEqual(
                    TestInstances.initialTotalReserve,
                );
                expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
                expect(instances.fulfilledQueue.getQueue.getLength()).toStrictEqual(0);
                expect(instances.normalProviderQueue.getQueue().getLength()).toStrictEqual(1);
            });

            it('should handle provider without liquidity amount', () => {
                const instances: TestInstances = createTestInstances();
                const provider1: Provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    false,
                );
                provider1.clearInitialLiquidityProvider();
                provider1.markToReset();
                provider1.setVirtualBTCContribution(1000);
                provider1.setLiquidityAmount(u128.Zero);

                instances.normalProviderQueue.add(provider1);
                instances.fulfilledQueue.add(provider1.getQueueIndex());

                const resetCount: u32 = instances.fulfilledQueue.reset(
                    1,
                    instances.normalProviderQueue,
                );
                expect(resetCount).toStrictEqual(1);
                expect(provider1.isActive()).toBeFalsy();
                expect(provider1.getVirtualBTCContribution()).toStrictEqual(0);
                expect(instances.liquidityReserve.virtualTokenReserve).toStrictEqual(
                    TestInstances.initialVirtualTokenReserve,
                );
                expect(instances.liquidityReserve.liquidity).toStrictEqual(
                    TestInstances.initialTotalReserve,
                );
                expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
                expect(instances.fulfilledQueue.getQueue.getLength()).toStrictEqual(0);
                expect(instances.normalProviderQueue.getQueue().getLength()).toStrictEqual(1);
            });

            it('should handle provider without BTC contribution', () => {
                const instances: TestInstances = createTestInstances();
                const provider1: Provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    false,
                );
                provider1.clearInitialLiquidityProvider();
                provider1.markToReset();
                provider1.setVirtualBTCContribution(0);

                instances.normalProviderQueue.add(provider1);
                instances.fulfilledQueue.add(provider1.getQueueIndex());
                const liquidity: u256 = provider1.getLiquidityAmount().toU256();

                const resetCount: u32 = instances.fulfilledQueue.reset(
                    1,
                    instances.normalProviderQueue,
                );
                expect(resetCount).toStrictEqual(1);
                expect(provider1.isActive()).toBeFalsy();
                expect(provider1.getVirtualBTCContribution()).toStrictEqual(0);
                expect(instances.liquidityReserve.virtualTokenReserve).toStrictEqual(
                    TestInstances.initialVirtualTokenReserve,
                );
                expect(instances.liquidityReserve.liquidity).toStrictEqual(
                    TestInstances.initialTotalReserve,
                );
                expect(getPendingStakingContractAmount()).toStrictEqual(u256.Zero);
                expect(instances.fulfilledQueue.getQueue.getLength()).toStrictEqual(0);
                expect(instances.normalProviderQueue.getQueue().getLength()).toStrictEqual(1);
            });
        });
    });

    describe('error cases', () => {
        it('should throw when provider is not fulfilled', () => {
            expect(() => {
                const instances: TestInstances = createTestInstances();
                const provider1: Provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    false,
                    false,
                    false,
                );
                provider1.clearInitialLiquidityProvider();
                provider1.clearToReset();
                provider1.setVirtualBTCContribution(1000);

                instances.normalProviderQueue.add(provider1);
                instances.fulfilledQueue.add(provider1.getQueueIndex());

                instances.fulfilledQueue.reset(1, instances.normalProviderQueue);
            }).toThrow('Impossible state: provider is not fulfilled.');
        });
    });
});
