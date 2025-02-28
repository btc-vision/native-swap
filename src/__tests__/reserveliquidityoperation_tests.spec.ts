import { Blockchain, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders, getProvider } from '../lib/Provider';
import {
    createProvider,
    createProviderId,
    msgSender1,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    receiverAddress1,
    setBlockchainEnvironment,
    TestLiquidityQueue,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import { ReserveLiquidityOperation } from '../lib/Liquidity/operations/ReserveLiquidityOperation';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { CreatePoolOperation } from '../lib/Liquidity/operations/CreatePoolOperation';
import { FeeManager } from '../lib/FeeManager';
import { ListTokensForSaleOperation } from '../lib/Liquidity/operations/ListTokensForSaleOperation';
import { Reservation } from '../lib/Reservation';
import { MAX_RESERVATION_AMOUNT_PROVIDER } from '../data-types/UserLiquidity';

describe('ReserveLiquidityOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
        FeeManager.RESERVATION_BASE_FEE = 0;
    });

    it("should revert if providerId= lq.initialLiquidityProvider => 'You may not reserve your own liquidity'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const provider = createProvider(providerAddress1, tokenAddress1, true, true, false);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.initialLiquidityProvider = provider.providerId;

            const operation = new ReserveLiquidityOperation(
                queue,
                provider.providerId,
                msgSender1,
                u256.fromU32(10000),
                u256.Zero,
                false,
                0,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if activationDelay>3 => 'Activation delay cannot be greater than 3'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.initialLiquidityProvider = providerId1;

            const operation = new ReserveLiquidityOperation(
                queue,
                providerId2,
                msgSender1,
                u256.fromU32(10000),
                u256.Zero,
                false,
                8,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if maximumAmountIn=0 => 'NATIVE_SWAP: Maximum amount in cannot be zero'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.initialLiquidityProvider = providerId1;

            const operation = new ReserveLiquidityOperation(
                queue,
                providerId2,
                msgSender1,
                u256.Zero,
                u256.Zero,
                false,
                0,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if maximumAmountIn< MINIMUM_TRADE_SIZE_IN_SATOSHIS => 'Requested amount is below minimum trade size'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.initialLiquidityProvider = providerId1;

            const operation = new ReserveLiquidityOperation(
                queue,
                providerId2,
                msgSender1,
                u256.fromU32(1000),
                u256.Zero,
                false,
                0,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if p0=0 => 'No pool exists for token'", () => {
        expect(() => {
            setBlockchainEnvironment(100);

            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            queue.initialLiquidityProvider = providerId1;

            const operation = new ReserveLiquidityOperation(
                queue,
                providerId2,
                msgSender1,
                u256.fromU32(10000),
                u256.Zero,
                false,
                0,
            );

            operation.execute();
        }).toThrow();
    });

    it("should revert if totalFee< FeeManager.RESERVATION_BASE_FEE => 'Insufficient fees collected'", () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initialProvider = getProvider(initialProviderId);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            FeeManager.RESERVATION_BASE_FEE = 10000;

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress1, providerAddress1);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const provider1 = getProvider(providerId1);
            const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue2,
                providerId1,
                providerAddress1,
                u256.fromU64(10000),
                u256.Zero,
                false,
                0,
            );

            reserveOp.execute();
        }).toThrow();
    });

    it("should revert if reservation.valid()==true => 'You already have an active reservation'", () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress1, providerAddress1);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue2,
                providerId1,
                providerAddress1,
                u256.fromU64(10000),
                u256.Zero,
                false,
                0,
            );

            reserveOp.execute();
            queue2.save();

            setBlockchainEnvironment(102, providerAddress1, providerAddress1);
            const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp2 = new ReserveLiquidityOperation(
                queue3,
                providerId1,
                providerAddress1,
                u256.fromU64(10000),
                u256.Zero,
                false,
                0,
            );

            reserveOp2.execute();
        }).toThrow();
    });

    it("should revert if user timed out => block.number <= userTimeoutBlockExpiration && lq.timeOutEnabled= true => 'User is timed out'", () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress1, providerAddress1);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue2,
                providerId1,
                providerAddress1,
                u256.fromU64(10000),
                u256.Zero,
                false,
                0,
            );

            reserveOp.execute();
            queue2.save();

            setBlockchainEnvironment(107, providerAddress1, providerAddress1);
            const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true, true);
            const reserveOp2 = new ReserveLiquidityOperation(
                queue3,
                providerId1,
                providerAddress1,
                u256.fromU64(10000),
                u256.Zero,
                false,
                0,
            );

            reserveOp2.execute();
        }).toThrow();
    });

    it("should revert if currentQuote=0 => 'Impossible state: Token is worth infinity'", () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress1, providerAddress1);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            // Force quote = 0
            queue2.virtualTokenReserve = u256.Zero;

            const reserveOp = new ReserveLiquidityOperation(
                queue2,
                providerId1,
                providerAddress1,
                u256.fromU64(10000),
                u256.Zero,
                false,
                0,
            );

            reserveOp.execute();
            queue2.save();
        }).toThrow();
    });

    it("should revert if block.number<= antiBotExpirationBlock && maxIn> maxTokensPerReservation => 'Cannot exceed anti-bot max tokens'", () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                10,
                u256.fromU32(15000),
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress1, providerAddress1);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const reserveOp = new ReserveLiquidityOperation(
                queue2,
                providerId1,
                providerAddress1,
                u256.fromU64(16000),
                u256.Zero,
                false,
                0,
            );

            reserveOp.execute();
        }).toThrow();
    });

    it("should revert if lq.liquidity< lq.reservedLiquidity => 'Impossible: liquidity < reservedLiquidity'", () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                10,
                u256.fromU32(15000),
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress1, providerAddress1);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            // Make reservedliquidity > liquidity
            queue2.updateTotalReserved(SafeMath.add(queue2.liquidity, u256.One), true);

            const reserveOp = new ReserveLiquidityOperation(
                queue2,
                providerId1,
                providerAddress1,
                u256.fromU64(11000),
                u256.Zero,
                false,
                0,
            );

            reserveOp.execute();
        }).toThrow();
    });

    it("should revert if computeTokenRemaining => tokensRemaining=0 => 'Not enough liquidity available'", () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                10,
                u256.fromU32(15000),
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress1, providerAddress1);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new ReserveLiquidityOperation(
                queue2,
                providerId1,
                providerAddress1,
                u256.fromU64(11000),
                u256.Zero,
                false,
                0,
            );

            // Make sure not enough liquidity
            queue2.updateTotalReserved(SafeMath.sub(queue2.liquidity, u256.One), true);

            reserveOp.execute();
        }).toThrow();
    });

    it("should revert if satCostTokenRemaining< MINIMUM_PROVIDER_RESERVATION_AMOUNT => 'Minimum liquidity not met'", () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                10,
                u256.fromU32(15000),
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(101, providerAddress1, providerAddress1);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new ReserveLiquidityOperation(
                queue2,
                providerId1,
                providerAddress1,
                u256.fromU64(11000),
                u256.Zero,
                false,
                0,
            );

            // Make sure Minimum liquidity not met
            queue2.updateTotalReserved(u256.fromString(`49999999000000000000000`), true);

            reserveOp.execute();
        }).toThrow();
    });

    it('should break if tokensToSatoshis(...) < STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT => exit loop', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(102, providerAddress1, providerAddress1);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const providerId1 = createProviderId(providerAddress1, tokenAddress1);
        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId1,
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        setBlockchainEnvironment(103, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId2,
            providerAddress2,
            u256.fromU64(110010),
            u256.Zero,
            false,
            0,
        );

        reserveOp.execute();
        queue3.save();

        // The exact number of tokens to reserve should be 73339999999999999999 but
        // tokensRemainingInSatoshis < LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT is met,
        // so reserved number is 73339999999999999998
        expect(queue3.reservedLiquidity).toStrictEqual(u256.fromString(`73339999999999999998`));
    });

    it('should break when nextprovider is null', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(102, providerAddress1, providerAddress1);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const providerId1 = createProviderId(providerAddress1, tokenAddress1);
        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId1,
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        setBlockchainEnvironment(103, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        // Fake the ip.reserved to max so it won't be used to get liquidity.
        // As ip is the last provider to be checked, if no liquidity is available to be reserved, null will be returned.
        initProvider.reserved = initProvider.liquidity;

        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId2,
            providerAddress2,
            u256.fromU64(20000),
            u256.Zero,
            false,
            0,
        );

        reserveOp.execute();
        queue3.save();

        const reservation = new Reservation(tokenAddress1, providerAddress2);
        const values = reservation.getReservedValues();

        expect(values.length).toStrictEqual(1);
        expect(values[0]).toStrictEqual(u128.fromString(`9999999999999999999`));
    });

    it('should handle normal provider => reserve up to min( providerLiquidity leftover, tokensRemaining, MAX_RESERVATION_AMOUNT_PROVIDER ) => add to reservation', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            MAX_RESERVATION_AMOUNT_PROVIDER,
            receiverAddress1,
            0,
            u256.Zero,
            100,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(102, providerAddress1, providerAddress1);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const providerId1 = createProviderId(providerAddress1, tokenAddress1);
        const provider1 = getProvider(providerId1);
        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId1,
            u128.sub(u128.Max, u128.One),
            receiverAddress1,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        setBlockchainEnvironment(103, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId2,
            providerAddress2,
            u256.fromU128(u128.Max),
            u256.Zero,
            false,
            2,
        );

        reserveOp.execute();
        queue3.save();

        const reservation = new Reservation(tokenAddress1, providerAddress2);
        expect(reservation.getReservedValues()[0]).toStrictEqual(
            u128.fromString(`1329227995784915872903796132074676998`),
        );

        expect(provider1.reserved).toStrictEqual(
            u128.fromString(`1329227995784915872903796132074676998`),
        );
    });

    it("should revert final if tokensReserved< minAmountOut => 'Not enough liquidity reserved...'", () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(msgSender1, tokenAddress1);
            const initProvider = getProvider(initialProviderId);
            const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const floorPrice: u256 = SafeMath.div(
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
                u256.fromU32(1500),
            );
            const initialLiquidity = SafeMath.mul128(
                u128.fromU32(1000000),
                SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
            );

            const createPoolOp = new CreatePoolOperation(
                queue,
                floorPrice,
                initialProviderId,
                initialLiquidity,
                receiverAddress1,
                0,
                u256.Zero,
                5,
            );

            createPoolOp.execute();
            queue.setBlockQuote();
            queue.save();

            setBlockchainEnvironment(102, providerAddress1, providerAddress1);
            const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const providerId1 = createProviderId(providerAddress1, tokenAddress1);
            const listOp = new ListTokensForSaleOperation(
                queue2,
                providerId1,
                u128.fromString(`10000000000000000000`),
                receiverAddress1,
                false,
                false,
            );

            listOp.execute();
            queue2.save();

            setBlockchainEnvironment(103, providerAddress2, providerAddress2);
            const providerId2 = createProviderId(providerAddress2, tokenAddress1);
            const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const reserveOp = new ReserveLiquidityOperation(
                queue3,
                providerId2,
                providerAddress2,
                u256.fromString(`9000000000000000000000000`),
                u256.fromString(`9000000000000000000000000`),
                false,
                0,
            );

            reserveOp.execute();
            queue3.save();
        }).toThrow();
    });

    it('should success scenario => updates totalReserved => sets reservation => calls addActiveReservation => set block quote => emit event', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(102, providerAddress1, providerAddress1);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const providerId1 = createProviderId(providerAddress1, tokenAddress1);
        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId1,
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        setBlockchainEnvironment(103, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId2,
            providerAddress2,
            u256.fromString(`90000000000000000000000`),
            u256.Zero,
            false,
            2,
        );

        reserveOp.execute();
        queue3.save();

        const reservation = new Reservation(tokenAddress1, providerAddress2);
        expect(reservation.getActivationDelay()).toStrictEqual(2);
        expect(reservation.reservedLP).toBeFalsy();
        expect(reservation.expirationBlock()).toStrictEqual(108);
        expect(reservation.getPurgeIndex()).toStrictEqual(0);

        const values = reservation.getReservedValues();
        const indexes = reservation.getReservedIndexes();
        expect(indexes.length).toStrictEqual(2);
        expect(indexes[0]).toStrictEqual(0);
        expect(indexes[1]).toStrictEqual(u32.MAX_VALUE);
        expect(values.length).toStrictEqual(2);
        expect(values[0]).toStrictEqual(u128.fromString(`9999999999999999999`));
        expect(values[1]).toStrictEqual(u128.fromString(`49990499999999999999999`));

        const reservationList = queue3.getReservationListForBlock(103);
        const reservationActiveList = queue3.getActiveReservationListForBlock(103);
        expect(queue3.reservedLiquidity).toStrictEqual(u256.fromString(`50000499999999999999998`));
        expect(reservationList.getLength()).toStrictEqual(1);
        expect(reservationList.get(reservation.getPurgeIndex())).toStrictEqual(
            reservation.reservationId,
        );
        expect(reservationActiveList.get(reservation.getPurgeIndex())).toBeTruthy();
    });

    it('should reset and skip provider when maxCostInSatoshis < LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(102, providerAddress1, providerAddress1);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const providerId1 = createProviderId(providerAddress1, tokenAddress1);
        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId1,
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        setBlockchainEnvironment(103, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = new TestLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const provider1 = getProvider(providerId1);
        provider1.reserved = u128.Zero;
        provider1.liquidity = u128.fromU32(10000);

        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId2,
            providerAddress2,
            u256.fromString(`90000000000000000000000`),
            u256.Zero,
            false,
            2,
        );

        expect(provider1.liquidity).toStrictEqual(u128.fromU32(10000));

        reserveOp.execute();
        queue3.save();

        expect(queue3.getProviderManager().getFromStandardQueue(provider1.indexedAt)).toStrictEqual(
            u256.Zero,
        );
        expect(TransferHelper.safeTransferCalled).toBeTruthy();
        expect(provider1.liquidity).toStrictEqual(u128.Zero);
    });

    it('should allow a provider to reserve his own token', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(102, providerAddress1, providerAddress1);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const providerId1 = createProviderId(providerAddress1, tokenAddress1);

        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId1,
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        setBlockchainEnvironment(103, providerAddress1, providerAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId1,
            providerAddress1,
            u256.fromString(`10000`),
            u256.Zero,
            false,
            2,
        );

        reserveOp.execute();
        queue3.save();
    });

    it('should handle more than 1 reservation in the same block', () => {
        setBlockchainEnvironment(100, msgSender1, msgSender1);
        Blockchain.mockValidateBitcoinAddressResult(true);

        const initialProviderId = createProviderId(msgSender1, tokenAddress1);
        const initProvider = getProvider(initialProviderId);
        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)),
            u256.fromU32(1500),
        );
        const initialLiquidity = SafeMath.mul128(
            u128.fromU32(1000000),
            SafeMath.pow(u256.fromU32(10), u256.fromU32(18)).toU128(),
        );

        const createPoolOp = new CreatePoolOperation(
            queue,
            floorPrice,
            initialProviderId,
            initialLiquidity,
            receiverAddress1,
            0,
            u256.Zero,
            5,
        );

        createPoolOp.execute();
        queue.setBlockQuote();
        queue.save();

        setBlockchainEnvironment(102, providerAddress1, providerAddress1);
        const queue2 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        const providerId1 = createProviderId(providerAddress1, tokenAddress1);

        const listOp = new ListTokensForSaleOperation(
            queue2,
            providerId1,
            u128.fromString(`10000000000000000000`),
            receiverAddress1,
            false,
            false,
        );

        listOp.execute();
        queue2.save();

        setBlockchainEnvironment(103, providerAddress2, providerAddress2);
        const providerId2 = createProviderId(providerAddress2, tokenAddress1);
        const queue3 = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const reserveOp = new ReserveLiquidityOperation(
            queue3,
            providerId2,
            providerAddress2,
            u256.fromString(`10000`),
            u256.Zero,
            false,
            2,
        );

        reserveOp.execute();
        queue3.save();

        setBlockchainEnvironment(103, providerAddress3, providerAddress3);
        const providerId3 = createProviderId(providerAddress3, tokenAddress1);
        const reserveOp2 = new ReserveLiquidityOperation(
            queue3,
            providerId3,
            providerAddress3,
            u256.fromString(`10000`),
            u256.Zero,
            false,
            2,
        );

        reserveOp2.execute();
        queue3.save();

        const reservationList = queue3.getReservationListForBlock(103);
        expect(reservationList.getLength()).toStrictEqual(2);
    });
});
