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

    it('should hash buffers created in sequence independently', () => {
        // Create account0 first, hash it immediately
        const account0 = generateAccount(0);
        const writer0 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer0.writeAddress(tokenAddress1);
        writer0.writeAddress(account0);
        const buffer0 = writer0.getBuffer();

        // Hash buffer0 BEFORE creating buffer73
        const hash0 = ripemd160(buffer0);

        // Now create account73 and buffer73
        const account73 = generateAccount(73);
        const writer73 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer73.writeAddress(tokenAddress1);
        writer73.writeAddress(account73);
        const buffer73 = writer73.getBuffer();

        // Hash buffer73
        const hash73 = ripemd160(buffer73);

        // Log hashes
        let h0Hex = '';
        let h73Hex = '';
        for (let i: i32 = 0; i < 20; i++) {
            h0Hex += hash0[i].toString() + '-';
            h73Hex += hash73[i].toString() + '-';
        }
        Blockchain.log(`Sequential Hash 0: ${h0Hex}`);
        Blockchain.log(`Sequential Hash 73: ${h73Hex}`);

        // Check if hashes are different
        let same = true;
        for (let i: i32 = 0; i < 20; i++) {
            if (hash0[i] != hash73[i]) {
                same = false;
                break;
            }
        }
        Blockchain.log(`Sequential hashes are same: ${same ? 'YES' : 'NO'}`);
        expect(same).toStrictEqual(false);
    });

    it('should verify buffer memory is independent', () => {
        const account0 = generateAccount(0);
        const account73 = generateAccount(73);

        const writer0 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer0.writeAddress(tokenAddress1);
        writer0.writeAddress(account0);

        const writer73 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer73.writeAddress(tokenAddress1);
        writer73.writeAddress(account73);

        // Get buffer references
        const buf0 = writer0.getBuffer();
        const buf73 = writer73.getBuffer();

        // Log dataStart pointers (memory addresses)
        Blockchain.log(`buf0.dataStart: ${buf0.dataStart.toString()}`);
        Blockchain.log(`buf73.dataStart: ${buf73.dataStart.toString()}`);

        // They should be different memory locations
        expect(buf0.dataStart).not.toStrictEqual(buf73.dataStart);

        // Now hash using the NATIVE Uint8Array methods
        const freshCopy0 = new Uint8Array(64);
        const freshCopy73 = new Uint8Array(64);

        // Use memory.copy to properly copy data
        memory.copy(freshCopy0.dataStart, buf0.dataStart, 64);
        memory.copy(freshCopy73.dataStart, buf73.dataStart, 64);

        // Log copied data
        let fc0Hex = '';
        let fc73Hex = '';
        for (let i: i32 = 0; i < 64; i++) {
            fc0Hex += freshCopy0[i].toString() + '-';
            fc73Hex += freshCopy73[i].toString() + '-';
        }
        Blockchain.log(`FreshCopy 0: ${fc0Hex}`);
        Blockchain.log(`FreshCopy 73: ${fc73Hex}`);

        const fh0 = ripemd160(freshCopy0);
        const fh73 = ripemd160(freshCopy73);

        let fh0Hex = '';
        let fh73Hex = '';
        for (let i: i32 = 0; i < 20; i++) {
            fh0Hex += fh0[i].toString() + '-';
            fh73Hex += fh73[i].toString() + '-';
        }
        Blockchain.log(`FreshCopy Hash 0: ${fh0Hex}`);
        Blockchain.log(`FreshCopy Hash 73: ${fh73Hex}`);

        let same = true;
        for (let i: i32 = 0; i < 20; i++) {
            if (fh0[i] != fh73[i]) {
                same = false;
                break;
            }
        }
        Blockchain.log(`FreshCopy hashes are same: ${same ? 'YES' : 'NO'}`);
        expect(same).toStrictEqual(false);
    });

    it('should test msg.set behavior with address-derived data', () => {
        const account0 = generateAccount(0);
        const account73 = generateAccount(73);

        const writer0 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer0.writeAddress(tokenAddress1);
        writer0.writeAddress(account0);

        const writer73 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer73.writeAddress(tokenAddress1);
        writer73.writeAddress(account73);

        const buf0 = writer0.getBuffer();
        const buf73 = writer73.getBuffer();

        // Simulate what ripemd160f does
        const len0 = buf0.length;
        const padLength0 = <i32>((56 - (len0 + 1) % 64 + 64) % 64);
        const totalLength0 = len0 + 1 + padLength0 + 8;

        const msg0 = new Uint8Array(totalLength0);
        msg0.set(buf0, 0);

        const len73 = buf73.length;
        const padLength73 = <i32>((56 - (len73 + 1) % 64 + 64) % 64);
        const totalLength73 = len73 + 1 + padLength73 + 8;

        const msg73 = new Uint8Array(totalLength73);
        msg73.set(buf73, 0);

        // Check what got set in msg0 and msg73
        let msg0Hex = '';
        let msg73Hex = '';
        for (let i: i32 = 0; i < 64; i++) {
            msg0Hex += msg0[i].toString() + '-';
            msg73Hex += msg73[i].toString() + '-';
        }
        Blockchain.log(`msg0 first 64: ${msg0Hex}`);
        Blockchain.log(`msg73 first 64: ${msg73Hex}`);

        // The data should be different
        let same = true;
        for (let i: i32 = 32; i < 64; i++) {
            if (msg0[i] != msg73[i]) {
                same = false;
                break;
            }
        }
        Blockchain.log(`msg buffers second 32 bytes same: ${same ? 'YES' : 'NO'}`);
        expect(same).toStrictEqual(false);
    });

    it('should identify if Address indexing is the problem', () => {
        const account0 = generateAccount(0);
        const account73 = generateAccount(73);

        // Directly access account bytes via index
        let acc0Bytes = '';
        let acc73Bytes = '';
        for (let i: i32 = 0; i < 32; i++) {
            acc0Bytes += account0[i].toString() + '-';
            acc73Bytes += account73[i].toString() + '-';
        }
        Blockchain.log(`Account0 via index: ${acc0Bytes}`);
        Blockchain.log(`Account73 via index: ${acc73Bytes}`);

        // Now try using dataStart to read memory directly
        let acc0MemBytes = '';
        let acc73MemBytes = '';
        for (let i: i32 = 0; i < 32; i++) {
            acc0MemBytes += load<u8>(account0.dataStart + <usize>i).toString() + '-';
            acc73MemBytes += load<u8>(account73.dataStart + <usize>i).toString() + '-';
        }
        Blockchain.log(`Account0 via memory: ${acc0MemBytes}`);
        Blockchain.log(`Account73 via memory: ${acc73MemBytes}`);

        // They should match each other but be different between accounts
        let same = true;
        for (let i: i32 = 0; i < 32; i++) {
            if (load<u8>(account0.dataStart + <usize>i) != load<u8>(account73.dataStart + <usize>i)) {
                same = false;
                break;
            }
        }
        Blockchain.log(`Accounts same via memory load: ${same ? 'YES' : 'NO'}`);
        expect(same).toStrictEqual(false);
    });

    it('should trace compress function data reading', () => {
        const account0 = generateAccount(0);
        const account73 = generateAccount(73);

        const writer0 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer0.writeAddress(tokenAddress1);
        writer0.writeAddress(account0);

        const writer73 = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer73.writeAddress(tokenAddress1);
        writer73.writeAddress(account73);

        const buf0 = writer0.getBuffer();
        const buf73 = writer73.getBuffer();

        // Simulate what ripemd160f does
        const len0 = buf0.length;
        const padLength0 = <i32>((56 - (len0 + 1) % 64 + 64) % 64);
        const totalLength0 = len0 + 1 + padLength0 + 8;

        const msg0 = new Uint8Array(totalLength0);
        msg0.set(buf0, 0);
        msg0[len0] = 0x80;  // PADDING_BYTE

        const len73 = buf73.length;
        const padLength73 = <i32>((56 - (len73 + 1) % 64 + 64) % 64);
        const totalLength73 = len73 + 1 + padLength73 + 8;

        const msg73 = new Uint8Array(totalLength73);
        msg73.set(buf73, 0);
        msg73[len73] = 0x80;

        // Add length bytes (simulating what ripemd160f does)
        const bitLen = <u64>64 << 3;
        const bitLenLow = <u32>(bitLen & 0xffffffff);
        msg0[totalLength0 - 8] = <u8>(bitLenLow & 0xff);
        msg0[totalLength0 - 7] = <u8>((bitLenLow >>> 8) & 0xff);
        msg73[totalLength73 - 8] = <u8>(bitLenLow & 0xff);
        msg73[totalLength73 - 7] = <u8>((bitLenLow >>> 8) & 0xff);

        // Now simulate what compress does - read x[] array
        // offset = 0 for first block
        const offset = 0;
        let x0Vals = '';
        let x73Vals = '';

        // First log raw bytes for word 8 (bytes 32-35 which should differ)
        const word8offset = 32;
        let raw0 = '';
        let raw73 = '';
        for (let b = 0; b < 4; b++) {
            raw0 += msg0[word8offset + b].toString() + '-';
            raw73 += msg73[word8offset + b].toString() + '-';
        }
        Blockchain.log(`msg0 bytes 32-35: ${raw0}`);
        Blockchain.log(`msg73 bytes 32-35: ${raw73}`);

        for (let i = 0; i < 16; i++) {
            const j = offset + (i << 2);
            const val0 =
                <u32>msg0[j] |
                (<u32>msg0[j + 1] << 8) |
                (<u32>msg0[j + 2] << 16) |
                (<u32>msg0[j + 3] << 24);
            const val73 =
                <u32>msg73[j] |
                (<u32>msg73[j + 1] << 8) |
                (<u32>msg73[j + 2] << 16) |
                (<u32>msg73[j + 3] << 24);
            x0Vals += val0.toString() + '-';
            x73Vals += val73.toString() + '-';
        }
        Blockchain.log(`x[] for msg0: ${x0Vals}`);
        Blockchain.log(`x[] for msg73: ${x73Vals}`);

        // They should be different in the latter half
        let same = true;
        for (let i = 8; i < 16; i++) {
            const j = offset + (i << 2);
            const val0 =
                <u32>msg0[j] |
                (<u32>msg0[j + 1] << 8) |
                (<u32>msg0[j + 2] << 16) |
                (<u32>msg0[j + 3] << 24);
            const val73 =
                <u32>msg73[j] |
                (<u32>msg73[j + 1] << 8) |
                (<u32>msg73[j + 2] << 16) |
                (<u32>msg73[j + 3] << 24);
            if (val0 != val73) {
                same = false;
                break;
            }
        }
        Blockchain.log(`x[] second half same: ${same ? 'YES' : 'NO'}`);
        expect(same).toStrictEqual(false);
    });
});
