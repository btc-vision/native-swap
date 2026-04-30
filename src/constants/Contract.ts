import { u128, u256 } from '@btc-vision/as-bignum/assembly';

export const INITIAL_FEE_COLLECT_ADDRESS: string =
    'bcrt1pe0slk2klsxckhf90hvu8g0688rxt9qts6thuxk3u4ymxeejw53gs0xjlhn'; //'bc1qwlfqavw7lc79kj86ydkx4d275v4chqy7ne4nylzsjk4zpl2xpp2stnmscm';

// opt1qdn74lndmxp9f2m7tgfw8lmh939yeefym4qa7qatc3eaqs8jdlx9srz7kar;
// tb1p823gdnqvk8a90f8cu30w8ywvk29uh8txtqqnsmk6f5ktd7hlyl0q3cyz4c
// bcrt1plz0svv3wl05qrrv0dx8hvh5mgqc7jf3mhqgtw8jnj3l3d3cs6lzsfc3mxh

export const ENABLE_FEES: bool = true;
export const QUOTE_SCALE: u256 = u256.fromU64(100_000_000);
export const RESERVATION_EXPIRE_AFTER_IN_BLOCKS: u64 = 8;
export const VOLATILITY_WINDOW_IN_BLOCKS: u32 = 8;
export const STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT: u64 = 600;
export const MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT: u64 = 1000;
export const MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT: u64 = 10_000;
export const MINIMUM_TRADE_SIZE_IN_SAT: u64 = 10_000;
export const PERCENT_TOKENS_FOR_PRIORITY_QUEUE_TAX: u128 = u128.fromU32(30);
export const PERCENT_TOKENS_FOR_PRIORITY_FACTOR_TAX: u128 = u128.fromU32(1000);
export const TIMEOUT_AFTER_EXPIRATION_BLOCKS: u8 = 2;
export const MAX_TOTAL_SATOSHIS: u256 = u256.fromU64(21_000_000 * 100_000_000);
export const MAX_ACTIVATION_DELAY: u8 = 3;

export const MAXIMUM_NUMBER_OF_PROVIDER_TO_RESETS_BEFORE_QUEUING: u8 = 120;
export const MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS: u8 = 50;

export const MAX_PRICE_IMPACT_BPS = u256.fromU64(10_000); // 40% 3_000 15_000
export const MAX_CUMULATIVE_IMPACT_BPS = u256.fromU32(20_000);

export const TEN_THOUSAND_U256: u256 = u256.fromU32(10_000);

// By design, Array does not contain more than U32.MAX_VALUE - 1 elements.
// And max index is U32.MAX_VALUE - 2.
export const INDEX_NOT_SET_VALUE: u32 = U32.MAX_VALUE;
export const INITIAL_LIQUIDITY_PROVIDER_INDEX: u32 = u32.MAX_VALUE - 1;
export const MAXIMUM_VALID_INDEX: u32 = u32.MAX_VALUE - 2;
export const BLOCK_NOT_SET_VALUE: u64 = U64.MAX_VALUE;

export const EMIT_PURGE_EVENTS: boolean = true;
export const EMIT_PROVIDERCONSUMED_EVENTS: boolean = true;
export const CSV_BLOCKS_REQUIRED: i32 = 1;

// Default amplification coefficient for stable pools
// Higher A = tighter liquidity around peg, lower slippage for small trades
// Typical values: 100-1000 for stablecoin pairs
export const DEFAULT_STABLE_AMPLIFICATION: u64 = 100;

export const POOL_TYPE_STANDARD: u8 = 0;
export const POOL_TYPE_STABLE: u8 = 1;

// Peg rate scale: pegRate is satoshis per token * 1e8
export const PEG_RATE_SCALE: u256 = u256.fromU64(100_000_000); // 1e8

// Peg rate bounds for defensive validation
// Min: 1 sat per token (1e8 scaled) - tokens worth less than 1 sat are unrealistic
export const MIN_PEG_RATE: u256 = u256.fromU64(100_000_000);

// Max: 1M BTC per token (1e14 sats * 1e8 scale) - catches overflow from malicious tokens
export const MAX_PEG_RATE: u256 = u256.fromUint8ArrayBE(
    Uint8Array.wrap(
        changetype<ArrayBuffer>([
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x1e, 0x19,
            0xe0, 0xc9, 0xba, 0xb2,
        ] as StaticArray<u8>),
    ),
);

/**
 * WARNING. This is very important because the limit of input UTXOs possible per transaction is 250. We give ourselves an error margin of 10.
 */
export const MAXIMUM_PROVIDER_PER_RESERVATIONS: u8 = 150;

export const AT_LEAST_PROVIDERS_TO_PURGE: u32 = 100;

export const ENABLE_INDEX_VERIFICATION: boolean = false;

export const MAXIMUM_QUOTE_INDEX: u64 = 500;
export const MAXIMUM_NUMBER_OF_PROVIDERS: u32 = u32.MAX_VALUE - 1000;

// Queue impact: scaled fixed-point unit (1.0 == 1_000_000)
export const QUEUE_IMPACT_SCALE_U64: u64 = 1_000_000;

// Queue impact: 7 days of Bitcoin-like blocks. Time at which the age term reaches its
// calibration target (70% crash from age alone).
export const QUEUE_TARGET_CLEARANCE_BLOCKS: u64 = 1_008;

// Queue impact: stress floor as a ratio of virtualTokenReserve, scaled by QUEUE_IMPACT_SCALE.
// 10_000 == 1% of T. Queues smaller than this age the pool at half speed or less.
export const QUEUE_STRESS_FLOOR_RATIO_U64: u64 = 10_000;

// Queue impact: recovery floor as a ratio of virtualTokenReserve. 50_000 == 5% of T.
// Sets a minimum recoveryDepth so tiny dust buys cannot earn full demand credit.
export const QUEUE_RECOVERY_FLOOR_RATIO_U64: u64 = 50_000;

// Queue impact: size term coefficients for R_size(x) = αx + β·x²/(x + x0).
// α = 0.30, β = 1.50, x0 = 0.40. Linear-plus-saturating-quadratic shape: handles dust
// gracefully and keeps marginal pressure under heavy queues, unlike the saturating
// log-squared shape used previously.
export const QUEUE_SIZE_ALPHA_U64: u64 = 300_000;
export const QUEUE_SIZE_BETA_U64: u64 = 1_500_000;
export const QUEUE_SIZE_X0_U64: u64 = 400_000;

// Queue impact: age coefficient γ. Calibrated for a 70% crash from age alone at 7 days:
//   R = 1 / 0.30 - 1 = 2.333333333  ->  scaled = 2_333_333
export const QUEUE_AGE_GAMMA_U64: u64 = 2_333_333;

export let currentProviderResetCount: u8 = 0;
