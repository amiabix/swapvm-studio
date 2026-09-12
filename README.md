# SwapVM Studio

Speak a pricing strategy, inspect a generated Solidity module, watch a fixed verification campaign reject and repair it, then authorize an atomic local Ethereum trade. The execution transaction deploys the module with CREATE2, settles through official Aqua/SwapVM, and pays its author.

Powered by SwapVM — © Degensoft Ltd 2025. SwapVM release/1.1 is pinned at `ac06e1bac021cd1983dc7c44d1f69b4b8861a945`. Derivative components retain [the upstream license](vendor/swap-vm/LICENSES/SwapVM-1.1.txt); changes started 2026-09-13. This is experimental hackathon software, not an audit or formal proof.

## Run locally

Requires Node 24+, Foundry with Solidity 0.8.30 support, and an optional authenticated Claude CLI for live generation.

```sh
git submodule update --init
npm ci --ignore-scripts
forge build
anvil --port 8547 --chain-id 31337
```

In another terminal:

```sh
npm run chain:setup
cp .env.example .env
npm start
```

Open http://127.0.0.1:4180. `Replay fixture` uses explicitly predetermined bad/good source, but compiles and tests both now. `Live` calls the configured model using stdin with no tool access. The prompt goes to that model provider. No wallet keys enter the prompt.

1. Describe a pricing formula; start with a constant-product curve supporting exact-in and exact-out.
2. Inspect the failed checks, concrete counterexamples and corrected source.
3. Review the displayed limits and click **Execute local transaction**.
4. Inspect the receipt, newly deployed module, actual output and author fee.

Local execution uses public Anvil development keys on loopback chain 31337 only. It trades 1 test token with a minimum 0.98 test-token output and maximum 0.01 output-token author fee. These are explicit demo limits, not amounts parsed from natural language. Token approvals, release registration and Aqua strategy shipping are preparatory transactions; deployment, swap and payment are in one final transaction. Cure's repository, Anvil port and existing deployments are untouched.

## What is implemented

- A fixed external pricing ABI called with STATICCALL, 200,000 gas and bounded returndata; no generated native router opcodes.
- EIP-712 authorization binding chain, executor, module code, pair, parameters, amounts, fee limits, nonce and deadline.
- Canonical Aqua orders with no arbitrary hooks/callbacks; actual final signer, maker, author and executor balance checks.
- Isolated compilation and seven sampled pricing properties plus two boundary tests, followed by the actual upstream CoreInvariants campaign against each candidate through real Aqua settlement. Failed campaigns feed reports back to the model; no executable artifact is released on failure.
- Browser microphone/text input, source inspection, repair ledger and real local transaction execution.
- Optional ENSv2 release-record enforcement and Blocky402 paid-verification service adapters; see configuration and status below.

There is one executed module and one author per program in this version. It does not yet implement a branching marketplace or arbitrary English-to-policy semantics. Fuzzing tests defined domains; it does not establish correctness for every program input. The source screen is a restricted capability lint, not a general Solidity security verifier. The release administrator, supported standard ERC20 implementations, compiler/toolchain and model-intent interpretation remain trust boundaries.

## Verification

```sh
npm test
forge test --fuzz-seed 0x20260913 -vv
```

The pricing campaign runs a candidate alone in a temporary workspace with the fixed `test/Candidate.template.txt`, FFI disabled and no filesystem cheatcode permission. Solidity imports, constructors, assembly, external-call capabilities and environment reads are rejected by the source screen. Reports identify ranges, seed, tolerances, harness/source hashes and compiler settings. Each candidate also runs the upstream CoreInvariants suite through real Aqua settlement with all upstream skip flags false; fee-bearing balance deltas are covered by separate integration tests. [Contract evidence](docs/CONTRACT-REPORT.md) records scope and limitations.

## Sponsor and hardware status

- **1inch:** official Aqua/SwapVM local execution is implemented. The demo position is currently a generated constant-product curve; more sophisticated accepted strategies remain product work.
- **ENSv2:** release-record helpers and onchain gate are implemented; a real Sepolia deployment/pinning transaction is still required. Local doubles are labelled in tests.
- **Hedera:** `POST /api/verify` is a metered x402 resource-server path. Configure `HEDERA_PAY_TO` and `HEDERA_FEE_PAYER` discovered from Blocky402 `/supported`. It charges 100 tinybars per sampled property execution (7 properties × fuzzRuns), plus two included boundary tests. A signed Hedera testnet payment and one successful real paid request are still required; unit tests use explicit facilitator doubles. The SDK client is `node --env-file=.env app/hedera-client.mjs pay app/fixtures/Candidate.good.sol`; HCS submission is `node --env-file=.env app/hedera-client.mjs anchor artifacts/good-full-report.json`.
- **HCS:** the direct SDK client submits report commitments and compares the message against the Hedera mirror node; actual submission needs a configured account/topic. An older optional relay adapter is also present and explicitly does not authenticate its receipt. HCS timestamps a commitment, not proof that verification was correct.
- **Ray-Ban Meta:** browser speech uses the selected system microphone. Native Meta toolkit integration and a real glasses-input session have not been completed.

Do not submit these pending integrations as completed. [Sponsor details](docs/SPONSORS.md) describe the wire formats and trust assumptions.

## AI usage

Codex assisted architecture, implementation, tests, review and documentation. Live generation uses the configured CLI model; replay mode uses committed fixtures. The generator prompt is in `app/generate.mjs`, the approved specification in `docs/SPEC.md`, and the implementation plan in `docs/superpowers/plans/2026-09-13-swapvm-studio.md`. Generated candidates and reports are stored under local `artifacts/`; no private keys are committed.
