import { clearCachedProviders } from '../models/Provider';
import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { ReservationProviderData } from '../models/ReservationProdiverData';
import { TickMath } from '../utils/TickMath';

describe('ReservationProviderData tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('constructor stores providerId, providedAmount, tick, fillPrice, creationBlock', () => {
        const providerId: u256 = u256.fromU64(7);
        const amount: u128 = u128.fromU64(12345);
        const tick: i32 = 1234;
        const fillPrice: u128 = TickMath.tickToPrice(tick);
        const creationBlock: u64 = 100;

        const data = new ReservationProviderData(
            providerId,
            amount,
            tick,
            fillPrice,
            creationBlock,
        );

        expect<bool>(u256.eq(data.providerId, providerId)).toBe(true);
        expect(data.providedAmount).toStrictEqual(amount);
        expect<i32>(data.tick).toBe(tick);
        expect<bool>(u128.eq(data.fillPrice, fillPrice)).toBe(true);
        expect<u64>(data.creationBlock).toBe(creationBlock);
    });

    it('preserves negative ticks correctly', () => {
        const providerId: u256 = u256.fromU64(42);
        const amount: u128 = u128.fromU64(1);
        const tick: i32 = -5_000;
        const fillPrice: u128 = TickMath.tickToPrice(tick);

        const data = new ReservationProviderData(providerId, amount, tick, fillPrice, 1);

        expect<i32>(data.tick).toBe(tick);
    });
});
