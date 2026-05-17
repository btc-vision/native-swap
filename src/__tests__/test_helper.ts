import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    ConsensusRules,
    ExtendedAddress,
    Networks,
    StoredBooleanArray,
    StoredU128Array,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { getProvider, Provider } from '../models/Provider';
import { Reservation } from '../models/Reservation';
import { LiquidityQueue } from '../managers/LiquidityQueue';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import { TickBitmapManager } from '../managers/TickBitmapManager';
import { ReservationManager } from '../managers/ReservationManager';
import { TradeManager } from '../managers/TradeManager';

import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { ILiquidityQueueReserve } from '../managers/interfaces/ILiquidityQueueReserve';
import { ITickBitmapManager } from '../managers/interfaces/ITickBitmapManager';
import { ITradeManager } from '../managers/interfaces/ITradeManager';

import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';

import { AT_LEAST_PROVIDERS_TO_PURGE, CSV_BLOCKS_REQUIRED } from '../constants/Contract';

// Network MUST be set before module-level toCSV(...) calls below — those
// reach into Network.hrp(Blockchain.network) at init time.
Blockchain.network = Networks.Regtest;

// ============================================================================
// Canonical addresses (preserved verbatim from the old harness so existing
// specs keep their fixtures stable)
// ============================================================================

export const testStackingContractAddress: Address = new Address([
    99, 103, 209, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101, 220, 185,
    192, 64, 105, 97, 112, 200, 3, 234, 133, 17, 88,
]);

export const providerAddress1: ExtendedAddress = new ExtendedAddress(
    [
        68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101, 220,
        185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
    ],
    [
        3, 153, 66, 199, 127, 168, 221, 3, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101, 220, 185,
        192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 2,
    ],
);
export const provider1BTCReceiveAddress: string = 'provider1BTCReceiveAddress';

export const providerAddress2: ExtendedAddress = new ExtendedAddress(
    [
        196, 73, 104, 227, 216, 12, 216, 134, 87, 166, 168, 44, 5, 101, 71, 69, 204, 213, 154, 86,
        76, 124, 186, 77, 90, 216, 39, 6, 239, 122, 100, 1,
    ],
    [
        1, 73, 104, 227, 216, 12, 216, 134, 87, 166, 168, 44, 5, 101, 71, 69, 204, 213, 154, 86, 76,
        124, 186, 77, 90, 216, 39, 6, 239, 122, 2, 1,
    ],
);
export const provider2BTCReceiveAddress: string = 'provider2BTCReceiveAddress';

export const providerAddress3: ExtendedAddress = new ExtendedAddress(
    [
        84, 79, 41, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71,
        53, 209, 126, 10, 49, 77, 37, 107, 101, 113, 216,
    ],
    [
        4, 79, 41, 213, 125, 76, 182, 184, 94, 6, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71,
        53, 209, 126, 10, 49, 77, 37, 107, 101, 113, 23,
    ],
);
export const provider3BTCReceiveAddress: string = 'provider3BTCReceiveAddress';

export const providerAddress4: ExtendedAddress = new ExtendedAddress(
    [
        43, 11, 41, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71,
        53, 209, 126, 10, 49, 77, 37, 107, 101, 67, 34,
    ],
    [
        6, 11, 41, 213, 125, 76, 182, 184, 94, 6, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71,
        53, 209, 126, 10, 49, 77, 37, 107, 101, 67, 8,
    ],
);
export const provider4BTCReceiveAddress: string = 'provider4BTCReceiveAddress';

export const providerAddress5: ExtendedAddress = new ExtendedAddress(
    [
        65, 22, 41, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71,
        53, 209, 126, 10, 49, 77, 37, 107, 101, 67, 1,
    ],
    [
        2, 22, 41, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71,
        53, 209, 126, 10, 49, 77, 37, 107, 101, 67, 9,
    ],
);
export const provider5BTCReceiveAddress: string = 'provider5BTCReceiveAddress';

export const providerAddress6: ExtendedAddress = new ExtendedAddress(
    [
        87, 33, 11, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71,
        53, 209, 126, 10, 49, 77, 37, 107, 89, 67, 88,
    ],
    [
        4, 33, 11, 213, 125, 76, 182, 184, 94, 85, 157, 6, 19, 45, 4, 70, 179, 164, 179, 31, 71, 53,
        209, 126, 10, 49, 77, 37, 107, 89, 67, 88,
    ],
);
export const provider6BTCReceiveAddress: string = 'provider6BTCReceiveAddress';

export const providerAddress7: ExtendedAddress = new ExtendedAddress(
    [
        210, 23, 12, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71,
        53, 209, 126, 10, 49, 77, 37, 107, 101, 67, 88,
    ],
    [
        5, 23, 12, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71,
        53, 209, 126, 10, 49, 77, 37, 107, 101, 67, 5,
    ],
);
export const provider7BTCReceiveAddress: string = 'provider7BTCReceiveAddress';

export const msgSender1: ExtendedAddress = new ExtendedAddress(
    [
        56, 172, 228, 82, 23, 145, 109, 98, 102, 186, 35, 65, 115, 253, 83, 104, 64, 71, 143, 47,
        250, 36, 107, 117, 250, 119, 149, 253, 56, 102, 51, 108,
    ],
    [
        56, 172, 228, 82, 23, 145, 109, 98, 102, 186, 35, 65, 115, 253, 83, 104, 64, 71, 143, 47,
        250, 36, 107, 117, 250, 119, 149, 253, 56, 102, 51, 107,
    ],
);

export const contractDeployer1: Address = new Address([
    204, 190, 163, 95, 110, 134, 1, 4, 104, 204, 197, 231, 62, 122, 115, 178, 237, 191, 201, 77,
    105, 55, 36, 40, 108, 255, 168, 146, 19, 124, 126, 173,
]);

export const contractAddress1: Address = new Address([
    88, 191, 35, 122, 155, 141, 248, 53, 37, 62, 101, 60, 10, 84, 39, 102, 23, 187, 180, 182, 82,
    28, 17, 107, 182, 139, 162, 187, 102, 146, 120, 99,
]);

export const txId1: Uint8Array = new Uint8Array(32);
txId1.set([
    233, 46, 113, 133, 187, 115, 218, 211, 63, 34, 178, 231, 36, 25, 22, 110, 165, 124, 122, 201,
    247, 233, 124, 41, 254, 64, 210, 16, 98, 89, 139, 181,
]);

export const txHash1: Uint8Array = new Uint8Array(32);
txHash1.set([
    233, 46, 113, 133, 187, 115, 218, 211, 63, 34, 178, 231, 36, 25, 22, 110, 165, 124, 122, 201,
    247, 233, 124, 41, 254, 64, 210, 16, 98, 89, 139, 181,
]);

export const txId2: Uint8Array = new Uint8Array(32);
txId2.set([
    189, 155, 208, 203, 149, 250, 116, 136, 30, 209, 224, 135, 201, 167, 123, 33, 172, 230, 39, 99,
    88, 244, 46, 38, 51, 187, 34, 141, 149, 4, 181, 150,
]);

export const tokenAddress1: Address = new Address([
    229, 26, 76, 180, 38, 124, 121, 223, 102, 39, 240, 138, 176, 156, 20, 68, 31, 90, 205, 152, 6,
    72, 189, 57, 202, 110, 217, 180, 106, 177, 172, 45,
]);
export const tokenIdUint8Array1: Uint8Array = ripemd160(tokenAddress1);

export const tokenAddress2: Address = new Address([
    222, 40, 197, 58, 44, 174, 172, 146, 11, 2, 236, 98, 173, 123, 172, 221, 45, 8, 99, 251, 190,
    151, 230, 90, 170, 2, 198, 68, 224, 254, 129, 245,
]);

export const ownerAddress1: ExtendedAddress = new ExtendedAddress(
    [
        221, 41, 197, 58, 44, 174, 172, 146, 11, 2, 236, 98, 173, 123, 172, 221, 45, 8, 99, 251,
        190, 151, 230, 90, 170, 2, 198, 68, 224, 254, 129, 240,
    ],
    [
        2, 41, 197, 58, 44, 174, 172, 146, 11, 2, 236, 98, 173, 123, 172, 221, 45, 8, 99, 251, 190,
        151, 230, 90, 170, 2, 198, 68, 224, 254, 129, 239,
    ],
);

export const receiverAddress1: Uint8Array = new Uint8Array(33);
receiverAddress1.set([
    0x02, 0x03, 0x73, 0x62, 0x6d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10, 0x68,
    0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x67, 0x0a, 0xf5,
    0x2c,
]);
export const receiverAddress1CSV: string = ExtendedAddress.toCSV(
    receiverAddress1,
    CSV_BLOCKS_REQUIRED,
);

export const receiverAddress2: Uint8Array = new Uint8Array(33);
receiverAddress2.set([
    0x22, 0x33, 0x83, 0x62, 0x6d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10, 0x68,
    0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x67, 0x0b, 0xf6,
    0x2d,
]);
export const receiverAddress2CSV: string = ExtendedAddress.toCSV(
    receiverAddress2,
    CSV_BLOCKS_REQUIRED,
);

export const receiverAddress3: Uint8Array = new Uint8Array(33);
receiverAddress3.set([
    0x32, 0x43, 0x93, 0x72, 0x6d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10, 0x68,
    0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x57, 0x1b, 0xe6,
    0x1d,
]);
export const receiverAddress3CSV: string = ExtendedAddress.toCSV(
    receiverAddress3,
    CSV_BLOCKS_REQUIRED,
);

export const receiverAddress4: Uint8Array = new Uint8Array(33);
receiverAddress4.set([
    0x62, 0x63, 0x63, 0x12, 0x5d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10, 0x68,
    0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x67, 0x03, 0xf4,
    0x25,
]);
export const receiverAddress4CSV: string = ExtendedAddress.toCSV(
    receiverAddress4,
    CSV_BLOCKS_REQUIRED,
);

export const receiverAddress5: Uint8Array = new Uint8Array(33);
receiverAddress5.set([
    0x72, 0x63, 0x43, 0x82, 0x3d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10, 0x68,
    0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x67, 0x12, 0x44,
    0x1e,
]);
export const receiverAddress5CSV: string = ExtendedAddress.toCSV(
    receiverAddress5,
    CSV_BLOCKS_REQUIRED,
);

// ============================================================================
// ID derivation
// ============================================================================

export function addressToPointerU256(address: Address, token: Address): u256 {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(address);
    writer.writeAddress(token);
    return u256.fromBytes(sha256(writer.getBuffer()), true);
}

export function createProviderId(providerAddress: Address, tokenAddress: Address): u256 {
    return addressToPointerU256(providerAddress, tokenAddress);
}

export function createReservationId(tokenAddress: Address, providerAddress: Address): u128 {
    const reservationArrayId: Uint8Array = Reservation.generateId(tokenAddress, providerAddress);
    return u128.fromBytes(reservationArrayId, true);
}

// ============================================================================
// Provider creation — refactored to drop priority/LP flags, add priceTick
// ============================================================================

/**
 * Build a provider against `tokenAddress`. Activates the provider, sets
 * `priceTick` (default 0), `liquidityAmount`, `reservedAmount`, BTC receiver.
 *
 * Compared to the old pre-refactor helper, this drops:
 *   - `_pendingRemoval`, `_isLP`, `canProvideLiquidity`  (AMM init flow gone)
 *   - `_liquidityProvided`                                (virtual-BTC tracking gone)
 *   - `isPriority`                                        (priority queue gone)
 *
 * Adds:
 *   - `priceTick: i32`                                    (new tick-based pricing)
 */
/**
 * Compatibility shim: accepts the OLD pre-refactor 12-arg shape so existing
 * specs keep compiling. Dropped concepts (`_pendingRemoval`, `_isLP`,
 * `canProvideLiquidity`, `_liquidityProvided`, `isPriority`) are silently
 * ignored — they referenced AMM-era state that doesn't exist anymore.
 *
 * New tick field is set to 0 by default. Specs that need a non-zero tick
 * should call `provider.setPriceTick(...)` afterward.
 */
export function createProvider(
    providerAddress: Address,
    tokenAddress: Address,
    _pendingRemoval: boolean = false,
    _isLP: boolean = false,
    _canProvideLiquidity: boolean = false,
    btcReceiver: string = 'e123e2d23d233',
    _liquidityProvided: u128 = u128.Zero,
    liquidity: u128 = u128.fromU64(1000),
    reserved: u128 = u128.fromU64(0),
    isActive: bool = true,
    _isPriority: bool = false,
    toReset: bool = false,
): Provider {
    const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
    const provider: Provider = getProvider(providerId);

    if (isActive) provider.activate();
    else provider.deactivate();

    if (toReset) provider.markToReset();
    else provider.clearToReset();

    provider.setPriceTick(0);
    provider.setLiquidityAmount(liquidity);
    provider.setReservedAmount(reserved);
    provider.setBtcReceiver(btcReceiver);

    return provider;
}

/**
 * Build N synthetic providers against `tokenAddress1` with deterministic
 * addresses (just bumps a byte). All share the same `liquidity` / `priceTick`.
 */
/**
 * Compatibility shim — same OLD shape as the original `createProviders`.
 * Dropped concepts are accepted but ignored.
 */
export function createProviders(
    nbProviderToAdd: u8,
    startIndex: u8 = 0,
    _pendingRemoval: boolean = false,
    _isLP: boolean = false,
    _canProvideLiquidity: boolean = true,
    btcReceiver: string = 'e123e2d23d233',
    _liquidityProvided: u128 = u128.Zero,
    liquidity: u128 = u128.fromU64(1000),
    reserved: u128 = u128.fromU64(0),
    isActive: bool = true,
    _isPriority: bool = false,
    toReset: bool = false,
): Provider[] {
    const providers: Provider[] = [];

    for (let i: u8 = startIndex; i < nbProviderToAdd + startIndex; i++) {
        const address: Address = new Address([
            68,
            153,
            66,
            199,
            127,
            168,
            221,
            199,
            156,
            120,
            43,
            34,
            88,
            0,
            29,
            93,
            123,
            133,
            101,
            220,
            185,
            192,
            64,
            105,
            97,
            112,
            200,
            3,
            234,
            133,
            61,
            i,
        ]);
        const provider = createProvider(
            address,
            tokenAddress1,
            _pendingRemoval,
            _isLP,
            _canProvideLiquidity,
            btcReceiver,
            _liquidityProvided,
            liquidity,
            reserved,
            isActive,
            _isPriority,
            toReset,
        );
        providers.push(provider);
    }
    return providers;
}

// ============================================================================
// Blockchain environment mocking
// ============================================================================

const regtestChainId = new Uint8Array(32);
regtestChainId.set([
    0x0f, 0x91, 0x88, 0xf1, 0x3c, 0xb7, 0xb2, 0xc7, 0x1f, 0x2a, 0x33, 0x5e, 0x3a, 0x4f, 0xc3, 0x28,
    0xbf, 0x5b, 0xeb, 0x43, 0x60, 0x12, 0xaf, 0xca, 0x59, 0x0b, 0x1a, 0x11, 0x46, 0x6e, 0x22, 0x06,
]);

const consensusRules = new ConsensusRules();
consensusRules.insertFlag(ConsensusRules.UNSAFE_QUANTUM_SIGNATURES_ALLOWED);

export function setBlockchainEnvironment(
    currentBlock: u64,
    sender: Address = msgSender1,
    origin: ExtendedAddress = msgSender1,
): void {
    const medianTimestamp: u64 = 87129871;
    const writer: BytesWriter = new BytesWriter(
        32 +
            2 * U64_BYTE_LENGTH +
            4 * ADDRESS_BYTE_LENGTH +
            txId1.length +
            txHash1.length +
            64 +
            32 +
            8,
    );

    writer.writeBytes(new Uint8Array(32));
    writer.writeU64(currentBlock);
    writer.writeU64(medianTimestamp);

    writer.writeBytes(txId1);
    writer.writeBytes(txHash1);

    writer.writeAddress(contractAddress1);
    writer.writeAddress(contractDeployer1);

    writer.writeAddress(sender);
    writer.writeAddress(origin);

    writer.writeBytes(regtestChainId);
    writer.writeBytes(new Uint8Array(32));
    writer.writeBytes(origin.tweakedPublicKey);
    writer.writeU64(consensusRules.asU64());

    Blockchain.setEnvironmentVariables(writer.getBuffer());
}

export function createReservation(token: Address, owner: Address): Reservation {
    const reservation: Reservation = new Reservation(token, owner);
    reservation.setCreationBlock(Blockchain.block.number);
    return reservation;
}

// ============================================================================
// Manager construction — post-refactor architecture
// ============================================================================

/**
 * Public-facing test interface for LiquidityQueue. Adds mock hooks used by the
 * specs that need to short-circuit `getNextProviderWithLiquidity` or read
 * private state.
 */
export interface ITestLiquidityQueue extends ILiquidityQueue {
    mockGetNextProviderWithLiquidity(p: Provider | null): void;
    // Old-name alias for spec compatibility
    mockgetNextProviderWithLiquidity(p: Provider | null): void;
    setLiquidity(value: u256): void;
    purgeCalled(): boolean;
    updateCalled(): boolean;
}

export class TestLiquidityQueue extends LiquidityQueue implements ITestLiquidityQueue {
    private _mockedNextProvider: Provider | null = null;
    private _purgeCalled: boolean = false;

    public mockGetNextProviderWithLiquidity(p: Provider | null): void {
        this._mockedNextProvider = p;
    }

    // Old-name alias preserved so existing specs don't need renaming.
    public mockgetNextProviderWithLiquidity(p: Provider | null): void {
        this._mockedNextProvider = p;
    }

    public override getNextProviderWithLiquidity(): Provider | null {
        if (this._mockedNextProvider !== null) return this._mockedNextProvider;
        return super.getNextProviderWithLiquidity();
    }

    public override purgeReservationsAndRestoreProviders(): void {
        this._purgeCalled = true;
        super.purgeReservationsAndRestoreProviders();
    }

    public setLiquidity(value: u256): void {
        // Surface for tests; uses the protected liquidityQueueReserve handle.
        // Since `liquidity` setter exists on LiquidityQueueReserve, route through it.
        // @ts-ignore — accessing protected field across same package boundary
        this.liquidityQueueReserve.liquidity = value;
    }

    public purgeCalled(): boolean {
        return this._purgeCalled;
    }

    /** @deprecated kept for compat — `updateVirtualPoolIfNeeded` removed in refactor */
    public updateCalled(): boolean {
        return false;
    }
}

export class TestReservationManager extends ReservationManager {
    private _purgeCalled: boolean = false;

    public override purgeReservationsAndRestoreProviders(lastPurgedBlock: u64): u64 {
        this._purgeCalled = true;
        return super.purgeReservationsAndRestoreProviders(lastPurgedBlock);
    }

    public purgeCalled(): boolean {
        return this._purgeCalled;
    }

    public lastBlockReservation(): u64 {
        const length: u32 = this.blocksWithReservations.getLength();
        if (length > 0) return this.blocksWithReservations.get(length - 1);
        return u64.MAX_VALUE;
    }

    public setAtLeastProvidersToPurge(value: u32): void {
        this.atLeastProvidersToPurge = value;
    }

    /** @deprecated kept for compat with pre-refactor specs (push-list index mocking) */
    public mockAddToListReturn(_index: u32): void {
        // no-op: the new ReservationManager doesn't expose this hook
    }

    /** @deprecated kept for compat */
    public mockAddToActiveListReturn(_index: u32): void {
        // no-op
    }

    /** Test surface — exposes the protected per-block reservation list. */
    public callgetReservationListForBlock(blockNumber: u64): StoredU128Array {
        // @ts-ignore — accessing protected method for tests
        return this.getReservationListForBlock(blockNumber);
    }

    /** Test surface — exposes the protected per-block active flags array. */
    public callgetActiveListForBlock(blockNumber: u64): StoredBooleanArray {
        // @ts-ignore — accessing protected method for tests
        return this.getActiveListForBlock(blockNumber);
    }
}

export class TestTickBitmapManager extends TickBitmapManager {
    // Hook surface — currently empty. Specs read state via the parent's public API.
}

export class CreateLiquidityQueueResult {
    public liquidityQueue: ITestLiquidityQueue;
    public tradeManager: ITradeManager;
    public tickBitmapManager: ITickBitmapManager;
    public reservationManager: TestReservationManager;
    public liquidityQueueReserve: ILiquidityQueueReserve;

    constructor(
        liquidityQueue: ITestLiquidityQueue,
        tradeManager: ITradeManager,
        tickBitmapManager: ITickBitmapManager,
        reservationManager: TestReservationManager,
        liquidityQueueReserve: ILiquidityQueueReserve,
    ) {
        this.liquidityQueue = liquidityQueue;
        this.tradeManager = tradeManager;
        this.tickBitmapManager = tickBitmapManager;
        this.reservationManager = reservationManager;
        this.liquidityQueueReserve = liquidityQueueReserve;
    }
}

/**
 * Wire the post-refactor stack against `(token, tokenId)`:
 *   LiquidityQueueReserve  ← in-memory reserve counters
 *   TickBitmapManager       ← bitmap + per-tick FIFO/purged + global fulfilled
 *   ReservationManager      ← per-block index + incremental purge
 *   LiquidityQueue          ← façade tying all three
 *   TradeManager            ← settlement
 *
 * Returns a bundle so specs can exercise managers individually or via the façade.
 */
export function createLiquidityQueue(
    token: Address,
    tokenId: Uint8Array,
    purgeOldReservations: boolean,
    timeoutEnabled: boolean = false,
): CreateLiquidityQueueResult {
    const liquidityQueueReserve: ILiquidityQueueReserve = new LiquidityQueueReserve(token, tokenId);

    const tickBitmapManager: ITickBitmapManager = new TestTickBitmapManager(
        token,
        tokenId,
        liquidityQueueReserve,
    );

    const reservationManager = new TestReservationManager(
        token,
        tokenId,
        tickBitmapManager,
        liquidityQueueReserve,
        AT_LEAST_PROVIDERS_TO_PURGE,
    );

    const liquidityQueue: ITestLiquidityQueue = new TestLiquidityQueue(
        token,
        tokenId,
        tickBitmapManager,
        liquidityQueueReserve,
        reservationManager,
        purgeOldReservations,
        timeoutEnabled,
    );

    const tradeManager: ITradeManager = new TradeManager(
        tickBitmapManager,
        liquidityQueueReserve,
        reservationManager,
    );

    return new CreateLiquidityQueueResult(
        liquidityQueue,
        tradeManager,
        tickBitmapManager,
        reservationManager,
        liquidityQueueReserve,
    );
}

// ============================================================================
// Subclass hooks used by specific specs
// ============================================================================

export class TestReserveLiquidityOperation extends ReserveLiquidityOperation {
    private mockedLimitByAvailableLiquidity: u256 = u256.Zero;
    private isLimitByAvailableLiquidityMocked: boolean = false;

    public getReservedProviderCount(): u8 {
        // @ts-ignore accessing protected field for assertion
        return this.reservedProviderCount;
    }

    /** @deprecated kept for compat with pre-refactor specs */
    public setRemainingTokens(_value: u256): void {
        // The new reserve walk doesn't track remainingTokens externally; this is a no-op shim.
    }

    /** @deprecated kept for compat — `currentQuote` removed in refactor */
    public setCurrentQuote(_quote: u256): void {
        // no-op
    }

    /** @deprecated kept for compat; routes to the new internal walk if the API still exists */
    public callReserveFromProvider(
        _reservation: Reservation,
        _provider: Provider,
        _quote: u256,
    ): void {
        // no-op: in the new arch the walk is driven entirely from `execute()`
    }

    public mockLimitByAvailableLiquidity(tokensToReturn: u256): void {
        this.isLimitByAvailableLiquidityMocked = true;
        this.mockedLimitByAvailableLiquidity = tokensToReturn;
    }
}

export class TestListTokenForSaleOperation extends ListTokensForSaleOperation {}
