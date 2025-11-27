import { BaseOperation } from './BaseOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Blockchain, Revert } from '@btc-vision/btc-runtime/runtime';
import { ListTokensForSaleOperation } from './ListTokensForSaleOperation';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { getProvider, Provider } from '../models/Provider';
import {
    DEFAULT_STABLE_AMPLIFICATION,
    INITIAL_LIQUIDITY_PROVIDER_INDEX,
    POOL_TYPE_STABLE,
    POOL_TYPE_STANDARD,
} from '../constants/Contract';

export class CreatePoolOperation extends BaseOperation {
    private readonly floorPrice: u256;
    private readonly providerId: u256;
    private readonly initialLiquidity: u128;
    private readonly receiver: Uint8Array;
    private readonly receiverStr: string;
    private readonly antiBotEnabledFor: u16;
    private readonly antiBotMaximumTokensPerReservation: u256;
    private readonly maxReservesIn5BlocksPercent: u16;
    private readonly poolType: u8;
    private readonly amplification: u64;

    constructor(
        liquidityQueue: ILiquidityQueue,
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u128,
        receiver: Uint8Array,
        receiverStr: string,
        antiBotEnabledFor: u16,
        antiBotMaximumTokensPerReservation: u256,
        maxReservesIn5BlocksPercent: u16,
        poolType: u8 = POOL_TYPE_STANDARD,
        amplification: u64 = DEFAULT_STABLE_AMPLIFICATION,
    ) {
        super(liquidityQueue);

        this.floorPrice = floorPrice;
        this.providerId = providerId;
        this.initialLiquidity = initialLiquidity;
        this.receiver = receiver;
        this.receiverStr = receiverStr;
        this.antiBotEnabledFor = antiBotEnabledFor;
        this.antiBotMaximumTokensPerReservation = antiBotMaximumTokensPerReservation;
        this.maxReservesIn5BlocksPercent = maxReservesIn5BlocksPercent;
        this.poolType = poolType;
        this.amplification = amplification;
    }

    public override execute(): void {
        this.checkPreConditions();
        this.initializeInitialProvider();
        this.listTokenForSale();
        this.applyAntibotSettingsIfNeeded();
    }

    private applyAntibotSettingsIfNeeded(): void {
        if (this.antiBotEnabledFor > 0) {
            this.liquidityQueue.antiBotExpirationBlock =
                Blockchain.block.number + u64(this.antiBotEnabledFor);
            this.liquidityQueue.maxTokensPerReservation = this.antiBotMaximumTokensPerReservation;
        }
    }

    private checkPreConditions(): void {
        this.ensureReceiverAddressValid();
        this.ensureFloorPriceNotZero();
        this.ensureInitialLiquidityNotZero();
        this.ensureAntibotSettingsValid();
        this.ensureInitialLiquidityProviderNotAlreadySet();
        this.ensureMaxReservesIn5BlocksPercentValid();
        this.ensurePoolTypeValid();
        this.ensureAmplificationValid();
    }

    private ensurePoolTypeValid(): void {
        if (this.poolType !== POOL_TYPE_STANDARD && this.poolType !== POOL_TYPE_STABLE) {
            throw new Revert('NATIVE_SWAP: Invalid pool type. Must be 0 (standard) or 1 (stable).');
        }
    }

    private ensureAmplificationValid(): void {
        if (this.poolType === POOL_TYPE_STABLE) {
            if (this.amplification < 1 || this.amplification > 10000) {
                throw new Revert('NATIVE_SWAP: Amplification must be between 1 and 10000.');
            }
        }
    }

    private ensureAntibotSettingsValid(): void {
        if (this.antiBotEnabledFor !== 0 && this.antiBotMaximumTokensPerReservation.isZero()) {
            throw new Revert('NATIVE_SWAP: Anti-bot max tokens per reservation cannot be zero.');
        }
    }

    private ensureFloorPriceNotZero(): void {
        if (this.floorPrice.isZero()) {
            throw new Revert('NATIVE_SWAP: Floor price cannot be zero.');
        }
    }

    private ensureInitialLiquidityNotZero(): void {
        if (this.initialLiquidity.isZero()) {
            throw new Revert('NATIVE_SWAP: Initial liquidity cannot be zero.');
        }
    }

    private ensureInitialLiquidityProviderNotAlreadySet(): void {
        if (!this.liquidityQueue.initialLiquidityProviderId.isZero()) {
            throw new Revert('NATIVE_SWAP: Base quote already set.');
        }
    }

    private ensureMaxReservesIn5BlocksPercentValid(): void {
        if (this.maxReservesIn5BlocksPercent > 100) {
            throw new Revert(
                'NATIVE_SWAP: The maximum reservation percentage for 5 blocks must be less than or equal to 100.',
            );
        }
    }

    private ensureReceiverAddressValid(): void {
        if (Blockchain.validateBitcoinAddress(this.receiverStr) == false) {
            throw new Revert('NATIVE_SWAP: Invalid receiver address.');
        }
    }

    private initializeInitialProvider(): void {
        const initialProvider: Provider = getProvider(this.providerId);

        initialProvider.markInitialLiquidityProvider();
        initialProvider.setQueueIndex(INITIAL_LIQUIDITY_PROVIDER_INDEX);
        initialProvider.save();

        this.liquidityQueue.initializeInitialLiquidity(
            this.floorPrice,
            this.providerId,
            this.initialLiquidity,
            this.maxReservesIn5BlocksPercent,
            this.poolType,
            this.amplification,
        );
    }

    private listTokenForSale(): void {
        const listTokenForSaleOp: ListTokensForSaleOperation = new ListTokensForSaleOperation(
            this.liquidityQueue,
            this.providerId,
            this.initialLiquidity,
            this.receiver,
            this.receiverStr,
            false,
            true,
        );

        listTokenForSaleOp.execute();
    }
}
