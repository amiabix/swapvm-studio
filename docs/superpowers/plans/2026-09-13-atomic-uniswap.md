# Atomic ENS / SwapVM / Uniswap implementation plan

Use superpowers:executing-plans inline. User approved restoring the one-transaction direction; assume one chain, not cross-rollup atomicity. Existing Solvent and Studio artifacts remain preserved.

Goal: a signed transaction checks an ENSv2 release, creates the pricing module with CREATE2, executes its Aqua/SwapVM order, hedges the received token through Uniswap v4, pays the author and enforces the signer's final balance. A late failure restores all contract state. Setup is explicitly outside the execution transaction.

Architecture: reuse StudioRouter and factor StudioExecutor's signature/deployment helper without changing the legacy entry point. AtomicExecutor adds an EIP-712 hedge commitment, requires a live pinned ENS resolver/node/report, and settles a no-hook Uniswap v4 PoolManager swap through an authenticated unlock callback. Permit only standard supported ERC20 pairs and exact-input first legs. UI surfaces one receipt and an actual late-revert comparison.

- [x] Add pinned official Uniswap v4 source/bytecode and test against its actual PoolManager.
- [x] Write failing atomic success/late-revert tests before implementing the executor. Bind pool, ENS identity, limits and nonce to the signature. Test unsolicited callback, tampering, replay, ENS revocation and donated executor balances.
- [x] Implement shared preparation helper and AtomicExecutor. Check actual balance deltas, clear allowances, reject partial hedge fills; test all legacy Studio flows for regression.
- [x] Deploy locally with actual ENSv2 resolver code, Aqua, Uniswap v4 and test liquidity. Exercise success, late failure and ENS revocation. Retain actual receipts and verify no code/nonce/pool-state survives late failure.
- [x] Connect the existing generation/verification output to a one-receipt UI. Keep off-chain preparation distinct, expose signed constraints and label preset programs honestly. Show missing code before and deployed code after, plus both venue events in the same receipt.
- [x] Prepare Sepolia deployment and docs/FEEDBACK.md. Public transactions require the user's existing keystore signing; do not claim a public deployment from local evidence. No sponsor submission or external PR messages without authorization.
- [x] Review contract changes, run appropriate unit/integration/browser checks, commit and leave the working app up.

Primary unknowns: official v4 PoolManager uses exact Solidity 0.8.26 while Studio uses 0.8.30; use pinned official artifacts or an isolated compiler target without modifying upstream pragma. ENSv2 fork/public namespace access must be explicit. No claims of novelty, universal strategy verification, guaranteed profit or cross-rollup execution.

Validation: 73 Solidity tests passed; 22 Node tests passed (one unrelated Solvent live-scene test is opt-in/skipped). Actual-contract CLI replay and desktop/mobile browser checks passed. ENS artifact bytecode reproduced from bundled compiler input. Independent review's failure-classification finding was fixed with a shared evidence classifier and regression test. Public deployment and sponsor submission remain pending; the checked deployment task prepares the script only.
