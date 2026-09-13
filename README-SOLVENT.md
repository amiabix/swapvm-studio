# Solvent

## What it does

**Makes SwapVM price against inventory the maker can deliver now.** Aqua can advertise the same wallet balance in several positions. Solvent reads the wallet and its spending approval before pricing, then narrows the virtual output reserve. It does not reserve inventory.

Powered by SwapVM — © Degensoft Ltd 2025. Changes: Solvent instruction, native router, evidence suite, Lens and agent interface, 13 September 2026. Pinned SwapVM `release/1.1`: `ac06e1bac021cd1983dc7c44d1f69b4b8861a945`. Source and extensions use [SwapVM-1.1](vendor/swap-vm/LICENSES/SwapVM-1.1.txt), not MIT. The earlier voice/compiler experiment is preserved in [README-STUDIO.md](README-STUDIO.md).

Place the instruction **after balance setup, before pricing**. For input reserve `x`, output reserve `y`, wallet balance `w` and allowance `a`:

```text
d = min(y, w, a)
mode 0, proportional: x' = ceil(x * d / y), y' = d
mode 1, asymmetric:   x' = x,                 y' = d
```

When `y = 0`, leave registers unchanged. When `d = y`, both modes leave registers unchanged. Proportional mode preserves the reserve ratio in real arithmetic; integer rounding can lower it slightly. Asymmetric mode deliberately lowers it as inventory thins. Full-precision multiplication/division avoids overflow and never rounds a ratio before multiplication.

Both forms support both modes:

| Form | Encoding for pinned AquaOpcodes | Implementation |
| --- | --- | --- |
| Extruction | `0x20 · 0x29 · moduleAddress[20] · mode[1] · spender[20]` | [DeliverableBalances.sol](contracts/DeliverableBalances.sol) |
| Native | `0x21 · 0x15 · mode[1] · spender[20]` | [DeliverableSwapVMRouter.sol](contracts/DeliverableSwapVMRouter.sol) |

Context does **not** expose MakerTraits. The program author supplies the spender: Aqua for Aqua settlement, the executing router for signed settlement. The instruction rejects a zero spender but cannot authenticate that choice. Extruction returns all five registers; both reserves are writable. Native opcode 33 is appended, preserving Aqua indices 0–32. The generic Opcodes table is different.

Measured gas, same constrained-inventory fixture, compiler 0.8.30, via-IR, optimizer 700, Cancun:

| Path | Cold quote | Repeated quote | Cold swap | Swap after quote |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 12,728 | 8,728 | 140,111 | 136,111 |
| Extruction proportional | 25,892 | 15,392 | 146,756 | 138,756 |
| Native proportional | 20,450 | 12,450 | 143,859 | 135,859 |
| Extruction asymmetric | 25,674 | 15,174 | 146,538 | 138,538 |
| Native asymmetric | 20,033 | 12,033 | 143,442 | 135,442 |

Native saves **2,897 / 3,096 gas per cold swap** against extruction for proportional / asymmetric mode. These are per-call measurements from [snapshots](snapshots), excluding transaction intrinsic/calldata gas and setup. [.gas-snapshot](.gas-snapshot) records whole-test costs and is not the table's source. Cold address/storage access and quote-warmed execution are controlled in [DeliverableGas.t.sol](test/DeliverableGas.t.sol).

Reproduce with Node 22+, Python 3 and Foundry on PATH:

```sh
npm ci
git submodule update --init --recursive
python3 reference/model.py
forge test --fuzz-seed 0x20260913
npm test
forge snapshot --match-contract DeliverableGasTest
forge snapshot --check --match-contract DeliverableGasTest
```

The [independent Python model](reference/model.py) generates 4,096 boundary states plus 1,904 seeded random states across the uint256 range. Foundry checks both modes against all 6,000 cases: **12,000 comparisons**. The generated ABI fixture is ignored; regenerate it before running tests. Recorded checks: 64 whole-repository contract tests and 21 Node tests passed; the three real-fork tests passed at mainnet block 25966898. Desktop/mobile checks exercised a dashboard fill and clearing stale bars after an RPC error. The normal suite includes healthy no-op checks, both settlement directions, ordering hazards, native/external equivalence, Aqua top-ups and revocation.

The unmodified upstream invariant campaign runs without skips. Healthy proportional/asymmetric and constrained asymmetric fixtures pass. **Constrained proportional fails additivity.** This is retained as a separate intentionally red campaign:

```sh
FOUNDRY_TEST=test-counterexamples forge test --match-contract 'Deliverable.*CounterexampleTest' -vv
# Expected: two Additivity violated failures, external and native.
```

For reserves 1,000/1,000 and wallet backing 500, one 3-token input returns `2982107355864811133` output units. Splitting into 1 + 2 returns `2986059753003952253`. The normal suite asserts this counterexample; it does not pretend proportional mode is subadditive. The asymmetric comparison and bounded fuzz campaign assert split output is no greater than single output. These tests are evidence for their tested domains, not a universal proof for every program.

The interactive demo opens before the first trade, with one wallet and three positions. Step through inventory consumption, the stock failure, Solvent settlement and approval revocation, or play the sequence automatically. Restart creates fresh test assets; it does not reset another node or rewind an existing fork.

```sh
# Terminal 1: dedicated interactive-demo chain, no remote RPC dependency
npm run solvent:scene:chain
# Terminal 2
npm run solvent:start
# Open http://127.0.0.1:4181 and select Create demo market.
# With both processes running, exercise the entire sequence:
npm run test:solvent:scene
```

The scene uses newly deployed, unmodified official Aqua contracts and the native Solvent router, with asymmetric mode and actual local ERC20 transfers. It uses port 8550 (`SOLVENT_SCENE_RPC` overrides it). Receipts and the current scene are saved in `artifacts/solvent-scene.json`. Stock failure is deliberately broadcast for the demo; successful trades use a 99% fresh-quote minimum output. A pending/ambiguous transaction blocks further steps until a fresh scene is started. The browser checks cover stepping, autoplay, mobile layout and failed RPC reads. Hedera/MCP retain their existing separate inventory interface.

Replay against existing mainnet Aqua, locally:

```sh
# Terminal 1: fresh local fork, public Anvil accounts only
anvil --port 8549 --chain-id 31337 \
  --fork-url https://ethereum-rpc.publicnode.com

# Terminal 2
npm run solvent:demo
```

The public RPC may reject historical storage without an archive plan. The interactive replay forks the current head and records the exact fork block. For the original pinned test fixture, use an archive-capable RPC; alternatively set `DELIVERABLE_FORK_BLOCK` to a recent mainnet block and record it with the results.

The replay deploys the unmodified official release/1.1 Aqua router, the module, native router, Lens and test tokens. Each scenario ships two 1,000-token allocations against one 1,000-token wallet. The first trade takes 600. Stock still quotes 600 for the second position and its actual transaction reverts; clamped positions price against the remaining 400 and transfer successfully. Both modes and paths are executed. A separate approval-revocation scene keeps all 1,000 tokens in the wallet. Receipts, addresses and programs are written to `artifacts/deliverable-demo.json` (a [recorded fork replay](docs/solvent-fork-evidence.json) is committed); the separate interactive scene also reads its Lens at a pinned block and exposes each event before proceeding.

Existing fork Aqua: `0x499943E74FB0cE105688beeE8Ef2ABec5D936d31`. This is a real ERC20/Aqua execution on a local Ethereum fork, **not a public Sepolia deployment**. Replay addresses are generated locally and are not public explorer links. No user keystore is needed.

```sh
DELIVERABLE_FORK_RPC=https://ethereum-rpc.publicnode.com \
  FOUNDRY_TEST=test-fork forge test -vv
npm run solvent:agent  # deterministic, unpaid inventory assessment
npm run solvent:mcp   # newline JSON-RPC on stdio; stdout is protocol-only
```

[SolventLens](contracts/SolventLens.sol) returns advertised allocation, wallet balance, allowance, active status and deliverable inventory for 1–128 caller-supplied positions (the contract also permits an empty read). It handles docked positions and has no admin or write functions. The MCP tool `solvent_inventory` exposes this view; omit arguments for demo positions, or pass `{maker, positions:[{app,strategyHash,token}]}`. Position discovery requires an indexer or supplied IDs. Sibling deliverables overlap and must not be summed as independent backing.

The rule-based [agent](app/solvent-agent.mjs) declines zero inventory and otherwise recommends fresh quoting/simulation; it does not sign Ethereum trades or claim to be an LLM. A metered x402 inventory endpoint reuses the project's Blocky402 integration, charging 100 tinybars per queried position. Configure `HEDERA_PAY_TO`, `HEDERA_ACCOUNT_ID`, and `HEDERA_PRIVATE_KEY` locally in ignored `.env`, then run `npm run solvent:agent -- --paid`. Never commit or paste keys. No paid request has been demonstrated yet. Payment settlement must return a real transaction receipt; tests use explicitly labelled mocks. `/.well-known/solvent.json` describes the local service.

## What it does not do

- **No reservation or shared debt ledger.** Two takers can see the same inventory; later transfers or sibling fills can invalidate a quote. This reads spendable inventory, not liabilities.
- Taker thresholds still apply. A previously signed or fetched quote can revert after inventory changes. Exact-output requests cannot silently receive less.
- **Zero deliverable inventory is not a successful zero quote.** The module narrows reserves to zero and the Lens reports zero; XYC/full SwapVM rejects the resulting quote. The UI and agent must represent it as unavailable liquidity.
- **Proportional mode is not universally subadditive.** See the retained counterexample. Healthy no-op means unchanged register values, not zero gas overhead or universal composability.
- Later balance instructions can overwrite the clamp. Putting it after the swap leaves already-computed amounts unchanged. Arbitrary later fee/transfer instructions can create additional obligations it did not budget.
- No cross-router coordination. Allowance must target the actual settlement spender. Fee-on-transfer, rebasing, lying or unusual ERC20 contracts are outside the standard-token assumptions; balanceOf/allowance alone do not establish delivery semantics.
- Token reads use STATICCALL. State-changing reentrancy is prohibited in that call tree, but token code can still revert, lie, consume gas, or make read-only calls. There is no claim of arbitrary-token safety.
- **Advertised router compatibility is not established.** At block 25966773, advertised router `0x8fDD04Dbf6111437B44bbca99C28882434e0958f` rejects current Aqua extruction index 32. The fork suite reproduces it. Our external-path demo uses a newly deployed, unmodified official release router against the existing Aqua; it does not claim the advertised older router supports this bytecode.
- The native append uses a checked free-memory layout under the pinned compiler/source. It fails closed if the allocation layout changes; rerun compatibility and execution tests on any compiler/upstream update.
- The API/UI are local-only. The paid path has a bounded, single-process receipt map; persistence, operator recovery after ambiguous settlement, HTTPS hosting and a real paid request remain prerequisites for a public service. A paid snapshot is still not a reservation or a correctness attestation.
- The code is experimental and unaudited. Neither the gas figures nor passing tests establish a production safety guarantee.

## What 1inch should consider

Aqua deliberately separates virtual allocations from wallet custody. An inventory modifier lets makers choose how their existing curve reacts when actual backing or approval shrinks. The contribution is the two-mode instruction, reproducible arithmetic/invariant evidence, and the measured cost of an external module versus one appended opcode.

For an upstream version: expose the settlement spender through Context or constrain it explicitly; document ordering and zero-liquidity quote semantics; decide whether proportional mode's split advantage is an acceptable policy. The asymmetric policy is the stronger candidate where the preferred additivity direction matters. Native inclusion removes measured external-call overhead, but requires maintaining another opcode and its ordering contract. [BUGS.md](BUGS.md) records source surprises and fixes.

The primary target is [1inch — Build an Aqua App](https://ethglobal.com/events/ethonline2026/prizes/1inch), which permits modified SwapVM redeployments and local forks. The potential second target is [Hedera — AI & Agentic Payments](https://ethglobal.com/events/ethonline2026/prizes/hedera): a live Blocky402 endpoint plus an agent making a **real** paid inventory request. Code scaffolding and mocked payments do not meet that bar. Hosting/payment evidence is pending; no third partner is claimed. Earlier ENS experiments are preserved separately, not counted as a Solvent integration.

AI tools assisted implementation, tests, review and documentation. The specification and source-verification plan are in [the implementation plan](docs/superpowers/plans/2026-09-13-deliverable-balances.md); generated financial guarantees were rejected when executable counterexamples contradicted them. No public upstream PR or hackathon submission has been sent by this local build.
