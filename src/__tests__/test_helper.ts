import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    StoredU256Array,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../models/Provider';
import { Reservation } from '../models/Reservation';
import { LiquidityQueue } from '../managers/LiquidityQueue';
import { ProviderManager } from '../managers/ProviderManager';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { MAXIMUM_PROVIDER_COUNT } from '../constants/Contract';
import { ProviderQueue } from '../managers/ProviderQueue';
import { IOwedBTCManager } from '../managers/interfaces/IOwedBTCManager';
import { IQuoteManager } from '../managers/interfaces/IQuoteManager';
import { ILiquidityQueueReserve } from '../managers/interfaces/ILiquidityQueueReserve';
import { IProviderManager } from '../managers/interfaces/IProviderManager';
import { IReservationManager } from '../managers/interfaces/IReservationManager';
import { IDynamicFee } from '../managers/interfaces/IDynamicFee';
import { TradeManager } from '../managers/TradeManager';
import { QuoteManager } from '../managers/QuoteManager';
import { OwedBTCManager } from '../managers/OwedBTCManager';
import { LiquidityQueueReserve } from '../models/LiquidityQueueReserve';
import { ReservationManager } from '../managers/ReservationManager';
import { DynamicFee } from '../managers/DynamicFee';
import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';
import { ITradeManager } from '../managers/interfaces/ITradeManager';

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

export const receiverAddress1: string = 'wjo29i3d02jd208j3';

export const receiverAddress2: string = 'cmewj390ujllq23u9';

export const receiverAddress3: string = 'peijkwhjbnafewr27';

export const receiverAddress4: string = 'cxdkidw9823yh099';

export const receiverAddress5: string = 'jiojijoijoji8j23';

export const receiverAddress6: string = 'fded0e32398hhd2i';

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
    pendingRemoval: boolean = false,
    isLP: boolean = true,
    canProvideLiquidity: boolean = false,
    btcReceiver: string = 'e123e2d23d233',
    liquidityProvided: u128 = u128.fromU64(1000),
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

    if (pendingRemoval) {
        provider.markPendingRemoval();
    } else {
        provider.clearPendingRemoval();
    }

    if (isLP) {
        provider.markLiquidityProvider();
    } else {
        provider.clearLiquidityProvider();
    }

    provider.setLiquidityProvided(liquidityProvided);
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
    isLP: boolean = true,
    canProvideLiquidity: boolean = true,
    btcReceiver: string = 'e123e2d23d233',
    liquidityProvided: u128 = u128.fromU64(1000),
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

export function createMaxProviders(
    pendingRemoval: boolean = false,
    isLP: boolean = true,
    canProvideLiquidity: boolean = true,
    btcReceiver: string = 'e123e2d23d233',
    liquidityProvided: u128 = u128.fromU64(1000),
    liquidity: u128 = u128.fromU64(1000),
    reserved: u128 = u128.fromU64(0),
    isActive: bool = true,
    isPriority: bool = false,
): Provider[] {
    const providers: Provider[] = [];

    let i: u32 = 0;
    while (i < MAXIMUM_PROVIDER_COUNT) {
        for (let j: u8 = 0; j <= 255; j++) {
            for (let k: u8 = 0; k <= 255; k++) {
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
                    j,
                    k,
                ]);
                i++;

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

                if (i == MAXIMUM_PROVIDER_COUNT) {
                    break;
                }
            }
        }
    }

    return providers;
}

export function createReservationId(tokenAddress: Address, providerAddress: Address): u128 {
    const reservationArrayId: Uint8Array = Reservation.generateId(tokenAddress, providerAddress);

    return u128.fromBytes(reservationArrayId, true);
}

export function setBlockchainEnvironment(
    currentBlock: u64,
    sender: Address = msgSender1,
    origin: Address = msgSender1,
): void {
    const medianTimestamp: u64 = 87129871;
    const writer: BytesWriter = new BytesWriter(
        32 + 2 * U64_BYTE_LENGTH + 4 * ADDRESS_BYTE_LENGTH + txId1.length + txHash1.length,
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

    Blockchain.setEnvironmentVariables(writer.getBuffer());
}

export function generateReservationId(token: Address, owner: Address): Uint8Array {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(token);
    writer.writeAddress(owner);

    const hash = ripemd160(writer.getBuffer());
    return hash.slice(0, 16);
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
}

export interface ITestReservationManager extends IReservationManager {
    readonly purgeReservationsAndRestoreProvidersCalled: boolean;
}

export interface ITestLiquidityQueue extends ILiquidityQueue {
    readonly volatility: u256;

    mockgetNextProviderWithLiquidity(mockedNextProvider: Provider | null): void;

    setLiquidity(value: u256): void;
}

export class CreateLiquidityQueueResult {
    public liquidityQueue: ITestLiquidityQueue;
    public tradeManager: ITradeManager;
    public providerManager: ITestProviderManager;
    public quoteManager: IQuoteManager;
    public reservationManager: ITestReservationManager;

    constructor(
        liquidityQueue: ITestLiquidityQueue,
        tradeManager: ITradeManager,
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
    const owedBtcManager: IOwedBTCManager = getOwedBtcManager();
    const quoteManager: IQuoteManager = getQuoteManager(tokenId);
    const liquidityQueueReserve: ILiquidityQueueReserve = getLiquidityQueueReserve(token, tokenId);
    const providerManager: ITestProviderManager = getProviderManager(
        token,
        tokenId,
        owedBtcManager,
    );
    const reservationManager: ITestReservationManager = getReservationManager(
        token,
        tokenId,
        providerManager,
        quoteManager,
        liquidityQueueReserve,
        owedBtcManager,
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
        owedBtcManager,
        purgeOldReservations,
        timeoutEnabled,
    );

    const tradeManager: ITradeManager = new TradeManager(
        tokenId,
        quoteManager,
        providerManager,
        liquidityQueueReserve,
        owedBtcManager,
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
    owedBtcManager: IOwedBTCManager,
): ITestProviderManager {
    return new TestProviderManager(token, tokenId, owedBtcManager);
}

export function getOwedBtcManager(): IOwedBTCManager {
    return new OwedBTCManager();
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
    quoteManager: IQuoteManager,
    liquidityQueueReserve: ILiquidityQueueReserve,
    owedBTCManager: IOwedBTCManager,
): ITestReservationManager {
    return new TestReservationManager(
        token,
        tokenId,
        providerManager,
        quoteManager,
        liquidityQueueReserve,
        owedBTCManager,
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

    public get getRemovalQueue(): StoredU256Array {
        return this.removalQueue.getQueue();
    }

    public get getPriorityQueue(): StoredU256Array {
        return this.priorityQueue.getQueue();
    }

    public get getNormalQueue(): StoredU256Array {
        return this.normalQueue.getQueue();
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
    public callInitializeCurrentIndex(): void {
        this.initializeCurrentIndex();
    }

    public callEnsureStartingIndexIsValid(): void {
        this.ensureStartingIndexIsValid();
    }
}

export class TestReservationManager extends ReservationManager implements ITestReservationManager {
    private _purgeReservationsAndRestoreProvidersCalled: boolean = false;

    public get purgeReservationsAndRestoreProvidersCalled(): boolean {
        return this._purgeReservationsAndRestoreProvidersCalled;
    }

    public clearMockedResults(): void {
        this._purgeReservationsAndRestoreProvidersCalled = false;
    }

    public purgeReservationsAndRestoreProviders(lastPurgedBlock: u64): u64 {
        this._purgeReservationsAndRestoreProvidersCalled = true;

        return super.purgeReservationsAndRestoreProviders(lastPurgedBlock);
    }
}
