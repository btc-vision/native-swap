import { Blockchain, TransactionOutput } from '@btc-vision/btc-runtime/runtime';
import { FeeManager } from '../managers/FeeManager';

export function getTotalFeeCollected(): u64 {
    const outputs = Blockchain.tx.outputs;

    let totalFee: u64 = 0;

    // Start as 1 as it will never be the first output.
    for (let i: i32 = 1; i < outputs.length; i++) {
        const output: TransactionOutput = outputs[i];

        // The output destination must be for the fees
        if (output.to !== FeeManager.feesAddress) {
            continue;
        }

        if (u64.MAX_VALUE - totalFee < output.value) {
            break;
        }

        totalFee += output.value;
    }

    return totalFee;
}
