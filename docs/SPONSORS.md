# Sponsor integrations

`app/sponsors.mjs` has no configured sponsor credentials by default. `sponsorStatus({facilitatorUrl,hcsEndpoint,ensResolver})` reports each integration as `configured` or `unconfigured`; it does not inspect environment variables or report a simulated payment.

## Blocky402 resource-server settlement

Blocky402's testnet facilitator is `https://api.testnet.blocky402.com`. Its documented `/verify` and `/settle` requests use x402 v2 and accept a signed `paymentPayload` with its matching `paymentRequirements`. Hedera payloads must include the facilitator-advertised `extra.feePayer`. The payment payload must be built and signed by an actual x402 Hedera client/wallet before calling this module; no private key handling or placeholder signature exists here.

`settlePaidVerification` is for the x402-gated verifier service, after that service has received a signed x402 payload. It is not an x402 client and it never replays the payload to another paid endpoint.

```js
import { settlePaidVerification } from './app/sponsors.mjs';

const result=await settlePaidVerification({
  facilitatorUrl: 'https://api.testnet.blocky402.com', // optional default
  paymentPayload,       // signed x402 v2 payload
  paymentRequirements,  // exactly the requirements used to make payload
  runVerification: async ({ payer, settlement }) => verifyCandidateFor(payer),
  apiKey,               // optional; required by Blocky402 mainnet when available
  fetch,                // optional fetch implementation
});
```

The function posts to `/verify`, requires `isValid: true` and a payer, posts to `/settle`, requires `success: true` and a transaction receipt, then invokes `runVerification` exactly once. Any failed facilitator response prevents that callback. The client owns the initial request/402/sign/retry handshake; its signed authorization must not be replayed to an independent resource server after settlement.

Sources: [Blocky402 API reference](https://blocky402.com/docs/api-reference/), [Blocky402 quickstart](https://blocky402.com/docs/quickstart/), and [x402 HTTP 402 headers](https://docs.x402.org/core-concepts/http-402). A read of `https://api.testnet.blocky402.com/supported` on 2026-09-13 reported x402 v2 `exact` support for `hedera:testnet` with facilitator fee payer `0.0.7162784`; a real client must discover this again before signing. No signed or settlement request was made for that check.

## HCS report anchor

Direct HCS message submission needs Hedera transaction signing/protobuf support, which is not an installed dependency. `anchorHcsReport` sends the digest-bound manifest to a configured, authenticated HCS relay and only accepts a response with the requested `topicId`, `transactionId`, and `consensusTimestamp`.

```js
import { anchorHcsReport } from './app/sponsors.mjs';

const anchor=await anchorHcsReport({
  endpoint: 'https://your-hcs-relay.example/topics/submit',
  topicId: '0.0.1234',
  report, // independently signed verifier report
  headers: { authorization: 'Bearer relay credential' },
  fetch, // optional fetch implementation
});
```

The relay receives `{topicId,message,encoding:'base64'}`, where `message` is a canonical manifest containing the report, artifact, source, harness, runtime-code, and verifier-signature digests. Its JSON response is untrusted transport data, not proof that HCS accepted or ordered the message. Verify the transaction and topic message independently through a Hedera mirror-node or other trusted Hedera query before presenting it as an anchor. HCS ordering and timestamps also do not establish that the report's claims are true; the independently signed verifier report remains the trusted assertion.

The [ETHGlobal Hedera prize requirements](https://ethglobal.com/events/ethonline2026/prizes/hedera) require a live x402-gated service on Hedera testnet or mainnet settled by Blocky402, a platform or agent completing at least one real paid request end to end, a public GitHub repository/README, and a demo video. It lists HCS audit trails as extra credit. These adapters are configuration-only until a deployed service, wallet/client, relay credentials, and independent receipt verification are supplied.

## ENSv2 Sepolia release pin

`createReportManifest(report)` creates the canonical digest binding. The two ENS helpers create viem-ready resolver calldata only; the caller must send it from an account with that resolver's `setData` permission.

```js
import { buildEnsReleaseRead, buildEnsReleasePin } from './app/sponsors.mjs';

const read=buildEnsReleaseRead({
  name: 'release.swapvm.eth', resolver: '0xResolver', key: 'swapvm.release.manifest',
});
const pin=buildEnsReleasePin({
  name: 'release.swapvm.eth', resolver: '0xResolver', report, key: 'swapvm.release.manifest',
});
// walletClient.sendTransaction({to: pin.to, data: pin.data})
```

The calls target the ENSv2 resolver's `data(bytes32,string)` and `setData(bytes32,string,bytes)` interfaces. The bundled ENSv2 source declares `setData` permissioned, and current ENS docs say to select Sepolia without hard-coding a Universal Resolver implementation address. Sources: [ENSv2 app developer guide](https://docs.ens.domains/ensv2/tutorial-app-developers/) and [PermissionedResolver setData](https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/resolver/PermissionedResolver.sol).
