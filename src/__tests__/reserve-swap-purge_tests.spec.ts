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
    receiverAddress1CSV,
    receiverAddress2,
    receiverAddress2CSV,
    receiverAddress3,
    receiverAddress3CSV,
    receiverAddress4,
    receiverAddress4CSV,
    receiverAddress5,
    receiverAddress5CSV,
    setBlockchainEnvironment,
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
import { CancelListingOperation } from '../operations/CancelListingOperation';

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
        receiverAddress1CSV,
        0,
        u256.Zero,
        100,
    );

    createPoolOp.execute();
    lq1.liquidityQueue.save();

    return getProvider(initialProvider);
}

function listTokenForSale(
    amount: u128,
    receiverAddress: Uint8Array,
    receiverAddressStr: string,
    priority: boolean = false,
): Provider {
    const liquidityProvider: u256 = createProviderId(Blockchain.tx.sender, tokenAddress1);
    const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
    const listLiquidityOp = new ListTokensForSaleOperation(
        lq1.liquidityQueue,
        liquidityProvider,
        expand(amount, tokenDec),
        receiverAddress,
        receiverAddressStr,
        priority,
        false,
    );

    listLiquidityOp.execute();
    lq1.liquidityQueue.save();

    return getProvider(liquidityProvider);
}

function cancelListing(provider: Provider): void {
    const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);

    const cancelListingOp = new CancelListingOperation(lq1.liquidityQueue, provider.getId());

    cancelListingOp.execute();
    lq1.liquidityQueue.save();
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

    const swapOp = new SwapOperation(lq1.liquidityQueue, lq1.tradeManager);

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
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress5,
            receiverAddress5CSV,
        );
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
        swap([receiverAddress2CSV], [489000]);
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
            u128.fromString(`337572155242047136101`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`662427844757952863899`),
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
            u128.fromString(`33757215524204713610`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`966242784475795286390`),
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
            u128.fromString(`999996746916621072216`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`3253083378927784`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();
        expect(liquidityProvider2.isActive()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`2409482021028055002409`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`50090517978971944997591`),
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
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress5,
            receiverAddress5CSV,
        );
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
        swap([receiverAddress2CSV, receiverAddress5CSV], [489000, 489000]);
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
            u128.fromString(`660581708194112660699`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`51839418291805887339301`),
        );
    });

    /*
    This test validates the behavior of the multi-provider liquidity system through a series of reservations and partial swaps.
    The first reservation requests a significant amount that exhausts the available liquidity from Provider1, Provider2, and Provider3 entirely,
    while also consuming a portion of the initial provider's liquidity. This tests the system's ability to aggregate liquidity across multiple sources.

    Following this reservation, a partial swap is executed where satoshis are sent exclusively to Provider2. The expected behavior is
    that Provider1, Provider3, and the initial provider should have their liquidity restored since they did not receive any satoshis.
    Provider2, having received the satoshis, should be marked as completely bought out and deactivated. Additionally, Provider1 and Provider3 should be added
    to the purge queue, marking them as priority candidates for reuse in subsequent operations.

    The second reservation is designed with a specific amount that should only require liquidity from Provider1, testing the system's ability to select
    appropriate providers based on reservation size. This verifies that the purge queue prioritization is working correctly by reusing Provider1.
    A partial swap follows where no satoshis are sent to Provider1. As a result, Provider1's liquidity should be fully restored,
    and it should return to the purge queue for priority reuse in future reservations.

    The third reservation uses an amount that again should only require Provider1's liquidity. This final step confirms that the purge queue mechanism correctly
    prioritizes Provider1 for reuse, demonstrating the system's efficiency in managing provider resources across multiple reservation cycles.
     */
    it('Test 3', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress3, providerAddress3);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress3,
            receiverAddress3CSV,
        );
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress4, providerAddress4);
        const liquidityProvider3 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress4,
            receiverAddress4CSV,
        );
        expect(liquidityProvider3.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1 - Reserve a big amount.
        // This will use all liquidity of Provider1, Provider2, Provider3 and some of the initial provider.
        setBlockchainEnvironment(112, providerAddress5, providerAddress5);
        reserve(982000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999708551999999999`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`291448000000001`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999708551999999999`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`291448000000001`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999708551999999999`),
        );
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`291448000000001`),
        );
        expect(liquidityProvider3.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`420351316858285714285`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52079648683141714285715`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Partial swap the Reservation1. send only satoshis to Provider2.
        // Provider1, Provider3 and initial provider should be restored.
        // Provider2 should be completely buy and deactivated.
        // Provider1 and Provider3 should go to the purge queue to be reused in priority.
        setBlockchainEnvironment(116, providerAddress5, providerAddress5);
        swap([receiverAddress3CSV], [484000]);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isActive()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider3.isPurged()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Reservation2 - Do another reservation.
        // Given the amount, only Provider1 should be used and it should stay in purge queue.
        setBlockchainEnvironment(118, providerAddress6, providerAddress6);
        reserve(200000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`681592113305726031524`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`318407886694273968476`),
        );
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isActive()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider3.isPurged()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Partial swap the Reservation2. do not send satoshis to Provider1.
        // Provider1 should be restored.
        // Provider1 should go to the purge queue to be reused in priority.
        setBlockchainEnvironment(121, providerAddress6, providerAddress6);
        swap([receiverAddress4CSV], [484000]);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isActive()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider3.isPurged()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Reservation3 - Do another reservation.
        // Given the amount, only some liquidity of Provider1 should be used.
        setBlockchainEnvironment(122, providerAddress7, providerAddress7);
        reserve(200000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`681592113305726031524`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`318407886694273968476`),
        );
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isActive()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider3.isPurged()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();
    });

    /*
    The test examines the system's behavior through four reservations involving five providers (Provider1-4 and an initial provider),
    testing various swap scenarios, provider deactivation, and restoration mechanisms.

    The first reservation consumes all available liquidity from Provider1, Provider2, and Provider3, while partially utilizing Provider4's
    liquidity. The initial provider remains untouched, demonstrating the system's provider selection logic based on some
    predetermined ordering or priority.

    A second large reservation is created that exhausts Provider4's remaining liquidity and begins consuming
    from the initial provider. This tests the system's ability to manage concurrent reservations and track partially consumed provider states.

    The second reservation is then swapped without sending any satoshis to the reserved providers. This action should
    trigger a restoration of the reserved liquidity of the second reservation for both Provider4 and the initial provider,
    testing the system's rollback mechanism for unused reservations. Provider4 is added back to purge queue.

    After handling Reservation2, the system executes a partial swap for Reservation1 with varying satoshi distributions.
    No satoshis are sent to Provider1 or the initial provider, a partial amount is sent to Provider2, and the full amount
    is sent to Provider3.
    The expected outcomes demonstrate nuanced provider state management.
    Provider1, having received no satoshis, should be fully restored and added to the purge queue for priority reuse.
    Provider2, receiving partial payment, should have its liquidity reduced by only the received amount and also join the purge queue.
    Provider3, receiving full payment, should be completely reset and deactivated, removing it from the available provider pool.
    Provider4 should be restored and added to the purge queue, while the initial provider should simply be restored without queue addition.

    The third reservation attempts another large liquidity request. The system should utilize all liquidity from Provider1, Provider2,
    and Provider4 (which are in the purge queue), while correctly excluding the deactivated Provider3. Some liquidity from the initial provider
    is also consumed.
    This reservation is intentionally left unswapped until expiration, testing the system's timeout and cleanup mechanisms.
    Upon expiration, all reserved liquidity should be restored to Provider1, Provider2, Provider4, and the initial provider.
    The active providers (excluding the initial provider) should be re-added to the purge queue.

    The final reservation repeats the pattern of Reservation3, confirming that the system state after expiration handling
    is correct. It should again use all liquidity from Provider1, Provider2, and Provider4, exclude the deactivated Provider3,
    and partially use the initial provider.
     */
    it('Test 4', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress3, providerAddress3);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress3,
            receiverAddress3CSV,
        );
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress4, providerAddress4);
        const liquidityProvider3 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress4,
            receiverAddress4CSV,
        );
        expect(liquidityProvider3.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider4 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress5,
            receiverAddress5CSV,
        );
        expect(liquidityProvider4.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1 - Reserve a big amount.
        // This will use all liquidity of Provider1, Provider2, Provider3.
        // This will use some liquidity of the Provider4 and none from initial provider.
        setBlockchainEnvironment(112, providerAddress6, providerAddress6);
        reserve(982000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999676301580952380`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`323698419047620`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999676301580952380`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`323698419047620`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999676301580952380`),
        );
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`323698419047620`),
        );
        expect(liquidityProvider3.isPurged()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(
            u128.fromString(`452021325114304761904`),
        );
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`547978674885695238096`),
        );
        expect(liquidityProvider4.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Reservation2 - Reserve another big amount.
        // This will use all the remaining liquidity of Provider4, and some of the initial provider.
        setBlockchainEnvironment(113, providerAddress7, providerAddress7);
        reserve(582000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999676301580952380`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`323698419047620`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999676301580952380`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`323698419047620`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999676301580952380`),
        );

        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`323698419047620`),
        );
        expect(liquidityProvider3.isPurged()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999676301580952380`),
        );
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`323698419047620`),
        );
        expect(liquidityProvider4.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`1497923732355580952380`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`51002076267644419047620`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Swap the Reservation2 by not sending any satoshis to reserved providers.
        // Reserved liquidity for Provider4 should be restored and Provider4 is added to purge queue.
        // Reserved liquidity for Initial provider should be restored.
        setBlockchainEnvironment(116, providerAddress7, providerAddress7);
        swap([receiverAddress4CSV], [484000]);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999676301580952380`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`323698419047620`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999676301580952380`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`323698419047620`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999676301580952380`),
        );
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`323698419047620`),
        );

        expect(liquidityProvider3.isPurged()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(
            u128.fromString(`452021325114304761904`),
        );
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`547978674885695238096`),
        );
        expect(liquidityProvider4.isPurged()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Partial swap the Reservation1.
        // Send partial amount of satoshis to Provider2.
        // Send full amount of satoshis to Provider3.
        // Do not send satoshis to initial provider and Provider1.
        // Provider1 should be restored and added to the purge queue.
        // Provider2 should be buy up to the provided amount and added to the purge queue.
        // Provider3 should be resets and deactivated.
        // Provider4 should be restored and added to the purge queue.
        // Initial provider should be restored.
        setBlockchainEnvironment(117, providerAddress6, providerAddress6);
        swap([receiverAddress4CSV, receiverAddress3CSV], [484000, 10000]);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`964847043238095238096`),
        );
        expect(liquidityProvider2.isPurged()).toBeTruthy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.isActive()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider4.isPurged()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Reservation3 - Reserve a big amount.
        // This will use all liquidity of Provider1, Provider2, Provider4.
        // Provider3 should not be used as it is deactivated.
        // This will use some liquidity of the initial provider.
        setBlockchainEnvironment(122, providerAddress7, providerAddress7);
        reserve(5200000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999997202938356395856`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`2797061643604144`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`964845210203966301877`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1833034128936219`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.isActive()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(
            u128.fromString(`999997202938356395856`),
        );
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`2797061643604144`),
        );
        expect(liquidityProvider4.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`15068937240551965804575`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`37431062759448034195425`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // As Reservation was not swapped and expired, it will be purged.
        // Provider1, Provider2, Provider4 and initial provider are restored.
        // Provider1, Provider2, Provider4 are added to purge queue.
        setBlockchainEnvironment(142, msgSender1, msgSender1);
        const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        lq.liquidityQueue.save();
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`964847043238095238096`),
        );
        expect(liquidityProvider2.isPurged()).toBeTruthy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.isActive()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider4.isPurged()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Reservation4 - Reserve a big amount.
        // This will use all liquidity of Provider1, Provider2, Provider4.
        // Those providers are also removed from purge queue.
        // Provider3 should not be used as it is deactivated.
        // This will use some liquidity of the initial provider.
        setBlockchainEnvironment(142, providerAddress7, providerAddress7);
        reserve(2200000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999997202938356395856`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`2797061643604144`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`964845210203966301877`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1833034128936219`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.isActive()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(
            u128.fromString(`999997202938356395856`),
        );
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`2797061643604144`),
        );
        expect(liquidityProvider4.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`4664835207879286055634`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`47835164792120713944366`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();
    });

    /*
    This test validates a sophisticated liquidity management system featuring priority providers, concurrent reservations,
    provider deactivation, and purge queue mechanics through four sequential reservation scenarios.

    The test examines system behavior with five providers (Provider1-4 and an initial provider), where Provider3 has priority status,
    testing reservation handling, swap operations, and automatic cleanup mechanisms.

    The first reservation requests a large amount that completely exhausts the liquidity of Provider1, Provider2, Provider3,
    and Provider4. The system demonstrates its priority logic by utilizing Provider3 first, despite it being listed third.
    After exhausting all regular providers, the reservation also consumes some liquidity from the initial provider, which appears
    to serve as a fallback liquidity source.

    With all regular providers fully reserved by Reservation1, the second reservation can only access the initial provider's remaining
    liquidity. This tests the system's ability to track reserved liquidity across multiple concurrent reservations and correctly identify available sources.

    The second reservation is then swapped without sending any satoshis to the provider. This triggers a complete restoration of the initial provider's liquidity
    that was reserved for Reservation2, demonstrating the system's ability to handle zero-value swaps as cancellations.

    Reservation1 undergoes a full swap with selective payment distribution. Satoshis are sent only to Provider2 and Provider3,
    while Provider1, Provider4, and the initial provider receive nothing.
    The system responds with differentiated handling based on payment status. Provider1 and Provider4, having received no payment,
    have their reserved liquidity fully restored and are added to the purge queue for priority reuse.
    Provider2 and Provider3, having received their required satoshis, are marked as fully bought, triggering a reset and deactivation
    that removes them from the available provider pool.
    The initial provider's reserved liquidity is also restored.

    The third reservation attempts another large liquidity request with a reduced provider pool. The system correctly utilizes
    all available liquidity from Provider1 and Provider4 (pulling them from the purge queue), while also consuming some from the
    initial provider. The deactivated Provider2 and Provider3 are properly excluded from consideration.
    Notably, Provider1 and Provider4 are removed from the purge queue upon being fully reserved.
    This reservation is intentionally left unswapped until expiration. The automatic purge process restores all reserved liquidity
    to Provider1, Provider4, and the initial provider. Provider1 and Provider4 are re-added to the purge queue, ready for subsequent use.

    The fourth reservation confirms the system's state consistency after expiration handling. It successfully reserves all liquidity from Provider1 and Provider4 (again removing them from the purge queue)
    and partially uses the initial provider, matching the expected behavior from Reservation3.
    */
    it('Test 5', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress3, providerAddress3);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress3,
            receiverAddress3CSV,
        );
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress4, providerAddress4);
        const txOut: TransactionOutput[] = [];
        txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
        txOut.push(new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 1000));
        Blockchain.mockTransactionOutput(txOut);
        const liquidityProvider3 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress4,
            receiverAddress4CSV,
            true,
        );
        expect(liquidityProvider3.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`970000000000000000000`),
        );
        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.isPriority()).toBeTruthy();

        Blockchain.mockTransactionOutput([]);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider4 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress5,
            receiverAddress5CSV,
        );
        expect(liquidityProvider4.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1. Reserve a big amount.
        // All liquidity from Provider1, Provider2, Provider3, Provider4 are reserved.
        // As Provider3 is a priority provider it is the first one to be used.
        // Some liquidity from initial provider is also reserved.
        setBlockchainEnvironment(112, providerAddress6, providerAddress6);
        reserve(1582000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999997929618885333333`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`2070381114666667`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999997929618885333333`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`2070381114666667`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(
            u128.fromString(`969999468967213333333`),
        );
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`531032786666667`),
        );
        expect(liquidityProvider3.isPurged()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(
            u128.fromString(`999997929618885333333`),
        );
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`2070381114666667`),
        );
        expect(liquidityProvider4.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`1594265711685463999999`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`50905734288314536000001`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Reservation2. Reserve a big amount.
        // As all liquidity from other providers are fully reserved,
        // only liquidity from initial provider is reserved.
        setBlockchainEnvironment(113, providerAddress7, providerAddress7);
        reserve(582000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999997929618885333333`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`2070381114666667`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999997929618885333333`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`2070381114666667`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(
            u128.fromString(`969999468967213333333`),
        );
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`531032786666667`),
        );
        expect(liquidityProvider3.isPurged()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(
            u128.fromString(`999997929618885333333`),
        );
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`2070381114666667`),
        );
        expect(liquidityProvider4.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`3641293979861463999998`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`48858706020138536000002`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Swap Reservation2.
        // Do not send satoshis to the reserved provider.
        // Reserved liquidity by Reservation2 from the initial provider is restored.
        setBlockchainEnvironment(116, providerAddress7, providerAddress7);
        swap([receiverAddress4CSV], [484000]);
        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`1594265711685463999999`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`50905734288314536000001`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Full Swap Reservation1.
        // Send required satoshis to Provider2 and Provider3.
        // Provider1 and Provider4 have their reserved liquidity restored and they are added to purge queue.
        // Provider2 and Provider3 are fully buy, so they are reset and deactivated.
        // Initial provider reserved liquidity is also restored.
        setBlockchainEnvironment(117, providerAddress6, providerAddress6);
        swap([receiverAddress4CSV, receiverAddress3CSV], [284000, 484000]);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.isPurged()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider4.isPurged()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Reservation3. Reserve a big amount.
        // All liquidity from Provider1 and Provider4 are reserved.
        // They are also both removed from purge queue as they are fully reserved.
        // Some liquidity from initial provider is also reserved.
        // Provider2 and Provider3 are not used as they are deactivated.
        setBlockchainEnvironment(122, providerAddress7, providerAddress7);
        reserve(5200000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998994536495452184`),
        );
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1005463504547816`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isActive()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.isActive()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998994536495452184`),
        );
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1005463504547816`),
        );
        expect(liquidityProvider4.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`15531304761961277268733`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`36968695238038722731267`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // As Reservation3 was not swapped and is now expired it should be purged.
        // All liquidity reserved from Provider1 and Provider4 are restored and add they are added to purge queue.
        // All liquidity reserved from initial provider is also restored.
        setBlockchainEnvironment(142, msgSender1, msgSender1);
        const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        lq.liquidityQueue.save();
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isActive()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.isActive()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider4.isPurged()).toBeTruthy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Reservation4. Reserve a big amount.
        // It should use all liquidity from Provider1 and Provider4 and remove them from the purge queue.
        // It should also use some liquidity from initial provider.
        setBlockchainEnvironment(142, providerAddress7, providerAddress7);
        reserve(2200000);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998994536495452184`),
        );

        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1005463504547816`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isActive()).toBeFalsy();

        expect(liquidityProvider3.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider3.isActive()).toBeFalsy();

        expect(liquidityProvider4.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998994536495452184`),
        );
        expect(liquidityProvider4.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1005463504547816`),
        );
        expect(liquidityProvider4.isPurged()).toBeFalsy();

        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`5417091636364584091943`),
        );
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`47082908363635415908057`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();
    });
});

describe('Reserve,Swap Expired, Purge tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        Blockchain.mockValidateBitcoinAddressResult(true);
        TransferHelper.clearMockedResults();
    });

    /*
    The test examines a single reservation scenario involving two providers (Provider1 and Provider2), testing the system's
    behavior when swapping an expired reservation with different payment outcomes for each provider.

    The reservation consumes all available liquidity from Provider1 and a partial amount from Provider2.
    This establishes a scenario where one provider is fully utilized while another is only partially reserved.

    The reservation is intentionally allowed to expire before any swap attempt is made. Despite the expiration,
    the system proceeds with a swap operation, testing whether expired reservations can still be processed.
    During the swap, the payment distribution is asymmetric. Provider1 receives the full amount of satoshis
    corresponding to its reserved liquidity, while Provider2 receives no satoshis at all.

    The system should handle each provider differently based on the payment received. Provider1, having received full payment
    for its entire liquidity, should be fully bought. Following this, Provider1 should be added to the purge queue, making it available for a reset.
    Provider2, having received no payment despite having liquidity reserved, should have its reserved amount fully restored.
    Provider2 should also be added to the purge queue for future priority usage.
    */
    it('Test1', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress5,
            receiverAddress5CSV,
        );
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1.
        // Reserve all liquidity from Provider1 and some from Provider2.
        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        reserve(491000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`305658669037180952381`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`694341330962819047619`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        // Let the reservation expire and swap.
        // Send full amount of satoshis to Provider1. Do not get more than what was reserved.
        // Send no satoshis to Provider2.
        // Provider1 liquidity should be fully bought and Provider1 added to purge queue.
        // Provider2 reserved liquidity should be fully restored and Provider2 added to purge queue.
        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        swap([receiverAddress2CSV], [489000]);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isPurged()).toBeTruthy();
    });

    /*
    The test examines a single reservation involving two providers (Provider1 and Provider2), testing the system's
    behavior when processing partial payments on an expired reservation and its ability to dynamically calculate
    token purchases based on current pricing.

    The reservation exhausts all available liquidity from Provider1 while reserving only a portion of Provider2's liquidity.
    This creates a scenario with one fully utilized provider and one partially utilized provider.

    The reservation is allowed to expire before swap execution. Despite expiration, the system processes a swap with asymmetric
    payment distribution. Provider1 receives only a partial amount of satoshis (less than its full reserved amount),
    while Provider2 receives no satoshis.

    For Provider1, receiving partial payment triggers a multi-step process. First, all reserved liquidity is restored to available liquidity.
    Then, the system calculates how many tokens can be purchased with the received satoshi amount using the current market price,
    and executes this purchase.
    After processing, Provider1 is added to the purge queue for future priority usage.

    Provider2, having received no payment, undergoes a simpler process. Its reserved liquidity is fully restored, and it is added
    to the purge queue without any token purchase operations.
    */
    it('Test2', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress5,
            receiverAddress5CSV,
        );
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1.
        // Reserve all liquidity from Provider1 and some from Provider2.
        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        reserve(491000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`305658669037180952381`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`694341330962819047619`),
        );

        // Let the reservation expire and swap.
        // Send partial amount of satoshis to Provider1.
        // Send no satoshis to Provider2.
        // Provider1 reserved liquidity should be fully restored and tokens should be bought for the provided amount using the current price.
        // Token bought from Provider1 is capped to the number of tokens originally reserved.
        // Provider1 should also be added to purge queue.
        // Provider2 reserved liquidity should be fully restored and Provider2 added to purge queue.
        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        swap([receiverAddress2CSV], [29000]);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`899926949695238095239`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isPurged()).toBeTruthy();
    });

    /*
    The test examines how the system manages providers whose remaining liquidity falls below operational thresholds
    through two sequential reservations involving Provider1 and the initial provider.

    The first reservation is carefully sized to reserve most of Provider1's liquidity while leaving a very small
    amount available. This remaining amount is deliberately below the system's minimum threshold for viable liquidity provision.
    The reservation undergoes a full swap where all reserved liquidity is purchased with the appropriate satoshi payment.
    Following the swap, Provider1 is added to the purge queue. However, Provider1 still has some liquidity remaining, albeit below the usable threshold.

    The second reservation tests the system's threshold enforcement mechanism. When attempting to fulfill this reservation,
    the system first considers Provider1 since it technically has available liquidity. However, upon detecting that Provider1's
    available liquidity is below the minimum threshold, the system triggers an automatic reset of Provider1.
    After resetting Provider1, the system falls back to the initial provider to fulfill Reservation2's liquidity requirements.
    */
    it('Test3', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1.
        // Reserve liquidity from Provider1 and leave a very small amount of available liquidity
        // that is below the minimum threshold.
        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        reserve(495000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`549451352380953`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999450548647619047`),
        );

        // Let the Reservation1 expires.
        // Fully swap the Reservation1 so all the reserved liquidity is bought.
        // Provider1 should be sent to purge queue to be reset later when trying to be used
        // by another reservation.
        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        swap([receiverAddress2CSV], [495000]);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString('549451352380953'),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        // Reservation2.
        // Reserve liquidity. Provider1 should be tried but as his liquidity is smaller than
        // the minimum threshold, it is resets and removed from the purge queue.
        // Initial provider is used to fulfill the reservation.
        setBlockchainEnvironment(130, providerAddress3, providerAddress3);
        reserve(491000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeFalsy();
        expect(liquidityProvider1.isActive()).toBeFalsy();

        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`51521267580106493416179`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`978732419893506583821`),
        );
    });

    /*
    The test examines how the system processes swaps on expired reservations when providers are left with liquidity below
    minimum thresholds, using two providers with different payment outcomes.

    The reservation is structured to consume most liquidity from both Provider1 and Provider2, deliberately leaving each with
    remaining amounts below the system's minimum threshold. This creates a scenario where both providers become effectively unusable
    for future reservations without reset.

    The reservation is allowed to expire before swap execution. Despite expiration, the system processes a swap with differentiated payment:
        - Provider1 receives full funding for all its reserved liquidity
        - Provider2 receives only partial funding

    For Provider1, receiving full payment results in complete consumption of all reserved liquidity. Since Provider1 already had
    below-threshold available liquidity and now has its reserved portion fully bought, it should be added to the purge queue for
    eventual reset and removal from the queue.

    Provider2 undergoes a more complex transition. Despite receiving only partial payment, its entire reserved liquidity is first restored.
    The system then calculates how many tokens can be purchased with the partial payment amount using current market prices and
    executes this purchase. Provider2 is added to the purge queue.
    */
    it('Test4', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress5,
            receiverAddress5CSV,
        );
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1.
        // Reserve liquidity from Provider1 and Provider2 and leave a very small amount of available liquidity
        // that is below the minimum threshold in both.
        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        reserve(691000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );

        // Let the Reservation1 expires.
        // Swap the Reservation1 by fully funding the Provider1 and partially funding Provider2.
        // All reserved liquidity from Provider1 should be consumed and Provider1 should be added to purge queue.
        // Provider2 reserved liquidity should be fully restored and tokens should be bought for the provided amount using the current price.
        // Provider2 should also be added to purge queue.
        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        swap([receiverAddress2CSV, receiverAddress5CSV], [489000, 200000]);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`309841032380952380953`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isPurged()).toBeTruthy();
    });

    /*
    The test tracks two providers through multiple state transitions across two reservations, demonstrating how the system handles
    fully bought versus partially bought providers and their availability for future use.

    The first reservation strategically consumes liquidity from Provider1 and Provider2, leaving both with available amounts below
    the minimum threshold. This sets up both providers as candidates for future maintenance.
    After allowing the reservation to expire, a swap is executed with different funding levels:
        - Provider1 receives full funding for its entire reserved amount
        - Provider2 receives only partial funding
    The system processes these payments differently. Provider1's reserved liquidity is completely consumed since it was fully funded,
    and Provider1 is added to the purge queue. Provider2's reserved liquidity is fully restored first, then tokens are purchased for
    the partial payment amount at current prices, and Provider2 is also added to the purge queue.

    The second reservation reveals how the system treats providers based on their previous payment status.
    Provider1, having been fully bought in Reservation1, undergoes a complete lifecycle transition. It is reset, deactivated (preventing future use),
    and removed from the purge queue. The system does not attempt to use Provider1 for Reservation2.

    Provider2, having been only partially bought, remains active and available. The system uses Provider2 to reserve liquidity,
    consuming all of its available amount and removing it from the purge queue as it becomes fully utilized. To fulfill the remaining
    reservation requirements, the system falls back to the initial provider.
    */
    it('Test5', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress5,
            receiverAddress5CSV,
        );
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1.
        // Reserve liquidity from Provider1 and Provider2 and leave a very small amount of available liquidity
        // that is below the minimum threshold in both.
        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        reserve(691000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );

        // Let the Reservation1 expires.
        // Swap the Reservation1 by fully funding the Provider1 and partially funding Provider2.
        // All reserved liquidity from Provider1 should be consumed and Provider1 should be added to purge queue.
        // Provider2 reserved liquidity should be fully restored and tokens should be bought for the provided amount using the current price.
        // Provider2 should also be added to purge queue.
        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        swap([receiverAddress2CSV, receiverAddress5CSV], [489000, 200000]);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`309841032380952380953`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isPurged()).toBeTruthy();

        // Reservation2.
        // Provider1 is reset, deactivated, removed from purge queue and not used as it was fully bought.
        // Provider2 is used to reserve liquidity as it was previously partially bought. All Provider2 liquidity is reserved.
        // Provider2 is also removed from the purge queue.
        // Initial provider is also used to fulfill the remaining of the reservation.
        setBlockchainEnvironment(127, providerAddress3, providerAddress3);
        reserve(691000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeFalsy();
        expect(liquidityProvider1.isActive()).toBeFalsy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`414919162377064`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`309840617461790003889`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`51427409534592731086283`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`1072590465407268913717`),
        );
    });

    /*
    The first reservation consumes most liquidity from Provider1 and Provider2, intentionally leaving both with remaining
    amounts below the minimum threshold. This creates two providers in suboptimal states requiring future maintenance.

    After expiration, the reservation is swapped with different funding approaches:
        - Provider1 receives full funding, resulting in complete consumption of its reserved liquidity
        - Provider2 receives partial funding, triggering restoration of reserved liquidity followed by token purchase at current prices
    Both providers are added to the purge queue, acknowledging their below-threshold status.

    The second reservation requests a small amount, testing the system's threshold enforcement. When attempting to use Provider1,
    the system detects its below-threshold liquidity status. Despite Provider1 being in the purge queue and technically having some liquidity,
    the system triggers an automatic reset, deactivates Provider1, and removes it from the purge queue. This prevents Provider1 from
    being used for the reservation.
    Provider2, despite also having below-threshold liquidity, is treated differently. The system successfully restore reserved liquidity and
    reserves liquidity from Provider2 at current market price. Provider2 remains in the purge queue after this reservation,
    maintaining its priority status for future operations.
    */
    it('Test6', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress5,
            receiverAddress5CSV,
        );
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1.
        // Reserve liquidity from Provider1 and Provider2 and leave a very small amount of available liquidity
        // that is below the minimum threshold in both.
        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        reserve(691000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        // Let the Reservation1 expires.
        // Swap the Reservation1 by fully funding the Provider1 and partially funding Provider2.
        // All reserved liquidity from Provider1 should be consumed and Provider1 should be added to purge queue.
        // Provider2 reserved liquidity should be fully restored and tokens should be bought for the provided amount using the current price.
        // Provider2 should also be added to purge queue.
        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        swap([receiverAddress2CSV, receiverAddress5CSV], [489000, 200000]);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`309841032380952380953`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isPurged()).toBeTruthy();

        // Reservation2.
        // Do a reservation with a small amount.
        // As Provider1 liquidity is below the minimum threshold, it is resets, deactivated and removed from the purge queue.
        // Liquidity should only be reserved from Provider2.
        // Provider2 should stay in the purge queue.
        setBlockchainEnvironment(127, providerAddress3, providerAddress3);
        reserve(21000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeFalsy();
        expect(liquidityProvider1.isActive()).toBeFalsy();
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`267827931454396321229`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`42013100926556059724`),
        );
        expect(liquidityProvider2.isPurged()).toBeTruthy();
    });

    /*
    The first reservation consumes almost all of Provider1's liquidity, leaving only a small amount below the minimum threshold,
    while also using some liquidity from Provider2.

    When this reservation expires without being swapped, both providers have their reserved liquidity fully restored.
    A second reservation is created that again uses most of Provider1's liquidity (leaving below-threshold amount) and some
    from Provider2. Provider1 is not added to the purge queue because it's almost fully reserved, while Provider2 is added to
    the purge queue.

    After Reservation2 is established, the expired Reservation1 is swapped. The system enforces threshold rules:
    - Provider1 receives no buy operation because its remaining liquidity doesn't meet the minimum threshold,
    - Provider2 has tokens bought, reducing its liquidity by the purchase amount.
    Both providers are then added to the purge queue.

    This reservation attempts to use Provider2 heavily (leaving below-threshold amount) and falls back to the initial provider.
    Provider1, lacking sufficient available liquidity, is skipped entirely with no state changes. Provider2, being almost fully
    reserved, is removed from the purge queue.

    Both active reservations expire and are purged, triggering full restoration of reserved liquidity to all affected providers.

    The fourth reservation fully reserves Provider1 (leaving below-threshold remainder) and partially reserves Provider2.
    Provider1 is removed from the purge queue upon being fully reserved, while Provider2 is added to the purge queue due
    to partial reservation.

    When Reservation4 is purged, both providers have their liquidity restored and are added back to the purge queue.
    */
    it('Test7', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress5, providerAddress5);
        const liquidityProvider2 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress5,
            receiverAddress5CSV,
        );
        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1.
        // Reserve an amount that will use almost all Provider1 liquidity, leaving only a small amount below minimum threshold.
        // Use some liquidity from Provider2.
        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        reserve(491000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`305658669037180952381`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`694341330962819047619`),
        );

        // Let Reservation1 expire.
        // Provider1 and Provider2 reserved liquidity is fully restored as no swap of Reservation1 was made.
        // Do Reservation2.
        // Reserve an amount that will use almost all Provider1 liquidity, leaving only a small amount below minimum threshold.
        // Use some liquidity from Provider2.
        // As Provider1 is almost fully reserved it is not added to purge queue.
        // Provider2 is added to purge queue.
        setBlockchainEnvironment(122, providerAddress4, providerAddress4);
        reserve(480000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`343617412256228571429`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`656382587743771428571`),
        );
        expect(liquidityProvider2.isPurged()).toBeTruthy();

        // Swap the expired Reservation1.
        // No buy from Provider1 as Provider1 remaining liquidity does not meet minimum threshold.
        // Buy from Provider2. Provider2 liquidity should be reduced by the number of tokens bought.
        // Both provider should be added to purge queue.
        setBlockchainEnvironment(126, providerAddress3, providerAddress3);
        swap([receiverAddress2CSV, receiverAddress5CSV], [489000, 20000]);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`930984103238095238096`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`274601515494323809525`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`656382587743771428571`),
        );
        expect(liquidityProvider2.isPurged()).toBeTruthy();

        // Do Reservation3.
        // Reserve an amount that will use almost all Provider2 liquidity, leaving only a small amount below minimum threshold.
        // Initial provider is also used to fulfill the reservation.
        // As Provider1 does not have enough available liquidity, it is not used and its states does not change.
        // As Provider2 is almost fully reserved by Reservation3, it is removed from the purge queue.
        setBlockchainEnvironment(127, providerAddress3, providerAddress3);
        reserve(480000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1065458057142858`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998934541942857142`),
        );
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`930984103238095238096`),
        );
        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`3043192113540305`),
        );

        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`930981060045981697791`),
        );
        expect(liquidityProvider2.isPurged()).toBeFalsy();

        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`51105285706118989493555`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`1394714293881010506445`),
        );

        // Reservation2 and Reservation3 expire.
        // Purge them and restore reserved liquidity to providers.
        setBlockchainEnvironment(136, msgSender1, msgSender1);
        const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        lq.liquidityQueue.save();

        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`930984103238095238096`),
        );

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`930984103238095238096`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isPurged()).toBeTruthy();

        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        // Do Reservation4.
        // Fully reserve Provider1, leaving only a small amount below the minimum threshold.
        // Provider1 is removed from purge queue,
        // Partially reserve Provider2. Add it to purge queue.
        setBlockchainEnvironment(137, providerAddress3, providerAddress3);
        reserve(480000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1665152871142714`),
        );

        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999998334847128857286`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`261669671902003319717`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(
            u128.fromString(`669314431336091918379`),
        );
        expect(liquidityProvider2.isPurged()).toBeTruthy();

        // Purge Reservation4.
        // Provider1 and Provider2 reserved liquidity should be restored and they should be added to purge queue.
        setBlockchainEnvironment(147, msgSender1, msgSender1);
        const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        lq1.liquidityQueue.save();
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeTruthy();

        expect(liquidityProvider2.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`930984103238095238096`),
        );
        expect(liquidityProvider2.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider2.isPurged()).toBeTruthy();
    });

    //***

    /*
    The test examines how the system prevents swap attempt after its provider has already been consumed.
    The first reservation consumes most of Provider1's liquidity, leaving only a small amount below the minimum threshold.
    It also reserves some liquidity from the initial provider to complete the reservation.
    This reservation is then allowed to expire without being swapped.

    Before handling the expired Reservation1, a second reservation is created with identical parameters:
        - Reserves most of Provider1's remaining liquidity (leaving below-threshold amount)
        - Uses some initial provider liquidity
    This creates a scenario where both reservations have claims on the same Provider1 liquidity, but the first one is expired.

    Reservation2 is swapped with selective funding:
        - Provider1 receives full payment and is completely bought out
        - Initial provider receives no satoshis, triggering restoration of its reserved liquidity

    At this point, Provider1 is fully consumed and is unavailable for any other operations.

    The system then attempts to swap the expired Reservation1, trying to fully fund Provider1. However, Provider1 has already
    been fully bought by Reservation2's swap.
    The expected behavior is that the system detects Provider1's fully bought status and ignores the swap attempt entirely as
    initial provider did not receive any satoshis.
    */
    it('Test8', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        setBlockchainEnvironment(110, providerAddress2, providerAddress2);
        const liquidityProvider1 = listTokenForSale(
            u128.fromU32(1000),
            receiverAddress2,
            receiverAddress2CSV,
        );
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`1000000000000000000000`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1.
        // Reserve liquidity from Provider1 and leave a very small amount of available liquidity
        // that is below the minimum threshold.
        // The reservation also reserve some liquidity from initial provider.
        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        reserve(691000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`549451352380953`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999450548647619047`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`51137785256986742857143`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`1362214743013257142857`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Let the Reservation1 expires and do Reservation2.
        // Reserve liquidity from Provider1 and leave a very small amount of available liquidity
        // that is below the minimum threshold.
        // The reservation also reserve some liquidity from initial provider.
        setBlockchainEnvironment(126, providerAddress4, providerAddress4);
        reserve(691000);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`549451352380953`),
        );
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(
            u128.fromString(`999999450548647619047`),
        );
        expect(liquidityProvider1.isPurged()).toBeFalsy();

        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`51137785256986742857143`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`1362214743013257142857`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Swap Reservation2.
        // Do a full swap for the Provider1 will be fully bought.
        // Don't send satoshis to initial provider, so it is restored.
        setBlockchainEnvironment(129, providerAddress4, providerAddress4);
        swap([receiverAddress2CSV], [489000]);
        expect(liquidityProvider1.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(liquidityProvider1.isPurged()).toBeFalsy();
        expect(liquidityProvider1.isActive()).toBeFalsy();

        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.isPurged()).toBeFalsy();

        // Swap the expired Reservation1 by fully funding the Provider1.
        // Provider1 should be already fully bought.
        // Initial provider do not receive any satoshis. so it is not used.
        // Swap should be ignored and don't buy anything.
        setBlockchainEnvironment(147, providerAddress3, providerAddress3);
        expect(() => {
            swap([receiverAddress2CSV], [489000]);
        }).toThrow();
    });

    /*
    The test examines how the system prevents swap attempt after the initial provider has already been consumed.
    The first reservation consumes most of initial provider's liquidity, leaving only a small amount below the minimum threshold.
    This reservation is then allowed to expire without being swapped.

    Before handling the expired Reservation1, a second reservation is created with identical parameters:
        - Reserves most of initial provider's remaining liquidity (leaving below-threshold amount)
    This creates a scenario where both reservations have claims on the same initial provider liquidity, but the first one is expired.

    Reservation2 is swapped with selective funding:
        - Initial provider receives full payment and is completely bought out

    At this point, initial provider is fully consumed and is unavailable for any other operations.

    The system then attempts to swap the expired Reservation1, trying to fully fund initial provider. However, initial provider has already
    been fully bought by Reservation2's swap.
    The expected behavior is that the system detects initial provider's fully bought status and ignores the swap attempt entirely.
    */
    it('Test9', () => {
        setBlockchainEnvironment(100, providerAddress1, providerAddress1);
        const initialProvider = createPool();
        expect(initialProvider.getLiquidityAmount()).toStrictEqual(
            u128.fromString(`52500000000000000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);

        // Reservation1.
        // Reserve liquidity from initial provider and leave a very small amount of available liquidity
        // that is below the minimum threshold.
        setBlockchainEnvironment(112, providerAddress3, providerAddress3);
        reserve(89100000);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1755844000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`52499998244156000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Let the Reservation1 expires and do Reservation2.
        // Reserve liquidity from initial provider and leave a very small amount of available liquidity
        // that is below the minimum threshold.
        setBlockchainEnvironment(126, providerAddress4, providerAddress4);
        reserve(89100000);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(
            u128.fromString(`1755844000000000`),
        );
        expect(initialProvider.getReservedAmount()).toStrictEqual(
            u128.fromString(`52499998244156000000000`),
        );
        expect(initialProvider.isPurged()).toBeFalsy();

        // Swap Reservation2.
        // Do a full swap so the initial provider will be fully bought.
        setBlockchainEnvironment(129, providerAddress4, providerAddress4);
        swap([receiverAddress1CSV], [89100000]);
        expect(initialProvider.getAvailableLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(initialProvider.isPurged()).toBeFalsy();
        expect(initialProvider.isActive()).toBeFalsy();

        // Swap the expired Reservation1 by fully funding the initial provider.
        // initial provider should be already fully bought. So it should be ignored and don't
        // buy anything.
        setBlockchainEnvironment(147, providerAddress3, providerAddress3);
        expect(() => {
            swap([receiverAddress1CSV], [489000]);
        }).toThrow();
    });
});
