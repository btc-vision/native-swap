import { BaseOperation } from './BaseOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Blockchain, Revert } from '@btc-vision/btc-runtime/runtime';
import { ListTokensForSaleOperation } from './ListTokensForSaleOperation';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { getProvider, Provider } from '../models/Provider';
import { INITIAL_LIQUIDITY_PROVIDER_INDEX } from '../constants/Contract';

export class CreatePoolOperation extends BaseOperation {
    private readonly floorPrice: u256;
    private readonly providerId: u256;
    private readonly initialLiquidity: u128;
    private readonly receiver: string;
    private readonly antiBotEnabledFor: u16;
    private readonly antiBotMaximumTokensPerReservation: u256;
    private readonly maxReservesIn5BlocksPercent: u16;

    constructor(
        liquidityQueue: ILiquidityQueue,
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u128,
        receiver: string,
        antiBotEnabledFor: u16,
        antiBotMaximumTokensPerReservation: u256,
        maxReservesIn5BlocksPercent: u16,
    ) {
        super(liquidityQueue);

        this.floorPrice = floorPrice;
        this.providerId = providerId;
        this.initialLiquidity = initialLiquidity;
        this.receiver = receiver;
        this.antiBotEnabledFor = antiBotEnabledFor;
        this.antiBotMaximumTokensPerReservation = antiBotMaximumTokensPerReservation;
        this.maxReservesIn5BlocksPercent = maxReservesIn5BlocksPercent;
    }

    public override execute(): void {
        Blockchain.log(`in1`);
        this.checkPreConditions();
        Blockchain.log(`in2`);
        this.initializeInitialProvider();
        Blockchain.log(`in3`);
        this.listTokenForSale();
        Blockchain.log(`in4`);
        this.applyAntibotSettingsIfNeeded();
        Blockchain.log(`in5`);
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
        if (Blockchain.validateBitcoinAddress(this.receiver) == false) {
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
        );
    }

    private listTokenForSale(): void {
        const listTokenForSaleOp: ListTokensForSaleOperation = new ListTokensForSaleOperation(
            this.liquidityQueue,
            this.providerId,
            this.initialLiquidity,
            this.receiver,
            false,
            true,
        );

        listTokenForSaleOp.execute();
    }
}
