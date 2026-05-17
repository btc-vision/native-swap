import { clearCachedProviders, getProvider } from '../models/Provider';
import { Blockchain, BytesWriter } from '@btc-vision/btc-runtime/runtime';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import {
    createLiquidityQueue,
    createProviderId,
    providerAddress1,
    receiverAddress1,
    receiverAddress1CSV,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

describe('CreatePoolOperation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    describe('CreatePoolOperation pre conditions', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });

        it('should revert if receiver address is invalid', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(false);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    tokenAddress1,
                    u256.fromU64(100),
                    u128.fromU64(100),
                    0, // initialTick (was floorPrice=u256.fromU64(100))
                    receiverAddress1,
                    'wjdhwe9dy9w08h29w',
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if floorPrice=0', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    tokenAddress1,
                    u256.fromU64(100),
                    u128.fromU64(100),
                    0, // initialTick (was floorPrice=u256.Zero)
                    receiverAddress1,
                    receiverAddress1CSV,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if initialLiquidity=0', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    tokenAddress1,
                    u256.fromU64(100),
                    u128.Zero,
                    0, // initialTick (was floorPrice=u256.fromU64(100))
                    receiverAddress1,
                    receiverAddress1CSV,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if antibot settings not valid', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    tokenAddress1,
                    u256.fromU64(100),
                    u128.fromU64(100),
                    0, // initialTick (was floorPrice=u256.fromU64(100))
                    receiverAddress1,
                    receiverAddress1CSV,
                );

                operation.execute();
            }).toThrow();
        });

        it('should revert if initial liquidity provider is already set', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    tokenAddress1,
                    u256.fromU64(100),
                    u128.fromU64(100),
                    0, // initialTick (was floorPrice=u256.fromU64(100))
                    receiverAddress1,
                    receiverAddress1CSV,
                );

                operation.execute();
                queue.liquidityQueue.save();

                const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation2 = new CreatePoolOperation(
                    queue2.liquidityQueue,
                    tokenAddress1,
                    u256.fromU64(100),
                    u128.fromU64(100),
                    0, // initialTick (was floorPrice=u256.fromU64(100))
                    receiverAddress1,
                    receiverAddress1CSV,
                );

                operation2.execute();
            }).toThrow();
        });

        it('should revert if maximum reservation percentage for 5 blocks is invalid', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            expect(() => {
                const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

                const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    tokenAddress1,
                    u256.fromU64(100),
                    u128.fromU64(100000),
                    0, // initialTick (was floorPrice=u256.fromU64(100))
                    receiverAddress1,
                    receiverAddress1CSV,
                );

                operation.execute();
            }).toThrow();
        });

    });

    describe('CreatePoolOperation execute', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
        });
        it('should call correctly initialize the pool', () => {
            setBlockchainEnvironment(100);
            Blockchain.mockValidateBitcoinAddressResult(true);

            const initialProviderId = createProviderId(providerAddress1, tokenAddress1);

            const queue = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

            const operation = new CreatePoolOperation(
                    queue.liquidityQueue,
                    tokenAddress1,
                    initialProviderId,
                    u128.fromU64(1000000),
                    0, // initialTick (was floorPrice=u256.fromU64(100))
                    receiverAddress1,
                    receiverAddress1CSV,
                );

            operation.execute();
            queue.liquidityQueue.save();

            // Reload queue and test
            const queue2 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            const provider = getProvider(initialProviderId);

            // initialLiquidityProviderId removed in refactor (no privileged initial-LP slot).
            // Virtual reserves, antibot, maxTokensPerReservation, maxReserves5BlockPercent
            // all gone — see plan. We assert only what the new arch still exposes.
            expect(queue2.liquidityQueue.liquidity).toStrictEqual(u256.fromU64(1000000));
            expect<bool>(queue2.liquidityQueue.isPoolRegistered()).toBe(true);
            expect(provider.getLiquidityAmount()).toStrictEqual(u128.fromU64(1000000));
            expect(provider.getReservedAmount()).toStrictEqual(u128.Zero);
            expect(provider.getBtcReceiver()).toStrictEqual(receiverAddress1CSV);
            expect(provider.isActive()).toBeTruthy();
        });

        // Antibot tests removed — antibot/cap concept was AMM-era and is gone in the refactor.
        // The 0.3% swap fee + per-tick pricing are the new spam-resistance mechanism.
    });
});
