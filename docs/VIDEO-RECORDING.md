# Recording the working demo

Keep the video below four minutes at normal playback speed. The live local scenes use actual contracts and funded development accounts, not a browser wallet. Explicitly distinguish them from the already-confirmed public Sepolia receipt.

## Tabs

1. http://127.0.0.1:4182/compose?network=local — customizable local trade. A saved draft takes precedence over the URL; use the network selector if necessary.
2. http://127.0.0.1:4182/atomic — local rollback and ENS revocation experiments.
3. http://127.0.0.1:4182/transaction — live inspection of the successful public Sepolia transaction.

## Three-minute walkthrough

- **0:00–0:25 — Public receipt.** “Studio binds a pricing program, an Aqua trade, a Uniswap trade and the author payment to one signed outcome. Here is the confirmed Sepolia execution.” Show the one hash, six stages, block and returned balance. State that test prices were seeded.
- **0:25–1:15 — Customizable local route.** Show the local network label. Choose an amount and minimum return, then Review trade. Expand Tokens, code & contract details → Aqua position & SwapVM deployment: the program has a predicted address and is not deployed yet. Close details, complete the visible setup steps, sign/preview, then execute. Setup is separate from the final trade.
- **1:15–2:05 — Late rollback.** On the local test page, click Load demo, then Demand 1,000 USD → test rollback. Show the unchanged balances, unused nonce and absent deployment. “Both venue trades ran; the final return failed, so their state changes rolled back. Gas was still spent.” Then click Sign & execute one transaction to show the original minimum succeeds.
- **2:05–2:40 — ENS revocation.** Click Load demo again, then Revoke ENS release, then test rejection. “Changing the live ENS approval blocks the route before either venue is called.” The revocation itself is a separate transaction.
- **2:40–3:00 — Public evidence.** Return to the Sepolia receipt. Expand the CREATE2 stage or token movements. End on the repository and explain the boundary: one-chain composition, tested code, separate preparation.

## Rehearsal verification

September 13: local composer setup, simulation and settlement passed; local late rollback, successful retry and ENS rejection passed; the public receipt loaded six executor stages and eight token transfers from live RPC. Desktop and mobile inspection reported no page errors or horizontal overflow. The local fixture now deploys actual DemoToken contracts named Demo USD (sUSD) and Demo rUTH (rUTH).

Start the server with `npm run atomic:start`; local Anvil must remain running on port 8551. Do not restart the app or Anvil during a take, since drafts are in memory. Use a newly reviewed route before recording rather than an hour-old authorization. No new Sepolia transaction is required for this walkthrough.
