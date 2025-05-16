export const NOT_DEFINED_PROVIDER_INDEX: u64 = u32.MAX_VALUE;
export const INITIAL_LIQUIDITY_PROVIDER_INDEX: u64 = u32.MAX_VALUE - 1;
export const IMPOSSIBLE_PURGE_INDEX: u32 = u32.MAX_VALUE;
export const ALLOW_DIRTY: bool = true;

/**
 * WARNING. This is very important because the limit of input UTXOs possible per transaction is 250. We give ourselves an error margin of 10.
 */
export const MAXIMUM_PROVIDER_PER_RESERVATIONS: u8 = 240;
