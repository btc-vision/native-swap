import { Blockchain, OP_NET, Revert, StoredBoolean } from '@btc-vision/btc-runtime/runtime';

const statusPointer: u16 = Blockchain.nextPointer;

export class ReentrancyGuard extends OP_NET {
    protected readonly _locked: StoredBoolean;

    protected constructor() {
        super();

        this._locked = new StoredBoolean(statusPointer, false);
    }

    public override onExecutionCompleted(): void {
        super.onExecutionCompleted();

        this.nonReentrantAfter();
    }

    public override onExecutionStarted(): void {
        super.onExecutionStarted();

        this.nonReentrantBefore();
    }

    public nonReentrantBefore(): void {
        // On the first call to nonReentrant, _status will be initialized to false
        if (this._locked.value) {
            this.reentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        this._locked.value = true;
    }

    public nonReentrantAfter(): void {
        // By storing the original value once again, a refund is triggered(see
        this._locked.value = false;
    }

    public reentrancyGuardEntered(): boolean {
        return this._locked.value === true;
    }

    /**
     * @dev Unauthorized reentrant call.
     */
    protected reentrancyGuardReentrantCall(): void {
        throw new Revert('ReentrancyGuard: LOCKED');
    }
}
