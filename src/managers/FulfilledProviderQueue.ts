import { Blockchain, Revert, StoredU32Array } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { addAmountToStakingContract, getProvider, Provider } from '../models/Provider';
import { ProviderFulfilledEvent } from '../events/ProviderFulfilledEvent';
import { ILiquidityQueueReserve } from './interfaces/ILiquidityQueueReserve';
import { ProviderQueue } from './ProviderQueue';

export class FulfilledProviderQueue {
    protected readonly queue: StoredU32Array;
    protected readonly liquidityQueueReserve: ILiquidityQueueReserve;

    constructor(
        pointer: u16,
        subPointer: Uint8Array,
        liquidityQueueReserve: ILiquidityQueueReserve,
    ) {
        this.queue = new StoredU32Array(pointer, subPointer);
        this.liquidityQueueReserve = liquidityQueueReserve;
    }

    public add(providerIndex: u32): void {
        this.queue.push(providerIndex, true);
    }

    public reset(count: u32, associatedQueue: ProviderQueue): u32 {
        const countToResets: u32 = min(count, this.queue.getLength());

        for (let index: u32 = 0; index < countToResets; index++) {
            const providerIndex: u32 = this.queue.next();
            this.resetProvider(providerIndex, associatedQueue);
        }

        return countToResets;
    }

    public save(): void {
        this.queue.save();
    }

    protected ensureProviderIsFulfilled(provider: Provider): void {
        if (!provider.toReset()) {
            throw new Revert(`Impossible state: provider is not fulfilled.`);
        }
    }

    private resetProvider(providerIndex: u32, associatedQueue: ProviderQueue): void {
        let stakedAmount: u256 = u256.Zero;
        const providerId: u256 = associatedQueue.getAt(providerIndex);
        const provider: Provider = getProvider(providerId);

        this.ensureProviderIsFulfilled(provider);

        if (!provider.isInitialLiquidityProvider()) {
            associatedQueue.remove(provider);
        }

        const btcContribution = provider.getVirtualBTCContribution();
        const hasContribution = btcContribution > 0;

        if (provider.hasLiquidityAmount()) {
            stakedAmount = provider.getLiquidityAmount().toU256();

            this.liquidityQueueReserve.subFromTotalReserve(stakedAmount);
            this.liquidityQueueReserve.subFromVirtualTokenReserve(stakedAmount);
            addAmountToStakingContract(stakedAmount);
        }

        //!!!! purged???
        if (hasContribution) {
            provider.setVirtualBTCContribution(0);
        }

        this.queue.removeItemFromLength();
        this.queue.applyNextOffsetToStartingIndex();

        provider.resetListingProviderValues();

        Blockchain.emit(new ProviderFulfilledEvent(provider.getId(), false, false, stakedAmount));
    }
}
