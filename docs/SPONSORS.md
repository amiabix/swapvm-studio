# Sponsor integrations

`app/sponsors.mjs` has no configured sponsor credentials by default. `sponsorStatus({facilitatorUrl,hcsEndpoint,ensResolver})` reports each integration as `configured` or `unconfigured`; it does not inspect environment variables or report a simulated payment.

## Blocky402 paid verification

Blocky402's testnet facilitator is `https://api.testnet.blocky402.com`. Its documented `/verify` and `/settle` requests use x402 v2 and accept a signed `paymentPayload` with its matching `paymentRequirements`. Hedera payloads must include the facilitator-advertised `extra.feePayer`. The payment payload must be built and signed by an actual x402 Hedera client/wallet before calling this module; no private key handling or placeholder signature exists here.

```js
import { verifyAndRunPaidCompute } from './app/sponsors.mjs';

const result=await verifyAndRunPaidCompute({
  endpoint: 'https://your-paid-verifier.example/report',
  facilitatorUrl: 'https://api.testnet.blocky402.com', // optional default
  paymentPayload,       // signed x402 v2 payload
  paymentRequirements,  // exactly the requirements used to make payload
  apiKey,               // optional; required by Blocky402 mainnet when available
  fetch,                // optional fetch implementation
});
```

The function posts to `/verify`, requires `isValid: true` and a payer, posts to `/settle`, requires `success: true` and a transaction receipt, and only then calls `endpoint` with the base64 x402 payload in `X-PAYMENT`. Any missing or failed receipt throws. This follows Blocky402's documented flow; it does not treat a 200 response alone as a payment.

Sources: [Blocky402 API reference](https://blocky402.com/docs/api-reference/), [Blocky402 quickstart](https://blocky402.com/docs/quickstart/), and [x402 HTTP 402 headers](https://docs.x402.org/core-concepts/http-402). Blocky402 currently documents testnet access; mainnet availability and credentials must be checked before use.

## HCS report anchor

Direct HCS message submission needs Hedera transaction signing/protobuf support, which is not an installed dependency. `anchorHcsReport` therefore sends the digest-bound manifest to a configured, authenticated HCS relay and rejects a response unless it contains the same `topicId`, `transactionId`, and `consensusTimestamp`.

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

The relay receives `{topicId,message,encoding:'base64'}`, where `message` is a canonical manifest containing the report, artifact, source, harness, runtime-code, and verifier-signature digests. HCS provides ordering and a consensus timestamp for that submitted message; it does not establish that the report's claims are true. The independently signed verifier report remains the trusted assertion. Hedera identifies HCS as an immutable ordering/timestamp service for proof-of-computation material, and its public ETHOnline 2026 listing confirms participation but does not publish a more specific technical acceptance rule: [Hedera AI material](https://hedera.com/wp-content/uploads/2026/04/Hedera-AI_Ebook-20260416.pdf), [ETHOnline event listing](https://hedera.com/events/).

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
