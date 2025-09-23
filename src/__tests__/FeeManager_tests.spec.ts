import { clearCachedProviders } from '../models/Provider';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { FeeManager } from '../managers/FeeManager';
import { INITIAL_FEE_COLLECT_ADDRESS } from '../constants/Contract';
import { setBlockchainEnvironment } from './test_helper';

describe('FeeManagerBase tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        FeeManager.reservationBaseFee = 0;
        FeeManager.priorityQueueBaseFee = 0;
    });

    it('should construct with a StoredU64 object and default do nothing else', () => {
        expect(FeeManager.reservationBaseFee).toStrictEqual(0);
        expect(FeeManager.priorityQueueBaseFee).toStrictEqual(0);
    });

    it('should allow setting a RESERVATION_BASE_FEE value below the cap', () => {
        FeeManager.reservationBaseFee = 50_000;
        expect(FeeManager.reservationBaseFee).toStrictEqual(50_000);
    });

    it('should throw Revert if setting RESERVATION_BASE_FEE above the cap', () => {
        expect(() => {
            FeeManager.reservationBaseFee = 150_000;
        }).toThrow();

        expect(FeeManager.reservationBaseFee).toStrictEqual(0);
    });

    it('should allow setting a PRIORITY_QUEUE_BASE_FEE value below the cap', () => {
        FeeManager.priorityQueueBaseFee = 300_000;
        expect(FeeManager.priorityQueueBaseFee).toStrictEqual(300_000);
    });

    it('should throw Revert if setting PRIORITY_QUEUE_BASE_FEE above the cap', () => {
        expect(() => {
            FeeManager.priorityQueueBaseFee = 600_000;
        }).toThrow();

        expect(FeeManager.priorityQueueBaseFee).toStrictEqual(0);
    });

    it('should call save() on SETTINGS', () => {
        FeeManager.reservationBaseFee = 10_000;
        FeeManager.priorityQueueBaseFee = 50_000;

        FeeManager.save();

        expect(FeeManager.reservationBaseFee).toStrictEqual(10_000);
        expect(FeeManager.priorityQueueBaseFee).toStrictEqual(50_000);
    });

    it('should set default fees in onDeploy()', () => {
        FeeManager.onDeploy();

        expect(FeeManager.reservationBaseFee).toStrictEqual(5_000);
        expect(FeeManager.priorityQueueBaseFee).toStrictEqual(50_000);
        expect(FeeManager.feesAddress).toStrictEqual(INITIAL_FEE_COLLECT_ADDRESS);
    });

    it('should correctly set new fees address', () => {
        setBlockchainEnvironment(1000);
        FeeManager.onDeploy();
        expect(FeeManager.feesAddress).toStrictEqual(INITIAL_FEE_COLLECT_ADDRESS);

        const newAddress = 'a new address';
        setBlockchainEnvironment(1001);
        FeeManager.feesAddress = newAddress;

        setBlockchainEnvironment(1002);
        expect(FeeManager.feesAddress).toStrictEqual(newAddress);
    });
});
