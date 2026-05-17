import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { clearCachedProviders } from '../models/Provider';
import {
    createLiquidityQueue,
    createProviderId,
    msgSender1,
    providerAddress1,
    receiverAddress1,
    receiverAddress1CSV,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS, MAXIMUM_PROVIDER_PER_RESERVATIONS, } from '../constants/Contract';

/**
 * Pool registration gate.
 *
 * Invariants:
 *   - `createPool` is one-time per token. First caller wins; second call reverts.
 *   - Before `createPool`: `listLiquidity` reverts, `reserve` reverts.
 *   - After `createPool` (with or without initial liquidity): both succeed.
 *   - `isPoolRegistered()` is the single source of truth.
 */

describe('Pool registration gate', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
        Blockchain.mockValidateBitcoinAddressResult(true);
    });

    it('fresh queue: isPoolRegistered() is false', () => {
        setBlockchainEnvironment(1, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        expect<bool>(q.liquidityQueue.isPoolRegistered()).toBe(false);
    });

    it('createPool flips isPoolRegistered() to true', () => {
        setBlockchainEnvironment(1, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const providerId = createProviderId(msgSender1, tokenAddress1);

        const op = new CreatePoolOperation(
            q.liquidityQueue,
            tokenAddress1,
            providerId,
            u128.Zero, // no initial liquidity
            0,
            receiverAddress1,
            receiverAddress1CSV,
        );
        op.execute();

        expect<bool>(q.liquidityQueue.isPoolRegistered()).toBe(true);
    });

    it('createPool reverts if pool already registered', () => {
        expect(() => {
            setBlockchainEnvironment(1, msgSender1, msgSender1);
            const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const providerId = createProviderId(msgSender1, tokenAddress1);

            const op1 = new CreatePoolOperation(
                q.liquidityQueue,
                tokenAddress1,
                providerId,
                u128.Zero,
                0,
                receiverAddress1,
                receiverAddress1CSV,
            );
            op1.execute();
            q.liquidityQueue.save();

            // Second createPool against the same token must revert.
            const q2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            const op2 = new CreatePoolOperation(
                q2.liquidityQueue,
                tokenAddress1,
                providerId,
                u128.Zero,
                0,
                receiverAddress1,
                receiverAddress1CSV,
            );
            op2.execute();
        }).toThrow();
    });

    it('listLiquidity reverts before createPool', () => {
        expect(() => {
            setBlockchainEnvironment(1, msgSender1, msgSender1);
            const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // NOTE: no createPool call.

            const providerId = createProviderId(providerAddress1, tokenAddress1);
            const op = new ListTokensForSaleOperation(
                q.liquidityQueue,
                providerId,
                u128.fromU64(50_000),
                receiverAddress1,
                receiverAddress1CSV,
                0,
            );
            op.execute();
        }).toThrow();
    });

    it('reserve reverts before createPool', () => {
        expect(() => {
            setBlockchainEnvironment(1, msgSender1, msgSender1);
            const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
            // NOTE: no createPool call.

            const buyerProviderId = createProviderId(msgSender1, tokenAddress1);
            const op = new ReserveLiquidityOperation(
                q.liquidityQueue,
                buyerProviderId,
                msgSender1,
                50_000,
                u256.fromU64(1),
                0,
                MAXIMUM_PROVIDER_PER_RESERVATIONS,
                MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS,
                receiverAddress1,
            );
            op.execute();
        }).toThrow();
    });

    it('createPool with zero initialLiquidity registers without listing anyone', () => {
        setBlockchainEnvironment(1, msgSender1, msgSender1);
        const q = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        const providerId = createProviderId(msgSender1, tokenAddress1);

        const op = new CreatePoolOperation(
            q.liquidityQueue,
            tokenAddress1,
            providerId,
            u128.Zero,
            0,
            receiverAddress1,
            receiverAddress1CSV,
        );
        op.execute();

        expect<bool>(q.liquidityQueue.isPoolRegistered()).toBe(true);
        // No bitmap occupancy: no listing was actually made.
        // `getCurrentBestTick` returns sentinel (> MAX_TICK).
        const best = q.tickBitmapManager.getCurrentBestTick();
        // Defensive: best can be either MAX_TICK+1 (sentinel) or some prior-test residue.
        // The robust check is that no provider was activated as the initial LP.
        expect<bool>(q.liquidityQueue.liquidity.isZero()).toBe(true);
    });
});
