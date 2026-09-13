# ENSv2 local deployment artifacts

These are actual PermissionedResolver and ERC1967Proxy builds, not resolver mocks.
They were extracted from the existing Cure build, solc 0.8.26, optimizer 200,
viaIR, Cancun. ENSv2 source revision:
https://github.com/ensdomains/contracts-v2/tree/48b3e2d39513b9dd32ef1850877a29009bc807b9

`compiler-input.json` contains all 43 required source files, original SPDX notices,
remappings, and compiler settings. Rebuild with:

```sh
solc-0.8.26 --standard-json < reference/ens-v2/compiler-input.json > /tmp/ens-build.json
```

Compare each output's `evm.bytecode.object` with the artifact's `bytecode.object`
(ignoring the `0x` prefix). Constructor arguments are supplied separately.
The local node has an isolated ENSv2 resolver; it does not claim a public ENS name.
Public Sepolia integration uses an owned ENSv2 namespace and its resolver instead.
