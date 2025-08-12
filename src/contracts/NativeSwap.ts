import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BOOLEAN_BYTE_LENGTH,
    BytesReader,
    BytesWriter,
    Calldata,
    encodeSelector,
    Revert,
    SafeMath,
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
import { LiquidityQueue } from '../managers/LiquidityQueue';
import {
    getProvider,
    Provider,
    saveAllProviders,
    transferPendingAmountToStakingContract,
} from '../models/Provider';
import { FeeManager } from '../managers/FeeManager';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { CancelListingOperation } from '../operations/CancelListingOperation';
import { SwapOperation } from '../operations/SwapOperation';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { ReentrancyGuard } from './ReentrancyGuard';
import {
    CONTRACT_PAUSED_POINTER,
    STAKING_CA_POINTER,
    WITHDRAW_MODE_POINTER,
} from '../constants/StoredPointers';
import { satoshisToTokens, tokensToSatoshis } from '../utils/SatoshisConversion';
import {
    AT_LEAST_PROVIDERS_TO_PURGE,
    ENABLE_INDEX_VERIFICATION,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
    QUOTE_SCALE,
} from '../constants/Contract';
import { ITradeManager } from '../managers/interfaces/ITradeManager';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { TradeManager } from '../managers/TradeManager';
import { QuoteManager } from '../managers/QuoteManager';
import { ProviderManager } from '../managers/ProviderManager';
import { IQuoteManager } from '../managers/interfaces/IQuoteManager';
import { IProviderManager } from '../managers/interfaces/IProviderManager';
import { ILiquidityQueueReserve } from '../managers/interfaces/ILiquidityQueueReserve';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import { IReservationManager } from '../managers/interfaces/IReservationManager';
import { ReservationManager } from '../managers/ReservationManager';
import { IDynamicFee } from '../managers/interfaces/IDynamicFee';
import { DynamicFee } from '../managers/DynamicFee';
import { WithdrawListingOperation } from '../operations/WithdrawListingOperation';
import { SELECTOR_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime/utils/lengths';

// onOP20Received(address,address,uint256,bytes)
export const ON_OP_20_RECEIVED_SELECTOR: u32 = 0xd83e7dbc;

class GetLiquidityQueueResult {
    public liquidityQueue: ILiquidityQueue;
    public tradeManager: ITradeManager;

    constructor(liquidityQueue: ILiquidityQueue, tradeManager: ITradeManager) {
        this.liquidityQueue = liquidityQueue;
        this.tradeManager = tradeManager;
    }
}

/**
 * OrderBook contract for the OP_NET order book system,
 * now using block-based, virtual-constant-product logic
 * in the LiquidityQueue.
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
        const address: Address = this._stakingContractAddress.value;
        if (address.isZero()) {
            return Address.dead();
        }

        return address;
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
            case encodeSelector('reserve(address,uint64,uint256,bool,uint8)'):
                return this.reserve(calldata);
            case encodeSelector('swap(address)'):
                return this.swap(calldata);
            case encodeSelector('listLiquidity(address,bytes,string,uint128,bool)'):
                return this.listLiquidity(calldata);
            case encodeSelector('cancelListing(address)'):
                return this.cancelListing(calldata);
            case encodeSelector('withdrawListing(address)'):
                return this.withdrawListing(calldata);
            case encodeSelector(
                'createPool(address,uint256,uint128,bytes,string,uint16,uint256,uint16)',
            ): {
                const token: Address = calldata.readAddress();
                return this.createPool(calldata, token);
            }
            case encodeSelector('setFees(uint64,uint64)'):
                return this.setFees(calldata);
            case encodeSelector('setStakingContractAddress(address)'):
                return this.setStakingContractAddress(calldata);
            case encodeSelector('setFeesAddress(string)'):
                return this.setFeesAddress(calldata);
            case encodeSelector('pause()'):
                return this.pause(calldata);
            case encodeSelector('unpause()'):
                return this.unpause(calldata);
            case encodeSelector('activateWithdrawMode()'):
                return this.activateWithdrawMode(calldata);
            /** Readable methods */
            case encodeSelector('isPaused()'):
                return this.isPaused(calldata);
            case encodeSelector('isWithdrawModeActive()'):
                return this.isWithdrawModeActive(calldata);
            case encodeSelector('getReserve(address)'):
                return this.getReserve(calldata);
            case encodeSelector('getQuote(address,uint64)'):
                return this.getQuote(calldata);
            case encodeSelector('getProviderDetails(address)'):
                return this.getProviderDetails(calldata);
            case encodeSelector('getProviderDetailsById(u256)'):
                return this.getProviderDetailsById(calldata);
            case encodeSelector('getQueueDetails(address)'):
                return this.getQueueDetails(calldata);
            case encodeSelector('getPriorityQueueCost()'):
                return this.getPriorityQueueCost();
            case encodeSelector('getFees()'):
                return this.getFees();
            case encodeSelector('getAntibotSettings(address)'):
                return this.getAntibotSettings(calldata);
            case encodeSelector('getStakingContractAddress()'):
                return this.getStakingContractAddress(calldata);
            case encodeSelector('getFeesAddress()'):
                return this.getFeesAddress(calldata);
            /*case encodeSelector('getLastPurgedBlock(address)'):
                return this.getLastPurgedBlock(calldata);
            case encodeSelector('getBlocksWithReservationsLength(address)'):
                return this.getBlocksWithReservationsLength(calldata);
            case encodeSelector('purgeReservationsAndRestoreProviders(address)'):
                return this.purgeReservationsAndRestoreProviders(calldata);
            */
            case encodeSelector('onOP20Received(address,address,uint256,bytes)'):
                return this.onOP20Received(calldata);
            default:
                return super.execute(method, calldata);
        }
    }

    private getAntibotSettings(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            this.addressToPointer(token),
            false,
        );

        const writer: BytesWriter = new BytesWriter(U64_BYTE_LENGTH + U256_BYTE_LENGTH);
        writer.writeU64(liquidityQueueResult.liquidityQueue.antiBotExpirationBlock);
        writer.writeU256(liquidityQueueResult.liquidityQueue.maxTokensPerReservation);

        return writer;
    }

    private getFees(): BytesWriter {
        const writer: BytesWriter = new BytesWriter(2 * U64_BYTE_LENGTH);
        writer.writeU64(FeeManager.reservationBaseFee);
        writer.writeU64(FeeManager.priorityQueueBaseFee);

        return writer;
    }

    private setFees(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this.ensureWithdrawModeNotActive();

        FeeManager.reservationBaseFee = calldata.readU64();
        FeeManager.priorityQueueBaseFee = calldata.readU64();

        return new BytesWriter(0);
    }

    private getStakingContractAddress(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(this.stakingContractAddress);

        return response;
    }

    private setStakingContractAddress(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this.ensureWithdrawModeNotActive();

        this._stakingContractAddress.value = calldata.readAddress();

        return new BytesWriter(0);
    }

    private getFeesAddress(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(
            FeeManager.feesAddress.length + U32_BYTE_LENGTH,
        );
        response.writeStringWithLength(FeeManager.feesAddress);

        return response;
    }

    private setFeesAddress(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this.ensureWithdrawModeNotActive();

        const address: string = calldata.readStringWithLength();
        this.ensureFeesAddressIsValid(address);

        FeeManager.feesAddress = address;

        return new BytesWriter(0);
    }

    private pause(_calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this.ensureWithdrawModeNotActive();

        if (!this._isPaused.value) {
            this._isPaused.value = true;
        }

        return new BytesWriter(0);
    }

    private unpause(_calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this.ensureWithdrawModeNotActive();

        if (this._isPaused.value) {
            this._isPaused.value = false;
        }

        return new BytesWriter(0);
    }

    private isPaused(_calldata: Calldata): BytesWriter {
        const result: BytesWriter = new BytesWriter(BOOLEAN_BYTE_LENGTH);

        if (this._isPaused.value) {
            result.writeBoolean(true);
        } else {
            result.writeBoolean(false);
        }

        return result;
    }

    private activateWithdrawMode(_calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this.ensureWithdrawModeNotActive();

        this._withdrawModeActive.value = true;

        return new BytesWriter(0);
    }

    private isWithdrawModeActive(_calldata: Calldata): BytesWriter {
        const result: BytesWriter = new BytesWriter(BOOLEAN_BYTE_LENGTH);

        if (this._withdrawModeActive.value) {
            result.writeBoolean(true);
        } else {
            result.writeBoolean(false);
        }

        return result;
    }

    private getProviderDetails(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);
        const provider: Provider = getProvider(providerId);

        return this.buildProviderDetailsWriter(provider);
    }

    private getProviderDetailsById(calldata: Calldata): BytesWriter {
        const providerId: u256 = calldata.readU256();
        const provider: Provider = getProvider(providerId);

        return this.buildProviderDetailsWriter(provider);
    }

    private getQueueDetails(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const getQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            this.addressToPointer(token),
            false,
        );

        this.ensurePoolExistsForToken(getQueueResult.liquidityQueue);

        const queueData: Uint8Array = getQueueResult.liquidityQueue.getProviderQueueData();

        const writer = new BytesWriter(U64_BYTE_LENGTH + U32_BYTE_LENGTH + queueData.length);
        writer.writeU64(getQueueResult.liquidityQueue.lastPurgedBlock);
        writer.writeU32(getQueueResult.liquidityQueue.blockWithReservationsLength());
        writer.writeBytes(queueData);

        return writer;
    }

    private getPriorityQueueCost(): BytesWriter {
        const cost: u64 = FeeManager.priorityQueueBaseFee;

        const writer: BytesWriter = new BytesWriter(U64_BYTE_LENGTH);
        writer.writeU64(cost);

        return writer;
    }

    private createPool(calldata: Calldata, token: Address): BytesWriter {
        this.ensureNotPaused();
        this.ensureWithdrawModeNotActive();
        this._tokenAddress = token.clone();

        const tokenOwner: Address = this.getDeployer(token);

        this.ensureContractDeployer(tokenOwner);

        const floorPrice: u256 = calldata.readU256();
        const initialLiquidity: u128 = calldata.readU128();
        const receiver: Uint8Array = calldata.readBytes(33);
        const receiverStr: string = calldata.readStringWithLength();
        const antiBotEnabledFor: u16 = calldata.readU16();
        const antiBotMaximumTokensPerReservation: u256 = calldata.readU256();
        const maxReservesIn5BlocksPercent: u16 = calldata.readU16();
        const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            this.addressToPointer(token),
            true,
        );
        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);

        const operation: CreatePoolOperation = new CreatePoolOperation(
            liquidityQueueResult.liquidityQueue,
            floorPrice,
            providerId,
            initialLiquidity,
            receiver,
            receiverStr,
            antiBotEnabledFor,
            antiBotMaximumTokensPerReservation,
            maxReservesIn5BlocksPercent,
        );

        operation.execute();
        liquidityQueueResult.liquidityQueue.save();

        return new BytesWriter(0);
    }

    private listLiquidity(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();
        this.ensureWithdrawModeNotActive();

        const token: Address = calldata.readAddress();
        const receiver: Uint8Array = calldata.readBytes(33);
        const receiverStr: string = calldata.readStringWithLength();
        this._tokenAddress = token.clone();

        const amountIn: u128 = calldata.readU128();
        const priority: boolean = calldata.readBoolean();

        this._listLiquidity(token, receiver, receiverStr, amountIn, priority);

        return new BytesWriter(0);
    }

    private _listLiquidity(
        token: Address,
        receiver: Uint8Array,
        receiverStr: string,
        amountIn: u128,
        priority: boolean,
    ): void {
        this.ensureValidTokenAddress(token);

        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);
        const tokenId: Uint8Array = this.addressToPointer(token);
        const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            tokenId,
            true,
        );

        this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

        const operation: ListTokensForSaleOperation = new ListTokensForSaleOperation(
            liquidityQueueResult.liquidityQueue,
            providerId,
            amountIn,
            receiver,
            receiverStr,
            priority,
            false,
        );

        operation.execute();
        liquidityQueueResult.liquidityQueue.save();
    }

    private reserve(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();
        this.ensureWithdrawModeNotActive();

        const token: Address = calldata.readAddress();
        const maximumAmountIn: u64 = calldata.readU64();
        const minimumAmountOut: u256 = calldata.readU256();
        const activationDelay: u8 = calldata.readU8();
        this._tokenAddress = token.clone();

        this._reserve(token, maximumAmountIn, minimumAmountOut, activationDelay);

        return new BytesWriter(0);
    }

    private _reserve(
        token: Address,
        maximumAmountIn: u64,
        minimumAmountOut: u256,
        activationDelay: u8,
    ): void {
        this.ensureValidTokenAddress(token);

        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);
        const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            this.addressToPointer(token),
            false,
            true,
        );

        this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

        const operation: ReserveLiquidityOperation = new ReserveLiquidityOperation(
            liquidityQueueResult.liquidityQueue,
            providerId,
            Blockchain.tx.sender,
            maximumAmountIn,
            minimumAmountOut,
            activationDelay,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        operation.execute();
        liquidityQueueResult.liquidityQueue.save();
    }

    private cancelListing(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();
        this.ensureWithdrawModeNotActive();

        const token: Address = calldata.readAddress();
        this._tokenAddress = token.clone();

        this._cancelListing(token);

        return new BytesWriter(0);
    }

    private _cancelListing(token: Address): void {
        this.ensureValidTokenAddress(token);

        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);
        const tokenId: Uint8Array = this.addressToPointer(token);
        const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            tokenId,
            true,
        );

        this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

        const operation: CancelListingOperation = new CancelListingOperation(
            liquidityQueueResult.liquidityQueue,
            providerId,
        );

        operation.execute();
        liquidityQueueResult.liquidityQueue.save();
    }

    private withdrawListing(calldata: Calldata): BytesWriter {
        this.ensureWithdrawModeActive();

        const token: Address = calldata.readAddress();
        this._tokenAddress = token.clone();

        this._withdrawListing(token);

        return new BytesWriter(0);
    }

    private _withdrawListing(token: Address): void {
        this.ensureValidTokenAddress(token);

        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);
        const tokenId: Uint8Array = this.addressToPointer(token);
        const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            tokenId,
            false,
        );

        this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

        const operation: WithdrawListingOperation = new WithdrawListingOperation(
            liquidityQueueResult.liquidityQueue,
            providerId,
        );

        operation.execute();
        liquidityQueueResult.liquidityQueue.save();
    }

    private swap(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();
        this.ensureWithdrawModeNotActive();

        const token: Address = calldata.readAddress();
        this._tokenAddress = token.clone();

        this._swap(token);

        return new BytesWriter(0);
    }

    private _swap(token: Address): void {
        this.ensureValidTokenAddress(token);

        const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            this.addressToPointer(token),
            false,
        );

        this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

        const operation: SwapOperation = new SwapOperation(
            liquidityQueueResult.liquidityQueue,
            liquidityQueueResult.tradeManager,
        );

        operation.execute();
        liquidityQueueResult.liquidityQueue.save();
    }

    private getReserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();

        return this._getReserve(token);
    }

    private _getReserve(token: Address): BytesWriter {
        this.ensureValidTokenAddress(token);

        const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            this.addressToPointer(token),
            false,
        );

        this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

        const result: BytesWriter = new BytesWriter(3 * U256_BYTE_LENGTH + U64_BYTE_LENGTH);
        result.writeU256(liquidityQueueResult.liquidityQueue.liquidity);
        result.writeU256(liquidityQueueResult.liquidityQueue.reservedLiquidity);
        result.writeU64(liquidityQueueResult.liquidityQueue.virtualSatoshisReserve);
        result.writeU256(liquidityQueueResult.liquidityQueue.virtualTokenReserve);

        return result;
    }

    private getQuote(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const satoshisIn: u64 = calldata.readU64();

        return this._getQuote(token, satoshisIn);
    }

    /**
     * @function _getQuote
     * Fetches the estimated number of tokens for a given BTC amount
     * using the new "virtual AMM" approach:
     *
     *   1) price = queue.quote() = scaled price = (B * SHIFT) / T
     *   2) tokensOut = (satoshisIn * price) / SHIFT   // [SCALE FIX]
     *   3) If tokensOut > availableLiquidity, cap it
     *   4) requiredSatoshis = min( satoshisIn, (tokensOut * SHIFT) / price )
     */
    private _getQuote(token: Address, satoshisIn: u64): BytesWriter {
        this.ensureValidTokenAddress(token);
        this.ensureMaximumAmountInNotZero(satoshisIn);

        const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            this.addressToPointer(token),
            false,
        );
        this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

        const price: u256 = liquidityQueueResult.liquidityQueue.quote();
        this.ensurePriceNotZeroAndLiquidity(price);

        let tokensOut: u256 = satoshisToTokens(satoshisIn, price);

        // If tokensOut > availableLiquidity, cap it
        const availableLiquidity: u256 = SafeMath.sub(
            liquidityQueueResult.liquidityQueue.liquidity,
            liquidityQueueResult.liquidityQueue.reservedLiquidity,
        );

        let requiredSatoshis: u64 = satoshisIn;
        if (u256.gt(tokensOut, availableLiquidity)) {
            tokensOut = availableLiquidity;
            requiredSatoshis = tokensToSatoshis(tokensOut, price);

            // If that is bigger than satoshisIn, clamp
            if (requiredSatoshis > satoshisIn) {
                requiredSatoshis = satoshisIn;
            }
        }

        // Prepare output
        const result: BytesWriter = new BytesWriter(2 * U256_BYTE_LENGTH + 2 * U64_BYTE_LENGTH);
        result.writeU256(tokensOut); // how many tokens
        result.writeU64(requiredSatoshis); // how many sat needed
        result.writeU256(price); // final *scaled* price
        result.writeU64(QUOTE_SCALE.toU64());
        return result;
    }

    private getLiquidityQueue(
        token: Address,
        tokenId: Uint8Array,
        purgeOldReservations: boolean,
        timeoutEnabled: boolean = false,
    ): GetLiquidityQueueResult {
        const quoteManager: IQuoteManager = this.getQuoteManager(tokenId);
        const liquidityQueueReserve: ILiquidityQueueReserve = this.getLiquidityQueueReserve(
            token,
            tokenId,
        );

        const providerManager: IProviderManager = this.getProviderManager(
            token,
            tokenId,
            quoteManager,
        );

        const reservationManager: IReservationManager = this.getReservationManager(
            token,
            tokenId,
            providerManager,
            liquidityQueueReserve,
        );

        const dynamicFee: IDynamicFee = this.getDynamicFee(tokenId);
        const liquidityQueue: LiquidityQueue = new LiquidityQueue(
            token,
            tokenId,
            providerManager,
            liquidityQueueReserve,
            quoteManager,
            reservationManager,
            dynamicFee,
            purgeOldReservations,
            timeoutEnabled,
        );

        const tradeManager: TradeManager = new TradeManager(
            tokenId,
            quoteManager,
            providerManager,
            liquidityQueueReserve,
            reservationManager,
        );

        return new GetLiquidityQueueResult(liquidityQueue, tradeManager);
    }

    private getQuoteManager(tokenId: Uint8Array): IQuoteManager {
        return new QuoteManager(tokenId);
    }

    private getProviderManager(
        token: Address,
        tokenId: Uint8Array,
        quoteManager: IQuoteManager,
    ): IProviderManager {
        return new ProviderManager(token, tokenId, quoteManager, ENABLE_INDEX_VERIFICATION);
    }

    private getLiquidityQueueReserve(token: Address, tokenId: Uint8Array): ILiquidityQueueReserve {
        return new LiquidityQueueReserve(token, tokenId);
    }

    private getReservationManager(
        token: Address,
        tokenId: Uint8Array,
        providerManager: IProviderManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
    ): IReservationManager {
        return new ReservationManager(
            token,
            tokenId,
            providerManager,
            liquidityQueueReserve,
            AT_LEAST_PROVIDERS_TO_PURGE,
        );
    }

    private getDynamicFee(tokenId: Uint8Array): IDynamicFee {
        return new DynamicFee(tokenId);
    }

    private addressToPointerU256(address: Address, token: Address): u256 {
        const writer: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer.writeAddress(address);
        writer.writeAddress(token);
        return u256.fromBytes(sha256(writer.getBuffer()), true);
    }

    private addressToPointer(address: Address): Uint8Array {
        return ripemd160(address);
    }

    private buildProviderDetailsWriter(provider: Provider): BytesWriter {
        const writer: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH +
                U128_BYTE_LENGTH * 2 +
                (U32_BYTE_LENGTH + provider.getBtcReceiver().length) +
                2 * U32_BYTE_LENGTH +
                3 * BOOLEAN_BYTE_LENGTH +
                U64_BYTE_LENGTH,
        );

        writer.writeU256(provider.getId());
        writer.writeU128(provider.getLiquidityAmount());
        writer.writeU128(provider.getReservedAmount());
        writer.writeStringWithLength(provider.getBtcReceiver());

        writer.writeU32(provider.getQueueIndex());
        writer.writeBoolean(provider.isPriority());

        writer.writeU32(provider.getPurgedIndex());
        writer.writeBoolean(provider.isActive());

        writer.writeU64(provider.getListedTokenAtBlock());
        writer.writeBoolean(provider.isPurged());
        return writer;
    }

    private getDeployer(token: Address): Address {
        const calldata: BytesWriter = new BytesWriter(4);
        calldata.writeSelector(NativeSwap.DEPLOYER_SELECTOR);

        const response: BytesReader = Blockchain.call(token, calldata);
        return response.readAddress();
    }

    private ensureContractDeployer(tokenOwner: Address): void {
        if (Blockchain.tx.origin.equals(tokenOwner) == false) {
            throw new Revert('NATIVE_SWAP: Only token owner can call createPool.');
        }
    }

    private ensureValidTokenAddress(token: Address): void {
        if (token.isZero() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('NATIVE_SWAP: Invalid token address.');
        }
    }

    private ensurePoolExistsForToken(queue: ILiquidityQueue): void {
        if (queue.initialLiquidityProviderId.isZero()) {
            throw new Revert('NATIVE_SWAP: Pool does not exist for token.');
        }
    }

    private ensureMaximumAmountInNotZero(maximumAmountIn: u64): void {
        if (maximumAmountIn === 0) {
            throw new Revert('NATIVE_SWAP: Maximum amount in cannot be zero.');
        }
    }

    private ensurePriceNotZeroAndLiquidity(price: u256): void {
        if (price.isZero()) {
            throw new Revert('NATIVE_SWAP: Price is zero or no liquidity.');
        }
    }

    private ensureNotPaused(): void {
        if (this._isPaused.value) {
            throw new Revert(`NATIVE_SWAP: Contract is currently paused. Try again later.`);
        }
    }

    private ensureWithdrawModeActive(): void {
        if (!this._withdrawModeActive.value) {
            throw new Revert(`NATIVE_SWAP: Withdraw mode is not active.`);
        }
    }

    private ensureWithdrawModeNotActive(): void {
        if (this._withdrawModeActive.value) {
            throw new Revert(
                `NATIVE_SWAP: You cannot perform this action when withdraw mode is active.`,
            );
        }
    }

    private ensureFeesAddressIsValid(address: string): void {
        if (address.length === 0) {
            throw new Revert('NATIVE_SWAP: Fees address is empty.');
        }

        if (Blockchain.validateBitcoinAddress(address) == false) {
            throw new Revert('NATIVE_SWAP: Fees address is an invalid bitcoin address.');
        }
    }

    private onOP20Received(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(SELECTOR_BYTE_LENGTH);
        writer.writeSelector(ON_OP_20_RECEIVED_SELECTOR);
        return writer;
    }

    /*DEBUG FUNCTIONS
        private getLastPurgedBlock(calldata: Calldata): BytesWriter {
            this.onlyDeployer(Blockchain.tx.sender);
            const token: Address = calldata.readAddress();
            this.ensureValidTokenAddress(token);

            const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
                token,
                this.addressToPointer(token),
                false,
            );

            this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

            const writer = new BytesWriter(U64_BYTE_LENGTH);
            writer.writeU64(liquidityQueueResult.liquidityQueue.lastPurgedBlock);

            return writer;
        }

        private getBlocksWithReservationsLength(calldata: Calldata): BytesWriter {
            this.onlyDeployer(Blockchain.tx.sender);
            const token: Address = calldata.readAddress();
            this.ensureValidTokenAddress(token);

            const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
                token,
                this.addressToPointer(token),
                false,
            );

            this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

            const writer = new BytesWriter(U32_BYTE_LENGTH);
            writer.writeU32(<u32>liquidityQueueResult.liquidityQueue.blockWithReservationsLength());

            return writer;
        }

        private purgeReservationsAndRestoreProviders(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
            const token: Address = calldata.readAddress();
            this.ensureValidTokenAddress(token);

            const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
                token,
                this.addressToPointer(token),
                true,
                true,
            );
            this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

            // Save the updated queue
            liquidityQueueResult.liquidityQueue.save();

            return new BytesWriter(0);
        }
    */
}
