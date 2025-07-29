import { clearCachedProviders, getProvider, Provider } from '../models/Provider';
import {
    Address,
    Blockchain,
    SafeMath,
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {
    createLiquidityQueue,
    createProviderId,
    msgSender1,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    providerAddress4,
    providerAddress5,
    providerAddress6,
    providerAddress7,
    receiverAddress1,
    receiverAddress2,
    receiverAddress3,
    receiverAddress4,
    receiverAddress5,
    setBlockchainEnvironment,
    testStackingContractAddress,
    tokenAddress1,
    tokenIdUint8Array1,
} from './test_helper';
import { CreatePoolOperation } from '../operations/CreatePoolOperation';
import {
    INDEX_NOT_SET_VALUE,
    INITIAL_FEE_COLLECT_ADDRESS,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
} from '../constants/Contract';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { SwapOperation } from '../operations/SwapOperation';
import { Reservation } from '../models/Reservation';

const tokenDec = 18;

function createPool(): Provider {
    const initialProvider: u256 = createProviderId(Blockchain.tx.sender, tokenAddress1);
    const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

    const floorPrice: u256 = SafeMath.div(
        SafeMath.pow(u256.fromU32(10), u256.fromU32(tokenDec)),
        u256.fromU32(500),
    );
    const initialLiq: u128 = SafeMath.mul128(
        u128.fromU32(52500),
        SafeMath.pow(u256.fromU32(10), u256.fromU32(tokenDec)).toU128(),
    );

    const createPoolOp = new CreatePoolOperation(
        lq1.liquidityQueue,
        floorPrice,
        initialProvider,
        initialLiq,
        receiverAddress1,
        0,
        u256.Zero,
        100,
        testStackingContractAddress,
    );

    createPoolOp.execute();
    lq1.liquidityQueue.save();

    return getProvider(initialProvider);
}

function listTokenForSale(
    amount: u128,
    receiverAddress: string,
    priority: boolean = false,
): Provider {
    const liquidityProvider: u256 = createProviderId(Blockchain.tx.sender, tokenAddress1);
    const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
    const listLiquidityOp = new ListTokensForSaleOperation(
        lq1.liquidityQueue,
        liquidityProvider,
        expand(amount, tokenDec),
        receiverAddress,
        testStackingContractAddress,
        priority,
        false,
    );

    listLiquidityOp.execute();
    lq1.liquidityQueue.save();

    return getProvider(liquidityProvider);
}

function reserve(amount: u64): u256 {
    const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
    const id: u256 = createProviderId(Blockchain.tx.sender, tokenAddress1);

    const reserveOp = new ReserveLiquidityOperation(
        lq1.liquidityQueue,
        id,
        Blockchain.tx.sender,
        amount,
        u256.Zero,
        0,
        MAXIMUM_PROVIDER_PER_RESERVATIONS,
    );

    reserveOp.execute();
    lq1.liquidityQueue.save();

    return id;
}

function swap(receiver: string[], amount: u64[]): void {
    const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

    const txOut: TransactionOutput[] = [];
    txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
    txOut.push(new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 100));
    for (let i: u16 = 0; i < <u16>receiver.length; i++) {
        txOut.push(new TransactionOutput(i + 2, 0, null, receiver[i], amount[i]));
    }

    Blockchain.mockTransactionOutput(txOut);

    const swapOp = new SwapOperation(
        lq1.liquidityQueue,
        lq1.tradeManager,
        testStackingContractAddress,
    );

    swapOp.execute();
    lq1.liquidityQueue.save();
}

function expand(amount: u128, decimal: u32): u128 {
    const scale = SafeMath.pow(u256.fromU32(10), u256.fromU32(decimal)).toU128();

    return SafeMath.mul128(amount, scale);
}

function getReservationId(token: Address, reserver: Address): u128 {
    const reservation: Reservation = new Reservation(token, reserver);
    return reservation.getId();
}

function logProvider(provider: Provider, name: string = 'Provider'): void {
    Blockchain.log(name);
    Blockchain.log(`---------`);
    Blockchain.log(`id: ${provider.getId()}`);
    Blockchain.log(`getLiquidityAmount: ${provider.getLiquidityAmount()}`);
    Blockchain.log(`getReservedAmount: ${provider.getReservedAmount()}`);
    Blockchain.log(`getAvailableLiquidityAmount: ${provider.getAvailableLiquidityAmount()}`);
    Blockchain.log(`getQueueIndex: ${provider.getQueueIndex()}`);
    Blockchain.log(`getPurgedIndex: ${provider.getPurgedIndex()}`);
    Blockchain.log(`isActive: ${provider.isActive()}`);
    Blockchain.log(`isPurged: ${provider.isPurged()}`);
    Blockchain.log(`isPriority: ${provider.isPriority()}`);
}

describe('Reserve, swap and purge tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        Blockchain.mockValidateBitcoinAddressResult(true);
        TransferHelper.clearMockedResults();
    });

    /*
    The scenario begins with a large reservation that consumes the full liquidity of Provider1 and partially uses Provider2.
    When this reservation is partially swapped, Provider1 receives an amount of satoshis that leave its liquidity below the minimum threshold,
    so Provider1 is reset.
    Provider2 receives nothing, causing its liquidity to be restored.
    Importantly, Provider2 gets added to a purge queue because it wasn't actually utilized during the swap operation.

    A second reservation is then made, and the system prioritizes Provider2 from the purge queue for this new reservation.
    Following this, a purge operation is performed, which restores Provider2 since reservation 2 was never swapped,
    while Provider1 remains unchanged as it is no more active.

    When a third reservation is made, Provider2 continues to be prioritized from the purge queue as the number of sent satoshis still fit in the provider2 liquidity.

    The complexity escalates with a fourth reservation made, requiring a larger amount that needs tokens from multiple providers.
    Provider2's liquidity is fully utilized first, and the system falls back to using the Initial Provider to fulfill the remaining token requirements.
    */
    it('Test 1', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider2 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(112, providerAddress3, providerAddress3);

        // Reserve full liquidity or provider1 and some from provider2.
        reserve(491000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`694341330962819047619`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`305658669037180952381`),
        );

        // Partial swap the reservation leaving small amount in provider1 smaller than minimum amount, so it is resets.
        // Don't send any sats to provider2 so it is restored.
        setBlockchainEnvironment(116, providerAddress3, providerAddress3);
        swap([receiverAddress2], [489000]);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeFalsy();
        expect(liquidityProvider1.isActive()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.isPurged()).toBeTruthy();
        expect(liquidityProvider2.isActive()).toBeTruthy();

        // Reserve again.
        // Provider2 has been push in the purge queue in the swap operation.
        // So it is the 1st one used for the requested amount.
        setBlockchainEnvironment(118, providerAddress4, providerAddress4);
        reserve(100000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isActive()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`337591091932497987821`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`662408908067502012179`),
        );
        expect(liquidityProvider2.isPurged()).toBeTruthy();
        expect(liquidityProvider2.isActive()).toBeTruthy();

        // Force a purge.
        // Provider2 is restored as reservation #2 expired and was not swapped.
        // Provider1 stays as is.
        setBlockchainEnvironment(132, msgSender1, msgSender1);
        const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        lq.liquidityQueue.save();
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isActive()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.isPurged()).toBeTruthy();
        expect(liquidityProvider2.isActive()).toBeTruthy();

        // Reserve again.
        // As provider2 is still in purged queue, given the satoshis amount, it is the only one that should be used.
        setBlockchainEnvironment(134, providerAddress6, providerAddress6);
        reserve(10000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeFalsy();
        expect(liquidityProvider1.isActive()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`33759109193249798782`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`966240890806750201218`),
        );
        expect(liquidityProvider2.isPurged()).toBeTruthy();
        expect(liquidityProvider2.isActive()).toBeTruthy();

        // Reserve again.
        // This time with a bigger amount.
        // All liquidity from Provider2 will be used, so it is removed from purge queue.
        // Initial provider will be used to fill the missing tokens.
        setBlockchainEnvironment(134, providerAddress3, providerAddress3);
        reserve(1000000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeFalsy();
        expect(liquidityProvider1.isActive()).toBeFalsy();

        expect(liquidityProvider1.getQueueIndex()).toStrictEqual(INDEX_NOT_SET_VALUE);
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998828878768239606`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1171121231760394`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();
        expect(liquidityProvider2.isActive()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`2409671199639461437393`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`50090328800360538562607`),
        );
    });

    /*
    This test scenario validates the system's handling of liquidity providers that fall below minimum thresholds
    after large liquidity operations and ensures proper provider reset and deactivation mechanisms.

    The test begins by creating a reservation that consumes nearly all available liquidity from both Provider1 and Provider2,
    strategically leaving only small amounts in each that fall below the system's minimum liquidity threshold.
    Since these two providers cannot fully satisfy the reservation requirements, the system completes the reservation
    by drawing additional liquidity from the Initial Provider, demonstrating the fallback mechanism when primary providers
    have insufficient funds.

    The reservation is then fully swapped, meaning all reserved liquidity is actually utilized and converted.
    This full execution triggers a critical system response where Provider1 and Provider2 are both reset and deactivated
    because their remaining liquidity amounts are below the minimum viable threshold. Meanwhile, the Initial Provider,
    which had liquidity drawn from it during the reservation, gets its liquidity restored since it does not receive any satoshis.

    The test concludes by making another reservation to verify the system's provider selection logic after the reset operation.
    As expected, Provider1 and Provider2 are not considered for this new reservation since they were deactivated in the previous
    step. Instead, only the Initial Provider is used, confirming that the system correctly maintains its provider registry and
    only selects from active, viable providers.
    */
    it('Test 2', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider2 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        // First make a reservation that takes almost all liquidity from Provider1 and Provider2,
        // leaving a small amount that is below the minimum threshold.
        // Complete the reservation by using a small amount in the initial provider.
        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        reserve(982000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.isActive()).toBeTruthy();
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider2.isActive()).toBeTruthy();
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`1388682661925638095238`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`51111317338074361904762`),
        );

        // Do a full swap of the reservation for Provider1 and Provider2.
        // Provider1 and Provider2 should be resets and deactivated.
        // Initial provider gets restored.
        setBlockchainEnvironment(116, providerAddress3, providerAddress3);
        swap([receiverAddress2, receiverAddress5], [489000, 489000]);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isActive()).toBeFalsy();
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isActive()).toBeFalsy();
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );

        // Do another reservation, Provider1 and Provider2 should not be used.
        // Only initial provider should be used.
        setBlockchainEnvironment(118, providerAddress4, providerAddress4);
        reserve(200000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isActive()).toBeFalsy();
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isActive()).toBeFalsy();
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`660703987946697348875`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`51839296012053302651125`),
        );
    });

    it('Test 3', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        Blockchain.log('\r\n\r\n100 - CreatePool');
        const initialProvider = createPool();

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
        const liquidityProvider1 = listTokenForSale(u128.fromU32(1000), receiverAddress2);

        setBlockchainEnvironment(110, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #2');
        const liquidityProvider2 = listTokenForSale(u128.fromU32(1000), receiverAddress3);

        setBlockchainEnvironment(110, providerAddress4, providerAddress4);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #3');
        const liquidityProvider3 = listTokenForSale(u128.fromU32(1000), receiverAddress4);

        setBlockchainEnvironment(112, providerAddress5, providerAddress5);
        Blockchain.log('\r\n\r\n112 - Reserve #1');
        reserve(982000);
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');
        logProvider(liquidityProvider3, 'Provider 3');
        logProvider(initialProvider, 'Initial Provider');

        setBlockchainEnvironment(116, providerAddress5, providerAddress5);
        Blockchain.log('\r\n\r\n116 - Swap #1');
        swap([receiverAddress3], [484000]);
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');
        logProvider(liquidityProvider3, 'Provider 3');
        logProvider(initialProvider, 'Initial Provider');

        setBlockchainEnvironment(118, providerAddress6, providerAddress6);
        Blockchain.log('\r\n\r\n118 - Reserve #2');
        reserve(200000);
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');
        logProvider(liquidityProvider3, 'Provider 3');
        logProvider(initialProvider, 'Initial Provider');

        setBlockchainEnvironment(121, providerAddress6, providerAddress6);
        Blockchain.log('\r\n\r\n121 - Swap #2');
        swap([receiverAddress4], [484000]);
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');
        logProvider(liquidityProvider3, 'Provider 3');
        logProvider(initialProvider, 'Initial Provider');

        setBlockchainEnvironment(122, providerAddress7, providerAddress7);
        Blockchain.log('\r\n\r\n122 - Reserve #3');
        reserve(200000);
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');
        logProvider(liquidityProvider3, 'Provider 3');
        logProvider(initialProvider, 'Initial Provider');
    });
    /*
        it('Test 3', () => {
            setBlockchainEnvironment(100, providerAddress1, providerAddress1);
            Blockchain.log('\r\n\r\n100 - CreatePool');
            const initialProvider: u256 = createPool();
    
            setBlockchainEnvironment(110, providerAddress2, providerAddress2);
            Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
            const liquidityProvider1: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
    
            setBlockchainEnvironment(110, providerAddress3, providerAddress3);
            Blockchain.log('\r\n\r\n110 - ListTokenForSale #2');
            const liquidityProvider2: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress3);
    
            setBlockchainEnvironment(110, providerAddress4, providerAddress4);
            Blockchain.log('\r\n\r\n110 - ListTokenForSale #3');
            const liquidityProvider3: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress4);
    
            setBlockchainEnvironment(110, providerAddress5, providerAddress5);
            Blockchain.log('\r\n\r\n110 - ListTokenForSale #4');
            const liquidityProvider4: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
    
            setBlockchainEnvironment(112, providerAddress6, providerAddress6);
            Blockchain.log('\r\n\r\n112 - Reserve #1');
            const reserver1: u256 = reserve(982000);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(113, providerAddress7, providerAddress7);
            Blockchain.log('\r\n\r\n113 - Reserve #2');
            const reserver2: u256 = reserve(582000);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(116, providerAddress7, providerAddress7);
            Blockchain.log('\r\n\r\n116 - Swap #2');
            swap([receiverAddress4], [484000]);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(117, providerAddress6, providerAddress6);
            Blockchain.log('\r\n\r\n117 - Swap #1');
            swap([receiverAddress4, receiverAddress3], [484000, 10000]);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(122, providerAddress7, providerAddress7);
            Blockchain.log('\r\n\r\n122 - Reserve #3');
            const reserver3: u256 = reserve(5200000);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(142, msgSender1, msgSender1);
            Blockchain.log('\r\n\r\n142 - Purge');
            const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            lq.liquidityQueue.save();
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(142, providerAddress7, providerAddress7);
    
            Blockchain.log('\r\n\r\n142 - Reserve #4');
            const reserver4: u256 = reserve(2200000);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
        });
    
        it('Test 4- Priority', () => {
            setBlockchainEnvironment(100, providerAddress1, providerAddress1);
            Blockchain.log('\r\n\r\n100 - CreatePool');
            const initialProvider: u256 = createPool();
    
            setBlockchainEnvironment(110, providerAddress2, providerAddress2);
            Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
            const liquidityProvider1: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
    
            setBlockchainEnvironment(110, providerAddress3, providerAddress3);
            Blockchain.log('\r\n\r\n110 - ListTokenForSale #2');
            const liquidityProvider2: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress3);
    
            setBlockchainEnvironment(110, providerAddress4, providerAddress4);
            Blockchain.log('\r\n\r\n110 - ListTokenForSale #3');
            const txOut: TransactionOutput[] = [];
            txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
            txOut.push(new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 1000));
            Blockchain.mockTransactionOutput(txOut);
            const liquidityProvider3: u256 = listTokenForSale(
                u128.fromU32(1000),
                receiverAddress4,
                true,
            );
            Blockchain.mockTransactionOutput([]);
    
            setBlockchainEnvironment(110, providerAddress5, providerAddress5);
            Blockchain.log('\r\n\r\n110 - ListTokenForSale #4');
            const liquidityProvider4: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
    
            setBlockchainEnvironment(112, providerAddress6, providerAddress6);
            Blockchain.log('\r\n\r\n112 - Reserve #1');
            const reserver1: u256 = reserve(1582000);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(113, providerAddress7, providerAddress7);
            Blockchain.log('\r\n\r\n113 - Reserve #2');
            const reserver2: u256 = reserve(582000);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(116, providerAddress7, providerAddress7);
            Blockchain.log('\r\n\r\n116 - Swap #2');
            swap([receiverAddress4], [484000]);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(117, providerAddress6, providerAddress6);
            Blockchain.log('\r\n\r\n117 - Swap #1');
            swap([receiverAddress4, receiverAddress3], [284000, 484000]);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(122, providerAddress7, providerAddress7);
            Blockchain.log('\r\n\r\n122 - Reserve #3');
            const reserver3: u256 = reserve(5200000);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(142, msgSender1, msgSender1);
            Blockchain.log('\r\n\r\n142 - Purge');
            const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
            lq.liquidityQueue.save();
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
    
            setBlockchainEnvironment(142, providerAddress7, providerAddress7);
    
            Blockchain.log('\r\n\r\n142 - Reserve #4');
            const reserver4: u256 = reserve(2200000);
            logProvider(liquidityProvider1, 'Provider 1');
            logProvider(liquidityProvider2, 'Provider 2');
            logProvider(liquidityProvider3, 'Provider 3');
            logProvider(liquidityProvider4, 'Provider 4');
            logProvider(initialProvider, 'Initial Provider');
        });
        
     */
});
/*
describe('Expired swap', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        Blockchain.mockValidateBitcoinAddressResult(true);
        TransferHelper.clearMockedResults();
    });

    it('should restore reserved liquidity, buy tokens up to the amount sent and push the provider to the purge queue when reserve from 1 provider and doing a partial swap', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        Blockchain.log('\r\n\r\n100 - CreatePool');
        const initialProvider: u256 = createPool();
        logProvider(initialProvider);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
        const liquidityProvider1: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
        logProvider(liquidityProvider1);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #2');
        const liquidityProvider2: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n112 - Reserve #1');
        const reserver1: u256 = reserve(491000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n116 - Swap #1');
        swap([receiverAddress2], [489000]);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
    });

    it('should restore reserved liquidity, buy the number of reserved tokens and push the provider to the purge queue when reserve from 1 provider and doing a full swap', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        Blockchain.log('\r\n\r\n100 - CreatePool');
        const initialProvider: u256 = createPool();
        logProvider(initialProvider);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
        const liquidityProvider1: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
        logProvider(liquidityProvider1);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #2');
        const liquidityProvider2: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n112 - Reserve #1');
        const reserver1: u256 = reserve(491000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n116 - Swap #1');
        swap([receiverAddress2], [491000]);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
    });

    it('should remove and reset the provider from the purge queue when not enough liquidity left', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        Blockchain.log('\r\n\r\n100 - CreatePool');
        const initialProvider: u256 = createPool();
        logProvider(initialProvider);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
        const liquidityProvider1: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
        logProvider(liquidityProvider1);

        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n112 - Reserve #1');
        const reserver1: u256 = reserve(495000);
        logProvider(liquidityProvider1);

        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n116 - Swap #1');
        swap([receiverAddress2], [495000]);
        logProvider(liquidityProvider1);

        setBlockchainEnvironment(130, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n130 - Reserve #2');
        const reserver2: u256 = reserve(491000);
        logProvider(liquidityProvider1);
        logProvider(initialProvider);
    });

    it('should restore reserved liquidity, buy tokens up to the amount sent and push the provider to the purge queue when reserve from 2 providers and doing a partial swap', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        Blockchain.log('\r\n\r\n100 - CreatePool');
        const initialProvider: u256 = createPool();
        logProvider(initialProvider);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
        const liquidityProvider1: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
        logProvider(liquidityProvider1);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #2');
        const liquidityProvider2: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n112 - Reserve #1');
        const reserver1: u256 = reserve(691000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n116 - Swap #1');
        swap([receiverAddress2, receiverAddress5], [489000, 200000]);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
    });

    it('should use providers from the purge queue and remove them when purge queue has providers and available liquidity not enough after reserve', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        Blockchain.log('\r\n\r\n100 - CreatePool');
        const initialProvider: u256 = createPool();
        logProvider(initialProvider);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
        const liquidityProvider1: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
        logProvider(liquidityProvider1);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #2');
        const liquidityProvider2: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n112 - Reserve #1');
        const reserver1: u256 = reserve(691000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n116 - Swap #1');
        swap([receiverAddress2, receiverAddress5], [489000, 200000]);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
        logProvider(initialProvider);

        setBlockchainEnvironment(127, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n127 - Reserve #2');
        const reserver2: u256 = reserve(691000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
        logProvider(initialProvider);
    });

    it('should use providers from the purge queue and leave them when purge queue has providers and available liquidity enough after reserve', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        Blockchain.log('\r\n\r\n100 - CreatePool');
        const initialProvider: u256 = createPool();
        logProvider(initialProvider);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
        const liquidityProvider1: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
        logProvider(liquidityProvider1);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #2');
        const liquidityProvider2: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n112 - Reserve #1');
        const reserver1: u256 = reserve(691000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n116 - Swap #1');
        swap([receiverAddress2, receiverAddress5], [489000, 200000]);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(127, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n127 - Reserve #2');
        const reserver2: u256 = reserve(21000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
    });

    it('should buy tokens up to the amount sent and not re-push the provider to the purge queue when reserve from 1 provider, doing a partial swap on a purged reservation', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        Blockchain.log('\r\n\r\n100 - CreatePool');
        const initialProvider: u256 = createPool();
        logProvider(initialProvider);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
        const liquidityProvider1: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
        logProvider(liquidityProvider1);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #2');
        const liquidityProvider2: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n112 - Reserve #1');
        const reserver1: u256 = reserve(491000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n116 - Swap #1');
        swap([receiverAddress2], [489000]);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
    });

    it('should buy only remaining liquidity when the provider does not have full initial reserved liquidity', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        Blockchain.log('\r\n\r\n100 - CreatePool');
        const initialProvider: u256 = createPool();
        logProvider(initialProvider);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #1');
        const liquidityProvider1: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress2);
        logProvider(liquidityProvider1);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        Blockchain.log('\r\n\r\n110 - ListTokenForSale #2');
        const liquidityProvider2: u256 = listTokenForSale(u128.fromU32(1000), receiverAddress5);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n112 - Reserve #1');
        const reserver1: u256 = reserve(491000);
        Blockchain.log(`Reservation: ${getReservationId(tokenAddress1, providerAddress3)}`);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(122, providerAddress4, providerAddress4);
        Blockchain.log('\r\n\r\n122 - Reserve #2');
        const reserver2: u256 = reserve(480000);
        Blockchain.log(`Reservation: ${getReservationId(tokenAddress1, providerAddress4)}`);
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');

        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n126 - Swap #1');
        swap([receiverAddress2], [489000]);
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');

        setBlockchainEnvironment(127, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n127 - Reserve #3');
        const reserver3: u256 = reserve(480000);
        Blockchain.log(`Reservation: ${getReservationId(tokenAddress1, providerAddress3)}`);
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');

        setBlockchainEnvironment(136, msgSender1, msgSender1);
        Blockchain.log('\r\n\r\n136 - Purge');
        const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        lq.liquidityQueue.save();
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');

        setBlockchainEnvironment(137, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n137 - Reserve #4');
        const reserver4: u256 = reserve(480000);
        Blockchain.log(`Reservation: ${getReservationId(tokenAddress1, providerAddress3)}`);
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');

        setBlockchainEnvironment(147, msgSender1, msgSender1);
        Blockchain.log('\r\n\r\n147 - Purge');
        const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        lq1.liquidityQueue.save();
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');
    });
});


 */