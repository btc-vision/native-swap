import { clearCachedProviders, Provider } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createProvider,
    createProviders,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    tokenAddress1,
    tokenAddress2,
    tokenIdUint8Array1,
} from './test_helper';
import { REMOVAL_QUEUE_POINTER } from '../constants/StoredPointers';
import { RemovalProviderQueue } from '../managers/RemovalProviderQueue';
import { OwedBTCManager } from '../managers/OwedBTCManager';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { ENABLE_INDEX_VERIFICATION, INDEX_NOT_SET_VALUE } from '../constants/Contract';

const QUOTE = u256.fromU64(100000000);

describe('ProviderQueue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('RemovalProviderQueue – add()', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('adds provider and sets removalQueueIndex', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true);
            const index: u32 = queue.add(provider);
            expect(provider.getQueueIndex()).toStrictEqual(index);
        });
    });

    describe('RemovalProviderQueue – resetProvider', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('clears pending and liquidity flags', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true, true);
            const index: u32 = queue.add(provider);
            queue.resetProvider(provider);
            expect(provider.isPendingRemoval()).toBeFalsy();
            expect(provider.isLiquidityProvider()).toBeFalsy();
            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
            expect(queue.getAt(index)).toStrictEqual(u256.Zero);
        });
    });

    describe('ProviderQueue – cleanUp', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('does nothing when queue is empty', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const result: u32 = queue.cleanUp(0);
            expect(result).toStrictEqual(0);
        });

        it('skips zero slots and continues', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const p1: Provider = createProvider(providerAddress1, tokenAddress1, true, true);
            queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2, true, true);
            queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2, true, true);
            queue.add(p3);

            queue.remove(p1);
            queue.remove(p2);
            queue.remove(p3);

            const result: u32 = queue.cleanUp(0);
            expect(result).toStrictEqual(3);
            expect(queue.startingIndex).toStrictEqual(0);
        });

        //!!! not sure needed
        it('deletes non pending removal providers', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            const p1Index: u32 = queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            const p2Index: u32 = queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            const p3Index: u32 = queue.add(p3);

            const result: u32 = queue.cleanUp(0);
            expect(result).toStrictEqual(3);
            expect(queue.getAt(0)).toStrictEqual(u256.Zero);
            expect(queue.getAt(1)).toStrictEqual(u256.Zero);
            expect(queue.getAt(2)).toStrictEqual(u256.Zero);
            expect(queue.startingIndex).toStrictEqual(0);
        });

        it('sets starting index when a pending removal provider is found', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2);
            queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2, true);
            queue.add(p3);

            queue.remove(p1);

            const result: u32 = queue.cleanUp(0);

            expect(result).toStrictEqual(2);
            expect(queue.startingIndex).toStrictEqual(2);
        });

        //!!! not sure needed
        it('returns index = length if no pending removal providers found', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const providers: Provider[] = createProviders(5, 0);

            for (let i: i32 = 0; i < providers.length; i++) {
                queue.add(providers[i]);
            }

            const result: u32 = queue.cleanUp(0);
            expect(result).toStrictEqual(providers.length);
        });

        //!!! not sure needed
        it('stops cleanup early at first pending removal provider', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const p1: Provider = createProvider(providerAddress1, tokenAddress1);
            queue.add(p1);

            const p2: Provider = createProvider(providerAddress2, tokenAddress2, true);
            queue.add(p2);

            const p3: Provider = createProvider(providerAddress3, tokenAddress2);
            queue.add(p3);

            const result: u32 = queue.cleanUp(0);

            expect(result).toStrictEqual(1);
            expect(queue.startingIndex).toStrictEqual(1);
        });

        it('cleanUp startingIndex = length returns length', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const p1: Provider = createProvider(providerAddress1, tokenAddress1, true);
            const p1Index: u32 = queue.add(p1);

            const result = queue.cleanUp(1);
            expect(result).toStrictEqual(1);
        });
    });

    describe('RemovalProviderQueue – getNextWithLiquidity', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('returns provider if pending and LP and valid owed', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1, true, true);
            queue.add(provider);
            owedBTCManager.setSatoshisOwed(provider.getId(), 100000);
            owedBTCManager.setSatoshisOwedReserved(provider.getId(), 10000);

            const result: Provider | null = queue.getNextWithLiquidity(QUOTE);

            expect(result).not.toBeNull();
            expect(result).toBe(provider);
        });

        it('removes provider if not pending or not LP', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                false,
            );
            const index: u32 = queue.add(provider);

            const result: Provider | null = queue.getNextWithLiquidity(QUOTE);
            expect(result).toBeNull();
            expect(queue.getAt(index)).toStrictEqual(u256.Zero);
            expect(provider.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        });

        it('skip providers if 0', () => {
            const owedBTCManager = new OwedBTCManager();
            const queue = new RemovalProviderQueue(
                owedBTCManager,
                tokenAddress1,
                REMOVAL_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
            );

            const provider: Provider = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                false,
            );
            const index: u32 = queue.add(provider);

            queue.remove(provider);

            const result: Provider | null = queue.getNextWithLiquidity(QUOTE);
            expect(result).toBeNull();
        });

        it('throws if reservedBTC > owedBTC', () => {
            expect(() => {
                const owedBTCManager = new OwedBTCManager();
                const queue = new RemovalProviderQueue(
                    owedBTCManager,
                    tokenAddress1,
                    REMOVAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    ENABLE_INDEX_VERIFICATION,
                );

                const provider: Provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    true,
                    true,
                );
                queue.add(provider);
                owedBTCManager.setSatoshisOwed(provider.getId(), 10000);
                owedBTCManager.setSatoshisOwedReserved(provider.getId(), 20000);

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });

        it('throws if owedBTC is below minimum', () => {
            expect(() => {
                const owedBTCManager = new OwedBTCManager();
                const queue = new RemovalProviderQueue(
                    owedBTCManager,
                    tokenAddress1,
                    REMOVAL_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    ENABLE_INDEX_VERIFICATION,
                );

                const provider: Provider = createProvider(
                    providerAddress1,
                    tokenAddress1,
                    true,
                    true,
                );
                queue.add(provider);
                owedBTCManager.setSatoshisOwed(provider.getId(), 10);
                owedBTCManager.setSatoshisOwedReserved(provider.getId(), 0);

                queue.getNextWithLiquidity(QUOTE);
            }).toThrow();
        });
    });
});
