import { Blockchain, SafeMath, TransactionOutput } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

export const FEE_COLLECT_SCRIPT_PUBKEY: string =
    'bcrt1plz0svv3wl05qrrv0dx8hvh5mgqc7jf3mhqgtw8jnj3l3d3cs6lzsfc3mxh';

export function getTotalFeeCollected(): u64 {
    const outputs = Blockchain.tx.outputs;

    let totalFee: u64 = 0;

    // We are certain it's not the first output.
    for (let i = 1; i < outputs.length; i++) {
        const output: TransactionOutput = outputs[i];

        if (output.to !== FEE_COLLECT_SCRIPT_PUBKEY) {
            continue;
        }

        if (u64.MAX_VALUE - totalFee < output.value) {
            break;
        }

        totalFee += output.value;
    }

    return totalFee;
}

export const QUOTE_SCALE = u256.fromU64(100_000_000);

export function tokensToSatoshis(tokenAmount: u256, scaledPrice: u256): u256 {
    return SafeMath.div(
        SafeMath.mul(SafeMath.add(tokenAmount, u256.One), QUOTE_SCALE), // We have to do plus one here due to the round down
        scaledPrice,
    );
}

export function satoshisToTokens(satoshis: u256, scaledPrice: u256): u256 {
    return SafeMath.div(SafeMath.mul(satoshis, scaledPrice), QUOTE_SCALE);
}
