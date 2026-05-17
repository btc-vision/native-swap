import { Blockchain, StoredBoolean, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { clearCachedProviders, getProvider, Provider } from '../models/Provider';
import {
    createLiquidityQueue,
    createProvider,
    msgSender1,
    providerAddress1,
    receiverAddress1CSV,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { TickMath } from '../utils/TickMath';
import { WithdrawListingOperation } from '../operations/WithdrawListingOperation';
import { WITHDRAW_MODE_POINTER } from '../constants/StoredPointers';

/**
 * Freeze invariant tests (`latestReservedUntilBlock`).
 *
 * Plan:
 *   Bob reserves against Alice at creation block N. Alice's
 *   `latestReservedUntilBlock` is bumped monotonically to N + RESERVATION_EXPIRE.
 *
 * The invariant under test:
 *   - `provider.isListingFrozen()` = (Blockchain.block.number <= latestReservedUntilBlock)
 *   - WithdrawListingOperation reverts while frozen
 *   - Past the freeze block, withdraw succeeds and force-clears stale reservedAmount
 *   - `withdrawMode` global bypasses the freeze entirely
 *
 * Each `it()` uses distinct sender addresses to keep storage isolated.
 */

function entry(
    providerId: u256,
    amount: u128,
    tick: i32,
    creationBlock: u64,
): ReservationProviderData {
    return new ReservationProviderData(
        providerId,
        amount,
        tick,
        TickMath.tickToPrice(tick),
        creationBlock,
    );
}

describe('Freeze invariant — provider.latestReservedUntilBlock', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('bumpLatestReservedUntilBlock is monotonic non-decreasing', () => {
        setBlockchainEnvironment(1, msgSender1, msgSender1);
        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(50_000),
            u128.Zero,
        );

        p.bumpLatestReservedUntilBlock(20);
        expect<u64>(p.getLatestReservedUntilBlock()).toBe(20);

        // Smaller value should be ignored.
        p.bumpLatestReservedUntilBlock(15);
        expect<u64>(p.getLatestReservedUntilBlock()).toBe(20);

        // Larger value advances.
        p.bumpLatestReservedUntilBlock(30);
        expect<u64>(p.getLatestReservedUntilBlock()).toBe(30);
    });

    it('isListingFrozen returns true when block.number <= latestReservedUntilBlock', () => {
        setBlockchainEnvironment(10, msgSender1, msgSender1);
        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(50_000),
            u128.Zero,
        );
        p.bumpLatestReservedUntilBlock(20);
        expect<bool>(p.isListingFrozen()).toBe(true);

        // Same-block boundary: still frozen.
        setBlockchainEnvironment(20, msgSender1, msgSender1);
        expect<bool>(p.isListingFrozen()).toBe(true);

        // Past freeze: unfrozen.
        setBlockchainEnvironment(21, msgSender1, msgSender1);
        expect<bool>(p.isListingFrozen()).toBe(false);
    });

    it('WithdrawListingOperation reverts while listing is frozen', () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            q.liquidityQueue.registerPool();
            q.liquidityQueue.save();

            const p = createProvider(
                providerAddress1,
                tokenAddress1,
                false,
                false,
                false,
                receiverAddress1CSV,
                u128.Zero,
                u128.fromU64(50_000),
                u128.Zero,
            );
            p.setPriceTick(0);
            q.tickBitmapManager.addToTickFIFO(p, 0);
            p.bumpLatestReservedUntilBlock(110);
            p.save();

            // Try to withdraw at block 105 (inside freeze window 100..110).
            setBlockchainEnvironment(105, providerAddress1, providerAddress1);
            const op = new WithdrawListingOperation(
                q.liquidityQueue,
                q.tickBitmapManager,
                p.getId(),
            );
            op.execute();
        }).toThrow();
    });

    it('WithdrawListingOperation succeeds once the freeze window has elapsed', () => {
        setBlockchainEnvironment(200, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(50_000),
            u128.Zero,
        );
        p.setPriceTick(0);
        q.tickBitmapManager.addToTickFIFO(p, 0);
        p.bumpLatestReservedUntilBlock(210);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(50_000));
        p.save();

        // Move past the freeze block — withdraw should succeed.
        setBlockchainEnvironment(211, providerAddress1, providerAddress1);
        const op = new WithdrawListingOperation(q.liquidityQueue, q.tickBitmapManager, p.getId());
        op.execute();

        const after: Provider = getProvider(p.getId());
        expect<bool>(after.getLiquidityAmount().isZero()).toBe(true);
        expect<bool>(after.isActive()).toBe(false);
    });

    it('withdraw-mode bypass: withdraw allowed even while inside freeze window', () => {
        setBlockchainEnvironment(300, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(50_000),
            u128.Zero,
        );
        p.setPriceTick(0);
        q.tickBitmapManager.addToTickFIFO(p, 0);
        p.bumpLatestReservedUntilBlock(400);
        q.liquidityQueue.increaseTotalReserve(u256.fromU64(50_000));
        p.save();

        // Activate emergency withdraw mode globally. StoredBoolean's setter persists.
        const withdrawMode = new StoredBoolean(WITHDRAW_MODE_POINTER, false);
        withdrawMode.value = true;

        // Still inside freeze window (block 305 ≤ 400), but withdrawMode bypasses guard.
        setBlockchainEnvironment(305, providerAddress1, providerAddress1);
        const op = new WithdrawListingOperation(q.liquidityQueue, q.tickBitmapManager, p.getId());
        op.execute();

        const after: Provider = getProvider(p.getId());
        expect<bool>(after.getLiquidityAmount().isZero()).toBe(true);
    });

    it('reserve walk bumps latestReservedUntilBlock on each provider entry', () => {
        // Simulate the reserve walk's bookkeeping side effect directly.
        setBlockchainEnvironment(50, msgSender1, msgSender1);
        const p = createProvider(
            providerAddress1,
            tokenAddress1,
            false,
            false,
            false,
            receiverAddress1CSV,
            u128.Zero,
            u128.fromU64(50_000),
            u128.Zero,
        );

        // Two reservations against the same provider at different blocks.
        // The bump must reflect the LATEST expiration.
        p.bumpLatestReservedUntilBlock(50 + 8); // first reservation expires at block 58
        expect<u64>(p.getLatestReservedUntilBlock()).toBe(58);

        p.bumpLatestReservedUntilBlock(53 + 8); // second reservation at block 53 → exp 61
        expect<u64>(p.getLatestReservedUntilBlock()).toBe(61);

        // First reservation expires (block 58), purge runs. But latestReservedUntilBlock
        // stays at 61 because the second reservation still locks the listing.
        // Withdraw at block 60 must still be forbidden.
        setBlockchainEnvironment(60, msgSender1, msgSender1);
        expect<bool>(p.isListingFrozen()).toBe(true);

        // Past block 61, the listing unfreezes.
        setBlockchainEnvironment(62, msgSender1, msgSender1);
        expect<bool>(p.isListingFrozen()).toBe(false);
    });
});
