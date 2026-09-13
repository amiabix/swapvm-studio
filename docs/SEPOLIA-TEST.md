# Wallet-backed Sepolia test

Public run completed: 27 independently checked receipts, 0.014600982587924065 test ETH, successful trade plus intentional late revert and ENS rejection. ENS was restored. See [verified evidence](evidence/atomic-sepolia-verified.json). Recheck with `npm run atomic:verify:sepolia` (requires historical RPC access).

Run `script/test-sepolia.command` on macOS, or `python3 script/test-sepolia.py` from the repository. The launcher builds and verifies the sample, then asks for the `cure-issuer` password once in the local terminal. `cast` decrypts the keystore; Python supplies its hidden terminal prompt with echo disabled. The password never becomes an argument, environment variable or regular file. No private key is exported.

This runner is pinned to Sepolia (11155111), issuer `0xEa9cD7BEf18a5F8B7f26e63710335e640D6C36dd`, the existing ENSv2 resolver for `cure-settlement.eth`, and the official v4 PoolManager. It reads the RPC configuration from the sibling Cure `.env`. It writes only the `swapvm.release` ENS record, initially requiring it to be empty, and keeps its previous value in the run ledger.

It deploys fresh Aqua/AtomicExecutor contracts, owner-minted demo USD and rUTH, issuer-controlled maker/author accounts and a small full-range liquidity seeder. The maker and author are distinct addresses controlled by the same demo issuer; they are not independent counterparties. Pool prices and liquidity are seeded, not live market opportunities.

The test broadcasts three executions:

1. An impossible final minimum: an actual reverted transaction. Verify the exact `minimum return` reason by `eth_call` at its receipt block, unchanged token balances, absent module and unused nonce.
2. The valid minimum: a successful transaction deploying the program, settling Aqua and Uniswap, and paying the author. Verify the actual receipt event and code/nonce state.
3. Revoke the ENS record in a separate transaction, then execute a fresh program authorization. Verify `ENS release mismatch`, unchanged balances and absent code/nonce. Restore the newly published release afterwards.

The budget is 0.04 test ETH for the whole saved run, with a 3 gwei max-fee cap. Ordinary transactions reserve 0.0018 ETH for ENS restoration. Every receipt contributes its actual gas cost to the saved spending ledger. Setup transactions and reverted executions still cost gas.

`artifacts/atomic-sepolia-test.json` records addresses, receipts, tested balance changes, the pinned report and completion state. Public revert reasons are replayed at the receipt block; the runner does not pretend to have an execution trace when the RPC does not expose one.

## Recovery

The ledger is written through atomic rename. Each step and broadcast intent is recorded before sending; an interrupted or ambiguous step is never automatically repeated. A corrupt ledger is rejected, and a per-run lock prevents concurrent runners. Review `pending`, `inFlight` and `recoveryRequired` against the chain before repairing a saved step. Do not discard this ledger and redeploy blindly.

Before revocation, the exact restoration target is persisted. Ordinary errors trigger restoration in `finally`. A pending transaction must have a known mined outcome before an apparently restored record is accepted. Unknown broadcast outcomes retain restoration intent and require recovery. A hard process kill or lost network can prevent immediate restoration; after the process is confirmed dead, clear a stale `.lock` if present and resume to resolve the receipt and restore the record. The exact resolver/node/value remains under `restoration` until confirmed.

## Validation before public broadcast

The same runner was exercised on local chain 31337 through an encrypted public Anvil test keystore: actual deployments, both venue trades, real reverted transactions, ENS rejection and restoration all passed. A fault injected immediately after revocation restored the actual record, left completion false and allowed a safe retry. An unknown pending revocation retained its restoration intent without sending another transaction. `test/AtomicDemo.t.sol` checks owner-only demo minting/withdrawal and unsolicited liquidity callbacks; the existing atomic suite checks settlement and signature guarantees.

`--local-check` requires loopback RPC, chain 31337 and the public Anvil address. The `ATOMIC_TEST_FAIL_AFTER_REVOKE` injection is recognized only in that local mode.
