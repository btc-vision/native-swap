import { Blockchain } from '@btc-vision/btc-runtime/runtime';

// ============================================================================
// Liquidity / reserves accounting
// ============================================================================

export const FEE_SETTINGS_POINTER: u16 = Blockchain.nextPointer;
export const TOTAL_RESERVES_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_RESERVED_POINTER: u16 = Blockchain.nextPointer;

// ============================================================================
// Provider data
// ============================================================================

export const PROVIDER_DATA_POINTER: u16 = Blockchain.nextPointer;
export const AMOUNT_POINTER: u16 = Blockchain.nextPointer;
export const BTC_RECEIVER_ADDRESS_POINTER: u16 = Blockchain.nextPointer;

// ============================================================================
// Per-tick queues (the new sorted-listing structure)
// ============================================================================

/** Bitmap of occupied ticks: StoredMap<u32 wordIdx, u256> per token. */
export const TICK_BITMAP_POINTER: u16 = Blockchain.nextPointer;

/** FIFO of provider IDs at this tick. StoredU256Array per (token, tick). */
export const TICK_FIFO_POINTER: u16 = Blockchain.nextPointer;

/** Indices into FIFO[T] for fast-path re-allocation after purge. StoredU32Array per (token, tick). */
export const TICK_PURGED_POINTER: u16 = Blockchain.nextPointer;

/** Hint: lowest-known non-empty bitmap word. StoredU32 per token. */
export const TICK_LOWEST_WORD_POINTER: u16 = Blockchain.nextPointer;

/** Single global fulfilled queue (provider IDs awaiting reset). StoredU256Array per token. */
export const QUEUE_FULFILLED_POINTER: u16 = Blockchain.nextPointer;

// ============================================================================
// Pool registration
// ============================================================================

/**
 * Per-token pool-registered flag (StoredU64 on this pointer keyed by tokenIdBytes;
 * 0 = not registered, non-zero = registered). True once `createPool(token, ...)`
 * has been called. Required for `listLiquidity` and `reserveLiquidity` to succeed.
 */
export const POOL_REGISTERED_POINTER: u16 = Blockchain.nextPointer;

/**
 * Per-token last-purged-block cursor (StoredU64 on this pointer keyed by tokenIdBytes).
 * Tracks the high-water mark of the incremental reservation purge.
 */
export const LAST_PURGED_BLOCK_POINTER: u16 = Blockchain.nextPointer;

// ============================================================================
// Reservation storage
// ============================================================================

/** Replaces the old RESERVATION_INDEXES — stores providerId directly per entry. StoredU256Array per reservation. */
export const RESERVATION_PROVIDER_IDS: u16 = Blockchain.nextPointer;

/** i32 ticks (two's-complement-encoded as u32) per reservation entry. StoredU32Array per reservation. */
export const RESERVATION_TICKS: u16 = Blockchain.nextPointer;

/** Q40.88 fillPrice per reservation entry (sats per base unit). StoredU128Array per reservation. */
export const RESERVATION_FILL_PRICES: u16 = Blockchain.nextPointer;

export const RESERVATION_AMOUNTS: u16 = Blockchain.nextPointer;
export const RESERVATION_DATA_POINTER: u16 = Blockchain.nextPointer;

export const BLOCKS_WITH_RESERVATIONS_POINTER: u16 = Blockchain.nextPointer;
export const RESERVATION_IDS_BY_BLOCK_POINTER: u16 = Blockchain.nextPointer;
export const ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER: u16 = Blockchain.nextPointer;

export const PURGE_RESERVATION_INDEX_POINTER: u16 = Blockchain.nextPointer;

// ============================================================================
// Contract administration
// ============================================================================

export const STAKING_CA_POINTER: u16 = Blockchain.nextPointer;
export const CONTRACT_PAUSED_POINTER: u16 = Blockchain.nextPointer;
export const FEES_ADDRESS_POINTER: u16 = Blockchain.nextPointer;
export const WITHDRAW_MODE_POINTER: u16 = Blockchain.nextPointer;
