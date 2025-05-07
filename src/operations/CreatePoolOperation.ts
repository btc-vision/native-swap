import { BaseOperation } from './BaseOperation';
import { u128, u256 } from '@btc-vision/as-bignum';
import { Address, Blockchain, Revert } from '@btc-vision/btc-runtime/runtime';
import { ListTokensForSaleOperation } from './ListTokensForSaleOperation';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';

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
        private readonly stakingAddress: Address,
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

    public execute(): void {
        this.checkPreConditions();
        this.initializeLiquidity();
        this.listTokenForSale();
        this.applyAntibotSettingsIfNeeded();
    }

    private checkPreConditions(): void {
        this.ensureReceiverAddressValid();
        this.ensureFloorPriceNotZero();
        this.ensureInitialLiquidityNotZero();
        this.ensureAntibotSettingsValid();
        this.ensureInitialLiquidityProviderNotAlreadySet();
        this.ensureMaxReservesIn5BlocksPercentValid();
    }

    private initializeLiquidity(): void {
        this.liquidityQueue.initializeInitialLiquidity(
            this.floorPrice,
            this.providerId,
            this.initialLiquidity,
            this.maxReservesIn5BlocksPercent,
        );
    }

    private listTokenForSale(): void {
        const listTokenForSaleOp = new ListTokensForSaleOperation(
            this.liquidityQueue,
            this.providerId,
            this.initialLiquidity,
            this.receiver,
            this.stakingAddress,
            false,
            true,
        );

        listTokenForSaleOp.execute();
    }

    private applyAntibotSettingsIfNeeded(): void {
        if (this.antiBotEnabledFor > 0) {
            this.liquidityQueue.antiBotExpirationBlock =
                Blockchain.block.number + u64(this.antiBotEnabledFor);
            this.liquidityQueue.maxTokensPerReservation = this.antiBotMaximumTokensPerReservation;
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
            throw new Revert('NATIVE_SWAP: Invalid receiver address');
        }
    }

    private ensureFloorPriceNotZero(): void {
        if (this.floorPrice.isZero()) {
            throw new Revert('NATIVE_SWAP: Floor price cannot be zero');
        }
    }

    private ensureInitialLiquidityNotZero(): void {
        if (this.initialLiquidity.isZero()) {
            throw new Revert('NATIVE_SWAP: Initial liquidity cannot be zero');
        }
    }

    private ensureAntibotSettingsValid(): void {
        if (this.antiBotEnabledFor !== 0 && this.antiBotMaximumTokensPerReservation.isZero()) {
            throw new Revert('NATIVE_SWAP: Anti-bot max tokens per reservation cannot be zero');
        }
    }

    private ensureInitialLiquidityProviderNotAlreadySet(): void {
        if (!this.liquidityQueue.initialLiquidityProviderId.isZero()) {
            throw new Revert('Base quote already set');
        }
    }
}
