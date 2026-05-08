import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BOOLEAN_BYTE_LENGTH,
    BytesWriter,
    Calldata,
    encodeSelector,
    ON_OP20_RECEIVED_SELECTOR,
    ReentrancyGuard,
    Revert,
    Selector,
    StoredAddress,
    StoredBoolean,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
    ZERO_ADDRESS,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { SELECTOR_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime/utils/lengths';

import {
    CONTRACT_PAUSED_POINTER,
    STAKING_CA_POINTER,
    WITHDRAW_MODE_POINTER,
} from '../constants/StoredPointers';
import {
    AT_LEAST_PROVIDERS_TO_PURGE,
    MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
    MAX_TICK,
    SWAP_FEE_BPS,
    SWAP_FEE_DENOM,
} from '../constants/Contract';

import {
    getProvider,
    Provider,
    saveAllProviders,
    transferPendingAmountToStakingContract,
} from '../models/Provider';
import { LiquidityQueue } from '../managers/LiquidityQueue';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import { TickBitmapManager } from '../managers/TickBitmapManager';
import { ReservationManager } from '../managers/ReservationManager';
import { TradeManager } from '../managers/TradeManager';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { ILiquidityQueueReserve } from '../managers/interfaces/ILiquidityQueueReserve';
import { IReservationManager } from '../managers/interfaces/IReservationManager';
import { ITickBitmapManager } from '../managers/interfaces/ITickBitmapManager';
import { ITradeManager } from '../managers/interfaces/ITradeManager';

import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { SwapOperation } from '../operations/SwapOperation';
import { UpdateListingOperation } from '../operations/UpdateListingOperation';
import { WithdrawListingOperation } from '../operations/WithdrawListingOperation';

import { ContractUpdatedEvent } from '../events/ContractUpdatedEvent';
import { TickMath } from '../utils/TickMath';
import { FeeManager } from '../managers/FeeManager';

class GetLiquidityQueueResult {
    public liquidityQueue: ILiquidityQueue;
    public tickBitmapManager: ITickBitmapManager;
    public tradeManager: ITradeManager;

    constructor(
        liquidityQueue: ILiquidityQueue,
        tickBitmapManager: ITickBitmapManager,
        tradeManager: ITradeManager,
    ) {
        this.liquidityQueue = liquidityQueue;
        this.tickBitmapManager = tickBitmapManager;
        this.tradeManager = tradeManager;
    }
}

/**
 * NativeSwap — Bitcoin L1 sorted-listing swap contract.
 *
 * Listings are placed in a tick-bucketed bitmap structure ("Uniswap V3 pattern").
 * Reservations walk cheapest-first and freeze the per-provider price quote at reserve
 * time. At swap settlement, 0.3% of bought tokens routes to the staking contract.
 *
 * Selector index:
 *   - createPool(address,uint128,int32,bytes,string)
 *   - listLiquidity(address,bytes,string,uint128,int32)
 *   - updateListing(address,int32)
 *   - withdrawListing(address)
 *   - reserve(address,uint64,uint256,uint8,bytes)
 *   - swap(address)
 *   - getReserve(address)
 *   - getQuote(address,uint64)
 *   - getBestTick(address)
 *   - getBestPrice(address)
 *   - getProviderListingDetails(address)
 */
@final
export class NativeSwap extends ReentrancyGuard {
    private readonly _stakingContractAddress: StoredAddress;
    private readonly _isPaused: StoredBoolean;
    private readonly _withdrawModeActive: StoredBoolean;
    private _tokenAddress: Address;

    public constructor() {
        super();
        this._stakingContractAddress = new StoredAddress(STAKING_CA_POINTER);
        this._isPaused = new StoredBoolean(CONTRACT_PAUSED_POINTER, false);
        this._withdrawModeActive = new StoredBoolean(WITHDRAW_MODE_POINTER, false);
        this._tokenAddress = ZERO_ADDRESS;
    }

    private static get DEPLOYER_SELECTOR(): Selector {
        return encodeSelector('deployer()');
    }

    public get stakingContractAddress(): Address {
        return this._stakingContractAddress.value;
    }

    public override onDeployment(_calldata: Calldata): void {
        FeeManager.onDeploy();
    }

    public override onExecutionCompleted(selector: Selector, calldata: Calldata): void {
        FeeManager.save();
        saveAllProviders();
        if (!this._tokenAddress.isZero()) {
            transferPendingAmountToStakingContract(this._tokenAddress, this.stakingContractAddress);
        }
        super.onExecutionCompleted(selector, calldata);
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            // ----- writes -----
            case encodeSelector('createPool(address,uint128,int32,bytes,string)'):
                return this.createPool(calldata);
            case encodeSelector('listLiquidity(address,bytes,string,uint128,int32)'):
                return this.listLiquidity(calldata);
            case encodeSelector('updateListing(address,int32)'):
                return this.updateListing(calldata);
            case encodeSelector('withdrawListing(address)'):
                return this.withdrawListing(calldata);
            case encodeSelector('reserve(address,uint64,uint256,uint8,bytes)'):
                return this.reserve(calldata);
            case encodeSelector('swap(address)'):
                return this.swap(calldata);

            // ----- governance -----
            case encodeSelector('setStakingContractAddress(address)'):
                return this.setStakingContractAddress(calldata);
            case encodeSelector('pause()'):
                return this.pause(calldata);
            case encodeSelector('unpause()'):
                return this.unpause(calldata);
            case encodeSelector('activateWithdrawMode()'):
                return this.activateWithdrawMode(calldata);

            // ----- views -----
            case encodeSelector('isPaused()'):
                return this.isPaused(calldata);
            case encodeSelector('isWithdrawModeActive()'):
                return this.isWithdrawModeActive(calldata);
            case encodeSelector('getReserve(address)'):
                return this.getReserve(calldata);
            case encodeSelector('getQuote(address,uint64)'):
                return this.getQuote(calldata);
            case encodeSelector('getBestTick(address)'):
                return this.getBestTick(calldata);
            case encodeSelector('getBestPrice(address)'):
                return this.getBestPrice(calldata);
            case encodeSelector('getProviderListingDetails(address)'):
                return this.getProviderListingDetails(calldata);
            case encodeSelector('getStakingContractAddress()'):
                return this.getStakingContractAddress(calldata);
            case encodeSelector('getSwapFeeBps()'):
                return this.getSwapFeeBps();

            // ----- protocol hooks -----
            case encodeSelector('onOP20Received(address,address,uint256,bytes)'):
                return this.onOP20Received(calldata);
            case encodeSelector('update(address,bytes)'):
                return this.update(calldata);

            default:
                return super.execute(method, calldata);
        }
    }

    public override onUpdate(calldata: Calldata): void {
        super.onUpdate(calldata);
    }

    private update(calldata: Calldata): BytesWriter {
        if (Blockchain.tx.sender !== Blockchain.tx.origin) {
            throw new Revert('NATIVE_SWAP: origin must be the sender.');
        }
        if (Blockchain.isContract(Blockchain.tx.sender)) {
            throw new Revert('NATIVE_SWAP: sender must be EOA');
        }
        this.onlyDeployer(Blockchain.tx.sender);

        const address: Address = calldata.readAddress();
        const updateCalldata: Uint8Array = calldata.readBytesWithLength();

        const writer = new BytesWriter(updateCalldata.length);
        writer.writeBytes(updateCalldata);

        Blockchain.updateContractFromExisting(address, writer);
        Blockchain.emit(new ContractUpdatedEvent(address));
        return new BytesWriter(0);
    }

    // ========================================================================
    // Pool creation (one-time per token, anyone-can-call)
    // ========================================================================

    private createPool(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();
        this.ensureNotContract();
        this.ensureWithdrawModeNotActive();

        const token: Address = calldata.readAddress();
        const initialLiquidity: u128 = calldata.readU128();
        const initialTick: i32 = calldata.readI32();
        const receiver: Uint8Array = calldata.readBytesWithLength();
        if (receiver.length !== 33) throw new Revert('Invalid receiver length');
        const receiverStr: string = calldata.readStringWithLength();

        this._tokenAddress = token.clone();
        const result = this.getLiquidityQueue(token, this.addressToPointer(token), false);
        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);

        const op = new CreatePoolOperation(
            result.liquidityQueue,
            token,
            providerId,
            initialLiquidity,
            initialTick,
            receiver,
            receiverStr,
        );
        op.execute();
        result.liquidityQueue.save();

        return new BytesWriter(0);
    }

    // ========================================================================
    // Listing operations
    // ========================================================================

    private listLiquidity(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();
        this.ensureNotContract();
        this.ensureWithdrawModeNotActive();

        const token: Address = calldata.readAddress();
        const receiver: Uint8Array = calldata.readBytesWithLength();
        if (receiver.length !== 33) throw new Revert('Invalid receiver length');
        const receiverStr: string = calldata.readStringWithLength();
        const amountIn: u128 = calldata.readU128();
        const priceTick: i32 = calldata.readI32();

        this._tokenAddress = token.clone();
        this.ensureValidTokenAddress(token);

        const result = this.getLiquidityQueue(token, this.addressToPointer(token), true);
        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);

        const op = new ListTokensForSaleOperation(
            result.liquidityQueue,
            providerId,
            amountIn,
            receiver,
            receiverStr,
            priceTick,
        );
        op.execute();
        result.liquidityQueue.save();

        return new BytesWriter(0);
    }

    private updateListing(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();
        this.ensureNotContract();
        this.ensureWithdrawModeNotActive();

        const token: Address = calldata.readAddress();
        const newPriceTick: i32 = calldata.readI32();

        this._tokenAddress = token.clone();
        this.ensureValidTokenAddress(token);

        const result = this.getLiquidityQueue(token, this.addressToPointer(token), false);
        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);

        const op = new UpdateListingOperation(
            result.liquidityQueue,
            result.tickBitmapManager,
            providerId,
            newPriceTick,
        );
        op.execute();
        result.liquidityQueue.save();

        return new BytesWriter(0);
    }

    private withdrawListing(calldata: Calldata): BytesWriter {
        this.ensureNotContract();
        // Withdraw is allowed even in withdraw-mode (in fact it's the *intent* of withdraw mode).
        // Pause is also bypassed for withdraw — sellers can always pull their tokens in emergencies.

        const token: Address = calldata.readAddress();
        this._tokenAddress = token.clone();
        this.ensureValidTokenAddress(token);

        const result = this.getLiquidityQueue(token, this.addressToPointer(token), false);
        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);

        const op = new WithdrawListingOperation(
            result.liquidityQueue,
            result.tickBitmapManager,
            providerId,
        );
        op.execute();
        result.liquidityQueue.save();
        return new BytesWriter(0);
    }

    // ========================================================================
    // Reserve / Swap
    // ========================================================================

    private reserve(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();
        this.ensureNotContract();
        this.ensureWithdrawModeNotActive();

        const token: Address = calldata.readAddress();
        const maximumAmountIn: u64 = calldata.readU64();
        const minimumAmountOut: u256 = calldata.readU256();
        const activationDelay: u8 = calldata.readU8();
        const sender: Uint8Array = calldata.readBytesWithLength();
        if (sender.length !== 33) throw new Revert('Invalid sender');

        this._tokenAddress = token.clone();
        this.ensureValidTokenAddress(token);

        const result = this.getLiquidityQueue(token, this.addressToPointer(token), false, true);
        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);

        const op = new ReserveLiquidityOperation(
            result.liquidityQueue,
            providerId,
            Blockchain.tx.sender,
            maximumAmountIn,
            minimumAmountOut,
            activationDelay,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
            MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS,
            sender,
        );
        op.execute();
        result.liquidityQueue.save();
        return new BytesWriter(0);
    }

    private swap(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();
        this.ensureNotContract();
        this.ensureWithdrawModeNotActive();

        const token: Address = calldata.readAddress();
        this._tokenAddress = token.clone();
        this.ensureValidTokenAddress(token);

        const result = this.getLiquidityQueue(token, this.addressToPointer(token), false);
        const op = new SwapOperation(result.liquidityQueue, result.tradeManager);
        op.execute();
        result.liquidityQueue.save();
        return new BytesWriter(0);
    }

    // ========================================================================
    // Governance
    // ========================================================================

    private setStakingContractAddress(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this.ensureWithdrawModeNotActive();

        const address: Address = calldata.readAddress();
        if (address.isZero()) {
            throw new Revert('NATIVE_SWAP: Staking contract address cannot be zero.');
        }
        this._stakingContractAddress.value = address;
        return new BytesWriter(0);
    }

    private getStakingContractAddress(_calldata: Calldata): BytesWriter {
        const w: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        w.writeAddress(this.stakingContractAddress);
        return w;
    }

    private pause(_calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this.ensureWithdrawModeNotActive();
        if (!this._isPaused.value) this._isPaused.value = true;
        return new BytesWriter(0);
    }

    private unpause(_calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this.ensureWithdrawModeNotActive();
        if (this._isPaused.value) this._isPaused.value = false;
        return new BytesWriter(0);
    }

    private isPaused(_calldata: Calldata): BytesWriter {
        const w: BytesWriter = new BytesWriter(BOOLEAN_BYTE_LENGTH);
        w.writeBoolean(this._isPaused.value);
        return w;
    }

    private activateWithdrawMode(_calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this.ensureWithdrawModeNotActive();
        this._withdrawModeActive.value = true;
        return new BytesWriter(0);
    }

    private isWithdrawModeActive(_calldata: Calldata): BytesWriter {
        const w: BytesWriter = new BytesWriter(BOOLEAN_BYTE_LENGTH);
        w.writeBoolean(this._withdrawModeActive.value);
        return w;
    }

    // ========================================================================
    // Views
    // ========================================================================

    private getReserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const result = this.getLiquidityQueue(token, this.addressToPointer(token), false);

        const w: BytesWriter = new BytesWriter(2 * U256_BYTE_LENGTH);
        w.writeU256(result.liquidityQueue.liquidity);
        w.writeU256(result.liquidityQueue.reservedLiquidity);
        return w;
    }

    /**
     * Read-only walk simulation:
     *   - if pool not registered or empty → returns (0, 0, 0)
     *   - else walks bitmap from cheapest tick, accumulates tokens until satoshisIn
     *     is exhausted or maxProviders reached
     *
     * Returns (tokensOut: u256, satoshisIn: u64, fillPriceAtBestTick: u128)
     */
    private getQuote(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const satoshisIn: u64 = calldata.readU64();

        const w: BytesWriter = new BytesWriter(U256_BYTE_LENGTH + U64_BYTE_LENGTH + U128_BYTE_LENGTH);
        if (satoshisIn == 0) {
            w.writeU256(u256.Zero);
            w.writeU64(0);
            w.writeU128(u128.Zero);
            return w;
        }
        const result = this.getLiquidityQueue(token, this.addressToPointer(token), false);
        if (!result.liquidityQueue.isPoolRegistered()) {
            w.writeU256(u256.Zero);
            w.writeU64(0);
            w.writeU128(u128.Zero);
            return w;
        }

        const tokensOut: u256 = result.liquidityQueue.previewWalk(
            satoshisIn,
            <u32>MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );
        const bestPrice: u128 = result.liquidityQueue.bestTickPrice();

        w.writeU256(tokensOut);
        w.writeU64(satoshisIn);
        w.writeU128(bestPrice);
        return w;
    }

    private getBestTick(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const result = this.getLiquidityQueue(token, this.addressToPointer(token), false);
        const t: i32 = result.liquidityQueue.bestTick();

        const w: BytesWriter = new BytesWriter(U32_BYTE_LENGTH);
        // i32 stored as u32 reinterpret. If pool empty, t == MAX_TICK + 1 (sentinel).
        w.writeI32(t);
        return w;
    }

    private getBestPrice(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const result = this.getLiquidityQueue(token, this.addressToPointer(token), false);
        const w: BytesWriter = new BytesWriter(U128_BYTE_LENGTH);
        w.writeU128(result.liquidityQueue.bestTickPrice());
        return w;
    }

    /**
     * @returns active(bool), priceTick(i32), liquidityAmount(u128), reservedAmount(u128), latestReservedUntilBlock(u64)
     */
    private getProviderListingDetails(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);
        const provider: Provider = getProvider(providerId);

        const w: BytesWriter = new BytesWriter(
            BOOLEAN_BYTE_LENGTH +
                U32_BYTE_LENGTH +
                U128_BYTE_LENGTH +
                U128_BYTE_LENGTH +
                U64_BYTE_LENGTH,
        );
        w.writeBoolean(provider.isActive());
        w.writeI32(provider.getPriceTick());
        w.writeU128(provider.getLiquidityAmount());
        w.writeU128(provider.getReservedAmount());
        w.writeU64(provider.getLatestReservedUntilBlock());
        return w;
    }

    private getSwapFeeBps(): BytesWriter {
        const w: BytesWriter = new BytesWriter(2 * U64_BYTE_LENGTH);
        w.writeU64(SWAP_FEE_BPS);
        w.writeU64(SWAP_FEE_DENOM);
        return w;
    }

    // ========================================================================
    // Internal: factory + helpers
    // ========================================================================

    private getLiquidityQueue(
        token: Address,
        tokenId: Uint8Array,
        purgeOldReservations: boolean,
        timeoutEnabled: boolean = false,
    ): GetLiquidityQueueResult {
        const liquidityQueueReserve: ILiquidityQueueReserve = new LiquidityQueueReserve(token, tokenId);
        const tickBitmapManager: ITickBitmapManager = new TickBitmapManager(
            token,
            tokenId,
            liquidityQueueReserve,
        );
        const reservationManager: IReservationManager = new ReservationManager(
            token,
            tokenId,
            tickBitmapManager,
            liquidityQueueReserve,
            AT_LEAST_PROVIDERS_TO_PURGE,
        );
        const liquidityQueue: LiquidityQueue = new LiquidityQueue(
            token,
            tokenId,
            tickBitmapManager,
            liquidityQueueReserve,
            reservationManager,
            purgeOldReservations,
            timeoutEnabled,
        );
        const tradeManager: ITradeManager = new TradeManager(
            tickBitmapManager,
            liquidityQueueReserve,
            reservationManager,
        );
        return new GetLiquidityQueueResult(liquidityQueue, tickBitmapManager, tradeManager);
    }

    /** providerId = sha256(senderAddress || tokenAddress) — encodes (token, sender). */
    private addressToPointerU256(address: Address, token: Address): u256 {
        const writer: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer.writeAddress(address);
        writer.writeAddress(token);
        return u256.fromBytes(sha256(writer.getBuffer()), true);
    }

    /** tokenIdBytes = ripemd160(token) — 30 bytes used as subPointer for token-keyed storage. */
    private addressToPointer(address: Address): Uint8Array {
        return ripemd160(address);
    }

    private onOP20Received(_calldata: Calldata): BytesWriter {
        const w = new BytesWriter(SELECTOR_BYTE_LENGTH);
        w.writeSelector(ON_OP20_RECEIVED_SELECTOR);
        return w;
    }

    private ensureValidTokenAddress(token: Address): void {
        if (token.isZero()) throw new Revert('NATIVE_SWAP: Invalid token address.');
    }

    private ensureNotPaused(): void {
        if (this._isPaused.value) {
            throw new Revert(`NATIVE_SWAP: Contract is currently paused. Try again later.`);
        }
    }

    private ensureNotContract(): void {
        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('NATIVE_SWAP: origin must be the sender.');
        }
        if (Blockchain.isContract(Blockchain.tx.sender)) {
            throw new Revert('NATIVE_SWAP: sender must be EOA');
        }
    }

    private ensureWithdrawModeNotActive(): void {
        if (this._withdrawModeActive.value) {
            throw new Revert(
                `NATIVE_SWAP: You cannot perform this action when withdraw mode is active.`,
            );
        }
    }
}
