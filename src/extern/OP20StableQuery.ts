import { Address, Blockchain, BytesWriter, encodeSelector, Revert, Selector, } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

/**
 * OP-20S: Stable Token Extension Standard
 *
 * Stablecoins must implement this interface to be used with NativeSwap stable pools.
 *
 * Required methods:
 *   pegRate(): u256      - Target price in satoshis per token, scaled by 1e8
 *   pegAuthority(): Address - Address authorized to update peg rate
 *   pegUpdatedAt(): u64  - Block number of last peg update
 *
 * The stablecoin issuer is responsible for:
 * 1. Keeping pegRate() updated via their own oracle/multisig
 * 2. Maintaining actual peg through collateral/mint/burn mechanisms
 *
 * NativeSwap only reads from this interface, never writes.
 *
 * Example pegRate values (assuming BTC = $100,000):
 *   1 USD = $1 = 1000 sats -> pegRate = 1000 * 1e8 = 100_000_000_000
 *   1 EUR  = $1.10 = 1100 sats -> pegRate = 1100 * 1e8 = 110_000_000_000
 */

const PEG_RATE_SELECTOR: Selector = encodeSelector('pegRate()');
const PEG_AUTHORITY_SELECTOR: Selector = encodeSelector('pegAuthority()');
const PEG_UPDATED_AT_SELECTOR: Selector = encodeSelector('pegUpdatedAt()');

export class OP20StableQuery {
    /**
     * Get the peg rate from a stable token.
     * Reverts if the token doesn't implement pegRate() or returns zero.
     *
     * @param token - The stable token address
     * @returns The peg rate scaled by 1e8
     */
    public static getPegRate(token: Address): u256 {
        const calldata = new BytesWriter(4);
        calldata.writeSelector(PEG_RATE_SELECTOR);

        const pegRate = Blockchain.call(token, calldata).data.readU256();

        if (pegRate.isZero()) {
            throw new Revert('OP20S: Token returned zero peg rate');
        }

        return pegRate;
    }

    /**
     * Get the peg authority address.
     * Reverts if the token doesn't implement pegAuthority().
     */
    public static getPegAuthority(token: Address): Address {
        const calldata = new BytesWriter(4);
        calldata.writeSelector(PEG_AUTHORITY_SELECTOR);

        const response = Blockchain.call(token, calldata);
        return response.data.readAddress();
    }

    /**
     * Get the block number when peg was last updated.
     * Reverts if the token doesn't implement pegUpdatedAt().
     */
    public static getPegUpdatedAt(token: Address): u64 {
        const calldata = new BytesWriter(4);
        calldata.writeSelector(PEG_UPDATED_AT_SELECTOR);

        const response = Blockchain.call(token, calldata);
        return response.data.readU64();
    }

    /**
     * Validate that peg data is not stale.
     *
     * @param token - The stable token address
     * @param maxStalenessBlocks - Maximum blocks since last update (0 = no check)
     * @param currentBlock - Current block number
     */
    public static validatePegFreshness(
        token: Address,
        maxStalenessBlocks: u64,
        currentBlock: u64,
    ): void {
        if (maxStalenessBlocks === 0) {
            return;
        }

        const updatedAt = OP20StableQuery.getPegUpdatedAt(token);

        if (updatedAt === 0) {
            throw new Revert('OP20S: Peg has never been updated');
        }

        const staleness = currentBlock - updatedAt;
        if (staleness > maxStalenessBlocks) {
            throw new Revert(
                `OP20S: Peg data stale. Last update: ${updatedAt}, current: ${currentBlock}, max staleness: ${maxStalenessBlocks}`,
            );
        }
    }
}
