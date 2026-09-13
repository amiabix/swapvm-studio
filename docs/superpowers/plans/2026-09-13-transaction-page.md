# Submission transaction viewer

User scope: a clean frontend showing transaction `0xa18c378e881f3abe9074e746ade151df89cce0e10e471b649eaaccd00906dd07` live and making its single-transaction boundary unmistakable.

Implementation:
- Decode the fixed public transaction and all receipt logs using deployed-contract ABIs. Check transaction, receipt, canonical block and executor/event bindings before presenting live evidence.
- Serve one read-only endpoint with a shared ten-second cache. The browser refreshes every twelve seconds while visible. On failure, show labeled saved evidence without current confirmations/finality.
- Present six execution stages inside a shared hash/block frame, exact token transfers, expandable input/events/gas/contract details and a JSON download.
- Keep the existing local strategy lab at `/atomic`; make this view the atomic server's default page.

Validation: fixture assertions check exact amounts, 21 decoded logs, eight transfers and rejection of mismatched evidence; an unreachable RPC check verifies fallback labels/state. Browser checks cover live refresh, expanded event/calldata views, download, outage/recovery, and desktop/mobile overflow. No signing or additional on-chain transactions are involved.
