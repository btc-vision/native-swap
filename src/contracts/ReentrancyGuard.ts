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

/**
 * import {
 *     Blockchain,
 *     BytesWriter,
 *     Calldata,
 *     encodeSelector,
 *     OP_NET,
 *     Revert,
 *     Selector,
 *     U256_BYTE_LENGTH,
 * } from '@btc-vision/btc-runtime/runtime';
 * import { u256 } from '@btc-vision/as-bignum/assembly';
 * import { StoredU256 } from '@btc-vision/btc-runtime/runtime/storage/StoredU256';
 *
 * const statusPointer: u16 = Blockchain.nextPointer;
 *
 * export class ReentrancyGuard extends OP_NET {
 *     protected readonly _status: StoredU256;
 *     private readonly disabled: boolean = false;
 *
 *     public constructor() {
 *         super();
 *
 *         this._status = new StoredU256(statusPointer, new Uint8Array(30));
 *     }
 *
 *     public override execute(method: Selector, calldata: Calldata): BytesWriter {
 *         switch (method) {
 *             case encodeSelector('status()'):
 *                 return this.status(calldata);
 *             default:
 *                 return super.execute(method, calldata);
 *         }
 *     }
 *
 *     public status(_calldata: Calldata): BytesWriter {
 *         const response = new BytesWriter(U256_BYTE_LENGTH);
 *         response.writeU256(this._nonces());
 *         return response;
 *     }
 *
 *     public checkReentrancy(): void {
 *         if (!this.disabled && u256.eq(this._nonces(), u256.One)) {
 *             throw new Revert(`NATIVE_SWAP: LOCKED`);
 *         }
 *     }
 *
 *     protected _nonces(): u256 {
 *         return this._status.value;
 *     }
 *
 *     protected _startEntry(): boolean {
 *         this._status.set(u256.One);
 *         return true;
 *     }
 *
 *     protected _stopEntry(): boolean {
 *         this._status.set(u256.Zero);
 *         return true;
 *     }
 * }
 */
