import { StoredString } from '@btc-vision/btc-runtime/runtime';
import { FEES_ADDRESS_POINTER } from '../constants/StoredPointers';
import { INITIAL_FEE_COLLECT_ADDRESS, SWAP_FEE_BPS, SWAP_FEE_DENOM } from '../constants/Contract';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';

/**
 * Slim fee manager. With the flat 0.3% swap fee hardcoded in `Contract.ts`, the only
 * piece of state worth keeping is the fees-collector address. Listing and reservation
 * fees are gone entirely.
 */
class FeeManagerBase {
    private readonly _feesAddress: StoredString = new StoredString(FEES_ADDRESS_POINTER);

    public get feesAddress(): string {
        return this._feesAddress.value;
    }

    public set feesAddress(address: string) {
        this._feesAddress.value = address;
    }

    public save(): void {
        // Nothing to save — _feesAddress saves on assignment.
    }

    public onDeploy(): void {
        this._feesAddress.value = INITIAL_FEE_COLLECT_ADDRESS;
    }

    /** `swapFee = (totalTokensPurchased * SWAP_FEE_BPS) / SWAP_FEE_DENOM` (0.3%). */
    public computeSwapFee(totalTokensPurchased: u256): u256 {
        return SafeMath.div(
            SafeMath.mul(totalTokensPurchased, u256.fromU64(SWAP_FEE_BPS)),
            u256.fromU64(SWAP_FEE_DENOM),
        );
    }
}

export const FeeManager = new FeeManagerBase();
