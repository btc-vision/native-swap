import { BaseOperation } from './BaseOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../models/Provider';
import { Blockchain, Revert, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { LiquidityRemovedEvent } from '../events/LiquidityRemovedEvent';
import { ActivateProviderEvent } from '../events/ActivateProviderEvent';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';

export class RemoveLiquidityOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly provider: Provider;

    constructor(liquidityQueue: ILiquidityQueue, providerId: u256) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.provider = getProvider(providerId);
    }

    public execute(): void {
        this.checkPreConditions();
        const btcOwed = this.getBtcOwed();
        const tokenAmount: u256 = this.getLiquidityProvided();
        this.pullOutTokens(tokenAmount);
        this.updateProvider();
        this.updateLiquidityQueue(tokenAmount, btcOwed);
        this.emitActivateProviderEvent(btcOwed);
        this.emitLiquidityRemovedEvent(btcOwed, tokenAmount);
    }

    private checkPreConditions(): void {
        this.ensureIsLiquidityProvider();
        this.ensureIsNotInitialProvider();
        this.ensureProviderHasNoListedTokens();
        this.ensureNotInPendingRemoval();
    }

    private getBtcOwed(): u256 {
        const btcOwed = this.liquidityQueue.getBTCowed(this.providerId);
        this.ensureBTCOwedNotZero(btcOwed);

        return btcOwed;
    }

    private getLiquidityProvided(): u256 {
        const tokenAmount: u256 = this.provider.getLiquidityProvided();
        this.ensureLiquidityProvidedNotZero(tokenAmount);

        return tokenAmount;
    }

    private pullOutTokens(amount: u256): void {
        TransferHelper.safeTransfer(this.liquidityQueue.token, Blockchain.tx.sender, amount);
    }

    private updateProvider(): void {
        this.provider.setLiquidityProvided(u256.Zero);
        this.provider.markPendingRemoval();
    }

    private updateLiquidityQueue(tokenAmount: u256, btcOwed: u256): void {
        this.liquidityQueue.decreaseTotalReserve(tokenAmount);
        this.liquidityQueue.decreaseVirtualTokenReserve(tokenAmount);
        this.liquidityQueue.decreaseVirtualBTCReserve(btcOwed);
        this.liquidityQueue.addToRemovalQueue(this.provider);
    }

    private ensureIsLiquidityProvider(): void {
        if (!this.provider.isLiquidityProvider()) {
            throw new Revert('NATIVE_SWAP: Not a liquidity provider');
        }
    }

    private ensureIsNotInitialProvider(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProviderId)) {
            throw new Revert('NATIVE_SWAP: Initial provider cannot remove liquidity');
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

    private ensureBTCOwedNotZero(btcOwed: u256): void {
        if (btcOwed.isZero()) {
            throw new Revert(
                'NATIVE_SWAP: You have no BTC owed. Did you already remove everything?',
            );
        }
    }

    private ensureLiquidityProvidedNotZero(tokenAmount: u256): void {
        if (tokenAmount.isZero()) {
            throw new Revert('NATIVE_SWAP: You have no tokens to remove.');
        }
    }

    private emitActivateProviderEvent(btcOwed: u256): void {
        Blockchain.emit(new ActivateProviderEvent(this.providerId, u128.Zero, btcOwed));
    }

    private emitLiquidityRemovedEvent(btcOwed: u256, tokenAmount: u256): void {
        Blockchain.emit(new LiquidityRemovedEvent(this.providerId, btcOwed, tokenAmount));
    }
}
