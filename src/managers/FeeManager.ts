import { Revert, StoredU64 } from '@btc-vision/btc-runtime/runtime';
import { FEE_SETTINGS_POINTER } from '../constants/StoredPointers';

class FeeManagerBase {
    private static CAP_RESERVATION_BASE_FEE: u64 = 100_000;
    private static CAP_PRIORITY_QUEUE_BASE_FEE: u64 = 500_000;
    private static DEFAULT_RESERVATION_BASE_FEE: u64 = 10_000;
    private static DEFAULT_PRIORITY_QUEUE_BASE_FEE: u64 = 50_000;

    private readonly settings: StoredU64 = new StoredU64(FEE_SETTINGS_POINTER, new Uint8Array(30));

    public get reservationBaseFee(): u64 {
        return this.settings.get(0);
    }

    public set reservationBaseFee(value: u64) {
        this.ensureReservationBaseFeeNotAboveCap(value);

        this.settings.set(0, value);
    }

    public get priorityQueueBaseFee(): u64 {
        return this.settings.get(1);
    }

    public set priorityQueueBaseFee(value: u64) {
        this.ensurePriorityQueueBaseFeeNotAboveCap(value);

        this.settings.set(1, value);
    }

    public save(): void {
        this.settings.save();
    }

    public onDeploy(): void {
        this.reservationBaseFee = FeeManagerBase.DEFAULT_RESERVATION_BASE_FEE;
        this.priorityQueueBaseFee = FeeManagerBase.DEFAULT_PRIORITY_QUEUE_BASE_FEE;
    }

    private ensurePriorityQueueBaseFeeNotAboveCap(value: u64): void {
        if (value > FeeManagerBase.CAP_PRIORITY_QUEUE_BASE_FEE) {
            throw new Revert('Priority queue base fee cannot exceed the cap');
        }
    }

    private ensureReservationBaseFeeNotAboveCap(value: u64): void {
        if (value > FeeManagerBase.CAP_RESERVATION_BASE_FEE) {
            throw new Revert('Reservation base fee cannot exceed the cap');
        }
    }
}

export const FeeManager = new FeeManagerBase();
