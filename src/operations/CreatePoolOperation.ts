import { BaseOperation } from './BaseOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../models/Provider';
import {
    Address,
    BitcoinAddresses,
    Blockchain,
    ExtendedAddress,
    Network,
    Revert,
    TransferHelper,
    ZERO_ADDRESS,
} from '@btc-vision/btc-runtime/runtime';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { LiquidityListedEvent } from '../events/LiquidityListedEvent';
import { PoolCreatedEvent } from '../events/PoolCreatedEvent';
import {
    CSV_BLOCKS_REQUIRED,
    MAX_TICK,
    MIN_TICK,
    MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT,
} from '../constants/Contract';
import { TickMath } from '../utils/TickMath';

/**
 * Register a pool for `token` (one-time per token, first caller wins).
 *
 * If `initialLiquidity > 0`, the caller becomes the **original liquidity provider** —
 * the first entry in `FIFO[initialTick]`. They have no special privileges; just first
 * in queue at their chosen tick.
 *
 * Permissionless: any EOA can call. If nobody calls it, no pool exists for this token
 * and every `listLiquidity` / `reserve` reverts.
 */
export class CreatePoolOperation extends BaseOperation {
    private readonly token: Address;
    private readonly providerId: u256;
    private readonly initialLiquidity: u128;
    private readonly initialTick: i32;
    private readonly receiver: Uint8Array;
    private readonly receiverStr: string;

    constructor(
        liquidityQueue: ILiquidityQueue,
        token: Address,
        providerId: u256,
        initialLiquidity: u128,
        initialTick: i32,
        receiver: Uint8Array,
        receiverStr: string,
    ) {
        super(liquidityQueue);
        this.token = token;
        this.providerId = providerId;
        this.initialLiquidity = initialLiquidity;
        this.initialTick = initialTick;
        this.receiver = receiver;
        this.receiverStr = receiverStr;
    }

    public override execute(): void {
        this.ensureValidToken();
        this.ensurePoolNotAlreadyRegistered();

        if (!this.initialLiquidity.isZero()) {
            this.ensureTickInRange(this.initialTick);
            this.ensureLiquidityNotTooLowAtTick(this.initialLiquidity, this.initialTick);
            this.verifyReceiverAddress();
        }

        // Mark pool as registered first — subsequent listLiquidity/reserve gates pass.
        this.liquidityQueue.registerPool();

        if (!this.initialLiquidity.isZero()) {
            const provider: Provider = getProvider(this.providerId);
            this.pullInTokens(this.initialLiquidity);
            provider.activate();
            provider.setPriceTick(this.initialTick);
            provider.setBtcReceiver(this.receiverStr);
            provider.setLiquidityAmount(this.initialLiquidity);
            provider.setListedTokenAtBlock(Blockchain.block.number);
            this.liquidityQueue.addToTickFIFO(provider, this.initialTick);
            this.liquidityQueue.increaseTotalReserve(this.initialLiquidity.toU256());
            provider.save();

            Blockchain.emit(
                new LiquidityListedEvent(this.initialLiquidity, this.receiverStr, this.initialTick),
            );
        }

        Blockchain.emit(
            new PoolCreatedEvent(
                this.token,
                Blockchain.tx.sender,
                this.initialLiquidity,
                this.initialTick,
            ),
        );
    }

    private ensureValidToken(): void {
        if (this.token.equals(ZERO_ADDRESS)) {
            throw new Revert('NATIVE_SWAP: token cannot be zero address.');
        }
        if (this.token.equals(Blockchain.contractAddress)) {
            throw new Revert('NATIVE_SWAP: token cannot be the NativeSwap contract itself.');
        }
    }

    private ensurePoolNotAlreadyRegistered(): void {
        if (this.liquidityQueue.isPoolRegistered()) {
            throw new Revert('NATIVE_SWAP: Pool already registered for this token.');
        }
    }

    private ensureTickInRange(tick: i32): void {
        if (tick < MIN_TICK || tick > MAX_TICK) {
            throw new Revert(`NATIVE_SWAP: tick ${tick} out of range [${MIN_TICK}, ${MAX_TICK}].`);
        }
    }

    private ensureLiquidityNotTooLowAtTick(amount: u128, tick: i32): void {
        const fillPrice: u128 = TickMath.tickToPrice(tick);
        const sats: u64 = TickMath.tokensToSatoshis(amount, fillPrice);
        if (sats < MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT) {
            throw new Revert(
                `NATIVE_SWAP: Bootstrap worth ${sats} sats; minimum is ${MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT}.`,
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

    private pullInTokens(amount: u128): void {
        TransferHelper.transferFrom(
            this.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            amount.toU256(),
        );
    }
}
