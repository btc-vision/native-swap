import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    Calldata,
    encodeSelector,
    Revert,
    SafeMath,
    Selector,
    StoredAddress,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U64_BYTE_LENGTH,
    ZERO_ADDRESS,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { LiquidityQueue } from '../managers/LiquidityQueue';
import { getProvider, saveAllProviders } from '../models/Provider';
import { FeeManager } from '../managers/FeeManager';
import { AddLiquidityOperation } from '../operations/AddLiquidityOperation';
import { RemoveLiquidityOperation } from '../operations/RemoveLiquidityOperation';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { CancelListingOperation } from '../operations/CancelListingOperation';
import { SwapOperation } from '../operations/SwapOperation';
import { SELECTOR_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime/utils/lengths';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { ReentrancyGuard } from '../contracts/ReentrancyGuard';
import { STAKING_CA_POINTER } from '../constants/StoredPointers';
import { eqUint } from '@btc-vision/btc-runtime/runtime/generic/MapUint8Array';
import { satoshisToTokens, tokensToSatoshis } from '../utils/SatoshisConversion';
import { QUOTE_SCALE } from '../constants/Contract';
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

/**
 * OrderBook contract for the OP_NET order book system,
 * now using block-based, virtual-constant-product logic
 * in the LiquidityQueue.
 */
@final
export class NativeSwap extends ReentrancyGuard {
    private readonly _stakingContractAddress: StoredAddress;

    //private readonly minimumTradeSize: u256 = u256.fromU32(10_000); // The minimum trade size in satoshis.

    public constructor() {
        super();

        this._stakingContractAddress = new StoredAddress(STAKING_CA_POINTER);
    }

    private static get DEPLOYER_SELECTOR(): Selector {
        return encodeSelector('deployer');
    }

    private static get APPROVE_FROM_SELECTOR(): Selector {
        return encodeSelector('approveFrom(address,uint256,uint256,bytes)');
    }

    public get stakingContractAddress(): Address {
        const address = this._stakingContractAddress.value;
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
            case encodeSelector('reserve(address,uint256,uint256,bool,uint8)'):
                return this.reserve(calldata);
            case encodeSelector('swap(address)'):
                return this.swap(calldata);
            case encodeSelector('listLiquidity(address,string,uint128,bool)'):
                return this.listLiquidity(calldata);
            case encodeSelector('cancelListing(address)'):
                return this.cancelListing(calldata);
            case encodeSelector('addLiquidity(address,string)'):
                return this.addLiquidity(calldata);
            case encodeSelector('removeLiquidity(address)'):
                return this.removeLiquidity(calldata);
            case encodeSelector(
                'createPool(address,uint256,uint128,string,uint16,uint256,uint16)',
            ): {
                const token: Address = calldata.readAddress();
                return this.createPool(calldata, token);
            }
            case encodeSelector(
                'createPoolWithSignature(bytes,uint256,uint256,address,uint256,uint128,string,uint16,uint256,uint16)',
            ): {
                return this.createPoolWithSignature(calldata);
            }
            case encodeSelector('setFees(uint64,uint64)'):
                return this.setFees(calldata);
            case encodeSelector('setStakingContractAddress(address)'):
                return this.setStakingContractAddress(calldata);

            /** Readable methods */
            case encodeSelector('getReserve(address)'):
                return this.getReserve(calldata);
            case encodeSelector('getQuote(address,uint256)'):
                return this.getQuote(calldata);
            case encodeSelector('getProviderDetails(address)'):
                return this.getProviderDetails(calldata);
            case encodeSelector('getPriorityQueueCost'):
                return this.getPriorityQueueCost();
            case encodeSelector('getFees'):
                return this.getFees();
            case encodeSelector('getAntibotSettings(address)'):
                return this.getAntibotSettings(calldata);
            case encodeSelector('getStakingContractAddress'):
                return this.getStakingContractAddress(calldata);
            default:
                return super.execute(method, calldata);
        }
    }

    private getAntibotSettings(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const { liquidityQueue, tradeManager } = this.getLiquidityQueueAndTradeManager(
            token,
            this.addressToPointer(token),
            false,
        );

        const writer = new BytesWriter(U64_BYTE_LENGTH + U256_BYTE_LENGTH);
        writer.writeU64(liquidityQueue.antiBotExpirationBlock);
        writer.writeU256(liquidityQueue.maxTokensPerReservation);

        return writer;
    }

    private getFees(): BytesWriter {
        const writer = new BytesWriter(2 * U64_BYTE_LENGTH);
        writer.writeU64(FeeManager.reservationBaseFee);
        writer.writeU64(FeeManager.priorityQueueBaseFee);

        return writer;
    }

    private setFees(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        FeeManager.reservationBaseFee = calldata.readU64();
        FeeManager.priorityQueueBaseFee = calldata.readU64();

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }

    private getStakingContractAddress(_calldata: Calldata): BytesWriter {
        const response = new BytesWriter(ADDRESS_BYTE_LENGTH);
        response.writeAddress(this.stakingContractAddress);

        return response;
    }

    private setStakingContractAddress(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        this._stakingContractAddress.value = calldata.readAddress();

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }

    private getProviderDetails(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const provider = getProvider(providerId);

        const writer = new BytesWriter(
            U128_BYTE_LENGTH * 2 + (2 + provider.getbtcReceiver().length) + 32,
        );
        writer.writeU128(provider.getLiquidityAmount());
        writer.writeU128(provider.getReservedAmount());
        writer.writeU256(provider.getLiquidityProvided());
        writer.writeStringWithLength(provider.getbtcReceiver());

        return writer;
    }

    private getPriorityQueueCost(): BytesWriter {
        const cost = FeeManager.priorityQueueBaseFee;

        const writer = new BytesWriter(U64_BYTE_LENGTH);
        writer.writeU64(cost);

        return writer;
    }

    private addLiquidity(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const receiver = calldata.readStringWithLength();
        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const { liquidityQueue, tradeManager } = this.getLiquidityQueueAndTradeManager(
            token,
            this.addressToPointer(token),
            false,
        );
        const operation = new AddLiquidityOperation(
            liquidityQueue,
            tradeManager,
            providerId,
            receiver,
        );

        operation.execute();
        liquidityQueue.save();

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }

    private removeLiquidity(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const { liquidityQueue, tradeManager } = this.getLiquidityQueueAndTradeManager(
            token,
            this.addressToPointer(token),
            true,
        );
        const operation = new RemoveLiquidityOperation(liquidityQueue, providerId);

        operation.execute();
        liquidityQueue.save();

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }

    private createPoolWithSignature(calldata: Calldata): BytesWriter {
        const signature = calldata.readBytesWithLength();
        this.ensureValidSignatureLength(signature);

        const amount = calldata.readU256();
        const nonce = calldata.readU256();

        const calldataSend = new BytesWriter(
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

    private createPool(calldata: Calldata, token: Address): BytesWriter {
        const tokenOwner = this.getDeployer(token);

        this.ensureContractDeployer(tokenOwner);

        const floorPrice: u256 = calldata.readU256();
        const initialLiquidity: u128 = calldata.readU128();
        const receiver: string = calldata.readStringWithLength();
        const antiBotEnabledFor: u16 = calldata.readU16();
        const antiBotMaximumTokensPerReservation: u256 = calldata.readU256();
        const maxReservesIn5BlocksPercent: u16 = calldata.readU16();
        const { liquidityQueue, tradeManager } = this.getLiquidityQueueAndTradeManager(
            token,
            this.addressToPointer(token),
            true,
        );
        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const operation = new CreatePoolOperation(
            liquidityQueue,
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
        liquidityQueue.save();

        const writer = new BytesWriter(1);
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

        const result = new BytesWriter(1);
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

        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const tokenId = this.addressToPointer(token);
        const { liquidityQueue, tradeManager } = this.getLiquidityQueueAndTradeManager(
            token,
            tokenId,
            true,
        );
        const operation = new ListTokensForSaleOperation(
            liquidityQueue,
            providerId,
            amountIn,
            receiver,
            this.stakingContractAddress,
            priority,
            false,
        );

        operation.execute();
        liquidityQueue.save();
    }

    private reserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const maximumAmountIn: u256 = calldata.readU256();
        const minimumAmountOut: u256 = calldata.readU256();
        const forLP: bool = calldata.readBoolean();
        const activationDelay: u8 = calldata.readU8();

        this._reserve(token, maximumAmountIn, minimumAmountOut, forLP, activationDelay);

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }

    private _reserve(
        token: Address,
        maximumAmountIn: u256,
        minimumAmountOut: u256,
        forLP: bool,
        activationDelay: u8,
    ): void {
        this.ensureValidTokenAddress(token);

        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const { liquidityQueue, tradeManager } = this.getLiquidityQueueAndTradeManager(
            token,
            this.addressToPointer(token),
            true,
        );
        const operation = new ReserveLiquidityOperation(
            liquidityQueue,
            providerId,
            Blockchain.tx.sender,
            maximumAmountIn,
            minimumAmountOut,
            forLP,
            activationDelay,
        );

        operation.execute();
        liquidityQueue.save();
    }

    private cancelListing(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        this._cancelListing(token);

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }

    private _cancelListing(token: Address): void {
        this.ensureValidTokenAddress(token);

        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const tokenId = this.addressToPointer(token);
        const { liquidityQueue, tradeManager } = this.getLiquidityQueueAndTradeManager(
            token,
            tokenId,
            true,
        );
        const operation = new CancelListingOperation(liquidityQueue, providerId);

        operation.execute();
        liquidityQueue.save();
    }

    private swap(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        this._swap(token);

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        return result;
    }

    private _swap(token: Address): void {
        this.ensureValidTokenAddress(token);

        const { liquidityQueue, tradeManager } = this.getLiquidityQueueAndTradeManager(
            token,
            this.addressToPointer(token),
            false,
        );

        const operation = new SwapOperation(
            liquidityQueue,
            tradeManager,
            this.stakingContractAddress,
        );

        operation.execute();
        liquidityQueue.save();
    }

    private getReserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();

        return this._getReserve(token);
    }

    private _getReserve(token: Address): BytesWriter {
        this.ensureValidTokenAddress(token);

        const { liquidityQueue, tradeManager } = this.getLiquidityQueueAndTradeManager(
            token,
            this.addressToPointer(token),
            true,
        );

        this.ensurePoolExistsForToken(liquidityQueue);

        const result = new BytesWriter(4 * U256_BYTE_LENGTH);
        result.writeU256(liquidityQueue.liquidity);
        result.writeU256(liquidityQueue.reservedLiquidity);
        result.writeU256(liquidityQueue.virtualBTCReserve);
        result.writeU256(liquidityQueue.virtualTokenReserve);

        return result;
    }

    private getQuote(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const satoshisIn: u256 = calldata.readU256();

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
    private _getQuote(token: Address, satoshisIn: u256): BytesWriter {
        this.ensureValidTokenAddress(token);
        this.ensureMaximumAmountInNotZero(satoshisIn);

        const { liquidityQueue, tradeManager } = this.getLiquidityQueueAndTradeManager(
            token,
            this.addressToPointer(token),
            false,
        );
        this.ensurePoolExistsForToken(liquidityQueue);

        const price: u256 = liquidityQueue.quote();
        this.ensurePriceNotZeroAndLiquidity(price);

        let tokensOut = satoshisToTokens(satoshisIn, price);

        // If tokensOut > availableLiquidity, cap it
        const availableLiquidity = SafeMath.sub(
            liquidityQueue.liquidity,
            liquidityQueue.reservedLiquidity,
        );

        let requiredSatoshis = satoshisIn;
        if (u256.gt(tokensOut, availableLiquidity)) {
            tokensOut = availableLiquidity;
            requiredSatoshis = tokensToSatoshis(tokensOut, price);

            // If that is bigger than satoshisIn, clamp
            if (u256.gt(requiredSatoshis, satoshisIn)) {
                requiredSatoshis = satoshisIn;
            }
        }

        // Prepare output
        const result = new BytesWriter(3 * U256_BYTE_LENGTH + U64_BYTE_LENGTH);
        result.writeU256(tokensOut); // how many tokens
        result.writeU256(requiredSatoshis); // how many sat needed
        result.writeU256(price); // final *scaled* price
        result.writeU64(QUOTE_SCALE.toU64());
        return result;
    }

    private getLiquidityQueueAndTradeManager(
        token: Address,
        tokenId: Uint8Array,
        purgeOldReservations: boolean,
    ): { liquidityQueue: ILiquidityQueue; tradeManager: ITradeManager } {
        const owedBtcManager = this.getOwedBtcManager();
        const quoteManager = this.getQuoteManager(tokenId);
        const liquidityQueueReserve = this.getLiquidityQueueReserve(token, tokenId);
        const providerManager = this.getProviderManager(token, tokenId, owedBtcManager);
        const reservationManager = this.getReservationManager(
            token,
            tokenId,
            providerManager,
            quoteManager,
            liquidityQueueReserve,
        );
        const dynamicFee = this.getDynamicFee(tokenId);

        const liquidityQueue = new LiquidityQueue(
            token,
            tokenId,
            providerManager,
            liquidityQueueReserve,
            quoteManager,
            reservationManager,
            dynamicFee,
            purgeOldReservations,
        );

        const tradeManager = new TradeManager(
            tokenId,
            quoteManager,
            providerManager,
            liquidityQueue,
        );

        return { liquidityQueue, tradeManager };
    }

    private getQuoteManager(tokenId: Uint8Array): IQuoteManager {
        return new QuoteManager(tokenId);
    }

    private getProviderManager(
        token: Address,
        tokenId: Uint8Array,
        owedBtcManager: IOwedBTCManager,
    ): IProviderManager {
        return new ProviderManager(token, tokenId, owedBtcManager);
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
        quoteManager: IQuoteManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
    ): IReservationManager {
        return new ReservationManager(
            token,
            tokenId,
            providerManager,
            quoteManager,
            liquidityQueueReserve,
        );
    }

    private getDynamicFee(tokenId: Uint8Array): IDynamicFee {
        return new DynamicFee(tokenId);
    }

    private addressToPointerU256(address: Address, token: Address): u256 {
        const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer.writeAddress(address);
        writer.writeAddress(token);
        return u256.fromBytes(sha256(writer.getBuffer()), true);
    }

    private addressToPointer(address: Address): Uint8Array {
        return ripemd160(address);
    }

    private getDeployer(token: Address): Address {
        const calldata = new BytesWriter(4);
        calldata.writeSelector(NativeSwap.DEPLOYER_SELECTOR);

        const response = Blockchain.call(token, calldata);
        return response.readAddress();
    }

    private ensureValidReceiverAddress(receiver: string): void {
        if (Blockchain.validateBitcoinAddress(receiver) == false) {
            throw new Revert('NATIVE_SWAP: Invalid receiver address');
        }
    }

    private ensureContractDeployer(tokenOwner: Address): void {
        if (Blockchain.tx.origin.equals(tokenOwner) == false) {
            throw new Revert('NATIVE_SWAP: Only token owner can call createPool');
        }
    }

    private ensureValidTokenAddress(token: Address): void {
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('NATIVE_SWAP: Invalid token address');
        }
    }

    private ensurePoolExistsForToken(queue: ILiquidityQueue): void {
        if (queue.initialLiquidityProviderId.isZero()) {
            throw new Revert('NATIVE_SWAP: Pool does not exist for token');
        }
    }

    private ensureMaximumAmountInNotZero(maximumAmountIn: u256): void {
        if (maximumAmountIn.isZero()) {
            throw new Revert('NATIVE_SWAP: Maximum amount in cannot be zero');
        }
    }

    private ensurePriceNotZeroAndLiquidity(price: u256): void {
        if (price.isZero()) {
            throw new Revert('NATIVE_SWAP: Price is zero or no liquidity');
        }
    }

    private ensureValidSignatureLength(signature: Uint8Array): void {
        if (signature.length !== 64) {
            throw new Revert('NATIVE_SWAP: Invalid signature length');
        }
    }
}
