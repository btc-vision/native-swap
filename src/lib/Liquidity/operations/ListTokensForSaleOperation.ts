import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../../Provider';
import {
    Address,
    Blockchain,
    Revert,
    SafeMath,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { getTotalFeeCollected, tokensToSatoshis } from '../../../utils/NativeSwapUtils';
import { LiquidityListedEvent } from '../../../events/LiquidityListedEvent';
import { FeeManager } from '../../FeeManager';

export class ListTokensForSaleOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly amountIn: u128;

    private readonly receiver: string;

    private readonly usePriorityQueue: boolean;
    private readonly initialLiquidity: boolean;

    private readonly provider: Provider;
    private readonly oldLiquidity: u128;

    constructor(
        liquidityQueue: LiquidityQueue,
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
        this.oldLiquidity = provider.liquidity;
    }

    public execute(): void {
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

        this.transferToken();
        this.emitLiquidityListedEvent();
    }

    private ensureNotInRemovalQueue(): void {
        if (this.provider.pendingRemoval) {
            throw new Revert(
                'NATIVE_SWAP: You are in the removal queue. Wait for removal of your liquidity first.',
            );
        }
    }

    private ensureProviderNotAlreadyProvidingLiquidity(): void {
        if (this.provider.canProvideLiquidity()) {
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
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProvider)) {
            throw new Revert(
                `NATIVE_SWAP: Initial provider can only add once, if not initialLiquidity.`,
            );
        }
    }

    private ensureLiquidityNotTooLowInSatoshis(): void {
        const currentPrice: u256 = this.liquidityQueue.quote();
        const liquidityInSatoshis: u256 = tokensToSatoshis(this.amountIn.toU256(), currentPrice);

        if (
            u256.lt(
                liquidityInSatoshis,
                LiquidityQueue.MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY,
            )
        ) {
            throw new Revert(
                `NATIVE_SWAP: Liquidity value is too low in satoshis. (provided: ${liquidityInSatoshis})`,
            );
        }
    }

    private ensureEnoughPriorityFees(): void {
        const feesCollected: u64 = getTotalFeeCollected();
        const costPriorityQueue: u64 = FeeManager.PRIORITY_QUEUE_BASE_FEE;

        if (feesCollected < costPriorityQueue) {
            throw new Revert('NATIVE_SWAP: Not enough fees for priority queue.');
        }
    }

    private ensureAmountInNotZero(): void {
        if (this.amountIn.isZero()) {
            throw new Revert('NATIVE_SWAP: Amount in cannot be zero');
        }
    }

    private transferToken(): void {
        // transfer tokens
        const u256AmountIn = this.amountIn.toU256();
        TransferHelper.safeTransferFrom(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            u256AmountIn,
        );

        // net if priority
        const newLiquidityNet: u128 = this.usePriorityQueue
            ? this.liquidityQueue.getTokensAfterTax(this.amountIn)
            : this.amountIn;

        if (!this.oldLiquidity.isZero() && this.usePriorityQueue !== this.provider.isPriority()) {
            throw new Revert(
                `NATIVE_SWAP: You must cancel your listings before using the priority queue.`,
            );
        }

        this.addProviderToQueue();

        const newTax: u128 = SafeMath.sub128(this.amountIn, newLiquidityNet);

        // add to provider
        this.provider.liquidity = SafeMath.add128(this.oldLiquidity, this.amountIn);
        this.provider.setListedTokenAtBlock(Blockchain.block.number);

        this.setProviderReceiver(this.provider);

        // update total reserves
        this.liquidityQueue.increaseTotalReserve(u256AmountIn);

        // if priority => remove tax
        if (this.usePriorityQueue) {
            this.removeTax(newTax);
        }

        if (this.initialLiquidity) {
            this.activateSlashing(u256AmountIn);
        }

        this.liquidityQueue.setBlockQuote();
    }

    private HALF(n: u256): u256 {
        const halfFloor = SafeMath.div(n, u256.fromU32(2));
        return u256.add(halfFloor, u256.and(n, u256.One));
    }

    private activateSlashing(amountIn: u256): void {
        // Previous and new total liquidity
        const oldTotal: u256 = this.oldLiquidity.toU256();
        const newTotal: u256 = SafeMath.add(oldTotal, amountIn);

        const oldHalfCred: u256 = this.HALF(oldTotal);
        const newHalfCred: u256 = this.HALF(newTotal);

        // Credit only the delta (never negative)
        const deltaHalf: u256 = SafeMath.sub(newHalfCred, oldHalfCred);
        if (!deltaHalf.isZero()) {
            this.liquidityQueue.increaseTotalTokenSellActivated(deltaHalf);
        }
    }

    private addProviderToQueue(): void {
        this.provider.activate();

        if (!this.initialLiquidity) {
            if (this.usePriorityQueue) {
                this.provider.markPriority(true);
                this.liquidityQueue.addToPriorityQueue(this.provider.providerId);
            } else {
                this.liquidityQueue.addToStandardQueue(this.provider.providerId);
            }
        }
    }

    private removeTax(totalTax: u128): void {
        if (totalTax.isZero()) {
            return;
        }

        this.provider.decreaseLiquidity(totalTax);

        this.applyPenality(totalTax.toU256());
    }

    private applyPenality(amount: u256): void {
        this.liquidityQueue.decreaseTotalReserve(amount); // we are sending the tokens out of the contract.
        this.liquidityQueue.increaseVirtualTokenReserve(amount);

        TransferHelper.safeTransfer(this.liquidityQueue.token, this.stakingAddress, amount);
    }

    private setProviderReceiver(provider: Provider): void {
        if (provider.haveReserved() && provider.btcReceiver !== this.receiver) {
            throw new Revert('NATIVE_SWAP: Cannot change receiver address while reserved.');
        } else if (!provider.haveReserved()) {
            provider.btcReceiver = this.receiver;
        }
    }

    private emitLiquidityListedEvent(): void {
        const ev = new LiquidityListedEvent(this.provider.liquidity, this.receiver);
        Blockchain.emit(ev);
    }
}
