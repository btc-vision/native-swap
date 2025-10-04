# NativeSwap

![Bitcoin](https://img.shields.io/badge/Bitcoin-000?style=for-the-badge&logo=bitcoin&logoColor=white)
![AssemblyScript](https://img.shields.io/badge/assembly%20script-%23000000.svg?style=for-the-badge&logo=assemblyscript&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node%20js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)
![NPM](https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white)

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

## What is NativeSwap?

NativeSwap is an automated market maker (AMM) that operates directly on Bitcoin Layer 1 without taking custody of BTC.
Built on OPNet's consensus layer, it enables trustless token swaps by tracking the cumulative effect of trades through
virtual accounting while actual Bitcoin moves directly between traders.

## The Core Problem

Bitcoin's architecture prevents smart contracts from holding or programmatically transferring BTC. Every satoshi is
controlled by specific spending conditions defined in transaction scripts, not by abstract contract logic. You cannot
have a Uniswap style pool where a contract holds both assets and manages them programmatically.

Existing Bitcoin token protocols handle this limitation in different ways. BRC20 marketplaces use centralized order
matching where a company controls the trading process. Runes platforms operate similarly with trusted intermediaries
managing trades. Alkanes enables smart contracts but still requires bridges like bUSD from Ethereum for liquidity. These
approaches work but introduce trust requirements or bridge risks.

NativeSwap takes a different approach. Rather than trying to make Bitcoin behave like Ethereum, it works within
Bitcoin's constraints to achieve AMM functionality.

## Virtual Reserve Accounting

The protocol maintains two numbers in its smart contract state: the virtual bitcoin reserve and the virtual token
reserve. These track how much value has flowed through the system rather than representing actual custody.

When someone buys tokens with BTC, the virtual bitcoin reserve increases by the BTC amount paid while the virtual token
reserve decreases by the tokens distributed. The actual BTC goes directly from buyer to sellers. The contract never
touches it. This is pure accounting, similar to how clearinghouses in traditional finance track trades without
physically moving assets between vaults for every transaction.

The constant product formula determines pricing: bitcoin reserve multiplied by token reserve equals a constant k. When
you trade, the formula calculates how reserves must change to maintain k. If reserves show 100 BTC and 10,000 tokens,
the price is 0.01 BTC per token. A trade for 1,000 tokens requires adding enough BTC to keep k constant. The larger the
trade, the more it moves the price, creating natural slippage that protects the pool from depletion.

This works because AMM pricing only depends on the ratio between reserves. Whether those reserves are physical assets in
a vault or numbers in a ledger doesn't affect the mathematics. The formula provides the same price discovery and
slippage characteristics as traditional AMMs while never requiring custody.

## The Two Phase Commit Protocol

Bitcoin transactions are irreversible once broadcast. If you send BTC to buy tokens but the price changes before your
transaction confirms, you cannot get that BTC back. On Ethereum, the transaction would simply fail and return your ETH.
On Bitcoin, your money is gone forever.

NativeSwap solves this through a reservation system. First, you create a reservation transaction that proves you control
the required BTC without actually spending it. You include your BTC as inputs but send it back to yourself as outputs,
paying only a small reservation fee. The smart contract locks in your exact price quote.

Second, you complete the swap by sending the quoted BTC amount. The system generates a transaction paying each seller
their exact portion. Because your price was locked during phase one, you get exactly what you expected. The reservation
expires after 5 blocks if unused, but while active, your price is guaranteed.

This eliminates the risk of price movements between transaction creation and confirmation. It also prevents front
running since once a reservation is locked, no other trades can affect that specific price quote.

## Queue Management and Immediate Liquidity

Rather than using order books where buyers and sellers hope to match, NativeSwap provides immediate execution at
deterministic prices. Sellers join a queue agreeing to sell at whatever the AMM price is when a buyer arrives. This
creates constant liquidity without requiring traditional market makers with inventory.

When processing a swap, the contract iterates through the queue, taking tokens from each seller in order until filling
the complete trade. If one seller has 600 tokens but the buyer wants 1,000, the contract takes all 600 from the first
seller, then moves to the next for the remaining 400. This happens atomically. Either all sellers get paid and the buyer
gets all tokens, or nothing happens.

The protocol can coordinate up to 200 different sellers in a single atomic transaction. Every other Bitcoin trading
platform requires centralized coordination for multi party trades. NativeSwap handles this through smart contract logic
without any central authority.

## Queue Impact Pricing

Markets process information multiplicatively. When a queue doubles from 100 to 200 tokens, it has the same psychological
impact as doubling from 1,000 to 2,000. The Queue Impact mechanism models this by adjusting the effective token reserve
based on queue depth using a logarithmic formula.

This adjustment reflects real selling pressure in the price. A deep queue signals that many sellers want to exit, which
should lower the price. The logarithmic scaling ensures the price responds appropriately without being overly sensitive
to small changes or completely insensitive to large ones.

Without this mechanism, the virtual reserves alone would ignore the reality that sellers are waiting to trade. With it,
the price incorporates both historical trades (virtual reserves) and pending supply (queue depth), creating more
accurate price discovery.

## Slashing Penalties and Economic Security

The Queue Impact system would be worthless if people could manipulate it without consequence. Someone could add massive
fake sell orders to crash the price, buy cheap tokens, then cancel their sells for profit.

The slashing mechanism makes this attack economically irrational. When someone cancels their queue position, they lose
50% of their tokens on the first offense, 70% on the second within 100 blocks, and 90% on subsequent cancellations.
These slashed tokens return to the virtual reserve, improving liquidity for honest participants.

This isn't just a fee. It fundamentally changes the game theory. Even in the best case scenario, an attacker loses half
their tokens to potentially gain a small price advantage. The math never works in their favor. Attempted attacks
actually strengthen the system by adding liquidity through slashed tokens.

## Transaction Pinning and CSV Timelocks

Bitcoin's UTXO model has a critical vulnerability for DEX operations. When you send Bitcoin to an address, the recipient
can immediately create a transaction spending that Bitcoin, even before the first transaction confirms. They can then
create another transaction spending the outputs of their first unconfirmed transaction, and continue building a chain
thousands of transactions deep.

For a DEX, this enables theft. An attacker receives your BTC as a seller, then creates massive chains of unconfirmed
transactions. Your original swap transaction gets stuck in the mempool because miners cannot process it without
including the entire chain, which may exceed block limits. Your reservation expires while your BTC remains trapped. The
attacker cancels their sell orders. When your transaction finally confirms, if ever, there are no tokens left to give
you.

NativeSwap completely eliminates this attack through mandatory CSV (CheckSequenceVerify) timelocks. Every seller must
use an address with at least a one block timelock. This means once Bitcoin arrives at their address, they cannot spend
it again until one block passes. They cannot create chains of unconfirmed transactions. The maximum chain length becomes
zero instead of unlimited.

This requirement is enforced at the protocol level. Sellers cannot join the queue without proving their address includes
the required timelock. This mathematically provable security measure closes the transaction pinning attack vector
entirely.

## Why OPNet?

NativeSwap requires a consensus layer that provides binding state consistency across all participants. When the contract
stores a reservation at a specific price, every node must agree on that state. When virtual reserves update after a
trade, every participant must see the same values. Without consensus, different nodes could disagree about fundamental
state like whether a reservation exists or what the current price is.

OPNet provides this consensus through proof of work mining and cryptographic attestations. It processes Bitcoin
transactions, executes smart contract code, and ensures all nodes reach agreement on the resulting state. The contract
logic runs deterministically in a WASM environment, guaranteeing identical execution across different hardware.

Indexer based systems like those used by BRC20 and Runes cannot provide this guarantee. Each indexer independently
interprets transactions and could reach different conclusions. While this works for simple token transfers, it cannot
support complex coordination like atomic swaps between hundreds of participants or binding price reservations.

## Liquidity Bootstrapping

In the current V1 implementation, pool creators provide initial liquidity by setting a starting price and adding tokens
to the virtual reserve. They receive BTC directly from initial sales, effectively acting as the first liquidity provider
without needing to provide BTC upfront.

As trading occurs, the virtual reserves track all trades cumulatively, maintaining price continuity even as different
sellers enter and exit the queue. During quiet periods, creators can support their pools by buying back tokens or adding
more supply based on demand.

Future versions will implement traditional liquidity provider mechanics where LPs provide both assets and earn fees from
trading volume.

## Prerequisites

- [Node.js](https://nodejs.org/en/download/prebuilt-installer) >= 22.17.0
- [npm](https://www.npmjs.com/) >= 11.5.2

## Basic Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Build the Project**:
   ```bash
   npm run build
   ```
   This compiles the AssemblyScript code into WebAssembly, along with any TypeScript modules used.

## License

This project is licensed under the MIT License. [View License](LICENSE.md) for more details.
