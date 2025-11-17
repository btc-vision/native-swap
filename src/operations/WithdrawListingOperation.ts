import { BaseOperation } from './BaseOperation';
import { getProvider, Provider } from '../models/Provider';
import { Blockchain, Revert, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { WithdrawListingEvent } from '../events/WithdrawListingEvent';

export class WithdrawListingOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly provider: Provider;

    constructor(liquidityQueue: ILiquidityQueue, providerId: u256) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.provider = getProvider(providerId);
    }

    public override execute(): void {
        const liquidityAmount: u128 = this.provider.getLiquidityAmount();

        if (liquidityAmount.isZero()) {
            throw new Revert('NATIVE_SWAP: Provider has no liquidity.');
        }

        this.prepareProviderForRefund();
        this.transferLiquidityBack(liquidityAmount);
        this.emitWithdrawListingEvent(liquidityAmount);
    }

    private emitWithdrawListingEvent(amount: u128): void {
        Blockchain.emit(
            new WithdrawListingEvent(
                amount,
                this.liquidityQueue.token,
                this.providerId,
                Blockchain.tx.sender,
            ),
        );
    }

    private prepareProviderForRefund(): void {
        this.provider.resetAll();
        this.provider.save();
    }

    private transferLiquidityBack(amount: u128): void {
        TransferHelper.transfer(this.liquidityQueue.token, Blockchain.tx.sender, amount.toU256());
    }
}
