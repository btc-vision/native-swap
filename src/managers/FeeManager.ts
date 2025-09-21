import { Revert, StoredString, StoredU64 } from '@btc-vision/btc-runtime/runtime';
import { FEE_SETTINGS_POINTER, FEES_ADDRESS_POINTER } from '../constants/StoredPointers';
import { INITIAL_FEE_COLLECT_ADDRESS } from '../constants/Contract';

class FeeManagerBase {
    private static CAP_RESERVATION_BASE_FEE: u64 = 100_000;
    private static CAP_PRIORITY_QUEUE_BASE_FEE: u64 = 500_000;
    private static DEFAULT_RESERVATION_BASE_FEE: u64 = 5_000;
    private static DEFAULT_PRIORITY_QUEUE_BASE_FEE: u64 = 50_000;

    private readonly settings: StoredU64 = new StoredU64(FEE_SETTINGS_POINTER, new Uint8Array(30));
    private readonly _feesAddress: StoredString = new StoredString(FEES_ADDRESS_POINTER);

    public get feesAddress(): string {
        return this._feesAddress.value;
    }

    public set feesAddress(address: string) {
        this._feesAddress.value = address;
    }

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
        this._feesAddress.value = INITIAL_FEE_COLLECT_ADDRESS;
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
