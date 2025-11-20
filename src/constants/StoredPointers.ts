import { Blockchain } from '@btc-vision/btc-runtime/runtime';

export const FEE_SETTINGS_POINTER: u16 = Blockchain.nextPointer;
export const TOTAL_RESERVES_POINTER: u16 = Blockchain.nextPointer;

export const PROVIDER_DATA_POINTER: u16 = Blockchain.nextPointer;
export const AMOUNT_POINTER: u16 = Blockchain.nextPointer;
export const BTC_RECEIVER_ADDRESS_POINTER: u16 = Blockchain.nextPointer;

export const LIQUIDITY_QUOTE_HISTORY_POINTER: u16 = Blockchain.nextPointer;
export const NORMAL_QUEUE_POINTER: u16 = Blockchain.nextPointer;
export const PRIORITY_QUEUE_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_RESERVED_POINTER: u16 = Blockchain.nextPointer;

export const LIQUIDITY_VIRTUAL_BTC_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_VIRTUAL_T_POINTER: u16 = Blockchain.nextPointer;
export const RESERVATION_SETTINGS_POINTER: u16 = Blockchain.nextPointer;
export const BLOCKS_WITH_RESERVATIONS_POINTER: u16 = Blockchain.nextPointer;

export const RESERVATION_INDEXES: u16 = Blockchain.nextPointer;
export const RESERVATION_AMOUNTS: u16 = Blockchain.nextPointer;
export const RESERVATION_PRIORITY: u16 = Blockchain.nextPointer;
export const RESERVATION_DATA_POINTER: u16 = Blockchain.nextPointer;
export const RESERVATION_IDS_BY_BLOCK_POINTER: u16 = Blockchain.nextPointer;
export const ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER: u16 = Blockchain.nextPointer;

export const ANTI_BOT_MAX_TOKENS_PER_RESERVATION: u16 = Blockchain.nextPointer;
export const INITIAL_LIQUIDITY_PROVIDER_POINTER: u16 = Blockchain.nextPointer;

export const DELTA_BTC_BUY: u16 = Blockchain.nextPointer;
export const DELTA_TOKENS_ADD: u16 = Blockchain.nextPointer;
export const DELTA_TOKENS_BUY: u16 = Blockchain.nextPointer;
export const REMOVAL_QUEUE_POINTER: u16 = Blockchain.nextPointer;

export const VOLATILITY_POINTER: u16 = Blockchain.nextPointer;
export const STARTING_INDEX_POINTER: u16 = Blockchain.nextPointer;
export const STAKING_CA_POINTER: u16 = Blockchain.nextPointer;

export const NORMAL_QUEUE_PURGED_RESERVATION: u16 = Blockchain.nextPointer;
export const PRIORITY_QUEUE_PURGED_RESERVATION: u16 = Blockchain.nextPointer;
export const REMOVAL_QUEUE_PURGED_RESERVATION: u16 = Blockchain.nextPointer;

export const PURGE_RESERVATION_INDEX_POINTER: u16 = Blockchain.nextPointer;
export const CONTRACT_PAUSED_POINTER: u16 = Blockchain.nextPointer;
export const FEES_ADDRESS_POINTER: u16 = Blockchain.nextPointer;
export const WITHDRAW_MODE_POINTER: u16 = Blockchain.nextPointer;
export const NORMAL_QUEUE_FULFILLED: u16 = Blockchain.nextPointer;
export const PRIORITY_QUEUE_FULFILLED: u16 = Blockchain.nextPointer;
