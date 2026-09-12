# SwapVM Studio Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task by task.

**Goal:** Deliver the approved voice-to-generated-market flow with real execution and honest verification.
**Architecture:** Restricted external pricing modules feed a trusted SwapVM instruction; an execution boundary binds signed limits and checks settlement. A Node service drives isolated Foundry campaigns and exposes artifacts/events to a browser UI.
**Tech Stack:** Solidity 0.8.30, Foundry, SwapVM release/1.1, official Aqua, Node 24, viem, plain browser UI.
**Spec:** docs/SPEC.md

## Global Constraints
- Preserve Cure. Work only in this separate repository.
- Never claim simulated model/payment/hardware actions are live.
- No generated native router code; no generated FFI or harness changes.
- Signed limits bind artifact and chain; actual settlement is atomic.
- Verification reports distinguish tested, enforced, proven and trusted.

### Task 1: Restricted execution and real swap
Files: contracts/StudioRouter.sol, contracts/StudioExecutor.sol, contracts/interfaces/IStudioPricing.sol, test/Studio.t.sol, script/Demo.s.sol.
- [ ] Write adversarial tests for state-writing modules, amount lies, limit breach, deployment rollback and replay rejection.
- [ ] Run `forge test --match-path test/Studio.t.sol -vv` and capture missing-feature failures.
- [ ] Implement trusted STATICCALL instruction using the spec interface and real Aqua settlement; bind authorization and instrument author payment.
- [ ] Run tests, including exact-in/out, normal swaps, fee conservation and full rollback.
- [ ] Commit implementation and record evidence; review security boundaries.

### Task 2: Locked verification and repair
Files: app/verify.mjs, app/generate.mjs, app/verify.test.mjs, test/Candidate.t.sol.
- [ ] Define JSON report with artifact hash, compiler version, tests, counterexamples, skipped properties and timings.
- [ ] Write tests proving invalid source/failed campaigns cannot be released, and repair receives counterexample data.
- [ ] Compile a single candidate in an isolated Foundry workspace; fixed harness tests generated pricing plus full execution where supported.
- [ ] Add live model command adapter without shell interpolation, capped attempts and a clearly labelled replay fixture.
- [ ] Execute failing candidate then successful repair; keep reports and source for replay.

### Task 3: User flow and local demo
Files: app/server.mjs, app/public/index.html, app/public/style.css, app/public/app.mjs.
- [ ] Serve voice/text entry, artifact inspection, verification timeline, explicit wallet authorization, transaction receipt and author payments.
- [ ] Wire local Anvil deployment/demo and test HTTP flow using Node tests and browser checks.
- [ ] Clearly distinguish local replay from live inference and chain transactions.

### Task 4: Sponsor integrations and delivery
Files: contracts/ENSReleaseRegistry.sol, app/hedera.mjs, README.md, .env.example.
- [ ] Add ENSv2 pinning using official deployed interface and test authorization/revocation.
- [ ] Implement configurable real x402 verification payment and HCS report anchoring; keep unavailable credentials visible as configuration requirements.
- [ ] Verify sponsor requirements against live pages, prepare public Sepolia deployment scripts and reproducible demo instructions.
- [ ] Check hardware input availability; retain paired-headset/browser microphone fallback without claiming native SDK completion.
- [ ] Run integration/security review, address findings and document remaining external requirements accurately.
