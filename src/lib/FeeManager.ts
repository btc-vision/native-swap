import { Revert, StoredU64 } from '@btc-vision/btc-runtime/runtime';
import { FEE_SETTINGS_POINTER } from './StoredPointers';

class FeeManagerBase {
    private static CAP_RESERVATION_BASE_FEE: u64 = 100_000;
    private static CAP_PRIORITY_QUEUE_BASE_FEE: u64 = 500_000;

    private readonly SETTINGS: StoredU64 = new StoredU64(FEE_SETTINGS_POINTER, new Uint8Array(30));

    public get RESERVATION_BASE_FEE(): u64 {
        return this.SETTINGS.get(0);
    }

    public set RESERVATION_BASE_FEE(value: u64) {
        if (value > FeeManagerBase.CAP_RESERVATION_BASE_FEE) {
            throw new Revert('Reservation base fee cannot exceed the cap');
        }

        this.SETTINGS.set(0, value);
    }

    public get PRIORITY_QUEUE_BASE_FEE(): u64 {
        return this.SETTINGS.get(1);
    }

    public set PRIORITY_QUEUE_BASE_FEE(value: u64) {
        if (value > FeeManagerBase.CAP_PRIORITY_QUEUE_BASE_FEE) {
            throw new Revert('Priority queue base fee cannot exceed the cap');
        }

        this.SETTINGS.set(1, value);
    }

    public save(): void {
        this.SETTINGS.save();
    }

    public onDeploy(): void {
        this.RESERVATION_BASE_FEE = 10_000;
        this.PRIORITY_QUEUE_BASE_FEE = 50_000;
    }
}

export const FeeManager = new FeeManagerBase();
