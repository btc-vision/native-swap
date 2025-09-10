import { Address, Blockchain, Potential, Revert, StoredU32Array, } from '@btc-vision/btc-runtime/runtime';
import { INDEX_NOT_SET_VALUE } from '../constants/Contract';
import { addAmountToStakingContract, getProvider, Provider } from '../models/Provider';
import { ProviderQueue } from './ProviderQueue';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ProviderFulfilledEvent } from '../events/ProviderFulfilledEvent';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';

export class PurgedProviderQueue {
    readonly queue: StoredU32Array;
    protected readonly token: Address;
    protected readonly enableIndexVerification: boolean;
    protected readonly liquidityQueueReserve: ILiquidityQueueReserve;

    constructor(
        token: Address,
        pointer: u16,
        subPointer: Uint8Array,
        enableIndexVerification: boolean,
        liquidityQueueReserve: ILiquidityQueueReserve,
    ) {
        this.token = token;
        this.queue = new StoredU32Array(pointer, subPointer, INDEX_NOT_SET_VALUE - 1);
        this.enableIndexVerification = enableIndexVerification;
        this.liquidityQueueReserve = liquidityQueueReserve;
    }

    public get length(): u32 {
        return this.queue.getLength();
    }

    public add(provider: Provider): u32 {
        let index: u32 = INDEX_NOT_SET_VALUE;

        if (!provider.isInitialLiquidityProvider()) {
            this.ensureProviderNotAlreadyPurged(provider.isPurged());
            this.ensureProviderNotPriority(provider);
            this.ensureProviderQueueIndexIsValid(provider.getQueueIndex());

            provider.markPurged();

            index = this.queue.push(provider.getQueueIndex(), false);

            // LOG what we're storing
            Blockchain.log(
                `PurgedProviderQueue.add: Storing queueIndex=${provider.getQueueIndex()} at purgedIndex=${index} for providerId=${provider.getId()}`,
            );

            provider.setPurgedIndex(index);
        }

        return index;
    }

    /*public removeStaleEntries(associatedQueue: ProviderQueue): void {
        // Only process if we have entries
        if (this.queue.getLength() === 0) return;

        // Check from the current position without iterating everything
        const currentPos = this.queue.currentOffset;
        const providerIndex = this.queue.getAt(currentPos);
        const providerId = associatedQueue.getAt(providerIndex);

        if (providerId.isZero()) {
            // This entry is stale, remove it
            this.queue.removeItemFromLength();
            this.queue.applyNextOffsetToStartingIndex();
        }
    }*/

    public get(associatedQueue: ProviderQueue, quote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const queueLength: u32 = this.queue.getLength();
        let count: u32 = 0;

        while (count < queueLength && result === null) {
            const providerIndex: u32 = this.queue.next();
            if (providerIndex === INDEX_NOT_SET_VALUE) {
                count++;
                continue;
            }

            const providerId = associatedQueue.getAt(providerIndex);

            // Handle empty slot
            if (providerId.isZero()) {
                Blockchain.log(
                    `PurgedProviderQueue.get: Index ${providerIndex} is empty, removing stale entry`,
                );
                this.queue.removeItemFromLength();
                this.queue.applyNextOffsetToStartingIndex();
                count++;
                continue;
            }

            const provider = getProvider(providerId);

            // Handle wrong provider (index was reused)
            if (!provider.isPurged()) {
                Blockchain.log(
                    `PurgedProviderQueue.get: Provider ${providerId} at index ${providerIndex} is not purged (index was reused), removing stale entry`,
                );
                this.queue.removeItemFromLength();
                this.queue.applyNextOffsetToStartingIndex();
                count++;
                continue;
            }

            // Additional validation: verify the purged index matches
            if (provider.getPurgedIndex() !== this.queue.previousOffset) {
                Blockchain.log(
                    `PurgedProviderQueue.get: Provider purged index mismatch, removing stale entry`,
                );
                this.queue.removeItemFromLength();
                this.queue.applyNextOffsetToStartingIndex();
                count++;
                continue;
            }

            // Now we know it's the RIGHT provider
            result = this.returnProvider(associatedQueue, provider, providerIndex, quote);
            count++;
        }

        return result;
    }

    /*public get(associatedQueue: ProviderQueue, quote: u256): Provider | null {
        let result: Potential<Provider> = null;
        const queueLength: u32 = this.queue.getLength();
        let count: u32 = 0;

        while (count < queueLength && result === null) {
            const providerIndex: u32 = this.queue.next();
            if (providerIndex === INDEX_NOT_SET_VALUE) {
                count++;
                continue;
            }

            // Log what we're about to look up
            Blockchain.log(
                `PurgedProviderQueue.get: About to look up index ${providerIndex} in main queue`,
            );

            const providerId = associatedQueue.getAt(providerIndex);

            // Log what we got back
            Blockchain.log(
                `PurgedProviderQueue.get: Got providerId=${providerId} from index ${providerIndex}`,
            );

            this.ensureProviderIdIsValid(providerId);

            const provider = getProvider(providerId);
            this.ensureProviderPurged(provider);

            if (provider.getPurgedIndex() !== this.queue.previousOffset) {
                throw new Revert(
                    `Impossible state: Provider: ${provider.getId()} getPurgedIndex(${provider.getPurgedIndex()}) !== previousOffset(${this.queue.previousOffset}).`,
                );
            }

            result = this.returnProvider(associatedQueue, provider, providerIndex, quote);
            count++;
        }

        return result;
    }*/

    /*
    This remove the provider at current index. Be careful to ensure the provided provider is
     also the current in the queue.
     */
    public remove(provider: Provider): void {
        this.ensureProviderQueueIndexIsValid(provider.getPurgedIndex());
        this.queue.removeItemFromLength();
        this.queue.applyNextOffsetToStartingIndex();

        provider.clearPurged();
        provider.setPurgedIndex(INDEX_NOT_SET_VALUE);
    }

    public save(): void {
        this.queue.save();
    }

    protected ensureProviderIdIsValid(id: u256): void {
        if (id.isZero()) {
            throw new Revert(`Impossible state: providerId cannot be zero.`);
        }
    }

    protected ensureProviderNotAlreadyPurged(state: boolean): void {
        if (state) {
            throw new Revert('Impossible state: provider has already been purged.');
        }
    }

    protected ensureProviderQueueIndexIsValid(index: u32): void {
        if (index === INDEX_NOT_SET_VALUE) {
            throw new Revert('Impossible state: provider index is not defined.');
        }
    }

    protected ensureProviderPurged(provider: Provider): void {
        if (!provider.isPurged()) {
            throw new Revert(`Impossible state: provider has not been purged.`);
        }
    }

    private ensureProviderNotPriority(provider: Provider): void {
        if (provider.isPriority()) {
            throw new Revert(
                `Impossible state: only normal provider can be in the normal provider purged queue.`,
            );
        }
    }

    private resetProvider(provider: Provider, associatedQueue: ProviderQueue): void {
        Blockchain.log(
            `PurgedProviderQueue.resetProvider: providerId=${provider.getId()}, purgedIndex=${provider.getPurgedIndex()}`,
        );

        let stakedAmount: u256 = u256.Zero;
        this.ensureProviderPurged(provider);
        this.ensureProviderQueueIndexIsValid(provider.getPurgedIndex());

        if (provider.hasLiquidityAmount()) {
            stakedAmount = provider.getLiquidityAmount().toU256();

            this.liquidityQueueReserve.subFromTotalReserve(stakedAmount);
            this.liquidityQueueReserve.subFromVirtualTokenReserve(stakedAmount);
            addAmountToStakingContract(stakedAmount);
        }

        // Remove from normal/priority queue
        associatedQueue.remove(provider);

        this.queue.removeItemFromLength();
        this.queue.applyNextOffsetToStartingIndex();

        provider.resetListingProviderValues();

        Blockchain.emit(new ProviderFulfilledEvent(provider.getId(), false, false, stakedAmount));
    }

    // TODO: Potential optimization. we could verify to check if we want to skip an index but this adds complexity, but it could save gas.
    private returnProvider(
        associatedQueue: ProviderQueue,
        provider: Provider,
        index: u32,
        quote: u256,
    ): Provider | null {
        let result: Potential<Provider> = null;
        const availableLiquidity: u128 = provider.getAvailableLiquidityAmount();

        if (this.enableIndexVerification) {
            if (provider.getQueueIndex() !== index) {
                throw new Revert(
                    `Impossible state: provider.getQueueIndex (${provider.getQueueIndex()}) does not match index (${index}).`,
                );
            }

            if (provider.isInitialLiquidityProvider()) {
                throw new Revert(
                    'Impossible state: Initial liquidity provider cannot be returned here.',
                );
            }
        }

        if (Provider.meetsMinimumReservationAmount(availableLiquidity, quote)) {
            result = provider;
        } else if (!provider.hasReservedAmount()) {
            this.resetProvider(provider, associatedQueue);
        }

        return result;
    }
}
