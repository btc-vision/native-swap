import { clearCachedProviders } from '../lib/Provider';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { FeeManager } from '../lib/FeeManager';

describe('FeeManagerBase tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        FeeManager.RESERVATION_BASE_FEE = 0;
        FeeManager.PRIORITY_QUEUE_BASE_FEE = 0;
    });

    it('should construct with a StoredU64 object and default do nothing else', () => {
        expect(FeeManager.RESERVATION_BASE_FEE).toStrictEqual(0);
        expect(FeeManager.PRIORITY_QUEUE_BASE_FEE).toStrictEqual(0);
    });

    it('should allow setting a RESERVATION_BASE_FEE value below the cap', () => {
        FeeManager.RESERVATION_BASE_FEE = 50_000;
        expect(FeeManager.RESERVATION_BASE_FEE).toStrictEqual(50_000);
    });

    it('should throw Revert if setting RESERVATION_BASE_FEE above the cap', () => {
        expect(() => {
            FeeManager.RESERVATION_BASE_FEE = 150_000;
        }).toThrow();

        expect(FeeManager.RESERVATION_BASE_FEE).toStrictEqual(0);
    });

    it('should allow setting a PRIORITY_QUEUE_BASE_FEE value below the cap', () => {
        FeeManager.PRIORITY_QUEUE_BASE_FEE = 300_000;
        expect(FeeManager.PRIORITY_QUEUE_BASE_FEE).toStrictEqual(300_000);
    });

    it('should throw Revert if setting PRIORITY_QUEUE_BASE_FEE above the cap', () => {
        expect(() => {
            FeeManager.PRIORITY_QUEUE_BASE_FEE = 600_000;
        }).toThrow();

        expect(FeeManager.PRIORITY_QUEUE_BASE_FEE).toStrictEqual(0);
    });

    it('should call save() on SETTINGS', () => {
        FeeManager.RESERVATION_BASE_FEE = 10_000;
        FeeManager.PRIORITY_QUEUE_BASE_FEE = 50_000;

        FeeManager.save();

        expect(FeeManager.RESERVATION_BASE_FEE).toStrictEqual(10_000);
        expect(FeeManager.PRIORITY_QUEUE_BASE_FEE).toStrictEqual(50_000);
    });

    it('should set default fees in onDeploy()', () => {
        FeeManager.onDeploy();

        expect(FeeManager.RESERVATION_BASE_FEE).toStrictEqual(10_000);
        expect(FeeManager.PRIORITY_QUEUE_BASE_FEE).toStrictEqual(50_000);
    });
});
