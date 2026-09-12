# Contract execution evidence

Pinned SwapVM: `vendor/swap-vm` release/1.1 commit `ac06e1bac021cd1983dc7c44d1f69b4b8861a945`. Settlement uses the installed official `@1inch/aqua` implementation and upstream SwapVM transfer logic, not a settlement mock. Compiler Solidity 0.8.30, Cancun, optimizer 700, via-IR.

## API and execution

`StudioExecutor(aqua,weth,owner)` creates its immutable `StudioRouter`. The owner explicitly permits standard ERC20 token addresses and approves release commitments `(initCodeHash,runtimeCodeHash,author,feeBps)`; releases can be revoked. This is authenticated administrative pinning, not a permissionless assertion of authorship or source safety.

`Authorization` fields, in order: signer, maker, tokenIn, tokenOut, author, initCodeHash, runtimeCodeHash, paramsHash, salt, amount, exactIn, maxInput, minOutput, feeBps, feeCap, nonce, deadline. Address/bytes32/bool types follow their names; amount and all remaining numeric fields are uint256. `digest(auth)` uses EIP-712 domain `SwapVM Studio`, version `1`, current chain ID, and executor address. The executor creates its immutable router, so binding the executor also fixes the router. EOA signatures only. `predict(auth)` includes executor, keccak256(abi.encode(signer,salt)), and initCodeHash in CREATE2 derivation.

`order(auth,params)` returns the canonical upstream Order. Maker calls `Aqua.ship(router,abi.encode(order),tokens,balances)` and approves Aqua for physical output transfers. Aqua balances are permissions/accounting; the maker must hold actual tokens too. `execute(auth,initCode,params,signature)` deploys if absent, checks runtime hash, settles through SwapVM/Aqua, pays author, refunds excess input, and returns `(amountIn,netAmountOut,fee)`. All writes and transfers revert atomically on failure. `quote(auth,params)` requires the predicted module to have already been deployed; before initial deployment, an eth_call of signed execute can simulate the atomic transaction without persisting deployment.

Fee is ceil(gross output * feeBps / 10000), paid in tokenOut. Exact-out first requests ceil(net desired * 10000 / (10000-feeBps)) gross output. Fees are capped at 1000 bps in registration and the signed feeCap is an absolute output-token amount. Exact-in amount and maxInput include all input; exact-out amount and minOutput refer to the net output. Signer, maker, author must be distinct. Author cannot be executor. One module is executed per accepted program and one `AuthorPaid` event records its actual paid fee; there is no branch-level provenance or multiple-author trace claim.

## Enforced boundaries

Only opcode 0 exists. It reconstructs the canonical Aqua-only, hook-free order hash and requires the executor as caller and taker. Parameters are capped at 128 bytes. Generated modules receive only the five specified pricing arguments, via a 200,000-gas STATICCALL with a fixed 64-byte output buffer and exact returndata-size validation. Returned amounts must be positive, preserve the exact side, and fit available Aqua output liquidity. Native generated instruction tables, hooks, and taker callbacks are absent from the accepted execution path.

Executor checks reviewed commitments, replay, deadline, pair, limits, exact amounts, and actual signer/maker/author/executor token balance changes. It uses a reentrancy guard and clears router approval. Initcode is capped at 24,576 bytes and creates no token approvals before deployment. Constructor execution itself is normal CREATE2 execution, not STATICCALL; constructors are still untrusted and signed/reviewed code commitments matter.

STATICCALL prevents state writes, not context observation or mathematical dishonesty. Modules can observe block/environment or read other contracts. Pricing fairness, source/runtime correspondence, supported token behavior, and administrative release review remain explicit trust/verification assumptions. Arbitrary ERC20 implementations, rebasing, fees on transfers, native ETH, ERC1271 signers, and production governance are outside supported scope. No formal proof or audit claim is made.

## Test results

`forge test --match-path test/Studio.t.sol --fuzz-seed 0x20260913 -vv`: 13 tests passed, zero failed, zero skipped, including 128 fuzz runs for real Candidate.good.sol quote-to-swap consistency in both modes. Samples bound amount to [100,10000] base units with initial Aqua reserves [100000,100000], after an initial 1000-base-unit swap; tolerances are zero for returned amounts and actual recipient/author deltas. The fixed verifier campaign separately covers larger numeric domains.

Tests cover successful exact-in/out settlement; exact paid fee conservation; replay and chain-domain rejection; changed signed limits; revoked release; state-writing module failure; exact-side amount lies; runtime commitment mismatch; signed output/fee limit failure after router settlement; expired authorization; physical maker balance insufficiency; and deployment/nonce/token rollback. Adversarial writer, lie, runtime, limit, and revocation tests assert specific revert reasons, preventing unrelated failures from masquerading as success.

Development evidence: tests were written before implementation. The first requested command failed compilation because `contracts/StudioExecutor.sol` did not exist, so this was a missing-implementation compile failure, not a behavioral TDD red pass. An initial test fixture prank-order mistake produced Aqua strategy failures and was corrected; negatives were tightened to specific expected reasons. Subsequent runtime checks above passed. No stricter behavioral test-first claim is made.

`script/Demo.s.sol` deploys the executor/router against configured existing AQUA_ADDRESS and WETH_ADDRESS using the Foundry CLI-selected account and STUDIO_OWNER. It checks configured contract code exists; it does not authenticate those addresses as official deployments. Confirm chain-specific deployment addresses independently. The app's separate Anvil bootstrap uses the actual Aqua implementation and the explicitly test-only `Token` fixture in test/Studio.t.sol.
