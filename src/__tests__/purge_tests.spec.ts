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
    INITIAL_FEE_COLLECT_ADDRESS,
    MAXIMUM_PROVIDER_PER_RESERVATIONS,
} from '../constants/Contract';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ListTokensForSaleOperation } from '../operations/ListTokensForSaleOperation';
import { ReserveLiquidityOperation } from '../operations/ReserveLiquidityOperation';
import { SwapOperation } from '../operations/SwapOperation';
import { Reservation } from '../models/Reservation';

const tokenDec = 18;

function createPool(): u256 {
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

    return initialProvider;
}

function listTokenForSale(amount: u128, receiverAddress: string, priority: boolean = false): u256 {
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

    return liquidityProvider;
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

function logProvider(providerId: u256, name: string = 'Provider'): void {
    const provider: Provider = getProvider(providerId);
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

describe('Purge tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        Blockchain.mockValidateBitcoinAddressResult(true);
        TransferHelper.clearMockedResults();
    });

    it('Test 1', () => {
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

        setBlockchainEnvironment(116, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n116 - Swap #1');
        swap([receiverAddress2], [489000]);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(118, providerAddress4, providerAddress4);
        Blockchain.log('\r\n\r\n118 - Reserve #2');
        const reserver2: u256 = reserve(100000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(132, msgSender1, msgSender1);
        Blockchain.log('\r\n\r\n132 - Purge');
        const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
        lq.liquidityQueue.save();
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(133, msgSender1, msgSender1);
        Blockchain.log('\r\n\r\n133 - Change token price');
        const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
        lq1.liquidityQueue.decreaseVirtualSatoshisReserve(20000000);

        setBlockchainEnvironment(134, providerAddress6, providerAddress6);
        Blockchain.log('\r\n\r\n134 - Reserve #3');
        const reserver3: u256 = reserve(10000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);

        setBlockchainEnvironment(134, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n134 - Reserve #4');
        const reserver4: u256 = reserve(1000000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
        logProvider(initialProvider);

        /*
                setBlockchainEnvironment(122, msgSender1, msgSender1);
                Blockchain.log('\r\n\r\n122 - Purge');
                const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                lq.liquidityQueue.save();
                logProvider(liquidityProvider1);
                logProvider(liquidityProvider2);
        
                setBlockchainEnvironment(123, providerAddress4, providerAddress4);
                Blockchain.log('\r\n\r\n123 - Reserve #2');
                const reserver2: u256 = reserve(100000);
                logProvider(liquidityProvider1);
                logProvider(liquidityProvider2);
        */
        /* setBlockchainEnvironment(124, providerAddress6, providerAddress6);
         Blockchain.log('\r\n\r\n124 - Reserve #3');
         const reserver3: u256 = reserve(1000000);
         logProvider(liquidityProvider1);
         logProvider(liquidityProvider2);*/
    });

    it('Test 2', () => {
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
        const reserver1: u256 = reserve(982000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
        logProvider(initialProvider);

        setBlockchainEnvironment(116, providerAddress3, providerAddress3);
        Blockchain.log('\r\n\r\n116 - Swap #1');
        swap([receiverAddress2, receiverAddress5], [489000, 489000]);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
        logProvider(initialProvider);

        setBlockchainEnvironment(118, providerAddress4, providerAddress4);
        Blockchain.log('\r\n\r\n118 - Reserve #2');
        const reserver2: u256 = reserve(200000);
        logProvider(liquidityProvider1);
        logProvider(liquidityProvider2);
        logProvider(initialProvider);
    });

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

        setBlockchainEnvironment(112, providerAddress5, providerAddress5);
        Blockchain.log('\r\n\r\n112 - Reserve #1');
        const reserver1: u256 = reserve(982000);
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
        const reserver2: u256 = reserve(200000);
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
        const reserver3: u256 = reserve(200000);
        logProvider(liquidityProvider1, 'Provider 1');
        logProvider(liquidityProvider2, 'Provider 2');
        logProvider(liquidityProvider3, 'Provider 3');
        logProvider(initialProvider, 'Initial Provider');

        /*
                setBlockchainEnvironment(132, msgSender1, msgSender1);
                Blockchain.log('\r\n\r\n132 - Purge');
                const lq = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
                lq.liquidityQueue.save();
                logProvider(liquidityProvider1);
                logProvider(liquidityProvider2);

                setBlockchainEnvironment(133, msgSender1, msgSender1);
                Blockchain.log('\r\n\r\n133 - Change token price');
                const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);
                Blockchain.log(`quote: ${lq1.liquidityQueue.quote()}`);
                lq1.liquidityQueue.decreaseVirtualSatoshisReserve(20000000);
                Blockchain.log(`quote2: ${lq1.liquidityQueue.quote()}`);

                setBlockchainEnvironment(134, providerAddress6, providerAddress6);
                Blockchain.log('\r\n\r\n134 - Reserve #3');
                const reserver3: u256 = reserve(10000);
                logProvider(liquidityProvider1);
                logProvider(liquidityProvider2);

                setBlockchainEnvironment(134, providerAddress3, providerAddress3);
                Blockchain.log('\r\n\r\n134 - Reserve #4');
                const reserver4: u256 = reserve(1000000);
                logProvider(liquidityProvider1);
                logProvider(liquidityProvider2);
                logProvider(initialProvider);
        */
    });

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
});

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
