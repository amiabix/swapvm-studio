# Active project direction

Build ENS release authorization, CREATE2 pricing-program deployment, SwapVM/Aqua trading, Uniswap v4 hedging and author payment inside one signed transaction on one EVM chain. Preparation and verification happen separately. This is not a rollup or cross-rollup atomicity protocol.

## Current checkpoint

- AtomicExecutor and the local UI are working: ENS release check, CREATE2 deployment, Aqua trade, v4 hedge, author payment and final balance enforcement share one signed transaction.
- Public Sepolia deployment and all three execution tests completed. Independent verification checked all 27 receipts, exact deployment bytecode, historical token snapshots and code/nonce transitions. ENS was restored and no pending/recovery state remains.
- Successful atomic transaction: 0xa18c378e881f3abe9074e746ade151df89cce0e10e471b649eaaccd00906dd07.
- Actual total gas cost: 0.014600982587924065 test ETH. Evidence: docs/evidence/atomic-sepolia-verified.json. Read-only recheck: npm run atomic:verify:sepolia.
- The interactive UI remains local on port 4182 and links to the verified public trade. Keystore secrets are not retained.
- Contract, Node, CLI and browser checks passed; wallet-selector regression and interrupted-run recovery were tested. Sponsor submission, feedback-form submission, and public frontend wallet UX remain separate work.
- Solvent and original Studio code/evidence are preserved; the older scope below is historical.

---

# Earlier Solvent scope

Ship **Solvent**: deliverable-inventory pricing for Aqua/SwapVM, as both extruction and appended native opcode, with independent arithmetic model, unmodified invariant campaigns, gas measurements, fork replay, Lens, dashboard, MCP and an inventory agent.

Primary bounty: 1inch. Potential second: Hedera metered inventory requests through Blocky402. A real paid request and hosted endpoint remain required; mocked tests are not eligibility evidence. ENS is deferred unless core work and payment evidence are complete.

The earlier voice-to-VM project remains in README-STUDIO.md. Cure and its deployments remain untouched. This latest user-approved scope supersedes the earlier voice/proof/identity ideas. The runtime goal tool could not rename its prior unfinished objective; this file records the current scope without falsely completing the old one.

## Checkpoint

Core, native, model, Lens, agent/MCP and local dashboard implemented. Counterexamples retained: constrained proportional mode fails additivity; zero-liquidity full quotes revert. The advertised older router does not accept the current extruction index, so the working fork deploys unmodified release/1.1 against existing mainnet Aqua. See README and BUGS.md for commands and limits. No public deployment, sponsor submission or paid Hedera call is claimed.

Demo-first revision: a guided, replayable scene now uses a dedicated local node on port 8550, one test-token wallet, three allocations, and real stock/Solvent transactions. The page opens before inventory is consumed. Step controls, autoplay, revocation, receipts and responsive layout are verified. Further agent/product changes remain deferred until the user reviews the demo.
