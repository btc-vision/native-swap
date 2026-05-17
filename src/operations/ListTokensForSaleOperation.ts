import { BaseOperation } from './BaseOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../models/Provider';
import {
    BitcoinAddresses,
    Blockchain,
    ExtendedAddress,
    Network,
    Revert,
    SafeMath,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { LiquidityListedEvent } from '../events/LiquidityListedEvent';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import {
    CSV_BLOCKS_REQUIRED,
    MAX_TICK,
    MIN_TICK,
    MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT,
} from '../constants/Contract';
import { TickMath } from '../utils/TickMath';

/**
 * List `amountIn` tokens at the given `priceTick`. Two paths:
 *   - first-list: provider not active → activate, set priceTick, push onto FIFO[tick]
 *   - top-up: provider already active at the SAME tick → just bump liquidityAmount
 *
 * To list at a different tick, the provider must `updateListing` first (or withdraw).
 *
 * **Minimum-value enforcement (NON-NEGOTIABLE)**: total post-op liquidity must be
 * worth ≥ `MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT` (= 20,000 sats) at the chosen tick.
 *
 * No listing fee, no priority tax. Buyer pays the 0.3% swap fee at settlement.
 */
export class ListTokensForSaleOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly amountIn: u128;
    private readonly amountIn256: u256;
    private readonly receiver: Uint8Array;
    private readonly receiverStr: string;
    private readonly priceTick: i32;
    private readonly provider: Provider;

    constructor(
        liquidityQueue: ILiquidityQueue,
        providerId: u256,
        amountIn: u128,
        receiver: Uint8Array,
        receiverStr: string,
        priceTick: i32,
    ) {
        super(liquidityQueue);
        this.providerId = providerId;
        this.amountIn = amountIn;
        this.amountIn256 = amountIn.toU256();
        this.receiver = receiver;
        this.receiverStr = receiverStr;
        this.priceTick = priceTick;
        this.provider = getProvider(providerId);
    }

    public override execute(): void {
        this.checkPreConditions();

        const wasActive: bool = this.provider.isActive();
        const totalAfter: u128 = SafeMath.add128(
            this.provider.getLiquidityAmount(),
            this.amountIn,
        );

        // Minimum listing value: enforced on TOTAL liquidity at this tick, post-op.
        this.ensureLiquidityNotTooLowAtTick(totalAfter, this.priceTick);

        this.pullInTokens();

        if (!wasActive) {
            this.provider.activate();
            this.provider.setPriceTick(this.priceTick);
            this.provider.setBtcReceiver(this.receiverStr);
            this.provider.setListedTokenAtBlock(Blockchain.block.number);
            this.liquidityQueue.addToTickFIFO(this.provider, this.priceTick);
        }

        this.provider.addToLiquidityAmount(this.amountIn);
        this.liquidityQueue.increaseTotalReserve(this.amountIn256);
        this.provider.save();

        Blockchain.emit(
            new LiquidityListedEvent(
                this.provider.getLiquidityAmount(),
                this.receiverStr,
                this.priceTick,
            ),
        );
    }

    private checkPreConditions(): void {
        if (!this.liquidityQueue.isPoolRegistered()) {
            throw new Revert(
                'NATIVE_SWAP: Pool not registered for this token. Call createPool first.',
            );
        }
        if (this.amountIn.isZero()) {
            throw new Revert('NATIVE_SWAP: Amount in cannot be zero.');
        }
        if (this.priceTick < MIN_TICK || this.priceTick > MAX_TICK) {
            throw new Revert(
                `NATIVE_SWAP: tick ${this.priceTick} out of range [${MIN_TICK}, ${MAX_TICK}].`,
            );
        }

        // If already listed, top-up MUST be at the same tick. Different tick → use updateListing.
        if (this.provider.isActive()) {
            if (this.priceTick != this.provider.getPriceTick()) {
                throw new Revert(
                    `NATIVE_SWAP: Provider already listed at tick ${this.provider.getPriceTick()}. Use updateListing to change price.`,
                );
            }
            // Same-tick top-up is allowed even while frozen. We do NOT call any
            // "no active reservation" guard — adding liquidity behind existing
            // reservations is safe.
        }

        // Liquidity overflow guard (u128.add128 already revert-on-overflow, but be explicit)
        if (!u128.lt(this.provider.getLiquidityAmount(), SafeMath.sub128(u128.Max, this.amountIn))) {
            throw new Revert('NATIVE_SWAP: Liquidity overflow. Add a smaller amount.');
        }

        // CSV P2WSH receiver verification — required on first list, optional rebind disallowed.
        if (!this.provider.isActive()) {
            this.verifyReceiverAddress();
        } else if (this.provider.getBtcReceiver() !== this.receiverStr) {
            throw new Revert('NATIVE_SWAP: Cannot change receiver address while listed.');
        }
    }

    /**
     * Enforce: `(amount * tickToPrice(tick)) >> 88 >= MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT`.
     * Same helper used by `CreatePoolOperation`.
     */
    private ensureLiquidityNotTooLowAtTick(amount: u128, tick: i32): void {
        const fillPrice: u128 = TickMath.tickToPrice(tick);
        const sats: u64 = TickMath.tokensToSatoshis(amount, fillPrice);
        if (sats < MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT) {
            throw new Revert(
                `NATIVE_SWAP: Listing worth ${sats} sats; minimum is ${MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT}.`,
            );
        }
    }

    private verifyReceiverAddress(): void {
        if (!Blockchain.validateBitcoinAddress(this.receiverStr)) {
            throw new Revert('NATIVE_SWAP: Invalid receiver address.');
        }
        const isValidCSV = BitcoinAddresses.verifyCsvP2wshAddress(
            this.receiver,
            CSV_BLOCKS_REQUIRED,
            this.receiverStr,
            Network.hrp(Blockchain.network),
        );
        if (!isValidCSV) {
            const expected = ExtendedAddress.toCSV(this.receiver, CSV_BLOCKS_REQUIRED);
            throw new Revert(
                `NATIVE_SWAP: Invalid receiver address. Expected CSV P2WSH with ${CSV_BLOCKS_REQUIRED} blocks. (got ${this.receiverStr}, expected ${expected})`,
            );
        }
    }

    private pullInTokens(): void {
        TransferHelper.transferFrom(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            this.amountIn256,
        );
    }
}
