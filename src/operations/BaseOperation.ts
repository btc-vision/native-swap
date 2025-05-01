import { ILiquidityQueue } from '../managers/interfaces/ILiquidityQueue';

export class BaseOperation {
    protected liquidityQueue: ILiquidityQueue;

    constructor(liquidityQueue: ILiquidityQueue) {
        this.liquidityQueue = liquidityQueue;
    }

    public execute(): void {}
}
