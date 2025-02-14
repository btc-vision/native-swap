import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders } from '../lib/Provider';
import { AdvancedStoredString } from '../stored/AdvancedStoredString';
import { u256 } from '@btc-vision/as-bignum/assembly';

describe('AdvancedStoredString', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should get an empty string if not yet saved', () => {
        const store = new AdvancedStoredString(<u16>1, u256.Zero);
        const val = store.value;
        expect(val).toStrictEqual('');
    });

    it('should set a short string (<28 bytes) and retrieve it', () => {
        const store = new AdvancedStoredString(<u16>10, u256.fromU64(20));
        store.value = 'HelloWorld';

        const val = store.value;
        expect(val).toStrictEqual('HelloWorld');
    });

    it('should handle empty string => no chunk, read => empty', () => {
        const store = new AdvancedStoredString(<u16>0, u256.Zero);
        store.value = '';
        const val = store.value;
        expect(val).toStrictEqual('');
    });

    it('should throw if length > 2048', () => {
        expect(() => {
            const store = new AdvancedStoredString(<u16>2, u256.Zero);
            let bigStr = '';
            for (let i = 0; i < 2050; i++) {
                bigStr += 'A';
            }

            store.value = bigStr;
        }).toThrow();
    });

    it('should set a 28-byte string => fits exactly in first chunk after 4 bytes used for length', () => {
        const store = new AdvancedStoredString(<u16>3, u256.Zero);

        let str28 = '';
        for (let i = 0; i < 28; i++) {
            str28 += 'X';
        }

        store.value = str28;
        expect(store.value).toStrictEqual(str28);
    });

    it('should set a >28 bytes but <=32 => second chunk usage test', () => {
        const store = new AdvancedStoredString(<u16>4, u256.Zero);
        let str = 'ABCDEFGHIJKLMNOPQRSTUVWX';

        for (let i = str.length; i < 30; i++) {
            str += 'Z';
        }

        store.value = str;
        expect(store.value).toStrictEqual(str);
    });

    it('should set a large multi-chunk string (e.g. 100 bytes) and read it back', () => {
        const store = new AdvancedStoredString(<u16>5, u256.Zero);
        let str100 = '';
        for (let i = 0; i < 100; i++) {
            str100 += String.fromCharCode(65 + (i % 26));
        }
        store.value = str100;

        const ret = store.value;
        expect(ret).toStrictEqual(str100);
    });

    it('should overwrite existing string if set again', () => {
        const store = new AdvancedStoredString(<u16>6, u256.Zero);
        store.value = 'firstVal';
        store.value = 'secondVal';
        expect(store.value).toStrictEqual('secondVal');
    });

    it('should load a 75-byte string spanning multiple while loop iterations', () => {
        const store = new AdvancedStoredString(<u16>7, u256.Zero);

        let s75 = '';
        for (let i = 0; i < 75; i++) {
            s75 += String.fromCharCode(65 + (i % 26));
        }

        store.value = s75;

        const store2 = new AdvancedStoredString(<u16>7, u256.Zero);
        expect(store2.value).toStrictEqual(s75);
    });
});
