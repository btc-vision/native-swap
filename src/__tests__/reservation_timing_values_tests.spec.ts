import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { clearCachedProviders } from '../models/Provider';
import {
    msgSender1,
    providerAddress1,
    setBlockchainEnvironment,
    tokenAddress1,
} from './test_helper';
import { Reservation } from '../models/Reservation';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { TickMath } from '../utils/TickMath';
import {
    RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
    TIMEOUT_AFTER_EXPIRATION_BLOCKS,
} from '../constants/Contract';

/**
 * Exact-value verification of reservation timing math.
 *
 * Relationships under test:
 *   expirationBlock      = creationBlock + RESERVATION_EXPIRE_AFTER_IN_BLOCKS
 *   userTimeoutExpiration = expirationBlock + TIMEOUT_AFTER_EXPIRATION_BLOCKS (only when timed out)
 *   isExpired            ⇔ block.number > expirationBlock
 *   ensureCanBeConsumed  ⇔ block.number >= creationBlock + activationDelay (within window)
 */

function entry(
    providerId: u256,
    amount: u128,
    tick: i32,
    creationBlock: u64,
): ReservationProviderData {
    return new ReservationProviderData(
        providerId,
        amount,
        tick,
        TickMath.tickToPrice(tick),
        creationBlock,
    );
}

describe('Reservation timing — exact block numbers', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('expirationBlock = creationBlock + RESERVATION_EXPIRE_AFTER_IN_BLOCKS (= 8)', () => {
        const r: Reservation = new Reservation(tokenAddress1, providerAddress1);
        r.setCreationBlock(100);
        expect<u64>(r.getExpirationBlock()).toBe(100 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS);
        expect<u64>(r.getExpirationBlock()).toBe(108);
    });

    it('isExpired is false at creationBlock + RESERVATION_EXPIRE_AFTER_IN_BLOCKS (boundary)', () => {
        const r: Reservation = new Reservation(tokenAddress1, providerAddress1);
        r.setCreationBlock(100);
        setBlockchainEnvironment(100 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS, msgSender1, msgSender1);
        // block == expirationBlock → !isExpired (must be strictly greater).
        expect<bool>(r.isExpired()).toBe(false);
    });

    it('isExpired becomes true at creationBlock + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + 1', () => {
        const r: Reservation = new Reservation(tokenAddress1, providerAddress1);
        r.setCreationBlock(100);
        setBlockchainEnvironment(
            100 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + 1,
            msgSender1,
            msgSender1,
        );
        expect<bool>(r.isExpired()).toBe(true);
    });

    it('userTimeoutExpirationBlock is 0 by default', () => {
        const r: Reservation = new Reservation(tokenAddress1, providerAddress1);
        r.setCreationBlock(100);
        expect<u64>(r.getUserTimeoutBlockExpiration()).toBe(0);
    });

    it('timeoutUser sets userTimeoutBlock = expirationBlock + TIMEOUT_AFTER_EXPIRATION_BLOCKS', () => {
        const r: Reservation = new Reservation(tokenAddress1, providerAddress1);
        r.setCreationBlock(100);
        r.timeoutUser();
        const expected: u64 =
            100 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + TIMEOUT_AFTER_EXPIRATION_BLOCKS;
        expect<u64>(r.getUserTimeoutBlockExpiration()).toBe(expected);
        // With current constants: 100 + 8 + 2 = 110.
        expect<u64>(r.getUserTimeoutBlockExpiration()).toBe(110);
    });

    it('isValid: false when expired even with providers; true when not expired with providers', () => {
        const r: Reservation = new Reservation(tokenAddress1, providerAddress1);
        r.setCreationBlock(100);
        r.addProvider(entry(u256.fromU64(1), u128.fromU64(1000), 0, 100));

        // Not yet expired.
        setBlockchainEnvironment(105, msgSender1, msgSender1);
        expect<bool>(r.isValid()).toBe(true);

        // Past expiration.
        setBlockchainEnvironment(110, msgSender1, msgSender1);
        expect<bool>(r.isValid()).toBe(false);
    });

    it('ensureCanBeConsumed: throws same-block when activationDelay = 0', () => {
        expect(() => {
            const r: Reservation = new Reservation(tokenAddress1, providerAddress1);
            r.addProvider(entry(u256.fromU64(1), u128.fromU64(1000), 0, 100));
            r.setCreationBlock(100);
            setBlockchainEnvironment(100, msgSender1, msgSender1);
            r.ensureCanBeConsumed();
        }).toThrow();
    });

    it('ensureCanBeConsumed: passes at activationDelay + 1 blocks past creation', () => {
        // Done direct (no closure wrap) — AS closures aren't enabled and this
        // call is expected NOT to throw, so a plain call is the simplest assertion.
        const r: Reservation = new Reservation(tokenAddress1, providerAddress1);
        r.addProvider(entry(u256.fromU64(1), u128.fromU64(1000), 0, 100));
        r.setCreationBlock(100);
        r.setActivationDelay(2);
        setBlockchainEnvironment(103, msgSender1, msgSender1);
        // If this throws, the test will fail with an uncaught error message.
        r.ensureCanBeConsumed();
        expect<bool>(true).toBe(true);
    });

    it('multiple addProvider calls all share the same creationBlock', () => {
        const r: Reservation = new Reservation(tokenAddress1, providerAddress1);
        r.setCreationBlock(500);
        r.addProvider(entry(u256.fromU64(1), u128.fromU64(1000), 100, 500));
        r.addProvider(entry(u256.fromU64(2), u128.fromU64(2000), -200, 500));
        r.addProvider(entry(u256.fromU64(3), u128.fromU64(3000), 0, 500));

        expect<u32>(r.getProviderCount()).toBe(3);
        for (let i: u32 = 0; i < 3; i++) {
            const pd: ReservationProviderData = r.getProviderAt(i);
            expect<u64>(pd.creationBlock).toBe(500);
        }
    });

    it('expirationBlock survives save/load round-trip', () => {
        const r1: Reservation = new Reservation(tokenAddress1, providerAddress1);
        r1.setCreationBlock(777);
        const exp: u64 = r1.getExpirationBlock();
        r1.addProvider(entry(u256.fromU64(1), u128.fromU64(1000), 0, 777));
        r1.save();

        const r2: Reservation = new Reservation(tokenAddress1, providerAddress1);
        expect<u64>(r2.getExpirationBlock()).toBe(exp);
        expect<u64>(r2.getCreationBlock()).toBe(777);
    });
});

describe('Reservation expire/timeout constants are the documented values', () => {
    it('RESERVATION_EXPIRE_AFTER_IN_BLOCKS == 8', () => {
        expect<u64>(RESERVATION_EXPIRE_AFTER_IN_BLOCKS).toBe(8);
    });
    it('TIMEOUT_AFTER_EXPIRATION_BLOCKS == 2', () => {
        expect<u8>(TIMEOUT_AFTER_EXPIRATION_BLOCKS).toBe(2);
    });
});
