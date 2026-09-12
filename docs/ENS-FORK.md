# ENSv2 fork integration

`app/ens-fork-demo.mjs` exercises the execution gate against the deployed ENSv2 `PermissionedResolver` at `0x7a04357971e6fEEc756df2E0d9b8e5D49eB020AB`, for `cure-settlement.eth`, on an Anvil fork of Sepolia. It never submits a public Sepolia transaction.

Run it only with the parent-provided loopback Anvil fork on port 8548:

```sh
node app/ens-fork-demo.mjs
```

The script refuses any non-loopback RPC, requires chain ID `31337`, requires the configured `https://ethereum-sepolia-rpc.publicnode.com` fork, and sets `STUDIO_RPC_URL=http://127.0.0.1:8548` plus `STUDIO_CHAIN_FILE=ens-fork-chain.json` before dynamically importing the local-chain helpers. It uses `anvil_impersonateAccount` for the existing local-fork issuer and stops impersonating it in `finally`.

The run deploys a local Studio executor, executes the passed `artifacts/good-full-report.json` candidate, configures the optional ENS gate, and writes the real resolver's exact gate record:

```solidity
setData(namehash("cure-settlement.eth"), "swapvm.release", abi.encode(releaseKey, reportDigest))
```

It confirms that quoting succeeds with the record, fails after the record is cleared, then succeeds after restoration. The run writes transaction hashes, resolver/node details, the fork block, and assertions to `artifacts/ens-fork-evidence.json`.

This demonstrates an actual ENSv2 Sepolia resolver state as read and written by a local fork. It is not a public Sepolia deployment, does not prove the issuer's production authorization policy, and does not turn the verifier report into a proof. The resolver permission model is implemented in the [ENSv2 PermissionedResolver](https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/resolver/PermissionedResolver.sol); the gate only trusts the configured resolver and exact digest binding.
