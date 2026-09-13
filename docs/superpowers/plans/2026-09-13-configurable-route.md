# Configurable atomic route

Extend the existing atomic workflow with a clean composer. Sepolia is the default; local Anvil remains available for automated end-to-end checks. User inputs are token addresses, spend, minimum outputs, fee/cap, Aqua virtual reserves, module parameters, author and maker, and hookless v4 pool fee/tick spacing. Reuse the verified sample or an existing passed generation job.

Before any signing, inspect token metadata/balances/allowances, the live ENS record, selected pool state, module source/hashes/predicted address, opcode bytes and serialized Aqua strategy. Return explicit setup transactions separately from the final atomic execution. Public transactions and typed-data signatures go through the connected browser wallet; local mode signs only for known development accounts on loopback chain 31337.

After setup, request the full-route signature, simulate the exact signed transaction, show its returned amount, then send that same calldata. Show actual setup receipts and the resulting execution receipt. Editing configuration invalidates the reviewed draft. Never reuse the historical receipt as a new execution result.

Validation: strict address/units/pool/params parsing, chain and signer checks, malformed-input tests, a real configurable local execution with nondefault amounts, and browser inspection on desktop/mobile. Public broadcast remains a wallet action; no server signing key is loaded.

Completed validation: a 25-token route with 25 bps author fee and 500000/510000 reserves settled locally; editing the source ran 11 verification checks and deployed new code during a subsequent successful trade. Browser checks covered reload after setup, loss/recovery of receipt responses, mobile overflow, and wrong-wallet rejection before any send request. Public Sepolia preview identified actual sUSD/rUTH metadata, funded v4 pool and maker shipping requirement without public writes.

An idle Anvil node exposed stale latest-block timestamps when constructing expiry. All four existing signing paths now construct expiry from the pending block timestamp, preserving the user-selected duration for the next block.
