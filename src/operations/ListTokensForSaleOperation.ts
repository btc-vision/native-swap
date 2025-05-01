import { BaseOperation } from './BaseOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../models/Provider';
import {
    Address,
    Blockchain,
    Revert,
    SafeMath,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { tokensToSatoshis } from '../utils/SatoshisConversion';
import { getTotalFeeCollected } from '../utils/BlockchainUtils';
import { LiquidityListedEvent } from '../events/LiquidityListedEvent';
import { FeeManager } from '../managers/FeeManager';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT } from '../constants/Contract';

export class ListTokensForSaleOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly amountIn: u128;
    private readonly receiver: string;
    private readonly usePriorityQueue: boolean;
    private readonly initialLiquidity: boolean;
    private readonly provider: Provider;
    private readonly oldLiquidity: u256;

    constructor(
        liquidityQueue: ILiquidityQueue,
        providerId: u256,
        amountIn: u128,
        receiver: string,
        private readonly stakingAddress: Address,
        usePriorityQueue: boolean,
        initialLiquidity: boolean = false,
    ) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.amountIn = amountIn;
        this.receiver = receiver;
        this.usePriorityQueue = usePriorityQueue;
        this.initialLiquidity = initialLiquidity;

        const provider = getProvider(providerId);
        this.provider = provider;
        this.oldLiquidity = provider.getLiquidityAmount();
    }

    public execute(): void {
        this.checkPreConditions();
        this.transferToken();
        this.emitLiquidityListedEvent();
    }

    private transferToken(): void {
        const amount = this.amountIn.toU256();
        this.pullInTokens(amount);
        const tax = this.calculateTax(this.amountIn);
        this.assertQueueSwitchAllowed();
        this.transitionProviderIfNeeded();
        this.updateProviderLiquidity();
        this.assignReceiver();
        this.increaseGlobalReserve(amount);
        this.deductTaxIfPriority(tax);
        this.snapshotBlockQuote();
    }

    private pullInTokens(amount: u256): void {
        TransferHelper.safeTransferFrom(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            amount,
        );
    }

    private calculateTax(gross: u128): u128 {
        const netLiquidity = this.usePriorityQueue
            ? this.liquidityQueue.getTokensAfterTax(gross)
            : gross;
        const tax = SafeMath.sub128(gross, netLiquidity);
        return tax;
    }

    private assertQueueSwitchAllowed(): void {
        const switched = this.usePriorityQueue !== this.provider.isPriority();
        if (!this.oldLiquidity.isZero() && switched) {
            throw new Revert(
                `NATIVE_SWAP: You must cancel your listings before using the priority queue.`,
            );
        }
    }

    private transitionProviderIfNeeded(): void {
        const isPromote =
            !this.provider.isPriority() && this.provider.isActive() && this.usePriorityQueue;

        if (isPromote) {
            this.provider.activate();
            this.provider.markPriority();
            this.liquidityQueue.addToPriorityQueue(this.provider);
        } else if (!this.provider.isActive()) {
            this.provider.activate();

            if (!this.initialLiquidity) {
                if (this.usePriorityQueue) {
                    this.provider.markPriority();
                    this.liquidityQueue.addToPriorityQueue(this.provider);
                } else {
                    this.provider.clearPriority();
                    this.liquidityQueue.addToStandardQueue(this.provider);
                }
            } else {
                this.provider.clearPriority();
            }
        }
    }

    private updateProviderLiquidity(): void {
        const updatedAmount = SafeMath.add128(this.oldLiquidity, this.amountIn);
        this.provider.setLiquidityAmount(updatedAmount);
    }

    private assignReceiver(): void {
        this.setProviderReceiver(this.provider);
    }

    private increaseGlobalReserve(amount: u256): void {
        this.liquidityQueue.increaseTotalReserve(amount);
    }

    private snapshotBlockQuote(): void {
        this.liquidityQueue.setBlockQuote();
    }

    private deductTaxIfPriority(tax: u128): void {
        if (this.usePriorityQueue) {
            this.removeTax(this.provider, tax);
        }
    }

    private removeTax(provider: Provider, totalTax: u128): void {
        if (totalTax.isZero()) {
            return;
        }

        provider.subtractFromLiquidityAmount(totalTax);

        this.liquidityQueue.buyTokens(totalTax.toU256(), u256.Zero);
        this.liquidityQueue.decreaseTotalReserve(totalTax.toU256());

        TransferHelper.safeTransfer(
            this.liquidityQueue.token,
            this.stakingAddress,
            totalTax.toU256(),
        );
    }

    private setProviderReceiver(provider: Provider): void {
        if (provider.hasReservedAmount() && provider.getbtcReceiver() !== this.receiver) {
            throw new Revert('NATIVE_SWAP: Cannot change receiver address while reserved.');
        } else if (!provider.hasReservedAmount()) {
            provider.setbtcReceiver(this.receiver);
        }
    }

    private emitLiquidityListedEvent(): void {
        const ev = new LiquidityListedEvent(this.provider.getLiquidityAmount(), this.receiver);
        Blockchain.emit(ev);
    }

    private checkPreConditions(): void {
        if (this.usePriorityQueue) {
            this.ensureEnoughPriorityFees();
        }

        this.ensureAmountInNotZero();
        this.ensureNoLiquidityOverflow();
        this.ensureNoActivePositionInPriorityQueue();
        this.ensureProviderNotAlreadyProvidingLiquidity();
        this.ensureNotInRemovalQueue();

        if (!this.initialLiquidity) {
            this.ensurePriceIsNotZero();
            this.ensureInitialProviderAddOnce();
            this.ensureLiquidityNotTooLowInSatoshis();
        }
    }

    private ensureNotInRemovalQueue(): void {
        if (this.provider.isPendingRemoval()) {
            throw new Revert(
                'NATIVE_SWAP: You are in the removal queue. Wait for removal of your liquidity first.',
            );
        }
    }

    private ensureProviderNotAlreadyProvidingLiquidity(): void {
        if (this.provider.isLiquidityProvisionAllowed()) {
            throw new Revert(
                'NATIVE_SWAP: You have an active position partially fulfilled. You must wait until it is fully fulfilled.',
            );
        }
    }

    private ensureNoLiquidityOverflow(): void {
        if (!u128.lt(this.oldLiquidity, SafeMath.sub128(u128.Max, this.amountIn))) {
            throw new Revert('NATIVE_SWAP: Liquidity overflow. Please add a smaller amount.');
        }
    }

    private ensureNoActivePositionInPriorityQueue(): void {
        if (this.provider.isPriority() && !this.usePriorityQueue) {
            throw new Revert(
                'NATIVE_SWAP: You already have an active position in the priority queue. Please use the priority queue.',
            );
        }
    }

    private ensurePriceIsNotZero(): void {
        const currentPrice: u256 = this.liquidityQueue.quote();
        if (currentPrice.isZero()) {
            throw new Revert(
                'NATIVE_SWAP: Quote is zero. Please set P0 if you are the owner of the token.',
            );
        }
    }

    private ensureInitialProviderAddOnce(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProviderId)) {
            throw new Revert(
                `NATIVE_SWAP: Initial provider can only add once, if not initialLiquidity.`,
            );
        }
    }

    private ensureLiquidityNotTooLowInSatoshis(): void {
        const currentPrice: u256 = this.liquidityQueue.quote();
        const liquidityInSatoshis: u256 = tokensToSatoshis(this.amountIn.toU256(), currentPrice);

        if (u256.lt(liquidityInSatoshis, MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT)) {
            throw new Revert(
                `NATIVE_SWAP: Liquidity value is too low in satoshis. (provided: ${liquidityInSatoshis})`,
            );
        }
    }

    private ensureEnoughPriorityFees(): void {
        const feesCollected: u64 = getTotalFeeCollected();
        const costPriorityQueue: u64 = FeeManager.priorityQueueBaseFee;

        if (feesCollected < costPriorityQueue) {
            throw new Revert('NATIVE_SWAP: Not enough fees for priority queue.');
        }
    }

    private ensureAmountInNotZero(): void {
        if (this.amountIn.isZero()) {
            throw new Revert('NATIVE_SWAP: Amount in cannot be zero');
        }
    }
}
