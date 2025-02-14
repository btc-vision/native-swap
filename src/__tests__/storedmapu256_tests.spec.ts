import { clearCachedProviders } from '../lib/Provider';
import { Blockchain } from '../../../btc-runtime-new/runtime';
import { StoredMapU256 } from '../stored/StoredMapU256';
import { u256 } from '@btc-vision/as-bignum/assembly';

describe('StoredMapU256 tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should store & retrieve a value for a given key', () => {
        const map = new StoredMapU256(<u16>10, u256.fromU64(20));
        map.set(u256.fromU64(100), u256.fromU64(500));

        const val = map.get(u256.fromU64(100));
        expect(val).toStrictEqual(u256.fromU32(500));
    });

    it('should return Zero if key not found', () => {
        const map = new StoredMapU256(<u16>10, u256.fromU64(20));
        const val = map.get(u256.fromU64(999));
        expect(val).toStrictEqual(u256.Zero);
    });

    it('should overwrite an existing key with new value', () => {
        const map = new StoredMapU256(<u16>1, u256.fromU64(2));
        map.set(u256.fromU64(500), u256.fromU64(1000));
        map.set(u256.fromU64(500), u256.fromU64(2000));
        const val = map.get(u256.fromU64(500));
        expect(val).toStrictEqual(u256.fromU32(2000));
    });

    it('should delete a key => set it to Zero', () => {
        const map = new StoredMapU256(<u16>1, u256.fromU64(2));
        map.set(u256.fromU64(123), u256.fromU64(456));

        expect(map.get(u256.fromU64(123))).toStrictEqual(u256.fromU32(456));

        map.delete(u256.fromU64(123));

        expect(map.get(u256.fromU64(123))).toStrictEqual(u256.Zero);
    });

    it('should call getKeyPointer with pointer & subPointer => unique pointer for each key', () => {
        const map = new StoredMapU256(<u16>99, u256.fromU64(1));

        map.set(u256.fromU64(10), u256.fromU64(1010));
        map.set(u256.fromU64(20), u256.fromU64(2020));

        expect(map.get(u256.fromU64(10))).toStrictEqual(u256.fromU32(1010));
        expect(map.get(u256.fromU64(20))).toStrictEqual(u256.fromU32(2020));
    });

    it('should handle subPointer = 0 => pointer is stable, but different pointer => same key => same location', () => {
        const map = new StoredMapU256(<u16>50, u256.Zero);

        map.set(u256.fromU64(777), u256.fromU64(1111));
        map.set(u256.fromU64(777), u256.fromU64(2222));
        const val = map.get(u256.fromU64(777));
        expect(val).toStrictEqual(u256.fromU32(2222));
    });
});
