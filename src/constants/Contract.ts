 import { u128, u256 } from '@btc-vision/as-bignum/assembly';

export const FEE_COLLECT_SCRIPT_PUBKEY: string =
    //'tb1p823gdnqvk8a90f8cu30w8ywvk29uh8txtqqnsmk6f5ktd7hlyl0q3cyz4c';
'bcrt1plz0svv3wl05qrrv0dx8hvh5mgqc7jf3mhqgtw8jnj3l3d3cs6lzsfc3mxh';

// tb1p823gdnqvk8a90f8cu30w8ywvk29uh8txtqqnsmk6f5ktd7hlyl0q3cyz4c

export const QUOTE_SCALE: u256 = u256.fromU64(100_000_000);
export const RESERVATION_EXPIRE_AFTER_IN_BLOCKS: u64 = 9;
export const VOLATILITY_WINDOW_IN_BLOCKS: u32 = 9;
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
export const BLOCK_NOT_SET_VALUE: u64 = U64.MAX_VALUE;

export const EMIT_PURGE_EVENTS: boolean = false;

export const ALLOW_DIRTY: boolean = true;

/**
 * WARNING. This is very important because the limit of input UTXOs possible per transaction is 250. We give ourselves an error margin of 10. !!!!??? 10???
 */
export const MAXIMUM_PROVIDER_PER_RESERVATIONS: u8 = 150;

export const AT_LEAST_PROVIDERS_TO_PURGE: u32 = 150;

// 4 block grace period
export const SLASH_GRACE_WINDOW: u64 = 4;

// number of blocks in 14 days
export const SLASH_RAMP_UP_BLOCKS: u64 = 2_016;

export const ENABLE_INDEX_VERIFICATION: boolean = false;

export const MAXIMUM_QUOTE_INDEX: u64 = 500;
export const MAXIMUM_NUMBER_OF_PROVIDERS: u32 = u32.MAX_VALUE - 1000;
