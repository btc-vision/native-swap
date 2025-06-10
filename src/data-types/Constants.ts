export const NOT_DEFINED_PROVIDER_INDEX: u64 = u32.MAX_VALUE;
export const INITIAL_LIQUIDITY_PROVIDER_INDEX: u64 = u32.MAX_VALUE - 1;
export const IMPOSSIBLE_PURGE_INDEX: u32 = u32.MAX_VALUE;
export const ALLOW_DIRTY: bool = true;

/**
 * WARNING. This is very important because the limit of input UTXOs possible per transaction is 250. We give ourselves an error margin of 10.
 */
export const MAXIMUM_PROVIDER_PER_RESERVATIONS: u8 = 100;

export const PURGE_AT_LEAST_X_PROVIDERS: u32 = 150;

// 4 block grace period
export const SLASH_GRACE_WINDOW: u64 = 4;

// number of blocks in 14 days
export const SLASH_RAMP_UP_BLOCKS: u64 = 2_016;

export const ENABLE_INDEX_VERIFICATION: bool = false;
export const RESERVATION_EXPIRE_AFTER: u64 = 5;

//export const FEE_COLLECT_SCRIPT_PUBKEY: string =
//    'tb1p823gdnqvk8a90f8cu30w8ywvk29uh8txtqqnsmk6f5ktd7hlyl0q3cyz4c';

export const FEE_COLLECT_SCRIPT_PUBKEY: string =
    'bcrt1plz0svv3wl05qrrv0dx8hvh5mgqc7jf3mhqgtw8jnj3l3d3cs6lzsfc3mxh';
