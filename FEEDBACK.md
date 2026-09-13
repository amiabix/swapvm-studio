# Uniswap v4 developer feedback

Project: Studio — ENS-authorized SwapVM/Aqua trading and a v4 hedge in one signed transaction.

## What worked

- The unlock/callback settlement model let us consume Aqua's output directly, settle v4's ERC20 input and take its output without a second user transaction.
- Signed pool fee/tick spacing, a fixed zero-hook policy and the outer final-return check kept the demo's settlement scope explicit.
- The npm `@uniswap/v4-core@1.0.2` package includes compiled PoolManager artifacts. This allowed testing the real manager while compiling our integration with solc 0.8.30; the PoolManager source pins 0.8.26.

## Friction and useful examples

- A minimal, supported ERC20-only unlock callback example showing `swap → sync → transfer → settle → take`, complete with signed whole-route limits, would shorten integration time.
- Route-level rollback examples should include a failure *after* v4 settlement, not just a swap rejection. Our test checks manager balances/price, external Aqua settlement, CREATE2 code and the authorization nonce, then retries successfully.
- Separately signing an inner trade and an outer hedge is unsafe if the inner signature can be used alone. Our outer digest is verified inside the shared deployment/nonce path; a regression test tries to strip the hedge.
- Local seeding currently uses the packaged test liquidity helper. A small documented development-only seeding command would be more approachable than adopting a production position-management flow for a one-pool demo.

## Evidence and scope

Implementation: `contracts/AtomicExecutor.sol`; tests: `test/Atomic.t.sol`; replay: `npm run atomic:demo`; receipts: `docs/evidence/atomic-evidence.json`.

Real v4 PoolManager on local Anvil; public Sepolia deployment remains pending. Hookless pools and exact-input ERC20 routes only. No claim of cross-chain atomicity or formal verification.

The developer feedback form at https://developers.uniswap.org/hackathon-feedback has **not** been submitted.
