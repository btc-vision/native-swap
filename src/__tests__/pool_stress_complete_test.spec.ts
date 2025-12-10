import { clearCachedProviders, getProvider, Provider } from '../models/Provider';
import {
    Blockchain,
    BytesWriter,
    ExtendedAddress,
    SafeMath,
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { CSV_BLOCKS_REQUIRED } from '../constants/Contract';
import {
    createLiquidityQueue,
    createProviderId,
    msgSender1,
    receiverAddress1,
    receiverAddress1CSV,
    setBlockchainEnvironment,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import {
    INITIAL_FEE_COLLECT_ADDRESS,
    MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
    MINIMUM_TRADE_SIZE_IN_SAT,
    QUOTE_SCALE,
} from '../constants/Contract';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { SwapOperation } from '../operations/SwapOperation';
import { Reservation } from '../models/Reservation';

// ============== TEST CONSTANTS ==============
const TOKEN_DECIMALS: u32 = 18;
const POOL_TOKEN_AMOUNT: u128 = u128.fromString('10000000000000000000000000'); // 10M tokens * 10^18
const MINIMUM_RESERVE_AMOUNT: u64 = MINIMUM_TRADE_SIZE_IN_SAT; // 10,000 sats
// accounts500 reserve double to ensure tokens remain above minimum value for listing after price changes
const ACCOUNTS500_RESERVE_AMOUNT: u64 = MINIMUM_TRADE_SIZE_IN_SAT * 2; // 20,000 sats
const LARGE_PURCHASE_AMOUNT: u64 = 1_000_000_000; // 10 BTC in satoshis
const ONE_BTC_IN_SATS: u64 = 100_000_000;

// ============== HELPER FUNCTIONS ==============

// Generate unique account address from index using SHA256 hash
// This guarantees collision-free addresses for any index
function generateAccount(index: u32): ExtendedAddress {
    const writer = new BytesWriter(12);
    writer.writeStringWithLength('addr');
    writer.writeU32(index);
    const hash = sha256(writer.getBuffer());

    const addressArr: u8[] = [];
    for (let i: i32 = 0; i < 32; i++) {
        addressArr.push(hash[i]);
    }

    const writer2 = new BytesWriter(12);
    writer2.writeStringWithLength('pubk');
    writer2.writeU32(index);
    const hash2 = sha256(writer2.getBuffer());

    const pubKeyArr: u8[] = [];
    for (let i: i32 = 0; i < 32; i++) {
        pubKeyArr.push(hash2[i]);
    }

    return new ExtendedAddress(addressArr, pubKeyArr);
}

// Generate receiver address bytes from index (33 bytes)
function generateReceiverAddressBytes(index: u32): Uint8Array {
    const bytes = new Uint8Array(33);
    bytes.set([
        0x02, 0x03, 0x73, 0x62, 0x6d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10,
        0x68, 0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x67,
        0x0a, 0xf5, 0x2c,
    ]);
    bytes[29] = u8((index >> 16) & 0xff);
    bytes[30] = u8((index >> 8) & 0xff);
    bytes[31] = u8(index & 0xff);
    return bytes;
}

// Generate BTC receiver address string from index (CSV format)
function generateReceiverAddressCSV(index: u32): string {
    const bytes = generateReceiverAddressBytes(index);
    return ExtendedAddress.toCSV(bytes, CSV_BLOCKS_REQUIRED);
}

// Expand token amount by decimals
function expand(amount: u128, decimal: u32): u128 {
    const scale = SafeMath.pow(u256.fromU32(10), u256.fromU32(decimal)).toU128();
    return SafeMath.mul128(amount, scale);
}

// Create the initial pool with 100 BTC value and 10M tokens
function createPool(block: u64): Provider {
    setBlockchainEnvironment(block, msgSender1, msgSender1);

    const initialProviderId: u256 = createProviderId(Blockchain.tx.sender, tokenAddress1);
    const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

    // Floor price: 10^18 / 100,000 = 10^13 (100,000 tokens per BTC)
    const floorPrice: u256 = SafeMath.div(
        SafeMath.pow(u256.fromU32(10), u256.fromU32(TOKEN_DECIMALS)),
        u256.fromU32(100000),
    );

    const createPoolOp = new CreatePoolOperation(
        lq.liquidityQueue,
        floorPrice,
        initialProviderId,
        POOL_TOKEN_AMOUNT,
        receiverAddress1,
        receiverAddress1CSV,
        0, // No anti-bot
        u256.Zero,
        100, // Max reserves 100%
    );

    createPoolOp.execute();
    lq.liquidityQueue.save();
    lq.liquidityQueue.setBlockQuote();
    lq.liquidityQueue.save();

    return getProvider(initialProviderId);
}

// Create a reservation for an account
function reserveForAccount(account: ExtendedAddress, amount: u64, block: u64): Reservation {
    setBlockchainEnvironment(block, account, account);
    const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
    const id = createProviderId(account, tokenAddress1);

    const reserveOp = new ReserveLiquidityOperation(
        lq.liquidityQueue,
        id,
        account,
        amount,
        u256.Zero, // minTokens = 0
        0, // activationDelay = 0
        MAXIMUM_PROVIDER_PER_RESERVATIONS,
        MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS,
    );

    reserveOp.execute();
    lq.liquidityQueue.save();

    return new Reservation(tokenAddress1, account);
}

// Execute swap for an account
function swapForAccount(
    account: ExtendedAddress,
    block: u64,
    initialProvider: Provider,
    satoshisToSend: u64,
    logDetails: bool = false,
): void {
    setBlockchainEnvironment(block, account, account);
    const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

    // First, check the reservation state
    const reservation = new Reservation(tokenAddress1, account);
    const providerCount = reservation.getProviderCount();

    if (logDetails) {
        Blockchain.log(`=== SWAP DEBUG for block ${block} ===`);
        Blockchain.log(`Reservation provider count: ${providerCount}`);
        Blockchain.log(`Reservation is valid: ${reservation.isValid() ? 'YES' : 'NO'}`);
        Blockchain.log(`Reservation is expired: ${reservation.isExpired() ? 'YES' : 'NO'}`);
        Blockchain.log(`Reservation creation block: ${reservation.getCreationBlock()}`);
        Blockchain.log(`Reservation expiration block: ${reservation.getExpirationBlock()}`);
    }

    // Build transaction outputs - need to send to EACH provider in the reservation
    const txOut: TransactionOutput[] = [];
    txOut.push(new TransactionOutput(0, 0, null, 'random_change_address', 0));
    txOut.push(new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 100));

    // Add outputs for each provider in the reservation
    let outputIndex: u16 = 2;
    for (let i: u32 = 0; i < providerCount; i++) {
        const providerData = reservation.getProviderAt(i);

        if (logDetails) {
            Blockchain.log(`Provider ${i}: index=${providerData.providerIndex}, amount=${providerData.providedAmount.toString()}, type=${providerData.providerType}`);
        }

        // Get the actual provider to find their BTC receiver
        const provider = lq.providerManager.getProviderFromQueue(
            providerData.providerIndex,
            providerData.providerType,
        );
        const btcReceiver = provider.getBtcReceiver();

        if (logDetails) {
            Blockchain.log(`Provider ${i}: btcReceiver=${btcReceiver}, liquidity=${provider.getLiquidityAmount().toString()}`);
        }

        // Send satoshis to this provider
        txOut.push(new TransactionOutput(outputIndex, 0, null, btcReceiver, satoshisToSend));
        outputIndex++;
    }

    // Also add output for initial provider (as fallback)
    txOut.push(
        new TransactionOutput(outputIndex, 0, null, initialProvider.getBtcReceiver(), satoshisToSend),
    );

    if (logDetails) {
        Blockchain.log(`Total tx outputs: ${txOut.length}`);
    }

    Blockchain.mockTransactionOutput(txOut);

    const swapOp = new SwapOperation(lq.liquidityQueue, lq.tradeManager);

    // CRITICAL: Swap must not revert - if it throws, test fails immediately
    swapOp.execute();
    lq.liquidityQueue.save();
}

// List tokens for sale from an account
function listTokensForAccount(
    account: ExtendedAddress,
    amount: u128,
    block: u64,
    receiverIndex: u32,
): Provider {
    setBlockchainEnvironment(block, account, account);
    const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
    const providerId = createProviderId(account, tokenAddress1);

    const receiverBytes = generateReceiverAddressBytes(receiverIndex);
    const receiverCSV = generateReceiverAddressCSV(receiverIndex);

    const listOp = new ListTokensForSaleOperation(
        lq.liquidityQueue,
        providerId,
        amount,
        receiverBytes,
        receiverCSV,
        false, // not priority
        false, // not fulfilled
        MAXIMUM_NUMBER_OF_QUEUED_PROVIDER_TO_RESETS,
    );

    listOp.execute();
    lq.liquidityQueue.save();

    return getProvider(providerId);
}

// Get current quote from pool
function getPoolQuote(block: u64): u256 {
    setBlockchainEnvironment(block, msgSender1, msgSender1);
    const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
    return lq.liquidityQueue.quote();
}

// Calculate tokens for 1 BTC worth based on quote
function calculateTokensFor1BTC(quote: u256): u128 {
    // quote = tokens per sat (scaled by QUOTE_SCALE)
    // tokens = sats * quote / QUOTE_SCALE
    const satsFor1BTC = u256.fromU64(ONE_BTC_IN_SATS);
    const tokensU256 = SafeMath.div(SafeMath.mul(satsFor1BTC, quote), QUOTE_SCALE);
    return tokensU256.toU128();
}

// Class for pool liquidity info
class PoolLiquidityInfo {
    liquidity: u256;
    reserved: u256;

    constructor(liquidity: u256, reserved: u256) {
        this.liquidity = liquidity;
        this.reserved = reserved;
    }
}

// Class for queue state tracking
class QueueState {
    block: u64;
    normalQueueLength: u32;
    priorityQueueLength: u32;
    liquidity: u256;
    reservedLiquidity: u256;
    quote: u256;
    virtualSatoshis: u64;
    virtualTokens: u256;

    constructor(
        block: u64,
        normalQueueLength: u32,
        priorityQueueLength: u32,
        liquidity: u256,
        reservedLiquidity: u256,
        quote: u256,
        virtualSatoshis: u64,
        virtualTokens: u256,
    ) {
        this.block = block;
        this.normalQueueLength = normalQueueLength;
        this.priorityQueueLength = priorityQueueLength;
        this.liquidity = liquidity;
        this.reservedLiquidity = reservedLiquidity;
        this.quote = quote;
        this.virtualSatoshis = virtualSatoshis;
        this.virtualTokens = virtualTokens;
    }
}

// Get full queue state for tracing
function getQueueState(block: u64): QueueState {
    setBlockchainEnvironment(block, msgSender1, msgSender1);
    const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
    return new QueueState(
        block,
        lq.providerManager.normalQueueLength,
        lq.providerManager.priorityQueueLength,
        lq.liquidityQueue.liquidity,
        lq.liquidityQueue.reservedLiquidity,
        lq.liquidityQueue.quote(),
        lq.liquidityQueue.virtualSatoshisReserve,
        lq.liquidityQueue.virtualTokenReserve,
    );
}

// Log queue state
function logQueueState(label: string, state: QueueState): void {
    Blockchain.log(`--- ${label} (Block ${state.block}) ---`);
    Blockchain.log(`  Normal Queue: ${state.normalQueueLength}, Priority Queue: ${state.priorityQueueLength}`);
    Blockchain.log(`  Liquidity: ${state.liquidity.toString()}`);
    Blockchain.log(`  Reserved: ${state.reservedLiquidity.toString()}`);
    Blockchain.log(`  Quote: ${state.quote.toString()}`);
    Blockchain.log(`  Virtual Sats: ${state.virtualSatoshis}`);
    Blockchain.log(`  Virtual Tokens: ${state.virtualTokens.toString()}`);
}

// Get pool liquidity info
function getPoolLiquidity(block: u64): PoolLiquidityInfo {
    setBlockchainEnvironment(block, msgSender1, msgSender1);
    const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
    return new PoolLiquidityInfo(lq.liquidityQueue.liquidity, lq.liquidityQueue.reservedLiquidity);
}

// Get total reserved tokens from a reservation
function getReservationTotalTokens(reservation: Reservation): u128 {
    // Sum up tokens from all providers in the reservation
    const providerCount = reservation.getProviderCount();
    let totalTokens = u128.Zero;

    for (let i: u32 = 0; i < providerCount; i++) {
        const providerData = reservation.getProviderAt(i);
        totalTokens = SafeMath.add128(totalTokens, providerData.providedAmount);
    }

    return totalTokens;
}

// ============== MAIN TEST ==============

describe('Pool Stress Test - Complete 12 Phase Verification', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        Blockchain.mockValidateBitcoinAddressResult(true);
        TransferHelper.clearMockedResults();
    });

    it('should handle 1000+ accounts across 12 phases with no swap reverts', () => {
        // Track test state
        let zeroTokenReservations: u32 = 0;
        const quoteHistory: u256[] = [];

        // Token tracking maps (accountIndex -> tokens)
        const tokensPhase3: Map<u32, u128> = new Map();
        const tokensPhase5: Map<u32, u128> = new Map();
        let bigPurchaseTokens: u128 = u128.Zero;
        const tokensPhase9: Map<u32, u128> = new Map();

        // Generate 1000 accounts for first wave
        const accounts1000: ExtendedAddress[] = [];
        for (let i: u32 = 0; i < 1000; i++) {
            accounts1000.push(generateAccount(i));
        }

        // Generate 500 accounts for second wave (starting at index 1000)
        const accounts500: ExtendedAddress[] = [];
        for (let i: u32 = 1000; i < 1500; i++) {
            accounts500.push(generateAccount(i));
        }

        // Big purchaser account
        const bigPurchaser = generateAccount(9999);

        // ============== PHASE 1: Create Pool ==============
        Blockchain.log('=== PHASE 1: Creating pool with 100 BTC / 10M tokens ===');
        const initialProvider = createPool(100);

        expect(initialProvider.getLiquidityAmount()).toStrictEqual(POOL_TOKEN_AMOUNT);
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        const initialQuote = getPoolQuote(100);
        quoteHistory.push(initialQuote);
        Blockchain.log(`Initial quote: ${initialQuote.toString()}`);

        // Trace queue state after Phase 1
        logQueueState('After Phase 1 (Pool Created)', getQueueState(100));

        // ============== PHASE 2: First Wave Reservations ==============
        Blockchain.log('=== PHASE 2: 1000 accounts reserving minimum amount ===');

        for (let i: i32 = 0; i < 1000; i++) {
            const account = accounts1000[i];
            const reservation = reserveForAccount(account, MINIMUM_RESERVE_AMOUNT, 101);

            // Track tokens for later listing
            const reservedTokens = getReservationTotalTokens(reservation);
            tokensPhase3.set(u32(i), reservedTokens);

            if (reservation.getProviderCount() === 0) {
                zeroTokenReservations++;
                Blockchain.log(`WARNING: Account ${i} got zero providers!`);
            }
            if (i % 200 === 0) {
                Blockchain.log(`Reservation ${i}/1000 created`);
            }
        }

        expect(zeroTokenReservations).toStrictEqual(0);

        const quoteAfterPhase2 = getPoolQuote(101);
        quoteHistory.push(quoteAfterPhase2);
        Blockchain.log(`Quote after Phase 2: ${quoteAfterPhase2.toString()}`);

        // Trace queue state after Phase 2
        logQueueState('After Phase 2 (1000 Reservations)', getQueueState(101));

        // ============== PHASE 3: First Wave Swaps ==============
        Blockchain.log('=== PHASE 3: Swapping all 1000 reservations ===');

        for (let i: i32 = 0; i < 1000; i++) {
            const account = accounts1000[i];
            swapForAccount(account, 102, initialProvider, MINIMUM_RESERVE_AMOUNT);
            if (i % 200 === 0) {
                Blockchain.log(`Swap ${i}/1000 completed`);
            }
        }

        const quoteAfterPhase3 = getPoolQuote(102);
        quoteHistory.push(quoteAfterPhase3);
        Blockchain.log(`Quote after Phase 3: ${quoteAfterPhase3.toString()}`);

        // Trace queue state after Phase 3
        logQueueState('After Phase 3 (1000 Swaps)', getQueueState(102));

        // ============== PHASE 4: Second Wave Reservations ==============
        Blockchain.log('=== PHASE 4: Same 1000 accounts reserving again ===');

        for (let i: i32 = 0; i < 1000; i++) {
            const account = accounts1000[i];
            const reservation = reserveForAccount(account, MINIMUM_RESERVE_AMOUNT, 103);

            // Track tokens for later listing (accumulate with phase 3)
            const reservedTokens = getReservationTotalTokens(reservation);
            const existing = tokensPhase3.has(u32(i)) ? tokensPhase3.get(u32(i)) : u128.Zero;
            tokensPhase5.set(u32(i), SafeMath.add128(existing, reservedTokens));

            if (reservation.getProviderCount() === 0) {
                zeroTokenReservations++;
                Blockchain.log(`WARNING: Account ${i} got zero providers in second wave!`);
            }
        }

        expect(zeroTokenReservations).toStrictEqual(0);

        const quoteAfterPhase4 = getPoolQuote(103);
        quoteHistory.push(quoteAfterPhase4);
        Blockchain.log(`Quote after Phase 4: ${quoteAfterPhase4.toString()}`);

        // Trace queue state after Phase 4
        logQueueState('After Phase 4 (1000 Reservations Round 2)', getQueueState(103));

        // ============== PHASE 5: Staggered Swaps ==============
        Blockchain.log('=== PHASE 5: Staggered swaps over 3 blocks ===');

        // Block 104: Swap first 400
        Blockchain.log('Block 104: Swapping first 400 reservations');
        for (let i: i32 = 0; i < 400; i++) {
            const account = accounts1000[i];
            swapForAccount(account, 104, initialProvider, MINIMUM_RESERVE_AMOUNT);
        }

        const quoteAfterBlock104 = getPoolQuote(104);
        quoteHistory.push(quoteAfterBlock104);
        Blockchain.log(`Quote after block 104: ${quoteAfterBlock104.toString()}`);

        // Block 105: Swap next 350
        Blockchain.log('Block 105: Swapping next 350 reservations');
        for (let i: i32 = 400; i < 750; i++) {
            const account = accounts1000[i];
            swapForAccount(account, 105, initialProvider, MINIMUM_RESERVE_AMOUNT);
        }

        const quoteAfterBlock105 = getPoolQuote(105);
        quoteHistory.push(quoteAfterBlock105);
        Blockchain.log(`Quote after block 105: ${quoteAfterBlock105.toString()}`);

        // Block 106: Swap remaining 250
        Blockchain.log('Block 106: Swapping remaining 250 reservations');
        for (let i: i32 = 750; i < 1000; i++) {
            const account = accounts1000[i];
            swapForAccount(account, 106, initialProvider, MINIMUM_RESERVE_AMOUNT);
        }

        const quoteAfterPhase5 = getPoolQuote(106);
        quoteHistory.push(quoteAfterPhase5);
        Blockchain.log(`Quote after Phase 5: ${quoteAfterPhase5.toString()}`);

        // Trace queue state after Phase 5
        logQueueState('After Phase 5 (Staggered Swaps)', getQueueState(106));

        // ============== PHASE 6: Large Purchase Reservation ==============
        Blockchain.log('=== PHASE 6: Large purchase reservation (10 BTC) ===');

        // Skip block 107
        const reservationBigPurchase = reserveForAccount(bigPurchaser, LARGE_PURCHASE_AMOUNT, 108);

        // Track big purchase tokens
        bigPurchaseTokens = getReservationTotalTokens(reservationBigPurchase);
        Blockchain.log(`Big purchase reserved tokens: ${bigPurchaseTokens.toString()}`);

        if (reservationBigPurchase.getProviderCount() === 0) {
            zeroTokenReservations++;
            Blockchain.log('WARNING: Big purchaser got zero providers!');
        }

        expect(zeroTokenReservations).toStrictEqual(0);

        const quoteAfterPhase6 = getPoolQuote(108);
        quoteHistory.push(quoteAfterPhase6);
        Blockchain.log(`Quote after Phase 6: ${quoteAfterPhase6.toString()}`);

        // Trace queue state after Phase 6
        logQueueState('After Phase 6 (10 BTC Reservation)', getQueueState(108));

        // ============== PHASE 7: Execute Large Swap ==============
        Blockchain.log('=== PHASE 7: Executing large swap (10 BTC) ===');

        swapForAccount(bigPurchaser, 109, initialProvider, LARGE_PURCHASE_AMOUNT);

        const quoteAfterPhase7 = getPoolQuote(109);
        quoteHistory.push(quoteAfterPhase7);
        Blockchain.log(`Quote after Phase 7: ${quoteAfterPhase7.toString()}`);

        // Verify price impact: after large buy, quote should DECREASE (tokens more expensive)
        Blockchain.log(
            `Price check: Before big buy: ${quoteAfterPhase6.toString()}, After: ${quoteAfterPhase7.toString()}`,
        );

        // Trace queue state after Phase 7
        logQueueState('After Phase 7 (10 BTC Swap)', getQueueState(109));

        // ============== PHASE 8: List Tokens from 1000 Accounts ==============
        Blockchain.log('=== PHASE 8: 1000 accounts listing tokens ===');

        // Use tracked tokens from Phase 3 + Phase 5 swaps
        // Block 110: First 334 accounts
        Blockchain.log('Block 110: First 334 accounts listing tokens');
        for (let i: i32 = 0; i < 334; i++) {
            const account = accounts1000[i];
            const tokensToList = tokensPhase5.has(u32(i)) ? tokensPhase5.get(u32(i)) : u128.Zero;
            if (tokensToList > u128.Zero) {
                listTokensForAccount(account, tokensToList, 110, u32(i));
            }
        }

        const quoteAfterBlock110 = getPoolQuote(110);
        quoteHistory.push(quoteAfterBlock110);
        Blockchain.log(`Quote after block 110: ${quoteAfterBlock110.toString()}`);

        // Block 111: Next 333 accounts
        Blockchain.log('Block 111: Next 333 accounts listing tokens');
        for (let i: i32 = 334; i < 667; i++) {
            const account = accounts1000[i];
            const tokensToList = tokensPhase5.has(u32(i)) ? tokensPhase5.get(u32(i)) : u128.Zero;
            if (tokensToList > u128.Zero) {
                listTokensForAccount(account, tokensToList, 111, u32(i));
            }
        }

        const quoteAfterBlock111 = getPoolQuote(111);
        quoteHistory.push(quoteAfterBlock111);
        Blockchain.log(`Quote after block 111: ${quoteAfterBlock111.toString()}`);

        // Block 112: Remaining 333 accounts
        Blockchain.log('Block 112: Remaining 333 accounts listing tokens');
        for (let i: i32 = 667; i < 1000; i++) {
            const account = accounts1000[i];
            const tokensToList = tokensPhase5.has(u32(i)) ? tokensPhase5.get(u32(i)) : u128.Zero;
            if (tokensToList > u128.Zero) {
                listTokensForAccount(account, tokensToList, 112, u32(i));
            }
        }

        const quoteAfterPhase8 = getPoolQuote(112);
        quoteHistory.push(quoteAfterPhase8);
        Blockchain.log(`Quote after Phase 8: ${quoteAfterPhase8.toString()}`);

        // After listing (sell pressure), quote should INCREASE (more tokens = cheaper)
        Blockchain.log(
            `Price check after listing: Before: ${quoteAfterPhase7.toString()}, After: ${quoteAfterPhase8.toString()}`,
        );

        // Trace queue state after Phase 8
        logQueueState('After Phase 8 (1000 Listings)', getQueueState(112));

        // ============== PHASE 9: 500 New Accounts Reserve ==============
        Blockchain.log('=== PHASE 9: 500 new accounts reserving (20,000 sats each) ===');

        // Skip block 113
        // Block 114: 250 accounts reserve with ACCOUNTS500_RESERVE_AMOUNT (20,000 sats)
        // This ensures tokens will be worth >= minimum listing value after price changes
        Blockchain.log('Block 114: First 250 new accounts reserving');
        for (let i: i32 = 0; i < 250; i++) {
            const account = accounts500[i];
            const reservation = reserveForAccount(account, ACCOUNTS500_RESERVE_AMOUNT, 114);

            const reservedTokens = getReservationTotalTokens(reservation);
            tokensPhase9.set(u32(i), reservedTokens);

            if (reservation.getProviderCount() === 0) {
                zeroTokenReservations++;
                Blockchain.log(`WARNING: New account ${i} got zero providers!`);
            }
        }

        const quoteAfterBlock114 = getPoolQuote(114);
        quoteHistory.push(quoteAfterBlock114);
        Blockchain.log(`Quote after block 114: ${quoteAfterBlock114.toString()}`);

        // Block 115: Remaining 250 accounts reserve
        Blockchain.log('Block 115: Remaining 250 new accounts reserving');
        for (let i: i32 = 250; i < 500; i++) {
            const account = accounts500[i];
            const reservation = reserveForAccount(account, ACCOUNTS500_RESERVE_AMOUNT, 115);

            const reservedTokens = getReservationTotalTokens(reservation);
            tokensPhase9.set(u32(i), reservedTokens);

            if (reservation.getProviderCount() === 0) {
                zeroTokenReservations++;
                Blockchain.log(`WARNING: New account ${i} got zero providers!`);
            }
        }

        expect(zeroTokenReservations).toStrictEqual(0);

        const quoteAfterPhase9 = getPoolQuote(115);
        quoteHistory.push(quoteAfterPhase9);
        Blockchain.log(`Quote after Phase 9: ${quoteAfterPhase9.toString()}`);

        // Trace queue state after Phase 9
        logQueueState('After Phase 9 (500 Reservations)', getQueueState(115));

        // ============== PHASE 10: First Dump + Partial Swaps ==============
        Blockchain.log('=== PHASE 10: First dump (1 BTC worth) + partial swaps ===');

        // Calculate 1 BTC worth of tokens based on current quote
        const currentQuotePhase10 = getPoolQuote(116);
        const dumpAmount1BTC = calculateTokensFor1BTC(currentQuotePhase10);
        Blockchain.log(`Dumping 1 BTC worth of tokens: ${dumpAmount1BTC.toString()}`);

        // List 1 BTC worth from big purchase
        listTokensForAccount(bigPurchaser, dumpAmount1BTC, 116, 9999);

        // Track remaining big purchase tokens
        const remainingBigPurchase = SafeMath.sub128(bigPurchaseTokens, dumpAmount1BTC);
        Blockchain.log(`Remaining big purchase tokens: ${remainingBigPurchase.toString()}`);

        // Swap 200 of the 500 reservations in the same block
        Blockchain.log('Block 116: Swapping first 200 of 500 reservations');
        for (let i: i32 = 0; i < 200; i++) {
            const account = accounts500[i];
            // Log details for first few swaps to debug the failure
            const shouldLog = i < 3;
            if (shouldLog) {
                Blockchain.log(`--- Attempting swap ${i} ---`);
            }
            swapForAccount(account, 116, initialProvider, ACCOUNTS500_RESERVE_AMOUNT, shouldLog);
        }

        const quoteAfterPhase10 = getPoolQuote(116);
        quoteHistory.push(quoteAfterPhase10);
        Blockchain.log(`Quote after Phase 10: ${quoteAfterPhase10.toString()}`);

        // Trace queue state after Phase 10
        logQueueState('After Phase 10 (1 BTC Dump + 200 Swaps)', getQueueState(116));

        // ============== PHASE 11: Second Dump + Complete Swaps + New Reservations ==============
        Blockchain.log('=== PHASE 11: Second dump + complete swaps + new reservations ===');

        // List remaining tokens from big purchase
        if (remainingBigPurchase > u128.Zero) {
            Blockchain.log(`Dumping remaining tokens: ${remainingBigPurchase.toString()}`);
            listTokensForAccount(bigPurchaser, remainingBigPurchase, 117, 9998);
        }

        // Swap remaining 300 reservations from accounts500
        Blockchain.log('Block 117: Swapping remaining 300 reservations');
        for (let i: i32 = 200; i < 500; i++) {
            const account = accounts500[i];
            swapForAccount(account, 117, initialProvider, ACCOUNTS500_RESERVE_AMOUNT);
        }

        // Create 1000 new reservations from original accounts
        Blockchain.log('Block 117: Creating 1000 new reservations');
        for (let i: i32 = 0; i < 1000; i++) {
            const account = accounts1000[i];
            const reservation = reserveForAccount(account, MINIMUM_RESERVE_AMOUNT, 117);

            if (reservation.getProviderCount() === 0) {
                zeroTokenReservations++;
                Blockchain.log(`WARNING: Account ${i} got zero providers in phase 11!`);
            }
        }

        expect(zeroTokenReservations).toStrictEqual(0);

        const quoteAfterPhase11 = getPoolQuote(117);
        quoteHistory.push(quoteAfterPhase11);
        Blockchain.log(`Quote after Phase 11: ${quoteAfterPhase11.toString()}`);

        // Trace queue state after Phase 11
        logQueueState('After Phase 11 (Dump + 300 Swaps + 1000 Reservations)', getQueueState(117));

        // ============== PHASE 12: Concurrent List and Swap ==============
        Blockchain.log('=== PHASE 12: Concurrent list and swap ===');

        // Block 118: Swap 400 + list from accounts500
        // accounts500 reserved 20,000 sats each - their tokens should be worth >= minimum
        Blockchain.log('Block 118: Swap 400 reservations + list from accounts500');

        for (let i: i32 = 0; i < 200; i++) {
            const account = accounts500[i];
            const tokensToList = tokensPhase9.has(u32(i)) ? tokensPhase9.get(u32(i)) : u128.Zero;
            if (tokensToList > u128.Zero) {
                listTokensForAccount(account, tokensToList, 118, u32(2000 + i));
            }
        }
        Blockchain.log('Block 118: Listed tokens from 200 accounts');

        for (let i: i32 = 0; i < 400; i++) {
            const account = accounts1000[i];
            swapForAccount(account, 118, initialProvider, MINIMUM_RESERVE_AMOUNT);
        }

        const quoteAfterBlock118 = getPoolQuote(118);
        quoteHistory.push(quoteAfterBlock118);
        Blockchain.log(`Quote after block 118: ${quoteAfterBlock118.toString()}`);

        // Block 119: Swap 350 + list from more accounts
        Blockchain.log('Block 119: Swap 350 reservations + list from accounts500');

        for (let i: i32 = 200; i < 350; i++) {
            const account = accounts500[i];
            const tokensToList = tokensPhase9.has(u32(i)) ? tokensPhase9.get(u32(i)) : u128.Zero;
            if (tokensToList > u128.Zero) {
                listTokensForAccount(account, tokensToList, 119, u32(2000 + i));
            }
        }
        Blockchain.log('Block 119: Listed tokens from 150 accounts');

        for (let i: i32 = 400; i < 750; i++) {
            const account = accounts1000[i];
            swapForAccount(account, 119, initialProvider, MINIMUM_RESERVE_AMOUNT);
        }

        const quoteAfterBlock119 = getPoolQuote(119);
        quoteHistory.push(quoteAfterBlock119);
        Blockchain.log(`Quote after block 119: ${quoteAfterBlock119.toString()}`);

        // Block 120: Swap remaining 250 + list remaining tokens
        Blockchain.log('Block 120: Swap remaining 250 + list remaining tokens');

        for (let i: i32 = 350; i < 500; i++) {
            const account = accounts500[i];
            const tokensToList = tokensPhase9.has(u32(i)) ? tokensPhase9.get(u32(i)) : u128.Zero;
            if (tokensToList > u128.Zero) {
                listTokensForAccount(account, tokensToList, 120, u32(2000 + i));
            }
        }
        Blockchain.log('Block 120: Listed tokens from 150 accounts');

        for (let i: i32 = 750; i < 1000; i++) {
            const account = accounts1000[i];
            swapForAccount(account, 120, initialProvider, MINIMUM_RESERVE_AMOUNT);
        }

        const quoteAfterPhase12 = getPoolQuote(120);
        quoteHistory.push(quoteAfterPhase12);
        Blockchain.log(`Quote after Phase 12: ${quoteAfterPhase12.toString()}`);

        // Trace queue state after Phase 12
        logQueueState('After Phase 12 (Final State)', getQueueState(120));

        // ============== FINAL ASSERTIONS ==============
        Blockchain.log('=== FINAL ASSERTIONS ===');

        // 1. No zero token reservations
        expect(zeroTokenReservations).toStrictEqual(0);
        Blockchain.log(`Zero token reservations: ${zeroTokenReservations.toString()} (expected: 0)`);

        // 2. Check pool state consistency
        const finalPoolState = getPoolLiquidity(120);
        Blockchain.log(`Final liquidity: ${finalPoolState.liquidity.toString()}`);
        Blockchain.log(`Final reserved: ${finalPoolState.reserved.toString()}`);

        // liquidity should be >= reserved (invariant)
        expect(finalPoolState.liquidity >= finalPoolState.reserved).toBeTruthy();

        // 3. Log quote history for analysis
        Blockchain.log('=== Quote History ===');
        for (let i = 0; i < quoteHistory.length; i++) {
            Blockchain.log(`Quote ${i}: ${quoteHistory[i].toString()}`);
        }

        // 4. Summary
        Blockchain.log('=== TEST COMPLETED SUCCESSFULLY ===');
        Blockchain.log('All swaps executed without reverts');
        Blockchain.log('No zero-token reservations');
        Blockchain.log('Pool state remains consistent');
    });

    it('should handle stress test with small 12 BTC pool', () => {
        // This test uses a much smaller pool (12 BTC) to stress test queue impact
        // Each 10,000 sat reservation = ~0.83% of pool vs ~0.01% in 100 BTC pool

        const SMALL_POOL_TOKEN_AMOUNT: u128 = u128.fromString('1200000000000000000000000'); // 1.2M tokens * 10^18
        // With 12 BTC = 1,200,000,000 sats and 1.2M tokens, floor price = 10^18 / 100,000 = 10^13

        let zeroTokenReservations: u32 = 0;

        // Generate 100 accounts (smaller test due to limited pool)
        const accounts100: ExtendedAddress[] = [];
        for (let i: u32 = 0; i < 100; i++) {
            accounts100.push(generateAccount(i + 5000)); // Different index range to avoid collision
        }

        // ============== PHASE 1: Create Small Pool ==============
        Blockchain.log('=== 12 BTC TEST - PHASE 1: Creating pool with 12 BTC / 1.2M tokens ===');

        setBlockchainEnvironment(200, msgSender1, msgSender1);
        const initialProviderId: u256 = createProviderId(Blockchain.tx.sender, tokenAddress1);
        const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

        // Floor price: 10^18 / 100,000 = 10^13 (100,000 tokens per BTC)
        const floorPrice: u256 = SafeMath.div(
            SafeMath.pow(u256.fromU32(10), u256.fromU32(TOKEN_DECIMALS)),
            u256.fromU32(100000),
        );

        const createPoolOp = new CreatePoolOperation(
            lq.liquidityQueue,
            floorPrice,
            initialProviderId,
            SMALL_POOL_TOKEN_AMOUNT,
            receiverAddress1,
            receiverAddress1CSV,
            0,
            u256.Zero,
            100,
        );

        createPoolOp.execute();
        lq.liquidityQueue.save();
        lq.liquidityQueue.setBlockQuote();
        lq.liquidityQueue.save();

        const initialProvider = getProvider(initialProviderId);

        expect(initialProvider.getLiquidityAmount()).toStrictEqual(SMALL_POOL_TOKEN_AMOUNT);

        logQueueState('12BTC: After Pool Created', getQueueState(200));

        // ============== PHASE 2: 100 accounts reserve minimum ==============
        Blockchain.log('=== 12 BTC TEST - PHASE 2: 100 accounts reserving ===');

        const tokensPhase2: Map<u32, u128> = new Map();

        for (let i: i32 = 0; i < 100; i++) {
            const account = accounts100[i];
            const reservation = reserveForAccount(account, MINIMUM_RESERVE_AMOUNT, 201);

            const reservedTokens = getReservationTotalTokens(reservation);
            tokensPhase2.set(u32(i), reservedTokens);

            if (reservation.getProviderCount() === 0) {
                zeroTokenReservations++;
                Blockchain.log(`WARNING: Account ${i} got zero providers!`);
            }
        }

        expect(zeroTokenReservations).toStrictEqual(0);
        logQueueState('12BTC: After 100 Reservations', getQueueState(201));

        // ============== PHASE 3: Execute all swaps ==============
        Blockchain.log('=== 12 BTC TEST - PHASE 3: Swapping all 100 reservations ===');

        for (let i: i32 = 0; i < 100; i++) {
            const account = accounts100[i];
            swapForAccount(account, 202, initialProvider, MINIMUM_RESERVE_AMOUNT);
        }

        logQueueState('12BTC: After 100 Swaps', getQueueState(202));

        // ============== PHASE 4: Large purchase (1 BTC = 8.3% of pool) ==============
        Blockchain.log('=== 12 BTC TEST - PHASE 4: Large 1 BTC reservation ===');

        const bigPurchaser = generateAccount(9998);
        const reservationBig = reserveForAccount(bigPurchaser, ONE_BTC_IN_SATS, 203);

        const bigPurchaseTokens = getReservationTotalTokens(reservationBig);
        Blockchain.log(`Big purchase reserved: ${bigPurchaseTokens.toString()}`);

        if (reservationBig.getProviderCount() === 0) {
            zeroTokenReservations++;
            Blockchain.log('WARNING: Big purchaser got zero providers!');
        }

        expect(zeroTokenReservations).toStrictEqual(0);
        logQueueState('12BTC: After 1 BTC Reservation', getQueueState(203));

        // ============== PHASE 5: Execute large swap ==============
        Blockchain.log('=== 12 BTC TEST - PHASE 5: Executing 1 BTC swap ===');

        swapForAccount(bigPurchaser, 204, initialProvider, ONE_BTC_IN_SATS);

        logQueueState('12BTC: After 1 BTC Swap', getQueueState(204));

        // ============== PHASE 6: 100 accounts list their tokens ==============
        Blockchain.log('=== 12 BTC TEST - PHASE 6: 100 accounts listing tokens ===');

        for (let i: i32 = 0; i < 100; i++) {
            const account = accounts100[i];
            const tokensToList = tokensPhase2.has(u32(i)) ? tokensPhase2.get(u32(i)) : u128.Zero;
            if (tokensToList > u128.Zero) {
                listTokensForAccount(account, tokensToList, 205, u32(i + 5000));
            }
        }

        logQueueState('12BTC: After 100 Listings', getQueueState(205));

        // ============== PHASE 7: 50 new accounts reserve ==============
        Blockchain.log('=== 12 BTC TEST - PHASE 7: 50 new accounts reserving ===');

        const accounts50: ExtendedAddress[] = [];
        for (let i: u32 = 0; i < 50; i++) {
            accounts50.push(generateAccount(i + 6000));
        }

        const tokensPhase7: Map<u32, u128> = new Map();

        for (let i: i32 = 0; i < 50; i++) {
            const account = accounts50[i];
            const reservation = reserveForAccount(account, ACCOUNTS500_RESERVE_AMOUNT, 206);

            const reservedTokens = getReservationTotalTokens(reservation);
            tokensPhase7.set(u32(i), reservedTokens);

            if (reservation.getProviderCount() === 0) {
                zeroTokenReservations++;
                Blockchain.log(`WARNING: New account ${i} got zero providers!`);
            }
        }

        expect(zeroTokenReservations).toStrictEqual(0);
        logQueueState('12BTC: After 50 New Reservations', getQueueState(206));

        // ============== PHASE 8: Big purchaser dumps + 50 swaps ==============
        Blockchain.log('=== 12 BTC TEST - PHASE 8: Dump + swaps ===');

        // List all tokens from big purchase
        Blockchain.log(`Dumping big purchase tokens: ${bigPurchaseTokens.toString()}`);
        listTokensForAccount(bigPurchaser, bigPurchaseTokens, 207, 9998);

        // Swap all 50 reservations
        for (let i: i32 = 0; i < 50; i++) {
            const account = accounts50[i];
            swapForAccount(account, 207, initialProvider, ACCOUNTS500_RESERVE_AMOUNT);
        }

        logQueueState('12BTC: After Dump + 50 Swaps', getQueueState(207));

        // ============== PHASE 9: 50 accounts list + 100 new reservations ==============
        Blockchain.log('=== 12 BTC TEST - PHASE 9: List + new reservations ===');

        // List from accounts50
        for (let i: i32 = 0; i < 50; i++) {
            const account = accounts50[i];
            const tokensToList = tokensPhase7.has(u32(i)) ? tokensPhase7.get(u32(i)) : u128.Zero;
            if (tokensToList > u128.Zero) {
                listTokensForAccount(account, tokensToList, 208, u32(i + 6000));
            }
        }

        // 100 new reservations from original accounts
        for (let i: i32 = 0; i < 100; i++) {
            const account = accounts100[i];
            const reservation = reserveForAccount(account, MINIMUM_RESERVE_AMOUNT, 208);

            if (reservation.getProviderCount() === 0) {
                zeroTokenReservations++;
                Blockchain.log(`WARNING: Account ${i} got zero providers in phase 9!`);
            }
        }

        expect(zeroTokenReservations).toStrictEqual(0);
        logQueueState('12BTC: After List + 100 Reservations', getQueueState(208));

        // ============== PHASE 10: Final swaps ==============
        Blockchain.log('=== 12 BTC TEST - PHASE 10: Final 100 swaps ===');

        for (let i: i32 = 0; i < 100; i++) {
            const account = accounts100[i];
            swapForAccount(account, 209, initialProvider, MINIMUM_RESERVE_AMOUNT);
        }

        logQueueState('12BTC: Final State', getQueueState(209));

        // ============== FINAL ASSERTIONS ==============
        Blockchain.log('=== 12 BTC TEST - FINAL ASSERTIONS ===');

        expect(zeroTokenReservations).toStrictEqual(0);
        Blockchain.log(`Zero token reservations: ${zeroTokenReservations} (expected: 0)`);

        const finalPoolState = getPoolLiquidity(209);
        Blockchain.log(`Final liquidity: ${finalPoolState.liquidity.toString()}`);
        Blockchain.log(`Final reserved: ${finalPoolState.reserved.toString()}`);

        expect(finalPoolState.liquidity >= finalPoolState.reserved).toBeTruthy();

        Blockchain.log('=== 12 BTC TEST COMPLETED SUCCESSFULLY ===');
    });
});
