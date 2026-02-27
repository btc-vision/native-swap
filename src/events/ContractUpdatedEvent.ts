import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
} from '@btc-vision/btc-runtime/runtime';

@final
export class ContractUpdatedEvent extends NetEvent {
    constructor(address: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        data.writeAddress(address);

        super('ContractUpdated', data);
    }
}
