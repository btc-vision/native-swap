import { clearCachedProviders } from '../lib/Provider';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { CreatePoolOperation } from '../lib/Liquidity/operations/CreatePoolOperation';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import { tokenAddress1, tokenIdUint8Array1 } from './test_helper';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

describe('AdvancedStoredString', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should revert if receiver address is invalid', () => {
        Blockchain.mockValidateBitcoinAddressResult(false);

        const queue = new LiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

        const operation = new CreatePoolOperation(
            queue,
            u256.fromU64(100),
            u256.fromU64(100),
            u128.fromU64(100),
            'd9dhdh92hd923hd',
            10,
            u256.Zero,
            5,
        );

        operation.execute();
    });

    it('should revert if floorPrice=0', () => {});

    it('should revert if initialLiquidity=0', () => {});

    it('should revert if antiBotEnabledFor !=0 but antiBotMaximumTokensPerReservation=0', () => {});

    it("should revert if p0 !=0 => 'Base quote already set'", () => {});

    it('should call initializeInitialLiquidity and listTokensForSaleOp.execute on success', () => {});

    it('should set antiBot fields if antiBotEnabledFor>0', () => {});

    it('should not set antiBot fields if antiBotEnabledFor=0', () => {});
});
