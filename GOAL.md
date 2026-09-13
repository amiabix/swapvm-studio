# Active project direction

Build ENS release authorization, CREATE2 pricing-program deployment, SwapVM/Aqua trading, Uniswap v4 hedging and author payment inside one signed transaction on one EVM chain. Preparation and verification happen separately. This is not a rollup or cross-rollup atomicity protocol.

## Current checkpoint

- AtomicExecutor implemented; a distinct EIP-712 authorization binds both trades, the ENS resolver/node/report, pool parameters and minimum return. A hedge signature cannot authorize the inherited standalone Aqua execution.
- Nine contract tests pass against the actual v4 PoolManager: success, late rollback/retry, both token orderings, empty-pool rejection, replay, signature binding, ENS revocation/config substitution and callback rejection (some grouped in one test).
- Local actual ENSv2 resolver, Aqua and Uniswap v4 deployments on port 8551. Successful receipt, late minimum-return revert and ENS revocation receipts recorded in artifacts/atomic-evidence.json.
- UI on port 4182 connects the existing generation/verification pipeline, setup and one-transaction execution. Public development wallets and seeded prices are explicit.
- Verification complete: 73 Solidity tests, 22 Node tests, actual-contract CLI replay, desktop/mobile browser checks. One unrelated Solvent scene test remains opt-in. Independent review finding fixed.
- Full Sepolia test runner prepared and locally validated using encrypted-wallet signing. It tests actual success, late revert and ENS revocation/restoration, with budget and interrupted-run safeguards. Terminal opened for user keystore unlock; no public completion claimed.
- Public Sepolia infrastructure script prepared. Public deployment, pool funding, live ENS release publication and hackathon submission remain pending.
- Solvent and original Studio code/evidence are preserved. Their earlier descriptions below are historical, not the active scope.

---

# Earlier Solvent scope

Ship **Solvent**: deliverable-inventory pricing for Aqua/SwapVM, as both extruction and appended native opcode, with independent arithmetic model, unmodified invariant campaigns, gas measurements, fork replay, Lens, dashboard, MCP and an inventory agent.

Primary bounty: 1inch. Potential second: Hedera metered inventory requests through Blocky402. A real paid request and hosted endpoint remain required; mocked tests are not eligibility evidence. ENS is deferred unless core work and payment evidence are complete.

The earlier voice-to-VM project remains in README-STUDIO.md. Cure and its deployments remain untouched. This latest user-approved scope supersedes the earlier voice/proof/identity ideas. The runtime goal tool could not rename its prior unfinished objective; this file records the current scope without falsely completing the old one.

## Checkpoint

Core, native, model, Lens, agent/MCP and local dashboard implemented. Counterexamples retained: constrained proportional mode fails additivity; zero-liquidity full quotes revert. The advertised older router does not accept the current extruction index, so the working fork deploys unmodified release/1.1 against existing mainnet Aqua. See README and BUGS.md for commands and limits. No public deployment, sponsor submission or paid Hedera call is claimed.

Demo-first revision: a guided, replayable scene now uses a dedicated local node on port 8550, one test-token wallet, three allocations, and real stock/Solvent transactions. The page opens before inventory is consumed. Step controls, autoplay, revocation, receipts and responsive layout are verified. Further agent/product changes remain deferred until the user reviews the demo.
