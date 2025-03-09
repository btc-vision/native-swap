import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Address, Blockchain, Revert } from '@btc-vision/btc-runtime/runtime';
import { ListTokensForSaleOperation } from './ListTokensForSaleOperation';

export class CreatePoolOperation extends BaseOperation {
    private readonly floorPrice: u256;
    private readonly providerId: u256;
    private readonly initialLiquidity: u128;
    private readonly receiver: string;
    private readonly antiBotEnabledFor: u16;
    private readonly antiBotMaximumTokensPerReservation: u256;
    private readonly maxReservesIn5BlocksPercent: u16;

    constructor(
        liquidityQueue: LiquidityQueue,
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
        this.ensureValidReceiverAddress(this.receiver);
        this.ensureFloorPriceNotZero(this.floorPrice);
        this.ensureInitialLiquidityNotZero(this.initialLiquidity);
        this.ensureAntibotSettingsValid(
            this.antiBotEnabledFor,
            this.antiBotMaximumTokensPerReservation,
        );
        this.ensureBaseQuoteNotAlreadySet(this.liquidityQueue.p0);

        this.liquidityQueue.initializeInitialLiquidity(
            this.floorPrice,
            this.providerId,
            this.initialLiquidity.toU256(),
            this.maxReservesIn5BlocksPercent,
        );

        // Instead of calling "listLiquidity", we do a direct "listTokensForSale"
        // if we want these tokens to be 'initially queued' for purchase
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

        if (this.antiBotEnabledFor > 0) {
            this.liquidityQueue.antiBotExpirationBlock =
                Blockchain.block.number + u64(this.antiBotEnabledFor);
            this.liquidityQueue.maxTokensPerReservation = this.antiBotMaximumTokensPerReservation;
        }
    }

    private ensureValidReceiverAddress(receiver: string): void {
        if (Blockchain.validateBitcoinAddress(receiver) == false) {
            throw new Revert('NATIVE_SWAP: Invalid receiver address');
        }
    }

    private ensureFloorPriceNotZero(floorPrice: u256): void {
        if (floorPrice.isZero()) {
            throw new Revert('NATIVE_SWAP: Floor price cannot be zero');
        }
    }

    private ensureInitialLiquidityNotZero(initialLiquidity: u128): void {
        if (initialLiquidity.isZero()) {
            throw new Revert('NATIVE_SWAP: Initial liquidity cannot be zero');
        }
    }

    private ensureAntibotSettingsValid(
        antiBotEnabledFor: u16,
        antiBotMaximumTokensPerReservation: u256,
    ): void {
        if (antiBotEnabledFor !== 0 && antiBotMaximumTokensPerReservation.isZero()) {
            throw new Revert('NATIVE_SWAP: Anti-bot max tokens per reservation cannot be zero');
        }
    }

    private ensureBaseQuoteNotAlreadySet(p0: u256): void {
        if (!p0.isZero()) {
            throw new Revert('Base quote already set');
        }
    }
}
