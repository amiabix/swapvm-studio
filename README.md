# Studio: one transaction

**ENS release authorization → CREATE2 pricing module → SwapVM/Aqua buy → Uniswap v4 sell → author payment and final wallet balance.** One EVM transaction commits every step or reverts every step.

This is same-chain composition. It does not implement a rollup, cross-chain atomicity or a new consensus guarantee. The contribution is a signed execution path that binds a generated pricing artifact, a live ENSv2 release and both venue legs. The signature cannot be extracted and reused for the standalone Aqua trade.

## Submission transaction page

```sh
npm ci
npm run atomic:start
```

Open **http://127.0.0.1:4182** for the successful public Sepolia transaction. No Anvil node, wallet unlock or new transaction is needed to view it. The page groups all six executor stages under one hash and block, with eight exact token transfers, all 21 decoded/raw logs, calldata, addresses and gas details. Expand any stage to inspect its emitted event.

The server rechecks the transaction, receipt and canonical block over Sepolia RPC every 12 seconds while the page is visible. Confirmations and finality reflect the current RPC response. Set `SEPOLIA_RPC_URL` to override the default public endpoint. A saved public receipt is included for outages and explicitly labeled **saved evidence**; confirmations and finality become unverified when the live check fails. No internal call trace is claimed.

The existing interactive local demo is at **http://127.0.0.1:4182/atomic**. The read-only transaction page is also available at `/transaction` in either server mode. Both are local pages; no public website or submission form has been published.

## Run the demo

Requires Node 22+, Foundry and the pinned submodule/dependencies. Local public Anvil keys are used **only** against loopback RPC with chain ID 31337.

```sh
git submodule update --init --recursive
npm ci
# Terminal 1
npm run atomic:chain
# Terminal 2 — compile, verify the sample, deploy actual contracts and seed liquidity
npm run atomic:setup
npm run atomic:start
```

Open **http://127.0.0.1:4182/atomic**. Click **Load demo**, then **Demand 1,000 USD → test rollback**. The real transaction reaches both trading venues and fails its final return check. The program remains undeployed, the nonce remains unused and all measured token balances are unchanged. Gas is still spent. Now click **Sign & execute one transaction**: the same prepared program and nonce successfully settle under the original 100 USD minimum.

Load another demo and click **Revoke ENS release, then test rejection**. Revocation is a separate transaction. The subsequent execution reads the changed ENS record and rejects before either venue trades.

**Build & verify** reuses the existing candidate synthesis/repair pipeline. Replay uses predetermined buggy and corrected sources, with tests executed now. Live generation is available when `STUDIO_MODEL_COMMAND` is configured. Candidate campaigns are tests, not formal proofs. The verified artifact is published and liquidity shipped during preparation; compilation and setup are not included in the final atomic transaction.

```sh
# Runnable end-to-end assertions and fresh receipt/call-trace evidence
npm run atomic:demo
forge test
npm test
```

The end-to-end script uses actual ENSv2 PermissionedResolver, Aqua and Uniswap v4 PoolManager contracts. It asserts success, late rollback and ENS revocation, and writes `artifacts/atomic-evidence.json` plus full per-transaction call traces. Unit tests use a small resolver fixture; the interactive and command-line demos do not. `reference/ens-v2` includes the real resolver/proxy artifacts and all compiler input sources; both artifacts were reproduced byte-for-byte with solc 0.8.26. The local resolver uses an isolated namespace, not a public ENS registration.

## What the signature and contracts enforce

[AtomicExecutor](contracts/AtomicExecutor.sol) extends [StudioExecutor](contracts/StudioExecutor.sol). Its EIP-712 digest binds the complete original trade authorization plus pool fee/tick spacing, final minimum return, ENS resolver, ENS node and verification-report digest. The EIP-712 domain binds chain ID and executor address; the executor immutably binds the v4 PoolManager. Pools must have zero hooks and use the signed token pair.

1. Read `swapvm.release` from the configured ENSv2 resolver. It must equal `abi.encode(releaseKey, reportDigest)`. Both the executor's reviewed-release list and the live ENS record must authorize it.
2. Verify the route signature and nonce. Deploy the committed init code with CREATE2 if absent and check its runtime code hash.
3. [StudioRouter's pricing instruction](contracts/StudioRouter.sol) calls that module using a bounded `STATICCALL`. It validates the exact amount side and available Aqua allocation. SwapVM and Aqua perform real token settlement.
4. Hedge the net rUTH output through the actual v4 PoolManager. Its unlock callback is authenticated, single-use and bound to the route data. Reject partial fills; settle the full input and take the output.
5. Enforce the signed final return. Transfer it to the signer and pay the program author in rUTH. Verify signer, maker, author and executor balance deltas. Preexisting executor donations cannot fund the route or be withdrawn by it.

The guard is on the full execution. A valid hedged signature fails if presented to inherited `execute`, so a relayer cannot strip the Uniswap leg.

Tests cover both token orderings, empty-pool/partial-hedge rejection, late rollback and retry, replay, pool/minimum signature tampering, live ENS revocation, resolver configuration substitution, unsolicited callbacks, and preservation of donated balances. Legacy Studio and Solvent tests remain intact.

## Measured local evidence

A sample run, with seeded Aqua/Uniswap prices and a pre-verified constant-product module:

| Outcome | Gas used | Result |
| --- | ---: | --- |
| Full execution | 527,788 | 100 USD → 102.630526 USD; 0.999900 rUTH author fee |
| Impossible final minimum | 657,227 | Both venue trades and author transfer executed, then reverted; nonce/deployment/token balances unchanged |
| ENS record revoked | 76,593 | Rejected before Aqua or Uniswap |

Gas and returns depend on state, bytecode and the transaction. These figures are not a mainnet profitability claim. [Recorded receipts](docs/evidence/atomic-evidence.json) include actual before/after balances, events and call-trace summaries. Local transaction hashes are replay evidence, not public explorer links.

## Boundaries

- Standard ERC20s, exact-input first legs and hookless Uniswap v4 pools only. No fee-on-transfer or rebasing support; no native ETH path.
- Pool setup, approvals, ENS publication, release review and Aqua shipping are separate transactions. The local server signs using public development keys. It is not a production wallet flow.
- The owner chooses supported tokens and reviewed releases. The signed resolver/node is the release authority; this path does not traverse the ENS registry or independently enforce name registration expiry. Resolver administrators can revoke or rotate the record, causing a pending trade to fail.
- A verification report hash identifies evidence; it does not prove the report's claims. There is no ZK proof, secret strategy or Hedera attestation in this implementation.
- State can change before inclusion; signed output limits protect execution by reverting. Failed transactions still cost gas. This is not a reservation, MEV guarantee or promise of profitable fills.
- The custom pricing opcode uses the existing restricted StudioRouter dispatch table. It is not an opcode installed in canonical deployed SwapVM routers.

## Public Sepolia and sponsor submission

The complete wallet-backed test is available through `script/test-sepolia.command`; see [SEPOLIA-TEST.md](docs/SEPOLIA-TEST.md) for its three actual execution transactions, spending cap and recovery behavior. It asks for the keystore password locally.

[DeployAtomic.s.sol](script/DeployAtomic.s.sol) prepares the public infrastructure using the official [Sepolia v4 PoolManager](https://developers.uniswap.org/docs/protocols/v4/deployments), and a fresh Aqua + AtomicExecutor. It requires an owned ENSv2 resolver/node and supported token addresses. It does not register a release, fund a pool or perform the first public trade.

```sh
# Configure STUDIO_OWNER, ENS_RELEASE_RESOLVER, ENS_RELEASE_NODE,
# ATOMIC_TOKEN_IN, ATOMIC_TOKEN_OUT and SEPOLIA_RPC_URL in your local environment.
forge script script/DeployAtomic.s.sol:DeployAtomic \
  --rpc-url "$SEPOLIA_RPC_URL" --account cure-issuer \
  --sender "$STUDIO_OWNER" --broadcast --slow
```

**Public Sepolia testing is complete.** [The atomic trade](https://sepolia.etherscan.io/tx/0xa18c378e881f3abe9074e746ade151df89cce0e10e471b649eaaccd00906dd07), the intentional late revert and ENS-revoked rejection were broadcast and independently verified, including historical balances, CREATE2 code and nonce state. All 27 receipts were checked; total cost was 0.014600982587924065 test ETH. The ENS release is restored. [Public evidence](docs/evidence/atomic-sepolia-verified.json) records the deployed contracts and execution receipts. Run `npm run atomic:verify:sepolia` to repeat the read-only checks while the RPC supports those historical blocks.

The strategy lab at `/atomic` still intentionally executes on local Anvil; the default page displays live public Sepolia evidence. The separate keystore-backed runner performed public deployment, test-token funding, pool seeding, ENS publication and the three tests. These setup transactions are separate from the single atomic trade.

Intended partner selections: 1inch, ENS and Uniswap. These are targets, not eligibility confirmations: the ENSv2 Sepolia execution is now recorded, and Uniswap still requires the developer feedback form alongside [FEEDBACK.md](FEEDBACK.md). No submission or feedback form has been sent.

## Provenance

SwapVM `release/1.1` is pinned to `ac06e1bac021cd1983dc7c44d1f69b4b8861a945`, © Degensoft Ltd 2025, under [SwapVM-1.1](vendor/swap-vm/LICENSES/SwapVM-1.1.txt). Uniswap v4-core is npm 1.0.2; its original licenses are retained. Its packaged `PoolModifyLiquidityTest` is used only for local liquidity setup/testing. ENSv2 sources and compiler provenance are in [reference/ens-v2](reference/ens-v2/README.md).

AI assistance was used for design, implementation, tests and documentation. The implementation plan is [here](docs/superpowers/plans/2026-09-13-atomic-uniswap.md); the restricted live-generation prompt is in [generate.mjs](app/generate.mjs). No model-generated source is called formally verified.

Earlier work is preserved in [README-STUDIO.md](README-STUDIO.md) and [README-SOLVENT.md](README-SOLVENT.md). Cure's deployed contracts were not modified.
