import { clearCachedProviders } from '../models/Provider';
import { getTotalFeeCollected } from '../utils/BlockchainUtils';
import { Blockchain, TransactionOutput } from '@btc-vision/btc-runtime/runtime';
import { setBlockchainEnvironment } from './test_helper';
import { FeeManager } from '../managers/FeeManager';

describe('OrderBookUtils tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        setBlockchainEnvironment(1000);
        FeeManager.onDeploy();
    });

    describe('OrderBookUtils tests - initial default fees address', () => {
        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            setBlockchainEnvironment(1000);
            FeeManager.onDeploy();
        });

        it('should return 0 if outputs array is empty', () => {
            Blockchain.mockTransactionOutput([]);

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(0);
        });

        it('should skip the first output (index=0) even if it matches fees address', () => {
            const tx: TransactionOutput[] = [];
            tx.push(new TransactionOutput(0, 0, null, FeeManager.feesAddress, 5000));
            tx.push(new TransactionOutput(1, 0, null, FeeManager.feesAddress, 3000));
            Blockchain.mockTransactionOutput(tx);

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(3000);
        });

        it('should return 0 if none of the outputs (after index=0) match the fees address', () => {
            const tx: TransactionOutput[] = [];
            tx.push(new TransactionOutput(0, 0, null, 'someOtherPubkey1', 1000));
            tx.push(new TransactionOutput(1, 0, null, 'someOtherPubkey2', 2000));
            tx.push(new TransactionOutput(2, 0, null, 'someOtherPubkey3', 3000));
            Blockchain.mockTransactionOutput(tx);

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(0);
        });

        it('should sum multiple matching outputs from index=1 onward', () => {
            const tx: TransactionOutput[] = [];
            tx.push(new TransactionOutput(0, 0, null, FeeManager.feesAddress, 9999));
            tx.push(new TransactionOutput(1, 0, null, FeeManager.feesAddress, 2000));
            tx.push(new TransactionOutput(2, 0, null, FeeManager.feesAddress, 4000));
            tx.push(new TransactionOutput(3, 0, null, 'someOtherPubkey', 9999));
            Blockchain.mockTransactionOutput(tx);

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(6000);
        });

        it('should stop adding if sum might exceed u64.MAX_VALUE', () => {
            const nearMax = <u64>(u64.MAX_VALUE - 1000);
            const bigVal = <u64>2000;

            const tx: TransactionOutput[] = [];
            tx.push(new TransactionOutput(0, 0, null, 'someOtherPubkey', 100));
            tx.push(new TransactionOutput(1, 0, null, FeeManager.feesAddress, nearMax));
            tx.push(new TransactionOutput(2, 0, null, FeeManager.feesAddress, bigVal));
            Blockchain.mockTransactionOutput(tx);

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(nearMax);
        });

        it('should not break if sum + next < u64.MAX_VALUE', () => {
            const largeVal1 = <u64>(u64.MAX_VALUE - 3000);
            const val2 = <u64>2000;

            const tx: TransactionOutput[] = [];
            tx.push(new TransactionOutput(0, 0, null, 'someOtherPubkey', 1));
            tx.push(new TransactionOutput(1, 0, null, FeeManager.feesAddress, largeVal1));
            tx.push(new TransactionOutput(2, 0, null, FeeManager.feesAddress, val2));
            Blockchain.mockTransactionOutput(tx);

            const sum = largeVal1 + val2;
            expect(sum < u64.MAX_VALUE).toBeTruthy();

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(sum);
        });
    });

    describe('OrderBookUtils tests - new fees address', () => {
        const newRandomFeesAddress = `tb1qm7w8k3x2v9n4p6r8s5t1u0y7e9w2q5r8x3c6v9n2m`;

        beforeEach(() => {
            clearCachedProviders();
            Blockchain.clearStorage();
            Blockchain.clearMockedResults();
            FeeManager.feesAddress = newRandomFeesAddress;
            setBlockchainEnvironment(1000);
        });

        it('should return 0 if outputs array is empty', () => {
            expect(FeeManager.feesAddress).toStrictEqual(newRandomFeesAddress);
            Blockchain.mockTransactionOutput([]);

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(0);
        });

        it('should skip the first output (index=0) even if it matches fees address', () => {
            expect(FeeManager.feesAddress).toStrictEqual(newRandomFeesAddress);
            const tx: TransactionOutput[] = [];
            tx.push(new TransactionOutput(0, 0, null, FeeManager.feesAddress, 5000));
            tx.push(new TransactionOutput(1, 0, null, FeeManager.feesAddress, 3000));
            Blockchain.mockTransactionOutput(tx);

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(3000);
        });

        it('should return 0 if none of the outputs (after index=0) match the fees address', () => {
            expect(FeeManager.feesAddress).toStrictEqual(newRandomFeesAddress);
            const tx: TransactionOutput[] = [];
            tx.push(new TransactionOutput(0, 0, null, 'someOtherPubkey1', 1000));
            tx.push(new TransactionOutput(1, 0, null, 'someOtherPubkey2', 2000));
            tx.push(new TransactionOutput(2, 0, null, 'someOtherPubkey3', 3000));
            Blockchain.mockTransactionOutput(tx);

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(0);
        });

        it('should sum multiple matching outputs from index=1 onward', () => {
            expect(FeeManager.feesAddress).toStrictEqual(newRandomFeesAddress);
            const tx: TransactionOutput[] = [];
            tx.push(new TransactionOutput(0, 0, null, FeeManager.feesAddress, 9999));
            tx.push(new TransactionOutput(1, 0, null, FeeManager.feesAddress, 2000));
            tx.push(new TransactionOutput(2, 0, null, FeeManager.feesAddress, 4000));
            tx.push(new TransactionOutput(3, 0, null, 'someOtherPubkey', 9999));
            Blockchain.mockTransactionOutput(tx);

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(6000);
        });

        it('should stop adding if sum might exceed u64.MAX_VALUE', () => {
            expect(FeeManager.feesAddress).toStrictEqual(newRandomFeesAddress);
            const nearMax = <u64>(u64.MAX_VALUE - 1000);
            const bigVal = <u64>2000;

            const tx: TransactionOutput[] = [];
            tx.push(new TransactionOutput(0, 0, null, 'someOtherPubkey', 100));
            tx.push(new TransactionOutput(1, 0, null, FeeManager.feesAddress, nearMax));
            tx.push(new TransactionOutput(2, 0, null, FeeManager.feesAddress, bigVal));
            Blockchain.mockTransactionOutput(tx);

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(nearMax);
        });

        it('should not break if sum + next < u64.MAX_VALUE', () => {
            expect(FeeManager.feesAddress).toStrictEqual(newRandomFeesAddress);
            const largeVal1 = <u64>(u64.MAX_VALUE - 3000);
            const val2 = <u64>2000;

            const tx: TransactionOutput[] = [];
            tx.push(new TransactionOutput(0, 0, null, 'someOtherPubkey', 1));
            tx.push(new TransactionOutput(1, 0, null, FeeManager.feesAddress, largeVal1));
            tx.push(new TransactionOutput(2, 0, null, FeeManager.feesAddress, val2));
            Blockchain.mockTransactionOutput(tx);

            const sum = largeVal1 + val2;
            expect(sum < u64.MAX_VALUE).toBeTruthy();

            const fee = getTotalFeeCollected();
            expect(fee).toStrictEqual(sum);
        });
    });
});
