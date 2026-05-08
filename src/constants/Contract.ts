import { u128, u256 } from '@btc-vision/as-bignum/assembly';

// ============================================================================
// Generic / non-tick constants
// ============================================================================

export const INITIAL_FEE_COLLECT_ADDRESS: string =
    'bc1qwlfqavw7lc79kj86ydkx4d275v4chqy7ne4nylzsjk4zpl2xpp2stnmscm';

export const RESERVATION_EXPIRE_AFTER_IN_BLOCKS: u64 = 8;
export const TIMEOUT_AFTER_EXPIRATION_BLOCKS: u8 = 2;
export const MAX_TOTAL_SATOSHIS: u256 = u256.fromU64(21_000_000 * 100_000_000);
export const MAX_ACTIVATION_DELAY: u8 = 3;

export const MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING: u8 = 120;
export const MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS: u8 = 50;

// By design, Array does not contain more than U32.MAX_VALUE - 1 elements.
// And max index is U32.MAX_VALUE - 2.
export const INDEX_NOT_SET_VALUE: u32 = U32.MAX_VALUE;
export const MAXIMUM_VALID_INDEX: u32 = u32.MAX_VALUE - 2;
export const BLOCK_NOT_SET_VALUE: u64 = U64.MAX_VALUE;

export const EMIT_PURGE_EVENTS: boolean = true;
export const EMIT_PROVIDERCONSUMED_EVENTS: boolean = true;
export const CSV_BLOCKS_REQUIRED: i32 = 1;

// 250 input UTXO limit per Bitcoin tx, 10 margin → 150 providers per reservation.
export const MAXIMUM_PROVIDER_PER_RESERVATIONS: u8 = 150;
export const AT_LEAST_PROVIDERS_TO_PURGE: u32 = 100;

export const ENABLE_INDEX_VERIFICATION: boolean = false;
export const MAXIMUM_NUMBER_OF_PROVIDERS: u32 = u32.MAX_VALUE - 1000;

export let currentProviderResetCount: u8 = 0;

// ============================================================================
// Minimum-value enforcement — NON-NEGOTIABLE, ENFORCED EVERYWHERE
// ============================================================================

/**
 * Minimum sat-equivalent value of any reservation against any provider.
 * Enforced at: ReserveLiquidityOperation walk (`meetsMinimumReservationAmountAtTick`).
 * A provider whose remaining availableLiquidity sat-value falls below this is treated
 * as dust → moved to fulfilled queue or reset.
 */
export const STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT: u64 = 1_000;

/**
 * Same value as STRICT in this revision. Used for the "snap up remaining dust into
 * the same reservation" optimization (see ReserveLiquidityOperation).
 */
export const MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT: u64 = 1_000;

/**
 * Minimum sat-equivalent value of a listing.
 * Enforced at: createPool (when initialLiquidity > 0) AND listLiquidity (first-list AND top-up).
 * Computed via: sats = (liquidityAmount * tickToPrice(tick)) >> 88
 * Listings worth less than this MUST revert.
 */
export const MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT: u64 = 20_000;

/**
 * Minimum buyer-side maxAmountInSats. Stops spam reservations with tiny budgets.
 */
export const MINIMUM_TRADE_SIZE_IN_SAT: u64 = 10_000;

// ============================================================================
// Fees
// ============================================================================

/**
 * Flat 0.3% swap fee. Always on, hardcoded. No governance toggle.
 * Deducted from `totalTokensPurchased` at swap settlement, sent to staking contract.
 */
export const SWAP_FEE_BPS: u64 = 30;
export const SWAP_FEE_DENOM: u64 = 10_000;

// ============================================================================
// Tick math (Q40.88 in u128 storage; computation in u256)
// ============================================================================

/**
 * Q40.88 fixed-point: 40 integer bits + 88 fractional bits. Stored value = realPrice * 2^88.
 * See `src/utils/TickMath.ts` for the rationale and computation.
 */
export const FP_SHIFT: u32 = 88;

/**
 * Distinguishability floor: at MIN_TICK, adjacent ticks differ by exactly 1 LSB
 * (1.001^-54116 * 0.001 ≈ 2^-88).
 */
export const MIN_TICK: i32 = -54_116;

/**
 * Q40.88 integer overflow at 2^40 sats per base unit ≈ 10,987 BTC per base unit.
 * 1.001^27739 < 2^40.
 */
export const MAX_TICK: i32 = 27_739;

/** unsigned bitmap index = tick + TICK_OFFSET; range [0, 81855]. */
export const TICK_OFFSET: i32 = 54_116;

/** ceil((54_116 + 27_739 + 1) / 256) = 320. */
export const BITMAP_WORD_COUNT: u32 = 320;

/**
 * `ratioAtBit(k)` = floor(1.001^(2^k) * 2^88) — Q40.88 representation of 1.001^(2^k).
 *
 * Returns u256 because [15] = 1.001^32768 * 2^88 ≈ 5.18e40 exceeds u128 max ≈ 3.4e38.
 * Lower entries fit u128 but returned uniformly as u256 for the multiplication path.
 *
 * Values script-verified to floor-rounded integer at 100-digit Decimal precision.
 *
 * (Implemented as a function rather than a top-level array because some AssemblyScript
 * transforms choke on static arrays of class instances.)
 */
export function ratioAtBit(k: u32): u256 {
    if (k == 0) return u256.fromString('309794494831166413793505837'); // 1.001^1
    if (k == 1) return u256.fromString('310104289325997580207299342'); // 1.001^2
    if (k == 2) return u256.fromString('310724808008938901365294148'); // 1.001^4
    if (k == 3) return u256.fromString('311969572833032667447928061'); // 1.001^8
    if (k == 4) return u256.fromString('314474082055887681484064449'); // 1.001^16
    if (k == 5) return u256.fromString('319543580937833516248908381'); // 1.001^32
    if (k == 6) return u256.fromString('329929065635577031271019004'); // 1.001^64
    if (k == 7) return u256.fromString('351723621166666702522381516'); // 1.001^128
    if (k == 8) return u256.fromString('399726971454953724138424905'); // 1.001^256
    if (k == 9) return u256.fromString('516282361464892206582623493'); // 1.001^512
    if (k == 10) return u256.fromString('861261348049245422942514486'); // 1.001^1024
    if (k == 11) return u256.fromString('2396791722066933461759285464'); // 1.001^2048
    if (k == 12) return u256.fromString('18561837816586788089049840203'); // 1.001^4096
    if (k == 13) return u256.fromString('1113274673071123511755594004565'); // 1.001^8192
    if (k == 14) return u256.fromString('4004654372168358620116828513550884'); // 1.001^16384
    if (k == 15) return u256.fromString('51819170982739684170545163151439426777124'); // 1.001^32768 (u256-only)
    return u256.Zero; // unreachable for valid bit indices
}
