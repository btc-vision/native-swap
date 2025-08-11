import { BaseOperation } from './BaseOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { addAmountToStakingContract, getProvider, Provider } from '../models/Provider';
import { Blockchain, Revert, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { tokensToSatoshis } from '../utils/SatoshisConversion';
import { getTotalFeeCollected } from '../utils/BlockchainUtils';
import { LiquidityListedEvent } from '../events/LiquidityListedEvent';
import { FeeManager } from '../managers/FeeManager';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import {
    INDEX_NOT_SET_VALUE,
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

    public override execute(): void {
        this.checkPreConditions();
        this.transferToken();
        this.emitLiquidityListedEvent();
    }

    private activateSlashing(): void {
        const newTotal: u128 = SafeMath.add128(this.oldLiquidity, this.amountIn);
        const oldHalfCred: u128 = this.half(this.oldLiquidity);
        const newHalfCred: u128 = this.half(newTotal);
        const deltaHalf: u128 = SafeMath.sub128(newHalfCred, oldHalfCred);

        if (!deltaHalf.isZero()) {
            this.liquidityQueue.increaseVirtualTokenReserve(deltaHalf.toU256());
        }
    }

    private addProviderToQueue(): void {
        this.provider.activate();

        if (!this.isForInitialLiquidity) {
            // In case the provider is already in the queue, do not add it another time.
            // This can be the case when listing tokens with already listed tokens
            const queueIndex: u32 = this.provider.getQueueIndex();

            if (this.usePriorityQueue) {
                this.provider.markPriority();

                if (
                    queueIndex === INDEX_NOT_SET_VALUE ||
                    (queueIndex !== INDEX_NOT_SET_VALUE &&
                        queueIndex < this.liquidityQueue.getPriorityQueueStartingIndex())
                ) {
                    this.liquidityQueue.addToPriorityQueue(this.provider);
                }
            } else {
                if (
                    queueIndex === INDEX_NOT_SET_VALUE ||
                    (queueIndex !== INDEX_NOT_SET_VALUE &&
                        queueIndex < this.liquidityQueue.getNormalQueueStartingIndex())
                ) {
                    this.liquidityQueue.addToNormalQueue(this.provider);
                }
            }
        }
    }

    private assignBlockNumber(): void {
        this.provider.setListedTokenAtBlock(Blockchain.block.number);
    }

    private assignReceiver(): void {
        if (this.provider.hasReservedAmount() && this.provider.getBtcReceiver() !== this.receiver) {
            throw new Revert('NATIVE_SWAP: Cannot change receiver address while reserved.');
        } else if (!this.provider.hasReservedAmount()) {
            this.verifyReceiverAddress();

            this.provider.setBtcReceiver(this.receiver);
        }
    }

    private verifyReceiverAddress(): void {
        //Blockchain.validateBitcoinAddress();

        // TODO: Implement Bitcoin address validation
    }

    private assertQueueSwitchAllowed(): void {
        if (this.provider.isPriority() && this.oldLiquidity.isZero()) {
            throw new Revert(
                `Impossible state: Provider has no liquidity but still in the priority queue.`,
            );
        }

        const switched: boolean = this.usePriorityQueue !== this.provider.isPriority();

        if (switched && !this.oldLiquidity.isZero()) {
            throw new Revert(
                `NATIVE_SWAP: You must cancel your listings before switching queue type.`,
            );
        }
    }

    private calculateTax(): u128 {
        return SafeMath.div128(
            SafeMath.mul128(this.amountIn, PERCENT_TOKENS_FOR_PRIORITY_QUEUE_TAX),
            PERCENT_TOKENS_FOR_PRIORITY_FACTOR_TAX,
        );
    }

    private checkPreConditions(): void {
        if (this.usePriorityQueue) {
            this.ensureEnoughPriorityFees();
        }

        this.ensureAmountInIsNotZero();
        this.ensureNoLiquidityOverflow();
        this.ensureNoActivePositionInPriorityQueue();
        this.ensureProviderNotAlreadyProvidingLiquidity();
        this.ensureNoActiveReservation();
        this.ensureProviderIsNotPurged();

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
                this.liquidityQueue.decreaseTotalReserve(tax256);
                this.liquidityQueue.increaseVirtualTokenReserve(tax256);
                addAmountToStakingContract(tax256);
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
            throw new Revert('NATIVE_SWAP: Amount in cannot be zero.');
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

    private ensureNoActiveReservation(): void {
        if (this.provider.hasReservedAmount()) {
            throw new Revert(
                `NATIVE_SWAP: All active reservations on your listing must be completed before listing again.`,
            );
        }
    }

    private ensureProviderIsNotPurged(): void {
        if (this.provider.isPurged()) {
            throw new Revert(
                `NATIVE_SWAP: You are in the purge queue. Your current listing must be bought before listing again.`,
            );
        }
    }

    private ensureNoLiquidityOverflow(): void {
        if (!u128.lt(this.oldLiquidity, SafeMath.sub128(u128.Max, this.amountIn))) {
            throw new Revert('NATIVE_SWAP: Liquidity overflow. Please add a smaller amount.');
        }
    }

    private ensurePriceIsNotZero(): void {
        const currentPrice: u256 = this.liquidityQueue.quote();
        if (currentPrice.isZero()) {
            throw new Revert(
                'NATIVE_SWAP: Quote is zero. Please set initial price if you are the owner of the token.',
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

    private half(value: u128): u128 {
        const halfFloor = SafeMath.div128(value, u128.fromU32(2));
        return u128.add(halfFloor, u128.and(value, u128.One));
    }

    private increaseTotalReserve(): void {
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
        this.addProviderToQueue();
        this.updateProviderLiquidity();
        this.assignBlockNumber();
        this.assignReceiver();
        this.increaseTotalReserve();
        this.deductTaxIfPriority();

        if (!this.isForInitialLiquidity) {
            this.activateSlashing();
        }

        this.snapshotBlockQuote();
    }

    private updateProviderLiquidity(): void {
        const updatedAmount: u128 = SafeMath.add128(this.oldLiquidity, this.amountIn);
        this.provider.setLiquidityAmount(updatedAmount);
    }
}
