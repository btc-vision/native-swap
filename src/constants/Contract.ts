import { u128, u256 } from '@btc-vision/as-bignum/assembly';

export const FEE_COLLECT_SCRIPT_PUBKEY: string =
    'bcrt1plz0svv3wl05qrrv0dx8hvh5mgqc7jf3mhqgtw8jnj3l3d3cs6lzsfc3mxh';
export const QUOTE_SCALE: u256 = u256.fromU64(100_000_000);
export const RESERVATION_EXPIRE_AFTER_IN_BLOCKS: u64 = 5;
export const VOLATILITY_WINDOW_IN_BLOCKS: u32 = 5;
export const STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT: u64 = 600;
export const MINIMUM_PROVIDER_RESERVATION_AMOUNT_IN_SAT: u64 = 1000;
export const MINIMUM_LIQUIDITY_VALUE_ADD_LIQUIDITY_IN_SAT: u64 = 10_000;
export const MINIMUM_TRADE_SIZE_IN_SAT: u64 = 10_000;
export const PERCENT_TOKENS_FOR_PRIORITY_QUEUE_TAX: u128 = u128.fromU32(30);
export const PERCENT_TOKENS_FOR_PRIORITY_FACTOR_TAX: u128 = u128.fromU32(1000);
export const TIMEOUT_AFTER_EXPIRATION_BLOCKS: u8 = 5;
export const MAX_TOTAL_SATOSHIS: u256 = u256.fromU64(21_000_000 * 100_000_000);
export const MAX_ACTIVATION_DELAY: u8 = 3;

// By design, Array does not contain more than U32.MAX_VALUE - 1 elements.
// And max index is U32.MAX_VALUE - 2.
export const INDEX_NOT_SET_VALUE: u32 = U32.MAX_VALUE;
export const INITIAL_LIQUIDITY_PROVIDER_INDEX: u32 = u32.MAX_VALUE - 1;
export const MAXIMUM_VALID_INDEX: u32 = u32.MAX_VALUE - 2;
export const MAXIMUM_PROVIDER_COUNT: u32 = U32.MAX_VALUE - 1;
