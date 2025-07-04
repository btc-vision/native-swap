import { Blockchain, TransferHelper, u256To30Bytes } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { clearCachedProviders } from '../models/Provider';
import { ReservationData } from '../models/ReservationData';
import { RESERVATION_DATA_POINTER } from '../constants/StoredPointers';
import {
    INDEX_NOT_SET_VALUE,
    RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
    TIMEOUT_AFTER_EXPIRATION_BLOCKS,
} from '../constants/Contract';

describe('ReservationData tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('throws if subPointer length > 30', () => {
        expect(() => {
            const ptr: u16 = 1;
            const badSub = new Uint8Array(31);

            new ReservationData(ptr, badSub);
        }).toThrow();
    });

    it('ensureValues with EMPTY_BUFFER sets defaults', () => {
        const providerBuffer: Uint8Array = u256To30Bytes(u256.fromU64(1111111111111111));
        const reservationData = new ReservationData(RESERVATION_DATA_POINTER, providerBuffer);

        expect(reservationData.timeout).toBeFalsy();
        expect(reservationData.activationDelay).toStrictEqual(0);
        expect(reservationData.purgeIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
        expect(reservationData.creationBlock).toStrictEqual(0);
        expect(reservationData.expirationBlock).toStrictEqual(RESERVATION_EXPIRE_AFTER_IN_BLOCKS);
        expect(reservationData.userTimeoutExpirationBlock).toStrictEqual(0);
    });

    it('setter marks change and save persists values', () => {
        const providerBuffer: Uint8Array = u256To30Bytes(u256.fromU64(1111111111111111));
        const reservationData = new ReservationData(RESERVATION_DATA_POINTER, providerBuffer);

        reservationData.activationDelay = 10;
        reservationData.purgeIndex = 20;
        reservationData.creationBlock = 101;
        reservationData.timeout = true;
        reservationData.save();

        const reservationData2 = new ReservationData(RESERVATION_DATA_POINTER, providerBuffer);
        expect(reservationData2.timeout).toBeTruthy();
        expect(reservationData2.activationDelay).toStrictEqual(10);
        expect(reservationData2.purgeIndex).toStrictEqual(20);
        expect(reservationData2.creationBlock).toStrictEqual(101);
        expect(reservationData2.expirationBlock).toStrictEqual(
            101 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
        );
        expect(reservationData2.userTimeoutExpirationBlock).toStrictEqual(
            101 + TIMEOUT_AFTER_EXPIRATION_BLOCKS + RESERVATION_EXPIRE_AFTER_IN_BLOCKS,
        );
    });

    it('setter creationBlock resets timeout', () => {
        const providerBuffer: Uint8Array = u256To30Bytes(u256.fromU64(1111111111111111));
        const reservationData = new ReservationData(RESERVATION_DATA_POINTER, providerBuffer);

        reservationData.timeout = true;
        reservationData.creationBlock = 100;

        expect(reservationData.timeout).toBeFalsy();
        expect(reservationData.creationBlock).toStrictEqual(100);
    });

    it('userTimeoutExpirationBlock returns extended expiration when timed out', () => {
        const providerBuffer: Uint8Array = u256To30Bytes(u256.fromU64(1111111111111111));
        const reservationData = new ReservationData(RESERVATION_DATA_POINTER, providerBuffer);

        reservationData.creationBlock = 50;
        reservationData.timeout = true;

        const expected = 50 + RESERVATION_EXPIRE_AFTER_IN_BLOCKS + TIMEOUT_AFTER_EXPIRATION_BLOCKS;
        expect(reservationData.userTimeoutExpirationBlock).toStrictEqual(expected);
    });

    it('userTimeoutExpirationBlock returns 0 when not timed out', () => {
        const providerBuffer: Uint8Array = u256To30Bytes(u256.fromU64(1111111111111111));
        const reservationData = new ReservationData(RESERVATION_DATA_POINTER, providerBuffer);

        reservationData.creationBlock = 50;
        reservationData.timeout = false;

        expect(reservationData.userTimeoutExpirationBlock).toStrictEqual(0);
    });

    it('reset(false) clears fields and sets creationBlock to 0', () => {
        const providerBuffer: Uint8Array = u256To30Bytes(u256.fromU64(1111111111111111));
        const reservationData = new ReservationData(RESERVATION_DATA_POINTER, providerBuffer);
        reservationData.timeout = true;
        reservationData.activationDelay = 3;
        reservationData.purgeIndex = 9;
        reservationData.creationBlock = 20;

        reservationData.reset(false);

        expect(reservationData.timeout).toBeFalsy();
        expect(reservationData.activationDelay).toStrictEqual(0);
        expect(reservationData.purgeIndex).toStrictEqual(INDEX_NOT_SET_VALUE);
        expect(reservationData.creationBlock).toStrictEqual(0);
    });

    it('reset(true) sets timeout but leaves creationBlock unchanged', () => {
        const providerBuffer: Uint8Array = u256To30Bytes(u256.fromU64(1111111111111111));
        const reservationData = new ReservationData(RESERVATION_DATA_POINTER, providerBuffer);
        reservationData.creationBlock = 30;
        reservationData.reset(true);
        expect(reservationData.timeout).toBeTruthy();
        expect(reservationData.creationBlock).toStrictEqual(30);
    });
});
