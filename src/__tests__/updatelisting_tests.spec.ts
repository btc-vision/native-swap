import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
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
import { UpdateListingOperation } from '../operations/UpdateListingOperation';
import { MAX_TICK, MIN_TICK } from '../constants/Contract';

/**
 * UpdateListingOperation — atomic move-tick semantics.
 *
 * Invariants:
 *   - Provider not active → revert
 *   - Listing frozen (block ≤ latestReservedUntilBlock) → revert
 *   - newPriceTick outside [MIN_TICK, MAX_TICK] → revert
 *   - newPriceTick == oldPriceTick → no-op (no state change, no event)
 *   - Otherwise: removeFromPurgeQueue (if purged) → removeFromTickQueue (tombstone old)
 *     → setPriceTick(new) → addToTickFIFO(new) → emit ListingUpdatedEvent
 *   - `liquidityAmount` is preserved across the move
 *   - `latestReservedUntilBlock` is preserved across the move
 */

describe('UpdateListingOperation — atomic move-tick', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('reverts when provider has no active listing', () => {
        expect(() => {
            setBlockchainEnvironment(1, msgSender1, msgSender1);
            const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            q.liquidityQueue.registerPool();
            q.liquidityQueue.save();

            const p = createProvider(
                providerAddress1, tokenAddress1, false, false, false,
                receiverAddress1CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
            );
            p.deactivate(); // no active listing

            const op = new UpdateListingOperation(
                q.liquidityQueue,
                q.tickBitmapManager,
                p.getId(),
                100,
            );
            op.execute();
        }).toThrow();
    });

    it('reverts when listing is frozen', () => {
        expect(() => {
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            q.liquidityQueue.registerPool();
            q.liquidityQueue.save();

            const p = createProvider(
                providerAddress1, tokenAddress1, false, false, false,
                receiverAddress1CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
            );
            p.setPriceTick(0);
            q.tickBitmapManager.addToTickFIFO(p, 0);
            p.bumpLatestReservedUntilBlock(110); // frozen until 110

            const op = new UpdateListingOperation(
                q.liquidityQueue,
                q.tickBitmapManager,
                p.getId(),
                250,
            );
            op.execute();
        }).toThrow();
    });

    it('reverts when newPriceTick > MAX_TICK', () => {
        expect(() => {
            setBlockchainEnvironment(1, msgSender1, msgSender1);
            const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            q.liquidityQueue.registerPool();
            q.liquidityQueue.save();

            const p = createProvider(
                providerAddress1, tokenAddress1, false, false, false,
                receiverAddress1CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
            );
            p.setPriceTick(0);
            q.tickBitmapManager.addToTickFIFO(p, 0);

            const op = new UpdateListingOperation(
                q.liquidityQueue,
                q.tickBitmapManager,
                p.getId(),
                MAX_TICK + 1,
            );
            op.execute();
        }).toThrow();
    });

    it('reverts when newPriceTick < MIN_TICK', () => {
        expect(() => {
            setBlockchainEnvironment(1, msgSender1, msgSender1);
            const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            q.liquidityQueue.registerPool();
            q.liquidityQueue.save();

            const p = createProvider(
                providerAddress1, tokenAddress1, false, false, false,
                receiverAddress1CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
            );
            p.setPriceTick(0);
            q.tickBitmapManager.addToTickFIFO(p, 0);

            const op = new UpdateListingOperation(
                q.liquidityQueue,
                q.tickBitmapManager,
                p.getId(),
                MIN_TICK - 1,
            );
            op.execute();
        }).toThrow();
    });

    it('same-tick no-op: no state change, FIFO position preserved', () => {
        setBlockchainEnvironment(1, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const p = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        p.setPriceTick(500);
        q.tickBitmapManager.addToTickFIFO(p, 500);
        const idxBefore: u32 = p.getTickFifoIndex();

        const op = new UpdateListingOperation(
            q.liquidityQueue,
            q.tickBitmapManager,
            p.getId(),
            500, // same tick
        );
        op.execute();

        expect<i32>(p.getPriceTick()).toBe(500);
        expect<u32>(p.getTickFifoIndex()).toBe(idxBefore);
    });

    it('move from old tick to new tick: bitmap bit moves, liquidity preserved', () => {
        setBlockchainEnvironment(1, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const p = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        const oldTick: i32 = 100;
        const newTick: i32 = -250;
        p.setPriceTick(oldTick);
        q.tickBitmapManager.addToTickFIFO(p, oldTick);

        expect<i32>(q.tickBitmapManager.getCurrentBestTick()).toBe(oldTick);

        const op = new UpdateListingOperation(
            q.liquidityQueue,
            q.tickBitmapManager,
            p.getId(),
            newTick,
        );
        op.execute();

        const after: Provider = getProvider(p.getId());
        // Provider's priceTick has moved.
        expect<i32>(after.getPriceTick()).toBe(newTick);
        // Liquidity preserved across the move.
        expect<bool>(u128.eq(after.getLiquidityAmount(), u128.fromU64(50_000))).toBe(true);
        // Cheapest occupied tick is now the new (cheaper) tick.
        expect<i32>(q.tickBitmapManager.getCurrentBestTick()).toBe(newTick);
    });

    it('latestReservedUntilBlock survives the move', () => {
        setBlockchainEnvironment(200, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        q.liquidityQueue.registerPool();
        q.liquidityQueue.save();

        const p = createProvider(
            providerAddress1, tokenAddress1, false, false, false,
            receiverAddress1CSV, u128.Zero, u128.fromU64(50_000), u128.Zero,
        );
        p.setPriceTick(0);
        q.tickBitmapManager.addToTickFIFO(p, 0);
        p.bumpLatestReservedUntilBlock(150); // expired (block 200 > 150) so move allowed

        const op = new UpdateListingOperation(
            q.liquidityQueue,
            q.tickBitmapManager,
            p.getId(),
            300,
        );
        op.execute();

        const after: Provider = getProvider(p.getId());
        // The freeze marker stays — it doesn't get reset by update.
        expect<u64>(after.getLatestReservedUntilBlock()).toBe(150);
        expect<i32>(after.getPriceTick()).toBe(300);
    });
});
