# Solvent findings and fixes

13 September 2026. Powered by SwapVM — © Degensoft Ltd 2025. Pinned source: release/1.1 `ac06e1bac021cd1983dc7c44d1f69b4b8861a945`. These include integration constraints and our own development mistakes, not just upstream defects.

| Finding | Evidence / resolution |
| --- | --- |
| Context lacks MakerTraits | Spender is an explicit 20-byte argument. The instruction cannot infer Aqua versus signed settlement. |
| Extruction returns all registers | Both proportional and asymmetric modes work externally; amounts and PC remain unchanged. |
| Virtual allocations are not wallet reservations | Two Aqua `ship` calls can advertise twice the wallet balance. The stock second fill fails in the ERC20 transfer; calling this a specific Balance Sufficiency error would be inaccurate. |
| Same strategy/token cannot be re-shipped | `ship` rejects existing registrations; `push` can top up with an actual transfer. Tested locally. |
| Proportional clamp rewards split fills | Single output `2982107355864811133`, split output `2986059753003952253`. Retained in normal counterexample assertion and intentionally red upstream suite. No additivity skip enabled. |
| Revocation does not produce a successful zero quote | Zero reserves are rejected by XYC/full SwapVM. Lens returns zero deliverable; full quote is unavailable. |
| Advertised deployed router uses a different table | Mainnet block 25966773 rejects release/1.1 extruction index 32. Working fork uses unmodified release source redeployed against existing Aqua. |
| Ordering is material | Placing clamp after XYC cannot change an already-computed output. Later reserve setup can overwrite it. |
| Array-copy append erased the native gas benefit | Replaced copy loop with a checked extension of the last allocated array. Guard verifies length and free-memory pointer; all existing indices and actual native fills are tested. |
| Inline 6,000-case reference loop exhausted EVM memory | External per-case test calls reset call memory; independent Python cases now complete 12,000 comparisons. |
| uint64 fuzz arguments undersampled 1e18-scale balances | Native equivalence fuzz arguments use uint256 before domain bounding. |
| Reusing an order hash across demo tokens hit Aqua immutability | Scenario-specific salt bytes avoid re-registering the shared input token under an existing strategy hash. |
| Foundry prank/expectRevert consumed by view getter | Compute router/hash getters before setting the next-call cheatcode. Fixed Lens docking test and zero-quote test. |
| Public RPC stopped serving historical storage | Publicnode rejected archival storage with HTTP 403. Replay now forks the current head and records its block; original pinned tests require archive access. |
| UI could retain stale bars after RPC failure | Failed refresh clears rendered rows; unavailable data is not shown as current. |
| Paid service could charge before a failed read | Snapshot read completes before settlement; failing reads incur zero charges and can retry. Mock regression check included. |
| Receipt key depended on JSON envelope shape | Key now uses the SDK-decoded Hedera transaction ID; envelope changes and alternate bytes for the same ID cannot bypass query binding. |
| Concurrent payment-service initialization created duplicate receipt maps | Cache the initialization promise. Single-process persistence limitation remains explicit. |

Token balance/allowance reads, shared backing and stale quotes are documented in README limitations. Full-token behavior, production security and universal subadditivity are not established by the tested fixtures.
