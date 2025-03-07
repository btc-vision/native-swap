import { clearCachedProviders } from '../lib/Provider';
import { FEE_COLLECT_SCRIPT_PUBKEY, getTotalFeeCollected } from '../utils/NativeSwapUtils';
import { Blockchain, TransactionOutput } from '@btc-vision/btc-runtime/runtime';
import { setBlockchainEnvironment } from './test_helper';

describe('OrderBookUtils tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        setBlockchainEnvironment(1000);
    });

    it('should return 0 if outputs array is empty', () => {
        Blockchain.mockTransactionOutput([]);

        const fee = getTotalFeeCollected();
        expect(fee).toStrictEqual(0);
    });

    it('should skip the first output (index=0) even if it matches script pubkey', () => {
        const tx: TransactionOutput[] = [];
        tx.push(new TransactionOutput(0, FEE_COLLECT_SCRIPT_PUBKEY, 5000));
        tx.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 3000));
        Blockchain.mockTransactionOutput(tx);

        const fee = getTotalFeeCollected();
        expect(fee).toStrictEqual(3000);
    });

    it('should return 0 if none of the outputs (after index=0) match the script pubkey', () => {
        const tx: TransactionOutput[] = [];
        tx.push(new TransactionOutput(0, 'someOtherPubkey1', 1000));
        tx.push(new TransactionOutput(1, 'someOtherPubkey2', 2000));
        tx.push(new TransactionOutput(2, 'someOtherPubkey3', 3000));
        Blockchain.mockTransactionOutput(tx);

        const fee = getTotalFeeCollected();
        expect(fee).toStrictEqual(0);
    });

    it('should sum multiple matching outputs from index=1 onward', () => {
        const tx: TransactionOutput[] = [];
        tx.push(new TransactionOutput(0, FEE_COLLECT_SCRIPT_PUBKEY, 9999));
        tx.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, 2000));
        tx.push(new TransactionOutput(2, FEE_COLLECT_SCRIPT_PUBKEY, 4000));
        tx.push(new TransactionOutput(3, 'someOtherPubkey', 9999));
        Blockchain.mockTransactionOutput(tx);

        const fee = getTotalFeeCollected();
        expect(fee).toStrictEqual(6000);
    });

    it('should stop adding if sum might exceed u64.MAX_VALUE', () => {
        const nearMax = <u64>(u64.MAX_VALUE - 1000);
        const bigVal = <u64>2000;

        const tx: TransactionOutput[] = [];
        tx.push(new TransactionOutput(0, 'someOtherPubkey', 100));
        tx.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, nearMax));
        tx.push(new TransactionOutput(2, FEE_COLLECT_SCRIPT_PUBKEY, bigVal));
        Blockchain.mockTransactionOutput(tx);

        const fee = getTotalFeeCollected();
        expect(fee).toStrictEqual(nearMax);
    });

    it('should not break if sum + next < u64.MAX_VALUE', () => {
        const largeVal1 = <u64>(u64.MAX_VALUE - 3000);
        const val2 = <u64>2000;

        const tx: TransactionOutput[] = [];
        tx.push(new TransactionOutput(0, 'someOtherPubkey', 1));
        tx.push(new TransactionOutput(1, FEE_COLLECT_SCRIPT_PUBKEY, largeVal1));
        tx.push(new TransactionOutput(2, FEE_COLLECT_SCRIPT_PUBKEY, val2));
        Blockchain.mockTransactionOutput(tx);

        const sum = largeVal1 + val2;
        expect<bool>(sum < u64.MAX_VALUE).toBeTruthy();

        const fee = getTotalFeeCollected();
        expect(fee).toStrictEqual(sum);
    });
});
