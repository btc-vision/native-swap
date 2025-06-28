import { BaseOperation } from './BaseOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../models/Provider';
import { Blockchain, Revert, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { LiquidityRemovedEvent } from '../events/LiquidityRemovedEvent';
import { ProviderActivatedEvent } from '../events/ProviderActivatedEvent';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';

export class RemoveLiquidityOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly provider: Provider;

    constructor(liquidityQueue: ILiquidityQueue, providerId: u256) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.provider = getProvider(providerId);
    }

    public override execute(): void {
        this.checkPreConditions();
        const satoshisOwed: u64 = this.getSatoshisOwed();
        const tokenAmount: u128 = this.getLiquidityProvided();
        const tokenAmount256: u256 = tokenAmount.toU256();

        this.pullOutTokens(tokenAmount256);
        this.updateProvider();
        this.updateLiquidityQueue(tokenAmount256, satoshisOwed);
        this.emitProviderActivatedEvent(satoshisOwed);
        this.emitLiquidityRemovedEvent(satoshisOwed, tokenAmount);
    }

    private checkPreConditions(): void {
        this.ensureIsLiquidityProvider();
        this.ensureIsNotInitialProvider();
        this.ensureProviderHasNoListedTokens();
        this.ensureNotInPendingRemoval();
    }

    private emitProviderActivatedEvent(satoshisOwed: u64): void {
        Blockchain.emit(new ProviderActivatedEvent(this.providerId, u128.Zero, satoshisOwed));
    }

    private emitLiquidityRemovedEvent(satoshisOwed: u64, tokenAmount: u128): void {
        Blockchain.emit(new LiquidityRemovedEvent(this.providerId, satoshisOwed, tokenAmount));
    }

    private ensureIsLiquidityProvider(): void {
        if (!this.provider.isLiquidityProvider()) {
            throw new Revert('NATIVE_SWAP: Not a liquidity provider.');
        }
    }

    private ensureIsNotInitialProvider(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProviderId)) {
            throw new Revert('NATIVE_SWAP: Initial provider cannot remove liquidity.');
        }
    }

    private ensureProviderHasNoListedTokens(): void {
        if (this.provider.hasLiquidityAmount()) {
            throw new Revert(
                'NATIVE_SWAP: You cannot remove your liquidity because you have active listing.',
            );
        }
    }

    private ensureNotInPendingRemoval(): void {
        if (this.provider.isPendingRemoval()) {
            throw new Revert('NATIVE_SWAP: You are already in the removal queue.');
        }
    }

    private ensureSatoshisOwedNotZero(SatoshisOwed: u64): void {
        if (SatoshisOwed === 0) {
            throw new Revert(
                'NATIVE_SWAP: You have no BTC owed. Did you already remove everything?',
            );
        }
    }

    private ensureLiquidityProvidedNotZero(liquidityProvided: u128): void {
        if (liquidityProvided.isZero()) {
            throw new Revert('NATIVE_SWAP: You have no liquidity to remove.');
        }
    }

    private getLiquidityProvided(): u128 {
        const liquidityProvided: u128 = this.provider.getLiquidityProvided();
        this.ensureLiquidityProvidedNotZero(liquidityProvided);

        return liquidityProvided;
    }

    private getSatoshisOwed(): u64 {
        const satoshisOwed: u64 = this.liquidityQueue.getSatoshisOwed(this.providerId);
        this.ensureSatoshisOwedNotZero(satoshisOwed);

        return satoshisOwed;
    }

    private pullOutTokens(amount: u256): void {
        TransferHelper.safeTransfer(this.liquidityQueue.token, Blockchain.tx.sender, amount);
    }

    private updateLiquidityQueue(tokenAmount: u256, satoshisOwed: u64): void {
        this.liquidityQueue.decreaseTotalReserve(tokenAmount);
        this.liquidityQueue.decreaseVirtualTokenReserve(tokenAmount);
        this.liquidityQueue.decreaseVirtualSatoshisReserve(satoshisOwed);
        this.liquidityQueue.addToRemovalQueue(this.provider);
    }

    private updateProvider(): void {
        this.provider.setLiquidityProvided(u128.Zero);
        this.provider.markPendingRemoval();
    }
}
