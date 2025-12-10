import { clearCachedProviders, Provider } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import {
    createProvider,
    createProviders,
    providerAddress1,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { PriorityProviderQueue } from '../managers/PriorityProviderQueue';
import { NORMAL_QUEUE_FULFILLED, PRIORITY_QUEUE_POINTER } from '../constants/StoredPointers';
import {
    ENABLE_INDEX_VERIFICATION,
    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
    MAXIMUM_NUMBER_OF_PROVIDERS,
} from '../constants/Contract';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import { ILiquidityQueueReserve } from '../managers/interfaces/ILiquidityQueueReserve';
import { FulfilledProviderQueue } from '../managers/FulfilledProviderQueue';

const QUOTE = u256.fromU64(100000000);

//MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING
function createNormalFulfilledQueue(
    liquidityQueueReserve: ILiquidityQueueReserve,
): FulfilledProviderQueue {
    return new FulfilledProviderQueue(
        NORMAL_QUEUE_FULFILLED,
        tokenIdUint8Array1,
        liquidityQueueReserve,
    );
}

describe('PriorityProviderQueue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    describe('PriorityProviderQueue – add()', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('adds provider and sets queueIndex', () => {
            const liquidityQueueReserve = new LiquidityQueueReserve(
                tokenAddress1,
                tokenIdUint8Array1,
            );
            const queue: PriorityProviderQueue = new PriorityProviderQueue(
                tokenAddress1,
                PRIORITY_QUEUE_POINTER,
                tokenIdUint8Array1,
                ENABLE_INDEX_VERIFICATION,
                MAXIMUM_NUMBER_OF_PROVIDERS,
                liquidityQueueReserve,
                MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
            );

            const provider: Provider = createProvider(providerAddress1, tokenAddress1);
            provider.markPurged();

            const index: u32 = queue.add(provider);
            expect(provider.getQueueIndex()).toStrictEqual(index);
        });

        it('reverts when adding more provider than maximum provider count', () => {
            expect(() => {
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );
                const queue: PriorityProviderQueue = new PriorityProviderQueue(
                    tokenAddress1,
                    PRIORITY_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    ENABLE_INDEX_VERIFICATION,
                    5,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const providers: Provider[] = createProviders(6, 0);

                for (let i: i32 = 0; i < providers.length; i++) {
                    providers[i].markPriority();
                    queue.add(providers[i]);
                }
            }).toThrow();
        });
    });

    describe('PriorityProviderQueue getNextWithLiquidity()', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            TransferHelper.clearMockedResults();
        });

        it('throws if provider is not priority', () => {
            expect(() => {
                const liquidityQueueReserve = new LiquidityQueueReserve(
                    tokenAddress1,
                    tokenIdUint8Array1,
                );
                const queue: PriorityProviderQueue = new PriorityProviderQueue(
                    tokenAddress1,
                    PRIORITY_QUEUE_POINTER,
                    tokenIdUint8Array1,
                    ENABLE_INDEX_VERIFICATION,
                    MAXIMUM_NUMBER_OF_PROVIDERS,
                    liquidityQueueReserve,
                    MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING,
                );

                const fulfilledQueue: FulfilledProviderQueue =
                    createNormalFulfilledQueue(liquidityQueueReserve);

                const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
                provider1.clearPriority();
                queue.add(provider1);

                queue.getNextWithLiquidity(fulfilledQueue, QUOTE);
            }).toThrow();
        });
    });
});
