import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    ExtendedAddress,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { sha256, ripemd160 } from '@btc-vision/btc-runtime/runtime/env/global';
import { clearCachedProviders } from '../models/Provider';
import { Reservation } from '../models/Reservation';
import { tokenAddress1 } from './test_helper';

// Generate unique account address from index using SHA256 hash
function generateAccount(index: u32): ExtendedAddress {
    const writer = new BytesWriter(12);
    writer.writeStringWithLength('addr');
    writer.writeU32(index);
    const hash = sha256(writer.getBuffer());

    const addressArr: u8[] = [];
    for (let i: i32 = 0; i < 32; i++) {
        addressArr.push(hash[i]);
    }

    const writer2 = new BytesWriter(12);
    writer2.writeStringWithLength('pubk');
    writer2.writeU32(index);
    const hash2 = sha256(writer2.getBuffer());

    const pubKeyArr: u8[] = [];
    for (let i: i32 = 0; i < 32; i++) {
        pubKeyArr.push(hash2[i]);
    }

    return new ExtendedAddress(addressArr, pubKeyArr);
}

describe('Reservation ID Generation Tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        Blockchain.mockValidateBitcoinAddressResult(true);
        TransferHelper.clearMockedResults();
    });

    it('should generate different accounts for different indices', () => {
        const account0 = generateAccount(0);
        const account1 = generateAccount(1);
        const account73 = generateAccount(73);

        // Log the accounts
        let acc0Hex = '';
        let acc1Hex = '';
        let acc73Hex = '';
        for (let i: i32 = 0; i < 32; i++) {
            acc0Hex += account0[i].toString() + '-';
            acc1Hex += account1[i].toString() + '-';
            acc73Hex += account73[i].toString() + '-';
        }
        Blockchain.log(`Account 0 (32 bytes): ${acc0Hex}`);
        Blockchain.log(`Account 1 (32 bytes): ${acc1Hex}`);
        Blockchain.log(`Account 73 (32 bytes): ${acc73Hex}`);

        // Check accounts are different
        let same0_1 = true;
        let same0_73 = true;
        for (let i: i32 = 0; i < 32; i++) {
            if (account0[i] != account1[i]) same0_1 = false;
            if (account0[i] != account73[i]) same0_73 = false;
        }
        expect(same0_1).toStrictEqual(false);
        expect(same0_73).toStrictEqual(false);
    });

    it('should have different tweakedPublicKey for different accounts', () => {
        const account0 = generateAccount(0);
        const account73 = generateAccount(73);

        // Log tweakedPublicKey
        let tpk0Hex = '';
        let tpk73Hex = '';
        for (let i: i32 = 0; i < 32; i++) {
            tpk0Hex += account0.tweakedPublicKey[i].toString() + '-';
            tpk73Hex += account73.tweakedPublicKey[i].toString() + '-';
        }
        Blockchain.log(`Account 0 tweakedPublicKey: ${tpk0Hex}`);
        Blockchain.log(`Account 73 tweakedPublicKey: ${tpk73Hex}`);

        // Check they are different
        let same = true;
        for (let i: i32 = 0; i < 32; i++) {
            if (account0.tweakedPublicKey[i] != account73.tweakedPublicKey[i]) {
                same = false;
                break;
            }
        }
        expect(same).toStrictEqual(false);
    });

    it('should write different bytes with BytesWriter for different accounts', () => {
        const account0 = generateAccount(0);
        const account73 = generateAccount(73);

        // Write token + account using BytesWriter
        const writer0 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer0.writeAddress(tokenAddress1);
        writer0.writeAddress(account0);
        const buffer0 = writer0.getBuffer();

        const writer73 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer73.writeAddress(tokenAddress1);
        writer73.writeAddress(account73);
        const buffer73 = writer73.getBuffer();

        // Log buffers
        let buf0Hex = '';
        let buf73Hex = '';
        for (let i: i32 = 0; i < <i32>buffer0.length; i++) {
            buf0Hex += buffer0[i].toString() + '-';
        }
        for (let i: i32 = 0; i < <i32>buffer73.length; i++) {
            buf73Hex += buffer73[i].toString() + '-';
        }
        Blockchain.log(`Buffer 0 (${buffer0.length} bytes): ${buf0Hex}`);
        Blockchain.log(`Buffer 73 (${buffer73.length} bytes): ${buf73Hex}`);

        // Check buffers are different
        expect(buffer0.length).toStrictEqual(64);
        expect(buffer73.length).toStrictEqual(64);

        // First 32 bytes should be same (tokenAddress1)
        for (let i: i32 = 0; i < 32; i++) {
            expect(buffer0[i]).toStrictEqual(buffer73[i]);
        }

        // Second 32 bytes should be different (account addresses)
        let same = true;
        for (let i: i32 = 32; i < 64; i++) {
            if (buffer0[i] != buffer73[i]) {
                same = false;
                break;
            }
        }
        Blockchain.log(`Second 32 bytes are same: ${same ? 'YES' : 'NO'}`);
        expect(same).toStrictEqual(false);
    });

    it('should generate different RIPEMD-160 hashes for different buffers', () => {
        const account0 = generateAccount(0);
        const account73 = generateAccount(73);

        // Create buffers
        const writer0 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer0.writeAddress(tokenAddress1);
        writer0.writeAddress(account0);
        const buffer0 = writer0.getBuffer();

        const writer73 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer73.writeAddress(tokenAddress1);
        writer73.writeAddress(account73);
        const buffer73 = writer73.getBuffer();

        // COPY the buffers to new arrays to ensure no aliasing
        const copy0 = new Uint8Array(64);
        const copy73 = new Uint8Array(64);
        for (let i: i32 = 0; i < 64; i++) {
            copy0[i] = buffer0[i];
            copy73[i] = buffer73[i];
        }

        // Log COPIED buffers right before hashing
        let c0Hex = '';
        let c73Hex = '';
        for (let i: i32 = 0; i < 64; i++) {
            c0Hex += copy0[i].toString() + '-';
            c73Hex += copy73[i].toString() + '-';
        }
        Blockchain.log(`Copy 0 before hash: ${c0Hex}`);
        Blockchain.log(`Copy 73 before hash: ${c73Hex}`);

        // Hash the COPIES
        const hash0 = ripemd160(copy0);
        const hash73 = ripemd160(copy73);

        // Log buffers AFTER hashing to check mutation
        let c0After = '';
        let c73After = '';
        for (let i: i32 = 0; i < 64; i++) {
            c0After += copy0[i].toString() + '-';
            c73After += copy73[i].toString() + '-';
        }
        Blockchain.log(`Copy 0 after hash: ${c0After}`);
        Blockchain.log(`Copy 73 after hash: ${c73After}`);

        // Log hashes
        let h0Hex = '';
        let h73Hex = '';
        for (let i: i32 = 0; i < 20; i++) {
            h0Hex += hash0[i].toString() + '-';
            h73Hex += hash73[i].toString() + '-';
        }
        Blockchain.log(`Hash 0: ${h0Hex}`);
        Blockchain.log(`Hash 73: ${h73Hex}`);

        // Check hashes are different
        let same = true;
        for (let i: i32 = 0; i < 20; i++) {
            if (hash0[i] != hash73[i]) {
                same = false;
                break;
            }
        }
        Blockchain.log(`Hashes are same: ${same ? 'YES' : 'NO'}`);
        expect(same).toStrictEqual(false);
    });

    it('should generate different reservation IDs for different accounts', () => {
        const account0 = generateAccount(0);
        const account73 = generateAccount(73);

        const resId0 = Reservation.generateId(tokenAddress1, account0);
        const resId73 = Reservation.generateId(tokenAddress1, account73);

        // Log reservation IDs
        let id0Hex = '';
        let id73Hex = '';
        for (let i: i32 = 0; i < 16; i++) {
            id0Hex += resId0[i].toString() + '-';
            id73Hex += resId73[i].toString() + '-';
        }
        Blockchain.log(`ResId 0: ${id0Hex}`);
        Blockchain.log(`ResId 73: ${id73Hex}`);

        // Check reservation IDs are different
        let same = true;
        for (let i: i32 = 0; i < 16; i++) {
            if (resId0[i] != resId73[i]) {
                same = false;
                break;
            }
        }
        Blockchain.log(`Reservation IDs are same: ${same ? 'YES' : 'NO'}`);
        expect(same).toStrictEqual(false);
    });

    it('should correctly hash a simple 64-byte input', () => {
        // Create two different 64-byte inputs manually
        const input1 = new Uint8Array(64);
        const input2 = new Uint8Array(64);

        // Fill first 32 bytes identically
        for (let i: i32 = 0; i < 32; i++) {
            input1[i] = <u8>i;
            input2[i] = <u8>i;
        }

        // Fill second 32 bytes differently
        for (let i: i32 = 32; i < 64; i++) {
            input1[i] = <u8>i;
            input2[i] = <u8>(i + 100);
        }

        const hash1 = ripemd160(input1);
        const hash2 = ripemd160(input2);

        let h1Hex = '';
        let h2Hex = '';
        for (let i: i32 = 0; i < 20; i++) {
            h1Hex += hash1[i].toString() + '-';
            h2Hex += hash2[i].toString() + '-';
        }
        Blockchain.log(`Simple input 1 hash: ${h1Hex}`);
        Blockchain.log(`Simple input 2 hash: ${h2Hex}`);

        // Hashes should be different
        let same = true;
        for (let i: i32 = 0; i < 20; i++) {
            if (hash1[i] != hash2[i]) {
                same = false;
                break;
            }
        }
        expect(same).toStrictEqual(false);
    });
});
