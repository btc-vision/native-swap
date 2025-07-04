import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';

export abstract class BaseOperation {
    protected liquidityQueue: ILiquidityQueue;

    constructor(liquidityQueue: ILiquidityQueue) {
        this.liquidityQueue = liquidityQueue;
    }

    public abstract execute(): void;
}
