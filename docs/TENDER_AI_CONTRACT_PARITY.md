# Tender AI contract parity (GHM validator <-> ZAID Tender AI schemas)

GHM has no schema library, so the Gateway validators in `src/tender/` are hand-written. They are the
**authoritative** validators (owner decisions Q8-Q10); the Tender AI Zod schemas are additional only.
To stop the two drifting silently, parity is a **tested requirement**, not a convention.

## Mechanism (the repositories cannot import each other)

1. **Source of truth for the fixtures:** `zaidhqdev-sys/zaid-tenderai`, file
   `contract-fixtures/tracking-v1.json`, produced by `src/domain/tender/contract-fixtures.test.ts`.
   Every case's expected outcome (`tenderAiValid`) is **computed by running the real Zod schemas**, never typed
   by hand. That test also fails if the committed file differs from what the current schemas produce.
2. **Regenerate (Tender AI repo):** `UPDATE_CONTRACT_FIXTURES=1 npx vitest run src/domain/tender/contract-fixtures.test.ts`
3. **Copy byte-for-byte into GHM:** `src/tender/fixtures/tracking-v1.json` (do not edit it here).
4. **Pin:** update `PINNED.sha256` and `PINNED.tenderAiCommit` in `src/tender/tracking-contract-parity.test.ts`.
   The test fails if the copy's SHA-256 differs from the pin, and fails if any case is judged differently by the
   GHM validator.

Current pin: `tracking-v1.json` SHA-256 `55f34bc13a69a837a6963a6f310819a0e954a757749965619ebec617cf2e44e1`,
Tender AI commit `ac2c70ac411ec09c4a70c741ea619e833d5e547a` (branch `feat/tender-web-app`).

## What the tracking fixtures cover

36 create cases, 16 update cases, 10 path-id cases: boundaries (300/301, 120/121, 200/201, 500/501), trimming,
null clearing, unknown keys, actor/business injection, non-object bodies, `http`/`ftp`/`javascript` URLs, URL
credentials, whitespace in URLs, malformed or impossible instants, and path ids with leading zeros or signs.

## Reviewed differences (documented in the fixture as `ghmDiffers`)

* `stage: "archived"` on **update**: Tender AI's schema accepts it; GHM refuses it, because archiving is a
  separate owner/administrator operation with its own audit event type. Tender AI must call the archive route.

A first parity run found one real gap (whitespace inside a source URL accepted by Tender AI, refused by GHM and
the SQL CHECK). It was fixed on the Tender AI side so the two agree.

## Version-2 saved-summary fixtures (batch 3, same mechanism)

The summary validator does not exist yet (batch 3). It will use the same four steps with a second file
(`summary-v2.json`) generated from `parseSavedSummary` / `validateCreateAnalysis`, covering: valid complete,
valid incomplete, truncated, invalid coverage, unsupported, oversized (>12 KiB) and evidence-integrity cases.
Not yet implemented, so **not yet proven**.
