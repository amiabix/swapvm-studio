# Upstream invariant reuse

`test/Upstream.t.sol` inherits and invokes the unmodified `CoreInvariants.assertAllInvariantsWithConfig` from SwapVM release/1.1, commit `ac06e1bac021cd1983dc7c44d1f69b4b8861a945`. This is executable reuse of the upstream assertions, not a copied list of invariant names.

The subject is the actual `StudioRouter`, its `StudioExecutor`, the installed official Aqua implementation, and `app/fixtures/Candidate.good.sol`. Candidate deployment occurs through a signed executor transaction with the real init/runtime commitments. A bootstrap strategy uses distinct parameters; the tested strategy starts with exactly `1e24` units on each side. Every campaign swap reuses that tested canonical order, allowing split trades to observe real updated Aqua balances.

Upstream quotes impersonate the executor because StudioRouter only accepts that caller/taker. The `_executeSwap` bridge stops that impersonation, signs a fresh nonce, and executes through the public executor entry point. It checks that the requested router, order, and token pair match the signed execution. It never substitutes quotes for settlement or replaces deployed code. The upstream snapshots restore token balances, Aqua accounting, and authorization nonces between comparisons.

## Configuration and coverage

All four upstream skip flags remain false. Default tolerances remain unchanged: symmetry 2 wei, additivity 0, rounding 100 bps, monotonicity 0. The deterministic suite uses upstream amounts `[1e18, 10e18, 50e18]`. The fuzz suite bounds a base amount to `[1e12, 1e20]` and checks `[base, 2*base, 4*base]`; the largest combined additivity trade is `1.2e21`, below the `1e24` reserve.

The suites invoke upstream exact-in/out symmetry, exact-in/out quote/settlement consistency, monotonicity, stateful split/combined additivity, maker-favoring rounding, and the upstream balance-sufficiency check. The external author fee is zero so the router's gross quote equals the executor's net output. Fee-bearing settlement is outside this upstream compatibility campaign and remains covered by Studio's own tests.

## Evidence

Executed on 2026-09-13:

```sh
forge test --match-path test/Upstream.t.sol --fuzz-seed 0x20260913 -vv
```

Result: **2 tests passed, 0 failed, 0 skipped**; the fuzz test reported **129 runs**. Solidity 0.8.30, optimizer 700, via-IR, Cancun. Foundry warns about upstream's deprecated `snapshot` and `revertTo` cheatcodes; those upstream sources were left unchanged.

## Limits

This campaign verifies the checked-in good constant-product candidate in a bounded, symmetric-reserve, standard-token domain. It does not establish correctness for arbitrary generated candidates, all reserve ratios, or every integer input.

The upstream balance-sufficiency helper accepts any revert and, on success, only asserts positive amounts. Its tiny-trade rounding helper also permits quote reverts. Neither establishes liveness or proves actual-wallet balance sufficiency. Studio's own candidate/domain and rollback tests must provide those stronger properties. Upstream exact-out additivity compares output totals, which are fixed by the requested amounts; it does not compare exact-out input costs. These limitations are preserved and disclosed rather than described as stronger guarantees.
