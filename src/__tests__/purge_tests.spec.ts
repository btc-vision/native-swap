import { clearCachedProviders, getProvider, Provider } from '../models/Provider';
import {
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
    receiverAddress1,
    receiverAddress2,
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
    const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, true);
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

function swap(receiver: string, amount: u64): void {
    const lq1 = createLiquidityQueue(tokenAddress1, tokenIdUint8Array1, false);

    const txOut: TransactionOutput[] = [];
    txOut.push(new TransactionOutput(0, 0, null, `random address`, 0));
    txOut.push(new TransactionOutput(1, 0, null, INITIAL_FEE_COLLECT_ADDRESS, 100));
    txOut.push(new TransactionOutput(2, 0, null, receiver, amount));
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

function logProvider(providerId: u256): void {
    const provider: Provider = getProvider(providerId);
    Blockchain.log(`Provider`);
    Blockchain.log(`---------`);
    Blockchain.log(`id: ${provider.getId()}`);
    Blockchain.log(`getLiquidityAmount: ${provider.getLiquidityAmount()}`);
    Blockchain.log(`getReservedAmount: ${provider.getReservedAmount()}`);
    Blockchain.log(`getAvailableLiquidityAmount: ${provider.getAvailableLiquidityAmount()}`);
    Blockchain.log(`getQueueIndex: ${provider.getQueueIndex()}`);
    Blockchain.log(`getPurgedIndex: ${provider.getPurgedIndex()}`);
    Blockchain.log(`isActive: ${provider.isActive()}`);
    Blockchain.log(`isPurged: ${provider.isPurged()}`);
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
        swap(receiverAddress2, 489000);
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
});
