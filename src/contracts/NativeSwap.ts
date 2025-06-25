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
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
    ZERO_ADDRESS,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { LiquidityQueue } from '../managers/LiquidityQueue';
import { getProvider, Provider, saveAllProviders } from '../models/Provider';
import { FeeManager } from '../managers/FeeManager';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { CancelListingOperation } from '../operations/CancelListingOperation';
import { SwapOperation } from '../operations/SwapOperation';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { ReentrancyGuard } from './ReentrancyGuard';
import { STAKING_CA_POINTER } from '../constants/StoredPointers';
import { eqUint } from '@btc-vision/btc-runtime/runtime/generic/MapUint8Array';
import { satoshisToTokens, tokensToSatoshis } from '../utils/SatoshisConversion';
import {
    ALLOW_DIRTY,
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
import { IOwedBTCManager } from '../managers/interfaces/IOwedBTCManager';
import { OwedBTCManager } from '../managers/OwedBTCManager';
import { IProviderManager } from '../managers/interfaces/IProviderManager';
import { ILiquidityQueueReserve } from '../managers/interfaces/ILiquidityQueueReserve';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import { IReservationManager } from '../managers/interfaces/IReservationManager';
import { ReservationManager } from '../managers/ReservationManager';
import { IDynamicFee } from '../managers/interfaces/IDynamicFee';
import { DynamicFee } from '../managers/DynamicFee';

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

    public constructor() {
        super();

        this._stakingContractAddress = new StoredAddress(STAKING_CA_POINTER);
    }

    private static get DEPLOYER_SELECTOR(): Selector {
        return encodeSelector('deployer()');
    }

    private static get APPROVE_FROM_SELECTOR(): Selector {
        return encodeSelector('approveFrom(address,uint256,uint256,bytes)');
    }

    public get stakingContractAddress(): Address {
        const address: Address = this._stakingContractAddress.value;
        if (eqUint(address, ZERO_ADDRESS)) {
            return Address.dead();
        }

        return address;
    }

    public override onDeployment(_calldata: Calldata): void {
        FeeManager.onDeploy();
    }

    public override onExecutionCompleted(): void {
        super.onExecutionCompleted();
        FeeManager.save();
        saveAllProviders();
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('reserve(address,uint64,uint256,bool,uint8)'):
                return this.reserve(calldata);
            case encodeSelector('swap(address)'):
                return this.swap(calldata);
            case encodeSelector('listLiquidity(address,string,uint128,bool)'):
                return this.listLiquidity(calldata);
            case encodeSelector('cancelListing(address)'):
                return this.cancelListing(calldata);
            /* Version 1 does not support liquidity provider
            case encodeSelector('addLiquidity(address,string)'):
                return this.addLiquidity(calldata);
            case encodeSelector('removeLiquidity(address)'):
                return this.removeLiquidity(calldata);

             */
            case encodeSelector(
                'createPool(address,uint256,uint128,string,uint16,uint256,uint16)',
            ): {
                const token: Address = calldata.readAddress();
                return this.createPool(calldata, token);
            }
            /* Disable for version 1. Will be reworked later.
            case encodeSelector(
                'createPoolWithSignature(bytes,uint256,uint256,address,uint256,uint128,string,uint16,uint256,uint16)',
            ): {
                return this.createPoolWithSignature(calldata);
            }

             */
            case encodeSelector('setFees(uint64,uint64)'):
                return this.setFees(calldata);
            case encodeSelector('setStakingContractAddress(address)'):
                return this.setStakingContractAddress(calldata);

            /** Readable methods */
            case encodeSelector('getReserve(address)'):
                return this.getReserve(calldata);
            case encodeSelector('getQuote(address,uint64)'):
                return this.getQuote(calldata);
            case encodeSelector('getProviderDetails(address)'):
                return this.getProviderDetails(calldata);
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
            /*case encodeSelector('getLastPurgedBlock(address)'):
                return this.getLastPurgedBlock(calldata);
            case encodeSelector('getBlocksWithReservationsLength(address)'):
                return this.getBlocksWithReservationsLength(calldata);
            case encodeSelector('purgeReservationsAndRestoreProviders(address)'):
                return this.purgeReservationsAndRestoreProviders(calldata);
            */
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

        FeeManager.reservationBaseFee = calldata.readU64();
        FeeManager.priorityQueueBaseFee = calldata.readU64();

        const result: BytesWriter = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }

    private getStakingContractAddress(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(this.stakingContractAddress);

        return response;
    }

    private setStakingContractAddress(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        this._stakingContractAddress.value = calldata.readAddress();

        const result: BytesWriter = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }

    private getProviderDetails(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);
        const provider: Provider = getProvider(providerId);

        const writer: BytesWriter = new BytesWriter(
            U128_BYTE_LENGTH * 3 +
                (U32_BYTE_LENGTH + provider.getBtcReceiver().length) +
                2 * U32_BYTE_LENGTH +
                2 * BOOLEAN_BYTE_LENGTH +
                U64_BYTE_LENGTH,
        );

        writer.writeU128(provider.getLiquidityAmount());
        writer.writeU128(provider.getReservedAmount());
        writer.writeU128(provider.getLiquidityProvided());
        writer.writeStringWithLength(provider.getBtcReceiver());
        writer.writeU32(provider.getQueueIndex());
        writer.writeBoolean(provider.isPriority());
        writer.writeU32(provider.getPurgedIndex());
        writer.writeBoolean(provider.isActive());
        writer.writeU64(provider.getListedTokenAtBlock());
        return writer;
    }

    private getQueueDetails(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const getQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
            token,
            this.addressToPointer(token),
            false,
        );

        this.ensurePoolExistsForToken(getQueueResult.liquidityQueue);

        const writer = new BytesWriter(U64_BYTE_LENGTH + 10 * U32_BYTE_LENGTH);
        writer.writeU64(getQueueResult.liquidityQueue.lastPurgedBlock);
        writer.writeU32(getQueueResult.liquidityQueue.blockWithReservationsLength());
        writer.writeBytes(getQueueResult.liquidityQueue.getProviderQueueData());

        return writer;
    }

    private getPriorityQueueCost(): BytesWriter {
        const cost: u64 = FeeManager.priorityQueueBaseFee;

        const writer: BytesWriter = new BytesWriter(U64_BYTE_LENGTH);
        writer.writeU64(cost);

        return writer;
    }

    /*
        private addLiquidity(calldata: Calldata): BytesWriter {
            const token: Address = calldata.readAddress();
            const receiver: string = calldata.readStringWithLength();
            const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);
            const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
                token,
                this.addressToPointer(token),
                false,
            );
    
            this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);
    
            const operation: AddLiquidityOperation = new AddLiquidityOperation(
                liquidityQueueResult.liquidityQueue,
                liquidityQueueResult.tradeManager,
                providerId,
                receiver,
            );
    
            operation.execute();
            liquidityQueueResult.liquidityQueue.save();
    
            const result: BytesWriter = new BytesWriter(1);
            result.writeBoolean(true);
    
            return result;
        }
    
        private removeLiquidity(calldata: Calldata): BytesWriter {
            const token: Address = calldata.readAddress();
            const providerId: u256 = this.addressToPointerU256(Blockchain.tx.sender, token);
            const liquidityQueueResult: GetLiquidityQueueResult = this.getLiquidityQueue(
                token,
                this.addressToPointer(token),
                true,
            );
    
            this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);
    
            const operation: RemoveLiquidityOperation = new RemoveLiquidityOperation(
                liquidityQueueResult.liquidityQueue,
                providerId,
            );
    
            operation.execute();
            liquidityQueueResult.liquidityQueue.save();
    
            const result: BytesWriter = new BytesWriter(1);
            result.writeBoolean(true);
    
            return result;
        }
    
        private createPoolWithSignature(calldata: Calldata): BytesWriter {
            const signature: Uint8Array = calldata.readBytesWithLength();
            this.ensureValidSignatureLength(signature);
    
            const amount: u256 = calldata.readU256();
            const nonce: u256 = calldata.readU256();
    
            const calldataSend: BytesWriter = new BytesWriter(
                SELECTOR_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH + U256_BYTE_LENGTH + 68,
            );
    
            calldataSend.writeSelector(NativeSwap.APPROVE_FROM_SELECTOR);
            calldataSend.writeAddress(this.address);
            calldataSend.writeU256(amount);
            calldataSend.writeU256(nonce);
            calldataSend.writeBytesWithLength(signature);
    
            const token: Address = calldata.readAddress();
    
            Blockchain.call(token, calldataSend);
    
            return this.createPool(calldata, token);
        }
    */
    private createPool(calldata: Calldata, token: Address): BytesWriter {
        const tokenOwner: Address = this.getDeployer(token);

        this.ensureContractDeployer(tokenOwner);

        const floorPrice: u256 = calldata.readU256();
        const initialLiquidity: u128 = calldata.readU128();
        const receiver: string = calldata.readStringWithLength();
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
            antiBotEnabledFor,
            antiBotMaximumTokensPerReservation,
            maxReservesIn5BlocksPercent,
            this.stakingContractAddress,
        );

        operation.execute();
        liquidityQueueResult.liquidityQueue.save();

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);

        return writer;
    }

    private listLiquidity(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const receiver: string = calldata.readStringWithLength();

        this.ensureValidReceiverAddress(receiver);

        const amountIn: u128 = calldata.readU128();
        const priority: boolean = calldata.readBoolean();

        this._listLiquidity(token, receiver, amountIn, priority);

        const result: BytesWriter = new BytesWriter(BOOLEAN_BYTE_LENGTH);
        result.writeBoolean(true);

        return result;
    }

    private _listLiquidity(
        token: Address,
        receiver: string,
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
            this.stakingContractAddress,
            priority,
            false,
        );

        operation.execute();
        liquidityQueueResult.liquidityQueue.save();
    }

    private reserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const maximumAmountIn: u64 = calldata.readU64();
        const minimumAmountOut: u256 = calldata.readU256();
        const forLP: boolean = calldata.readBoolean();
        const activationDelay: u8 = calldata.readU8();

        this._reserve(token, maximumAmountIn, minimumAmountOut, forLP, activationDelay);

        const result: BytesWriter = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }

    private _reserve(
        token: Address,
        maximumAmountIn: u64,
        minimumAmountOut: u256,
        forLP: boolean,
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
            forLP,
            activationDelay,
            MAXIMUM_PROVIDER_PER_RESERVATIONS,
        );

        operation.execute();
        liquidityQueueResult.liquidityQueue.save();
    }

    private cancelListing(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        this._cancelListing(token);

        const result: BytesWriter = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
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
            this.stakingContractAddress,
        );

        operation.execute();
        liquidityQueueResult.liquidityQueue.save();
    }

    private swap(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        this._swap(token);

        const result: BytesWriter = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
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
            this.stakingContractAddress,
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
            true,
        );

        this.ensurePoolExistsForToken(liquidityQueueResult.liquidityQueue);

        const result: BytesWriter = new BytesWriter(3 * U256_BYTE_LENGTH + U64_BYTE_LENGTH);
        result.writeU256(liquidityQueueResult.liquidityQueue.liquidity);
        result.writeU256(liquidityQueueResult.liquidityQueue.reservedLiquidity);
        result.writeU64(liquidityQueueResult.liquidityQueue.virtualSatoshisReserve);
        result.writeU256(liquidityQueueResult.liquidityQueue.virtualTokenReserve);

        return result;
    }

    /*
    private getLastPurgedBlock(calldata: Calldata): BytesWriter {
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

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }
*/
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
        const owedBtcManager: IOwedBTCManager = this.getOwedBtcManager();
        const quoteManager: IQuoteManager = this.getQuoteManager(tokenId);
        const liquidityQueueReserve: ILiquidityQueueReserve = this.getLiquidityQueueReserve(
            token,
            tokenId,
        );
        const providerManager: IProviderManager = this.getProviderManager(
            token,
            tokenId,
            owedBtcManager,
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
            owedBtcManager,
            purgeOldReservations,
            timeoutEnabled,
        );

        const tradeManager: TradeManager = new TradeManager(
            tokenId,
            quoteManager,
            providerManager,
            liquidityQueueReserve,
            owedBtcManager,
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
        owedBtcManager: IOwedBTCManager,
        quoteManager: IQuoteManager,
    ): IProviderManager {
        return new ProviderManager(
            token,
            tokenId,
            owedBtcManager,
            quoteManager,
            ENABLE_INDEX_VERIFICATION,
        );
    }

    private getOwedBtcManager(): IOwedBTCManager {
        return new OwedBTCManager();
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
            ALLOW_DIRTY,
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

    private getDeployer(token: Address): Address {
        const calldata: BytesWriter = new BytesWriter(4);
        calldata.writeSelector(NativeSwap.DEPLOYER_SELECTOR);

        const response: BytesReader = Blockchain.call(token, calldata);
        return response.readAddress();
    }

    private ensureValidReceiverAddress(receiver: string): void {
        if (Blockchain.validateBitcoinAddress(receiver) == false) {
            throw new Revert('NATIVE_SWAP: Invalid receiver address.');
        }
    }

    private ensureContractDeployer(tokenOwner: Address): void {
        if (Blockchain.tx.origin.equals(tokenOwner) == false) {
            throw new Revert('NATIVE_SWAP: Only token owner can call createPool.');
        }
    }

    private ensureValidTokenAddress(token: Address): void {
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
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

    private ensureValidSignatureLength(signature: Uint8Array): void {
        if (signature.length !== 64) {
            throw new Revert('NATIVE_SWAP: Invalid signature length.');
        }
    }
}
