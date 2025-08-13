import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    Networks,
    StoredBooleanArray,
    StoredU128Array,
    StoredU256Array,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../models/Provider';
import { Reservation } from '../models/Reservation';
import { LiquidityQueue } from '../managers/LiquidityQueue';
import { ProviderManager } from '../managers/ProviderManager';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import {
    AT_LEAST_PROVIDERS_TO_PURGE,
    CSV_BLOCKS_REQUIRED,
    ENABLE_INDEX_VERIFICATION,
} from '../constants/Contract';
import { ProviderQueue } from '../managers/ProviderQueue';

import { IQuoteManager } from '../managers/interfaces/IQuoteManager';
import { ILiquidityQueueReserve } from '../managers/interfaces/ILiquidityQueueReserve';
import { IProviderManager } from '../managers/interfaces/IProviderManager';
import { IReservationManager } from '../managers/interfaces/IReservationManager';
import { IDynamicFee } from '../managers/interfaces/IDynamicFee';
import { TradeManager } from '../managers/TradeManager';
import { QuoteManager } from '../managers/QuoteManager';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import { ReservationManager } from '../managers/ReservationManager';
import { DynamicFee } from '../managers/DynamicFee';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { ITradeManager } from '../managers/interfaces/ITradeManager';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';

// IF YOU CHANGE NETWORK MAKE SURE TO CHANGE THIS AS WELL.
Blockchain.network = Networks.Regtest;

export const testStackingContractAddress: Address = new Address([
    99, 103, 209, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101, 220, 185,
    192, 64, 105, 97, 112, 200, 3, 234, 133, 17, 88,
]);

export const providerAddress1: Address = new Address([
    68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101, 220, 185,
    192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
]);

export const providerAddress2: Address = new Address([
    196, 73, 104, 227, 216, 12, 216, 134, 87, 166, 168, 44, 5, 101, 71, 69, 204, 213, 154, 86, 76,
    124, 186, 77, 90, 216, 39, 6, 239, 122, 100, 1,
]);

export const providerAddress3: Address = new Address([
    84, 79, 41, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71, 53,
    209, 126, 10, 49, 77, 37, 107, 101, 113, 216,
]);

export const providerAddress4: Address = new Address([
    43, 11, 41, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71, 53,
    209, 126, 10, 49, 77, 37, 107, 101, 67, 34,
]);

export const providerAddress5: Address = new Address([
    109, 98, 200, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71,
    53, 209, 126, 10, 49, 77, 37, 107, 101, 67, 211,
]);

export const providerAddress6: Address = new Address([
    200, 33, 11, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71, 53,
    209, 126, 10, 49, 77, 37, 107, 101, 67, 88,
]);

export const providerAddress7: Address = new Address([
    210, 23, 12, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71, 53,
    209, 126, 10, 49, 77, 37, 107, 101, 67, 88,
]);

export const msgSender1: Address = new Address([
    56, 172, 228, 82, 23, 145, 109, 98, 102, 186, 35, 65, 115, 253, 83, 104, 64, 71, 143, 47, 250,
    36, 107, 117, 250, 119, 149, 253, 56, 102, 51, 108,
]);

export const txOrigin1: Address = new Address([
    113, 221, 31, 226, 33, 248, 28, 254, 8, 16, 106, 44, 26, 240, 107, 94, 38, 154, 85, 230, 151,
    248, 2, 44, 146, 20, 195, 28, 32, 155, 140, 210,
]);

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
export const tokenId1: u256 = u256.fromBytes(tokenAddress1, true);

export const tokenAddress2: Address = new Address([
    222, 40, 197, 58, 44, 174, 172, 146, 11, 2, 236, 98, 173, 123, 172, 221, 45, 8, 99, 251, 190,
    151, 230, 90, 170, 2, 198, 68, 224, 254, 129, 245,
]);
export const tokenIdUint8Array2: Uint8Array = ripemd160(tokenAddress2);
export const tokenId2: u256 = u256.fromBytes(tokenAddress2, true);

export const ownerAddress1: Address = new Address([
    221, 41, 197, 58, 44, 174, 172, 146, 11, 2, 236, 98, 173, 123, 172, 221, 45, 8, 99, 251, 190,
    151, 230, 90, 170, 2, 198, 68, 224, 254, 129, 240,
]);

export const ownerAddress2: Address = new Address([
    214, 32, 197, 58, 44, 174, 172, 146, 11, 2, 236, 98, 173, 123, 172, 221, 45, 8, 99, 251, 190,
    151, 230, 90, 170, 2, 198, 68, 224, 254, 129, 24,
]);

export const ownerAddress3: Address = new Address([
    116, 12, 197, 58, 44, 174, 172, 146, 11, 2, 236, 98, 173, 123, 172, 221, 45, 8, 99, 251, 190,
    151, 230, 90, 170, 2, 198, 68, 224, 254, 129, 34,
]);

export const receiverAddress1: Uint8Array = new Uint8Array(33);
receiverAddress1.set([
    0x02, 0x03, 0x73, 0x62, 0x6d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10, 0x68,
    0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x67, 0x0a, 0xf5,
    0x2c,
]);

export const receiverAddress1CSV: string = Address.toCSV(receiverAddress1, CSV_BLOCKS_REQUIRED);

export const receiverAddress2: Uint8Array = new Uint8Array(33);
receiverAddress2.set([
    0x22, 0x33, 0x83, 0x62, 0x6d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10, 0x68,
    0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x67, 0x0b, 0xf6,
    0x2d,
]);
export const receiverAddress2CSV: string = Address.toCSV(receiverAddress2, CSV_BLOCKS_REQUIRED);

export const receiverAddress3: Uint8Array = new Uint8Array(33);
receiverAddress3.set([
    0x32, 0x43, 0x93, 0x72, 0x6d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10, 0x68,
    0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x57, 0x1b, 0xe6,
    0x1d,
]);
export const receiverAddress3CSV: string = Address.toCSV(receiverAddress3, CSV_BLOCKS_REQUIRED);

export const receiverAddress4: Uint8Array = new Uint8Array(33);
receiverAddress4.set([
    0x62, 0x63, 0x63, 0x12, 0x5d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10, 0x68,
    0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x67, 0x03, 0xf4,
    0x25,
]);
export const receiverAddress4CSV: string = Address.toCSV(receiverAddress4, CSV_BLOCKS_REQUIRED);

export const receiverAddress5: Uint8Array = new Uint8Array(33);
receiverAddress5.set([
    0x72, 0x63, 0x43, 0x82, 0x3d, 0x31, 0x7a, 0xe8, 0x78, 0x8c, 0xe3, 0x28, 0x0b, 0x49, 0x10, 0x68,
    0x61, 0x0d, 0x84, 0x0c, 0x23, 0xec, 0xb6, 0x4c, 0x14, 0x07, 0x5b, 0xbb, 0x9f, 0x67, 0x12, 0x44,
    0x1e,
]);
export const receiverAddress5CSV: string = Address.toCSV(receiverAddress5, CSV_BLOCKS_REQUIRED);

export function addressToPointerU256(address: Address, token: Address): u256 {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(address);
    writer.writeAddress(token);
    return u256.fromBytes(sha256(writer.getBuffer()), true);
}

export function createProviderId(providerAddress: Address, tokenAddress: Address): u256 {
    return addressToPointerU256(providerAddress, tokenAddress);
}

export function createProvider(
    providerAddress: Address,
    tokenAddress: Address,
    _pendingRemoval: boolean = false,
    _isLP: boolean = false,
    canProvideLiquidity: boolean = false,
    btcReceiver: string = 'e123e2d23d233',
    _liquidityProvided: u128 = u128.Zero,
    liquidity: u128 = u128.fromU64(1000),
    reserved: u128 = u128.fromU64(0),
    isActive: bool = true,
    isPriority: bool = false,
): Provider {
    const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
    const provider: Provider = getProvider(providerId);

    if (isActive) {
        provider.activate();
    } else {
        provider.deactivate();
    }

    if (isPriority) {
        provider.markPriority();
    } else {
        provider.clearPriority();
    }

    provider.setLiquidityAmount(liquidity);
    provider.setReservedAmount(reserved);
    provider.setBtcReceiver(btcReceiver);

    if (canProvideLiquidity) {
        provider.allowLiquidityProvision();
    } else {
        provider.disallowLiquidityProvision();
    }

    return provider;
}

export function createPriorityProvider(providerAddress: Address, tokenAddress: Address): Provider {
    return createProvider(
        providerAddress,
        tokenAddress,
        false,
        false,
        false,
        '33333333',
        u128.Zero,
        u128.Zero,
        u128.Zero,
        true,
        true,
    );
}

export function createProviders(
    nbProviderToAdd: u8,
    startIndex: u8 = 0,
    pendingRemoval: boolean = false,
    isLP: boolean = false,
    canProvideLiquidity: boolean = true,
    btcReceiver: string = 'e123e2d23d233',
    liquidityProvided: u128 = u128.Zero,
    liquidity: u128 = u128.fromU64(1000),
    reserved: u128 = u128.fromU64(0),
    isActive: bool = true,
    isPriority: bool = false,
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
            pendingRemoval,
            isLP,
            canProvideLiquidity,
            btcReceiver,
            liquidityProvided,
            liquidity,
            reserved,
            isActive,
            isPriority,
        );

        providers.push(provider);
    }

    return providers;
}

export function createReservationId(tokenAddress: Address, providerAddress: Address): u128 {
    const reservationArrayId: Uint8Array = Reservation.generateId(tokenAddress, providerAddress);

    return u128.fromBytes(reservationArrayId, true);
}

const regtestChainId = new Uint8Array(32);
regtestChainId.set([
    0x0f, 0x91, 0x88, 0xf1, 0x3c, 0xb7, 0xb2, 0xc7, 0x1f, 0x2a, 0x33, 0x5e, 0x3a, 0x4f, 0xc3, 0x28,
    0xbf, 0x5b, 0xeb, 0x43, 0x60, 0x12, 0xaf, 0xca, 0x59, 0x0b, 0x1a, 0x11, 0x46, 0x6e, 0x22, 0x06,
]);

export function setBlockchainEnvironment(
    currentBlock: u64,
    sender: Address = msgSender1,
    origin: Address = msgSender1,
): void {
    const medianTimestamp: u64 = 87129871;
    const writer: BytesWriter = new BytesWriter(
        32 + 2 * U64_BYTE_LENGTH + 4 * ADDRESS_BYTE_LENGTH + txId1.length + txHash1.length + 64,
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

    writer.writeBytes(regtestChainId); // chain id
    writer.writeBytes(new Uint8Array(32)); // protocol id

    Blockchain.setEnvironmentVariables(writer.getBuffer());
}

export function createReservation(token: Address, owner: Address): Reservation {
    const reservation: Reservation = new Reservation(token, owner);

    reservation.setCreationBlock(Blockchain.block.number);

    return reservation;
}

export interface ITestProviderManager extends IProviderManager {
    readonly cleanUpQueuesCalled: boolean;
    readonly getNextProviderWithLiquidityCalled: boolean;
    readonly resetProviderCalled: boolean;
    readonly getPriorityQueue: StoredU256Array;
    readonly getNormalQueue: StoredU256Array;
    readonly priorityPurgedQueueLength: u32;
    readonly normalPurgedQueueLength: u32;

    clearMockedResults(): void;

    cleanUpQueues(): void;

    getNextProviderWithLiquidity(currentQuote: u256): Provider | null;

    resetProvider(
        provider: Provider,
        // @ts-expect-error valid in assembly script but not in typescript
        burnRemainingFunds: boolean = true,
        // @ts-expect-error valid in assembly script but not in typescript
        canceled: boolean = false,
    ): void;
}

export interface ITestReservationManager extends IReservationManager {
    readonly purgeReservationsAndRestoreProvidersCalled: boolean;

    lastBlockReservation(): u64;

    mockAddToListReturn(index: u32): void;

    mockAddToActiveListReturn(index: u32): void;

    callgetReservationListForBlock(blockNumber: u64): StoredU128Array;

    callgetActiveListForBlock(blockNumber: u64): StoredBooleanArray;

    setAtLeastProvidersToPurge(value: u32): void;
}

export interface ITestLiquidityQueue extends ILiquidityQueue {
    readonly volatility: u256;

    mockgetNextProviderWithLiquidity(mockedNextProvider: Provider | null): void;

    setLiquidity(value: u256): void;
}

export interface ITestTradeManager extends ITradeManager {
    callReportUTXOUsed(address: string, value: u64): void;

    callGetSatoshisSent(address: string): u64;

    getConsumedOutputsFromUTXOsMap(key: string): u64;

    addToConsumedOutputsFromUTXOsMap(key: string, value: u64): void;
}

export class CreateLiquidityQueueResult {
    public liquidityQueue: ITestLiquidityQueue;
    public tradeManager: ITestTradeManager;
    public providerManager: ITestProviderManager;
    public quoteManager: IQuoteManager;
    public reservationManager: ITestReservationManager;

    constructor(
        liquidityQueue: ITestLiquidityQueue,
        tradeManager: ITestTradeManager,
        providerManager: ITestProviderManager,
        quoteManager: IQuoteManager,
        reservationManager: ITestReservationManager,
    ) {
        this.liquidityQueue = liquidityQueue;
        this.tradeManager = tradeManager;
        this.providerManager = providerManager;
        this.quoteManager = quoteManager;
        this.reservationManager = reservationManager;
    }
}

export function createLiquidityQueue(
    token: Address,
    tokenId: Uint8Array,
    purgeOldReservations: boolean,
    timeoutEnabled: boolean = false,
): CreateLiquidityQueueResult {
    const quoteManager: IQuoteManager = getQuoteManager(tokenId);
    const liquidityQueueReserve: ILiquidityQueueReserve = getLiquidityQueueReserve(token, tokenId);
    const providerManager: ITestProviderManager = getProviderManager(token, tokenId, quoteManager);
    const reservationManager: ITestReservationManager = getReservationManager(
        token,
        tokenId,
        providerManager,
        liquidityQueueReserve,
    );
    const dynamicFee: IDynamicFee = getDynamicFee(tokenId);

    const liquidityQueue: ITestLiquidityQueue = new TestLiquidityQueue(
        token,
        tokenId,
        providerManager,
        liquidityQueueReserve,
        quoteManager,
        reservationManager,
        dynamicFee,
        purgeOldReservations,
        timeoutEnabled,
    );

    const tradeManager: ITestTradeManager = new TestTradeManager(
        tokenId,
        quoteManager,
        providerManager,
        liquidityQueueReserve,
        reservationManager,
    );

    return new CreateLiquidityQueueResult(
        liquidityQueue,
        tradeManager,
        providerManager,
        quoteManager,
        reservationManager,
    );
}

export function getQuoteManager(tokenId: Uint8Array): IQuoteManager {
    return new QuoteManager(tokenId);
}

export function getProviderManager(
    token: Address,
    tokenId: Uint8Array,
    quoteManager: IQuoteManager,
): ITestProviderManager {
    return new TestProviderManager(token, tokenId, quoteManager, ENABLE_INDEX_VERIFICATION);
}

export function getLiquidityQueueReserve(
    token: Address,
    tokenId: Uint8Array,
): ILiquidityQueueReserve {
    return new LiquidityQueueReserve(token, tokenId);
}

export function getReservationManager(
    token: Address,
    tokenId: Uint8Array,
    providerManager: IProviderManager,
    liquidityQueueReserve: ILiquidityQueueReserve,
): ITestReservationManager {
    return new TestReservationManager(
        token,
        tokenId,
        providerManager,
        liquidityQueueReserve,
        AT_LEAST_PROVIDERS_TO_PURGE,
    );
}

export function getDynamicFee(tokenId: Uint8Array): IDynamicFee {
    return new DynamicFee(tokenId);
}

export class TestLiquidityQueue extends LiquidityQueue implements ITestLiquidityQueue {
    private _mockedNextProvider: Provider | null = null;

    public get volatility(): u256 {
        return this.dynamicFee.volatility;
    }

    public clearMockedResults(): void {
        this._mockedNextProvider = null;
    }

    public mockgetNextProviderWithLiquidity(mockedNextProvider: Provider | null): void {
        this._mockedNextProvider = mockedNextProvider;
    }

    public getNextProviderWithLiquidity(currentQuote: u256): Provider | null {
        if (this._mockedNextProvider !== null) {
            return this._mockedNextProvider;
        } else {
            return super.getNextProviderWithLiquidity(currentQuote);
        }
    }

    public setLiquidity(value: u256): void {
        this.liquidityQueueReserve.liquidity = value;
    }
}

export class TestProviderManager extends ProviderManager implements ITestProviderManager {
    private _getNextProviderWithLiquidityCalled: boolean = false;

    public get getNextProviderWithLiquidityCalled(): boolean {
        return this._getNextProviderWithLiquidityCalled;
    }

    private _cleanUpQueuesCalled: boolean = false;

    public get cleanUpQueuesCalled(): boolean {
        return this._cleanUpQueuesCalled;
    }

    private _resetProviderCalled: boolean = false;

    public get resetProviderCalled(): boolean {
        return this._resetProviderCalled;
    }

    public get getPriorityQueue(): StoredU256Array {
        return this.priorityQueue.getQueue();
    }

    public get getNormalQueue(): StoredU256Array {
        return this.normalQueue.getQueue();
    }

    public get priorityPurgedQueueLength(): u32 {
        return this.priorityPurgedQueue.length;
    }

    public get normalPurgedQueueLength(): u32 {
        return this.normalPurgedQueue.length;
    }

    public clearMockedResults(): void {
        this._cleanUpQueuesCalled = false;
        this._getNextProviderWithLiquidityCalled = false;
        this._resetProviderCalled = false;
    }

    public cleanUpQueues(): void {
        this._cleanUpQueuesCalled = true;
        super.cleanUpQueues();
    }

    public getNextProviderWithLiquidity(currentQuote: u256): Provider | null {
        this._getNextProviderWithLiquidityCalled = true;
        return super.getNextProviderWithLiquidity(currentQuote);
    }

    public resetProvider(
        provider: Provider,
        burnRemainingFunds: boolean = true,
        canceled: boolean = false,
    ): void {
        this._resetProviderCalled = true;
        super.resetProvider(provider, burnRemainingFunds, canceled);
    }
}

export class TestProviderQueue extends ProviderQueue {
    public setStartingIndex(index: u32): void {
        this.queue.setStartingIndex(index);
    }
}

export class TestReservationManager extends ReservationManager implements ITestReservationManager {
    private _mockedAddToListReturn: u32 = u32.MAX_VALUE;
    private _mockedAddToActiveListReturn: u32 = u32.MAX_VALUE;

    private _purgeReservationsAndRestoreProvidersCalled: boolean = false;

    public get purgeReservationsAndRestoreProvidersCalled(): boolean {
        return this._purgeReservationsAndRestoreProvidersCalled;
    }

    public clearMockedResults(): void {
        this._purgeReservationsAndRestoreProvidersCalled = false;
        this._mockedAddToListReturn = u32.MAX_VALUE;
        this._mockedAddToActiveListReturn = u32.MAX_VALUE;
    }

    public mockAddToListReturn(index: u32): void {
        this._mockedAddToListReturn = index;
    }

    public mockAddToActiveListReturn(index: u32): void {
        this._mockedAddToActiveListReturn = index;
    }

    public callgetReservationListForBlock(blockNumber: u64): StoredU128Array {
        return super.getReservationListForBlock(blockNumber);
    }

    public callgetActiveListForBlock(blockNumber: u64): StoredBooleanArray {
        return super.getActiveListForBlock(blockNumber);
    }

    override purgeReservationsAndRestoreProviders(lastPurgedBlock: u64): u64 {
        this._purgeReservationsAndRestoreProvidersCalled = true;

        return super.purgeReservationsAndRestoreProviders(lastPurgedBlock);
    }

    public lastBlockReservation(): u64 {
        const length: u32 = this.blocksWithReservations.getLength();

        if (length > 0) {
            return this.blocksWithReservations.get(length - 1);
        }

        return u64.MAX_VALUE;
    }

    public setAtLeastProvidersToPurge(value: u32): void {
        this.atLeastProvidersToPurge = value;
    }

    protected override pushToReservationList(blockNumber: u64, reservationId: u128): u32 {
        if (this._mockedAddToListReturn !== u32.MAX_VALUE) {
            super.pushToReservationList(blockNumber, reservationId);
            return this._mockedAddToListReturn;
        } else {
            return super.pushToReservationList(blockNumber, reservationId);
        }
    }

    protected override pushToActiveList(blockNumber: u64): u32 {
        if (this._mockedAddToActiveListReturn !== u32.MAX_VALUE) {
            super.pushToActiveList(blockNumber);
            return this._mockedAddToActiveListReturn;
        } else {
            return super.pushToActiveList(blockNumber);
        }
    }
}

export class TestReserveLiquidityOperation extends ReserveLiquidityOperation {
    private mockedLimitByAvailableLiquidity: u256 = u256.Zero;
    private isLimitByAvailableLiquidityMocked: boolean = false;

    public setRemainingTokens(value: u256): void {
        this.remainingTokens = value;
    }

    public setCurrentQuote(quote: u256): void {
        this.currentQuote = quote;
    }

    public getReservedProviderCount(): u8 {
        return this.reservedProviderCount;
    }

    public callReserveFromProvider(
        reservation: Reservation,
        provider: Provider,
        quote: u256,
    ): void {
        this.currentQuote = quote;
        super.reserveFromProvider(reservation, provider);
    }

    public mockLimitByAvailableLiquidity(tokensToReturn: u256): void {
        this.isLimitByAvailableLiquidityMocked = true;
        this.mockedLimitByAvailableLiquidity = tokensToReturn;
    }

    protected override limitByAvailableLiquidity(tokens: u256): u256 {
        if (this.isLimitByAvailableLiquidityMocked) {
            return this.mockedLimitByAvailableLiquidity;
        }

        return super.limitByAvailableLiquidity(tokens);
    }
}

export class TestTradeManager extends TradeManager implements ITestTradeManager {
    public addToConsumedOutputsFromUTXOsMap(key: string, value: u64): void {
        this.consumedOutputsFromUTXOs.set(key, value);
    }

    public getConsumedOutputsFromUTXOsMap(key: string): u64 {
        return this.consumedOutputsFromUTXOs.get(key);
    }

    public callReportUTXOUsed(address: string, value: u64): void {
        super.reportUTXOUsed(address, value);
    }

    public callGetSatoshisSent(address: string): u64 {
        return super.getSatoshisSent(address);
    }
}
