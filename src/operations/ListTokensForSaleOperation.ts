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
import {
    MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT,
    PERCENT_TOKENS_FOR_PRIORITY_FACTOR_TAX,
    PERCENT_TOKENS_FOR_PRIORITY_QUEUE_TAX,
} from '../constants/Contract';

export class ListTokensForSaleOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly amountIn: u128;
    private readonly amountIn256: u256;
    private readonly receiver: string;
    private readonly usePriorityQueue: boolean;
    private readonly isForInitialLiquidity: boolean;
    private readonly provider: Provider;
    private readonly oldLiquidity: u128;

    constructor(
        liquidityQueue: ILiquidityQueue,
        providerId: u256,
        amountIn: u128,
        receiver: string,
        private readonly stakingAddress: Address,
        usePriorityQueue: boolean,
        isForInitialLiquidity: boolean = false,
    ) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.amountIn = amountIn;
        this.amountIn256 = amountIn.toU256();
        this.receiver = receiver;
        this.usePriorityQueue = usePriorityQueue;
        this.isForInitialLiquidity = isForInitialLiquidity;

        const provider: Provider = getProvider(providerId);
        this.provider = provider;
        this.oldLiquidity = provider.getLiquidityAmount();
    }

    public execute(): void {
        this.checkPreConditions();
        this.transferToken();
        this.emitLiquidityListedEvent();
    }

    private assignBlockNumber(): void {
        this.provider.setListedTokenAtBlock(Blockchain.block.number);
    }

    private assignReceiver(): void {
        if (this.provider.hasReservedAmount() && this.provider.getBtcReceiver() !== this.receiver) {
            throw new Revert('NATIVE_SWAP: Cannot change receiver address while reserved.');
        } else if (!this.provider.hasReservedAmount()) {
            this.provider.setBtcReceiver(this.receiver);
        }
    }

    private assertQueueSwitchAllowed(): void {
        const switched: boolean = this.usePriorityQueue !== this.provider.isPriority();
        if (!this.oldLiquidity.isZero() && switched) {
            throw new Revert(
                `NATIVE_SWAP: You must cancel your listings before using the priority queue.`,
            );
        }
    }

    private calculateTax(): u128 {
        const tokensForPriorityQueue: u128 = SafeMath.div128(
            SafeMath.mul128(this.amountIn, PERCENT_TOKENS_FOR_PRIORITY_QUEUE_TAX),
            PERCENT_TOKENS_FOR_PRIORITY_FACTOR_TAX,
        );

        return tokensForPriorityQueue;
    }

    private checkPreConditions(): void {
        if (this.usePriorityQueue) {
            this.ensureEnoughPriorityFees();
        }

        this.ensureAmountInIsNotZero();
        this.ensureNoLiquidityOverflow();
        this.ensureNoActivePositionInPriorityQueue();
        this.ensureProviderNotAlreadyProvidingLiquidity();
        this.ensureNotInRemovalQueue();

        if (!this.isForInitialLiquidity) {
            this.ensurePriceIsNotZero();
            this.ensureInitialProviderAddOnce();
            this.ensureLiquidityNotTooLowInSatoshis();
        }
    }

    private deductTaxIfPriority(): void {
        if (this.usePriorityQueue) {
            const tax: u128 = this.calculateTax();

            if (!tax.isZero()) {
                const tax256: u256 = tax.toU256();

                this.provider.subtractFromLiquidityAmount(tax);

                this.liquidityQueue.buyTokens(tax256, 0);
                this.liquidityQueue.decreaseTotalReserve(tax256);

                TransferHelper.safeTransfer(this.liquidityQueue.token, this.stakingAddress, tax256);
            }
        }
    }

    private emitLiquidityListedEvent(): void {
        Blockchain.emit(
            new LiquidityListedEvent(this.provider.getLiquidityAmount(), this.receiver),
        );
    }

    private ensureAmountInIsNotZero(): void {
        if (this.amountIn.isZero()) {
            throw new Revert('NATIVE_SWAP: Amount in cannot be zero');
        }
    }

    private ensureEnoughPriorityFees(): void {
        const feesCollected: u64 = getTotalFeeCollected();
        const costPriorityQueue: u64 = FeeManager.priorityQueueBaseFee;

        if (feesCollected < costPriorityQueue) {
            throw new Revert('NATIVE_SWAP: Not enough fees for priority queue.');
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
        const liquidityInSatoshis: u64 = tokensToSatoshis(this.amountIn256, currentPrice);

        if (liquidityInSatoshis < MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT) {
            throw new Revert(
                `NATIVE_SWAP: Liquidity value is too low in satoshis. (provided: ${liquidityInSatoshis}.)`,
            );
        }
    }

    private ensureNoActivePositionInPriorityQueue(): void {
        if (this.provider.isPriority() && !this.usePriorityQueue) {
            throw new Revert(
                'NATIVE_SWAP: You already have an active position in the priority queue. Please use the priority queue.',
            );
        }
    }

    private ensureNoLiquidityOverflow(): void {
        if (!u128.lt(this.oldLiquidity, SafeMath.sub128(u128.Max, this.amountIn))) {
            throw new Revert('NATIVE_SWAP: Liquidity overflow. Please add a smaller amount.');
        }
    }

    private ensureNotInRemovalQueue(): void {
        if (this.provider.isPendingRemoval()) {
            throw new Revert(
                'NATIVE_SWAP: You are in the removal queue. Wait for removal of your liquidity first.',
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

    private ensureProviderNotAlreadyProvidingLiquidity(): void {
        if (this.provider.isLiquidityProvisionAllowed()) {
            throw new Revert(
                'NATIVE_SWAP: You have an active position partially fulfilled. You must wait until it is fully fulfilled.',
            );
        }
    }

    private increaseGlobalReserve(): void {
        this.liquidityQueue.increaseTotalReserve(this.amountIn256);
    }

    private pullInTokens(): void {
        TransferHelper.safeTransferFrom(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            this.amountIn256,
        );
    }

    private snapshotBlockQuote(): void {
        this.liquidityQueue.setBlockQuote();
    }

    private transferToken(): void {
        this.pullInTokens();
        this.assertQueueSwitchAllowed();
        this.transitionProviderIfNeeded();
        this.updateProviderLiquidity();
        this.assignBlockNumber();
        this.assignReceiver();
        this.increaseGlobalReserve();
        this.deductTaxIfPriority();
        this.snapshotBlockQuote();
    }

    private transitionProviderIfNeeded(): void {
        //!!!! REDO
        // what if moving. must remove from old queue
        const wasNormal =
            !this.provider.isPriority() && this.provider.isActive() && this.usePriorityQueue;

        if (wasNormal) {
            this.provider.activate();
            this.provider.markPriority();
            this.liquidityQueue.addToPriorityQueue(this.provider);
        } else if (!this.provider.isActive()) {
            if (!this.isForInitialLiquidity) {
                this.provider.activate();
                if (this.usePriorityQueue) {
                    this.provider.markPriority();
                    this.liquidityQueue.addToPriorityQueue(this.provider);
                } else {
                    this.provider.clearPriority();
                    this.liquidityQueue.addToNormalQueue(this.provider);
                }
            } else {
                this.provider.activate();
                this.provider.clearPriority();
            }
        }
    }

    private updateProviderLiquidity(): void {
        const updatedAmount: u128 = SafeMath.add128(this.oldLiquidity, this.amountIn);
        this.provider.setLiquidityAmount(updatedAmount);
    }
}
