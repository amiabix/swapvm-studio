# Studio submission copy

## Project name

Studio

## Tagline

Authorize pricing code, deploy it, and trade across Aqua and Uniswap in one Ethereum transaction.

## Short description

Studio turns a custom pricing module into an executable DeFi route. One signed transaction checks an ENSv2 release, deploys the module with CREATE2, buys through SwapVM/Aqua, sells through Uniswap v4, pays the code author, and enforces the trader's minimum return. If a step fails, every execution effect rolls back.

## Project description

Studio connects programmable pricing to a complete trading outcome. A user chooses the tokens, amount, pricing module, author fee and minimum return. After separate setup transactions, they sign one authorization binding the route and its limits.

At execution, the contract reads the live ENSv2 Permissioned Resolver record to confirm the release remains approved. It deploys the committed pricing module if needed, invokes it through a custom SwapVM instruction, buys the intermediate token using Aqua, and sells the net output through Uniswap v4. The trader receives the final output and the module author receives the agreed fee, all within the same transaction.

The critical guarantee is that the route cannot be split: a relayer cannot remove the Uniswap leg and reuse the signature for only the Aqua trade. If the final return is insufficient, both swaps, the module deployment, fee payment and nonce consumption revert together. Revoking the ENS release blocks execution before trading.

The interface exposes editable code and route parameters, guided setup, signed simulation, and receipt inspection. Its evidence page groups the deployed module, both swaps and author payment under one real Sepolia transaction hash. Public test results also demonstrate intentional late rollback and rejection after ENS revocation.

## How it is made

Solidity and Foundry implement and test the executor and custom router. StudioRouter inherits 1inch SwapVM and implements a restricted pricing opcode that calls a module using a bounded STATICCALL. Official Aqua contracts provide maker liquidity accounting and token settlement. The pricing module's init-code and runtime-code hashes are bound to the authorization; CREATE2 determines its deployment address.

AtomicExecutor uses the official Uniswap v4 PoolManager on Sepolia. Its authenticated unlock callback swaps, settles the input and takes the output. The EIP-712 authorization binds the trade, pool parameters, minimum final return, ENS resolver/node and verification-report digest. It also binds the chain and executor through the signing domain. The live ENSv2 data record must match the approved release and report before execution.

Node.js, viem and a plain HTML/CSS/JavaScript frontend provide configuration, compilation/testing, chain inspection and wallet interaction. Tests exercise rollback, replay, signature tampering, hedge stripping, ENS revocation, callback authentication and token balance preservation. Verification campaigns are tests, not formal proofs.

## Hardest technical challenge

Composing two settlement systems without letting the signed intent fragment. An authorization for the Aqua leg must not remain usable independently of the signed Uniswap hedge. We bind both legs into a single digest and verify it through the shared authorization/deployment path. We also authenticate the v4 callback, reject partial hedges, and enforce final balances so donated executor tokens cannot subsidize a failing route. Regression tests cover these boundaries, and public Sepolia tests demonstrate success, late rollback and revoked-release rejection.

## Partner selections and integration descriptions

These are the non-Continuity tracks. Use the tracks matching your actual ETHGlobal registration and disclose pre-existing work. Requirements checked against the [ETHOnline 2026 prize page](https://ethglobal.com/events/ethonline2026/prizes).

### 1inch — Build an Aqua App

Studio uses official Aqua contracts and a custom router inheriting SwapVM. A new restricted pricing instruction executes a committed pricing module, while Aqua settles the maker's trade. We compose that fill with a Uniswap hedge and code-author payment in one transaction. The Sepolia receipt demonstrates real token transfers. This is a custom router deployment, not a change to canonical deployed SwapVM.

### ENS — Best Use of ENSv2

Studio uses an ENSv2 Permissioned Resolver on Sepolia as a live release-authorization source. Its `swapvm.release` data record pins the pricing release and verification-report digest. The executor checks that record before deployment or trading. Changing the record revokes execution, demonstrated by a real rejected Sepolia transaction. The integration reads the configured resolver directly; it does not implement registry traversal or name-expiry enforcement.

### Uniswap Foundation — Best Uniswap Stack Contribution

Studio integrates the official Sepolia Uniswap v4 PoolManager as the second leg of an atomic trade. Aqua output is settled into a hookless v4 pool through an authenticated unlock callback. The final return is enforced across the entire route; insufficient output rolls back both venues. Source and regression tests are public. The required developer feedback form still needs submission; the required FEEDBACK.md file has been removed, so that requirement is currently unmet.

## Links and evidence

- Repository: https://github.com/amiabix/swapvm-studio
- Successful execution: https://sepolia.etherscan.io/tx/0xa18c378e881f3abe9074e746ade151df89cce0e10e471b649eaaccd00906dd07
- Late rollback: https://sepolia.etherscan.io/tx/0x91a477919428a094fa80c3aea58506bf26cadff07f4ca4507b1925590b17ad21
- ENS-revoked rejection: https://sepolia.etherscan.io/tx/0xc67f2f3031f435916941ed18720f827e6efb2e57b417cc61075a00a542276b7b
- Executor: https://sepolia.etherscan.io/address/0x916da5514e87ccc49696a88bba5aa8db2b529a93
- Evidence: https://github.com/amiabix/swapvm-studio/blob/main/docs/evidence/atomic-sepolia-verified.json
- Uniswap feedback form: https://developers.uniswap.org/hackathon-feedback
- Atomic entry point: https://github.com/amiabix/swapvm-studio/blob/main/contracts/AtomicExecutor.sol#L51
- v4 callback: https://github.com/amiabix/swapvm-studio/blob/main/contracts/AtomicExecutor.sol#L122
- Pricing opcode: https://github.com/amiabix/swapvm-studio/blob/main/contracts/StudioRouter.sol#L35
- ENS check: https://github.com/amiabix/swapvm-studio/blob/main/contracts/StudioExecutor.sol#L142

Successful execution: block 11695446, 527,784 gas. 100 demo sUSD in; 102.630526394150830622 demo sUSD returned; author paid 0.9999000099990001 demo rUTH. Prices and liquidity are seeded, so this is execution evidence, not a profitability claim.

## AI use disclosure

AI assistance was used for design, implementation, testing and documentation. The repository includes implementation plans and the restricted generation prompt. Generated pricing modules are tested before use; passing tests is not described as a formal proof.

## Scope

Setup, approvals, liquidity seeding, ENS publication and Aqua shipping happen separately. The final trade is one transaction on one chain. Standard ERC20s, exact-input routes and existing hookless v4 pools only. The current release does not provide cross-chain atomicity, ZK proofs or secret strategies. Public execution was performed through the keystore-backed runner; the configurable composer was exercised end to end locally. Public composer signing requires a browser wallet. Localhost is not a public demo URL.

## Demo outline — approximately three minutes

1. 0:00–0:25: Show the money flow and explain the signed final minimum.
2. 0:25–1:00: Change an amount and expand the pricing code and deployment details.
3. 1:00–1:45: Show the successful public receipt: ENS check, CREATE2 deployment, Aqua fill, v4 fill, author payment, one hash and block.
4. 1:45–2:20: Show late rollback evidence: failed final return, unchanged nonce and no surviving module deployment for that attempt. Failed gas is still spent.
5. 2:20–2:45: Show the ENS-revoked rejection and explain that restoring approval permits later execution.
6. 2:45–3:00: Show the repository, tests and scope; state that setup is separate and liquidity is seeded.

## Remaining submission fields/actions

- Record and upload the demo video; add its actual accessible URL.
- Add a public website URL only if deployed. The local UI has not been hosted publicly.
- Uniswap requires a FEEDBACK.md file and the developer feedback form. The file has been removed; this requirement is currently unmet.
- Add team/member details and confirm the actual event track and pre-existing-work disclosure.
- Upload screenshots/logo if requested by the submission form.
- Submit the ETHGlobal form. Nothing in this document claims that a form has already been submitted.
