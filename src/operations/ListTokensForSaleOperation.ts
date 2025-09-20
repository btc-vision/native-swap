import { BaseOperation } from './BaseOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { addAmountToStakingContract, getProvider, Provider } from '../models/Provider';
import {
    BitcoinAddresses,
    Blockchain,
    Network,
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
    CSV_BLOCKS_REQUIRED,
    INDEX_NOT_SET_VALUE,
    MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT,
    PERCENT_TOKENS_FOR_PRIORITY_FACTOR_TAX,
    PERCENT_TOKENS_FOR_PRIORITY_QUEUE_TAX,
} from '../constants/Contract';

export class ListTokensForSaleOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly amountIn: u128;
    private readonly amountIn256: u256;
    private readonly receiver: Uint8Array;
    private readonly receiverStr: string;
    private readonly usePriorityQueue: boolean;
    private readonly isForInitialLiquidity: boolean;
    private readonly provider: Provider;
    private readonly oldLiquidity: u128;

    constructor(
        liquidityQueue: ILiquidityQueue,
        providerId: u256,
        amountIn: u128,
        receiver: Uint8Array,
        receiverStr: string, // Ensure we recompute the right string
        usePriorityQueue: boolean,
        isForInitialLiquidity: boolean = false,
    ) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.amountIn = amountIn;
        this.amountIn256 = amountIn.toU256();
        this.receiver = receiver;
        this.receiverStr = receiverStr;
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
            // ENTRY-PRICE TRACKING: Accumulate BTC contribution for new tokens
            const currentQuote = this.liquidityQueue.quote();
            if (!currentQuote.isZero()) {
                // Calculate BTC value of the NEW tokens being added (not the total)
                const newTokensBtcValue = tokensToSatoshis(this.amountIn256, currentQuote);

                // Get existing contribution and add the new amount
                const existingContribution = this.provider.getVirtualBTCContribution();
                const updatedContribution = existingContribution + newTokensBtcValue;

                // Store the accumulated total
                this.provider.setVirtualBTCContribution(updatedContribution);
            }

            // Add half tokens to virtual reserves (causes price drop)
            this.liquidityQueue.increaseTotalTokensSellActivated(deltaHalf.toU256()); // same as addToTotalTokensSellActivated
        }
    }

    private ensureValidReceiverAddress(receiver: string): void {
        if (Blockchain.validateBitcoinAddress(receiver) == false) {
            throw new Revert('NATIVE_SWAP: Invalid receiver address.');
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
        const hasReceiver: boolean = this.provider.hasReservedAmount();
        if (hasReceiver && this.provider.getBtcReceiver() !== this.receiverStr) {
            throw new Revert('NATIVE_SWAP: Cannot change receiver address while reserved.');
        } else if (!hasReceiver) {
            this.verifyReceiverAddress();

            this.provider.setBtcReceiver(this.receiverStr);
        }
    }

    private verifyReceiverAddress(): void {
        const isValidCSV = BitcoinAddresses.verifyCsvP2wshAddress(
            this.receiver,
            CSV_BLOCKS_REQUIRED,
            this.receiverStr,
            Network.hrp(Blockchain.network),
        );

        if (!isValidCSV) {
            throw new Revert(
                `NATIVE_SWAP: Invalid receiver address. Expected CSV P2WSH address with ${CSV_BLOCKS_REQUIRED} blocks.`,
            );
        }
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

        this.ensureValidReceiverAddress(this.receiverStr);
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

    private deductTaxIfPriority(): u256 {
        if (!this.usePriorityQueue) {
            return u256.Zero;
        }

        const tax: u128 = this.calculateTax();

        if (tax.isZero()) {
            return u256.Zero;
        }

        const tax256: u256 = tax.toU256();

        // Only deduct from provider's amount
        this.provider.subtractFromLiquidityAmount(tax);

        // Send to staking
        addAmountToStakingContract(tax256);

        // Return tax amount so caller can adjust what goes into reserves
        return tax256;
    }

    private emitLiquidityListedEvent(): void {
        Blockchain.emit(
            new LiquidityListedEvent(this.provider.getLiquidityAmount(), this.receiverStr),
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

        // Calculate tax (if any) and get net amount
        const taxAmount = this.deductTaxIfPriority();
        const netAmount = SafeMath.sub(this.amountIn256, taxAmount);

        // Only add net amount to reserves
        this.liquidityQueue.increaseTotalReserve(netAmount);

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
