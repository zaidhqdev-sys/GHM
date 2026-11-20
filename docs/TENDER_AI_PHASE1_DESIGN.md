# ZAID Tender AI — GHM Phase 1 design (tracking, saved summaries, audit)

**Branch:** `feat/tender-ai-phase1`, created from GHM `main` at `b73839b2` (2026-11-18).
**Batch 2 (tracking) and batch 3 (saved analyses) are implemented on this branch: see §8 and §9.**
**Status:** development approved by the owner for this branch only (2026-11-18). **Nothing here is merged, applied to any database, deployed, or authorized for production.** Migration reconciliation (42+ pending production migrations) remains unresolved; the tender migrations must not enter `main` until it is.
**Tender AI side:** repo `zaidhqdev-sys/zaid-tenderai`, branch `feat/tender-web-app`, head `d0c7bf5` (version-2 projection contract, read and write validators).

## 1. Contracts verified at `b73839b2` (not taken from the old proposal)

| Area | Verified fact (file) |
|---|---|
| Gateway shape | `src/actor-gateway/app.ts`: Express app; `authenticateGatewayActor` verifies the ES256 bearer token itself (`AccessJwtVerifier`) and sets `res.locals.actorAccountId`; per-account rate limit (120/min, or the Worker decision); `express.json({limit:'16kb'})` after auth; routes are `/v1/...`, business-scoped ones `/v1/businesses/:businessId/...`. |
| Operation chain | Resource API router -> `src/http/*-gateway-client.ts` (forwards the user's token, 5 s timeout, `redirect:'error'`) -> Gateway route -> `src/actor-gateway/*-reader.ts` (opens a transaction, builds an HMAC assertion with `createActorGatewayAssertion(key, actor, operation, context)`) -> `ghm.gateway_*` `SECURITY DEFINER` function. |
| Assertion | `request-assertion.ts`: payload `ghm-actor-gateway:v2\|actor\|operation\|issuedAt\|nonce\|hex(context)`; DB function checks `session_user = 'ghm_actor_gateway'`, 60 s window, HMAC with the secret in `ghm.actor_gateway_capability_assertion_secret`, one-use nonce in `ghm.actor_gateway_capability_assertion_nonce`, active account, and that `p_context::jsonb` equals the arguments (so a caller cannot sign one thing and send another). |
| Authorization | Done **inside** the SQL function (`ghm.business_membership`, `membership_status='active'`, role set), under `FOR SHARE`. Newest precedent: `20261116190000_add_commercial_consent_payment_prepare_gateway.sql`. |
| Error mapping | Gateway routes map SQLSTATE: `42501` 403, `22023` 400, `P0001`/`23505` 409, `P0002` 404, anything else 503 with a bounded `actor_gateway_operation_failed` log (error class only). |
| Append-only precedent | `20261116150000_create_commercial_consent_evidence.sql`: owner `ghm_schema_owner`, `BEFORE UPDATE OR DELETE` row trigger **and** `BEFORE TRUNCATE` statement trigger, `ON DELETE RESTRICT` on the actor and business, a `request_id` column, no runtime grant. This closes the two gaps the older directory-review event table has (no TRUNCATE guard, `ON DELETE SET NULL` actor). |
| Grants | Functions: `OWNER ghm_schema_owner`, `REVOKE ALL FROM PUBLIC, ghm_runtime, ghm_migrator`, `GRANT EXECUTE TO ghm_actor_gateway`. Tables: no grant to the runtime role. The expected function ACL is pinned in `src/actor-gateway/database-privileges.ts` and `scripts/qualify-actor-gateway-principal.mjs`; new functions must be added to both. |
| Request id | **Gap.** No Gateway-generated request id exists. Only `POST /v1/commercial/payment-prepare` reads an optional client `x-request-id` (`^[A-Za-z0-9._:-]{1,200}$`) and stores it. Tender operations need the Q13/Q14 two-id model, which is built here for tender routes only. |
| Auth issuer | `main`: `server.ts` runs `createApp({authRoutesEnabled:false})`; the issuer (`src/auth-issuer`) serves `/api/v1/auth/*`. Unchanged by this branch. |
| Roles | `business_membership.membership_role IN ('owner','administrator','member')`. |
| Tests | `npm test` is an explicit file list in `package.json` (new test files must be added) and mixes `node:test` static SQL contract tests (`src/db/*-migration-contract.test.ts`) with reader tests on a fake pool. **No test here executes SQL against PostgreSQL.** |
| Production guard | `src/db/production-pending-migration-allowlist.ts` makes `migrate.ts` refuse a production run whose pending set differs from the allowlist. This branch does not touch it; a tender migration that reached `main` would stop a production run, which is the intended safety net. |

## 2. Gaps found, and how this branch treats them

| # | Gap | Treatment |
|---|---|---|
| G1 | No Gateway-generated authoritative request id | Implement for tender routes only: `crypto.randomUUID()` per request, signed into the assertion context and stored. The Tender AI id (`x-request-id`) is validated as a UUID and stored only as `client_correlation_id`, opaque, never an identity or authorization input. |
| G2 | No structured success log for gateway operations | Tender operations only (Q14). One bounded line per success: request id, correlation id, actor, business, operation, resource id, outcome. No general audit platform. |
| G3 | Denial logging | Tender routes only, logs only (Q13), allow-listed fields, bounded volume. No DB row for denials. |
| G4 | The Resource API has no tender router | Add `src/http/tender-*-router.ts` and a gateway client, following `business-hours-gateway-client.ts`. |
| G5 | Nothing can execute the new SQL here | Static contract tests plus reader/route tests on fakes. A disposable-database qualification (blocker B5) is required before any claim the SQL works. Not installing PostgreSQL, not using the expired sandbox, not touching `ghm_db`. |
| G6 | Capability registry (`requireRegisteredAccess`) on Resource API routes | Decide in batch 2 after reading `src/resources/registry.ts`; no new platform. |

## 3. Operations (Gateway routes, all under `/v1/businesses/:businessId/tenders/...`)

Q1: active members create and edit; owners and administrators archive and delete. Reads: any active member. Path ids are positive integers (`^[1-9][0-9]{0,14}$`). Bodies are strict (exact key sets), 16 KiB.

| Operation (signed name) | Method and path | Who |
|---|---|---|
| `tender.tracking.create` | `POST /tenders/tracking` | active member |
| `tender.tracking.list` | `GET /tenders/tracking?stage=&limit=&after=` | active member (bounded page, max 50) |
| `tender.tracking.get` | `GET /tenders/tracking/:id` | active member |
| `tender.tracking.update` | `PATCH /tenders/tracking/:id` | active member |
| `tender.tracking.archive` | `POST /tenders/tracking/:id/archive` | owner/administrator |
| `tender.tracking.delete` | `DELETE /tenders/tracking/:id` | owner/administrator |
| `tender.analysis.create` | `POST /tenders/analyses` | active member |
| `tender.analysis.list` | `GET /tenders/analyses` | active member (bounded) |
| `tender.analysis.get` | `GET /tenders/analyses/:id` | active member |
| `tender.analysis.delete` | `DELETE /tenders/analyses/:id` | owner/administrator |

The business id comes from the path only and is bound into the signed context; it is never read from a body. The actor is the verified token account; no body, header or query field can name an actor, account or role. Denial of a business the caller does not belong to is `403` (SQLSTATE `42501`) for every operation, so a business cannot be probed for existence through a different status.

## 4. Schema (to be written as migrations in batches 2-4)

Every table: owner `ghm_schema_owner`, RLS enabled, `REVOKE ALL FROM PUBLIC, ghm_runtime`; reachable only through the `SECURITY DEFINER` functions above.

**`ghm.tender_tracking`** (batch 2): `id`, `business_id` (FK RESTRICT), `title` (1-300), `reference_number` (1-120), `issuer_name` (1-200), `source_url` (https, 8-500, user-supplied and shown as unverified), `closing_at`, `stage` in `saved|evaluating|preparing|submitted|archived`, `created_by`/`updated_by` (FK RESTRICT), timestamps, `archived_at` with `CHECK (stage = 'archived') = (archived_at IS NOT NULL)`. Limits equal to the Tender AI contract. At most **500** per business, enforced in the function under a per-business advisory lock, not only in the client.

**`ghm.tender_analysis`** (batch 3): `id`, `business_id`, optional `tender_tracking_id` (FK `ON DELETE SET NULL`, so deleting a tracking record keeps the saved summary, unlinked), `projection_version smallint CHECK (= 2)`, `source CHECK ('ai_extracted')`, `model`, `prompt_version`, `document_sha256` (64 hex; no document text, Q6), `coverage_status CHECK IN ('complete','incomplete')`, `chunks_total`, `chunks_processed`, `truncated_for_storage`, `result jsonb` with `octet_length(result::text) <= 12288`, and CHECKs that the denormalised columns equal the values inside `result`. At most **100** per business. `unsupported` has no representation. The strict version-2 validation runs in the Gateway (Q10: authoritative) against a hand-written validator in this repo (GHM has no `zod`), checked against **conformance vectors generated from the Tender AI contract tests** so the two cannot drift silently; the SQL CHECKs are a second line, not the first.

**`ghm.tender_audit_event`** (batch 4, Q12, Q13): `id`, `occurred_at`, `request_id uuid NOT NULL` (Gateway-generated), `client_correlation_id uuid` (untrusted metadata), `actor_account_id` (FK **RESTRICT**), `business_id` (FK RESTRICT), `operation` (CHECK list), `resource_type`, `resource_id bigint` (no FK, so it survives a delete), `outcome CHECK ('success')`, `metadata jsonb` (object, at most 2 KiB, allow-listed keys such as changed field names, stage from/to, coverage status, document hash). Row trigger on UPDATE/DELETE and a **TRUNCATE** trigger both raise `55000`. Written only inside the same function and transaction as the change, so a failed write leaves no event and an event cannot exist without its change. Denials are never written here: a raising function rolls its own insert back, and Q13 says logs only.

## 5. Two ids and logging (Q13, Q14, refinement)

Gateway generates `requestId` per tender request. The incoming `x-request-id` is accepted only if it is a UUID; otherwise it is dropped (not an error). Both go into the signed context; the audit row keeps both; the structured success log prints both. Denial and failure logs carry only: request id, authenticated actor if known, operation, business id if it parsed as a positive integer, outcome class, timestamp; capped per window with a single suppression summary, the same way Tender AI bounds its own logs. No tender text, quote, summary or personal data is logged anywhere.

## 6. Batches and evidence

1. This design (no code, no migration).
2. Tracking: migration, `gateway_*` functions, reader, Gateway routes, Resource API router and client, tests.
3. Saved summaries: migration, validator with conformance vectors, functions, reader, routes, tests.
4. Audit events: table and triggers, calls inside the functions, request-id plumbing, tests.
5. Integration and security tests (cross-business, replay, tampered context, caps, incomplete stays incomplete, unsupported refused).
6. Handovers in both repos.

## 7. What remains blocked for production (unchanged by this branch)

B1 Render role remediation; B2 backup; B3 staged runner; B5 disposable-DB qualification (this branch's SQL has not run on any database); B6 secret provisioning; B7 Gateway service (an always-on Render service is not approved); B8 auth issuer; B9 Resource API redeploy; B10 adding the Tender AI origin; and the 42+ pending-migration reconciliation. Merging, applying, deploying and spending are not authorized.

## 8. Batch 2 outcome (tracking read/write)

Implemented: migration `20261118100000_create_tender_tracking_and_audit.sql`; Gateway validator, reader, request-id
context and bounded logger; six Gateway routes; Resource API client, router and registry entry; privilege-checker
update; tests. **None of the SQL has run on any PostgreSQL database.** Evidence is static contract tests, a
pure-JS PostgreSQL *syntax* parse (libpg-query, scratch directory, not a dependency), and fake-pool/fake-reader tests.

Decisions taken in batch 2 (and the G6 resolution):

* **G6:** a `tender_tracking` resource is registered (read, create, update, archive, delete); `archive` was added to the
  `ResourceOperation` vocabulary. Roles `admin` and `business` only; `customer` has none. Fine-grained authorization is
  NOT decided there: it is repeated server-side in SQL from `business_membership`.
* **Authorization inside SQL:** every gateway function checks (1) context equals arguments, (2) the one-use signed
  assertion, (3) active membership with the right role. Non-members, and nonexistent Businesses, are `42501` -> 403.
* **Archive vs permanent delete:** separate functions, routes, and audit types `tender.tracking.archive` /
  `tender.tracking.delete`. Update cannot set `archived`; archived records cannot be edited. The audit table has no
  foreign key to the record, so the delete event survives; there is no cascade anywhere to audit history.
* **Audit:** written by an internal helper in the same function (same transaction) as the change; allow-listed metadata
  (changed field names, stage from/to) only; denials are logs only.
* **Caps in SQL:** at most 500 active and 2000 total per Business under a per-Business advisory lock.
* **Privilege checker:** `database-privileges.ts` accepts a database with all six tender gateway functions or none (so a
  database without the feature-branch migration still qualifies), and rejects any partial or extra set. Internal helper
  functions have no gateway EXECUTE grant and are intentionally not listed.
* **`scripts/qualify-actor-gateway-principal.mjs` unchanged:** it is a live-database script and cannot run here; adding
  tender cases to it is part of the disposable-database qualification (B5).
* **Parity:** see `docs/TENDER_AI_CONTRACT_PARITY.md`. Tracking fixtures are done; version-2 summary fixtures are batch 3.

### Not yet proven (needs a disposable PostgreSQL run, B5)

SQL executes at all; plpgsql semantics (composite-type handling in `tender_tracking_json`, `FOR SHARE`, advisory lock,
`hmac` availability, `jsonb` context equality with real parameter binding); RLS/privilege effects; the triggers actually
rejecting UPDATE/DELETE/TRUNCATE; `ON DELETE RESTRICT`; check constraints; real nonce replay; concurrency on the caps.
The replay and tamper tests in `tender-tracking-reader.test.ts` exercise a *model* of the verifier, not the SQL.

## 9. Batch 3 outcome (saved analyses)

Implemented: migration `20261119100000_create_tender_analysis_and_extend_audit.sql`; hand-written version-2 validator
`src/tender/analysis-contract.ts`; reader `tender-analysis-reader.ts`; four Gateway routes under
`/v1/businesses/:businessId/tenders/analyses`; Resource API client, router and `tender_analysis` registry entry; privilege
checker update; parity fixtures; tests. **None of the SQL has run on any PostgreSQL database.**

* **Operations:** `tender.analysis.create|list|get|delete`. Create/list/get: any active member. Delete: owner or
  administrator, permanent (there is no archive and no update for analyses). Authorization is repeated inside each SQL
  function; a non-member or nonexistent Business is `42501` -> 403 for every operation.
* **Contract:** exact version 2. Strict keys everywhere; nothing is defaulted, converted or repaired. Contradictory
  coverage, evidence outside read text, a truncation flag that contradicts the counts, and any unknown key are refused
  (`400`). `unsupported` is refused with its own status (`422`) and has no representation in the schema (CHECKs allow only
  `complete`/`incomplete`). Over 12 KiB (projection) or 16 KiB (request) is `413`. All of this is decided in the Gateway
  **before** any database call.
* **Writes validated, reads validated:** the reader validates every result against version 2 **before COMMIT**, so a database
  that returns anything outside the contract (or a payload different from the one sent) rolls back rather than persisting.
  The Resource API client validates responses again. Stored columns must equal what the payload says.
* **Preserved semantics:** `coverageStatus`, `chunksTotal`, `chunksProcessed` and `truncatedForStorage` are *derived in SQL
  from the payload* (never taken as separate inputs) and pinned by CHECKs; complete <=> all parts processed. The row is
  immutable (trigger, `55000`); the only permitted change is the foreign-key action that unlinks the tracking record when
  that record is deleted. A saved incomplete analysis therefore cannot become complete.
* **Second line in SQL:** `ghm.tender_analysis_result_problem` (IMMUTABLE, used by a CHECK and by the create function)
  refuses unexpected keys, wrong version/source, bad counts, a chunk list that disagrees with the totals, a processed count
  that disagrees with the outcomes, status/count contradictions and a lying truncation flag. It does not replace the
  Gateway validator (evidence offsets, quote rules and dates are validated only there).
* **Size note:** `jsonb::text` has spaces after separators, so the SQL ceiling is a sanity limit (20,000 bytes); the compact
  12 KiB limit is enforced by the Gateway validator.
* **Linking:** an optional tracking id must belong to the same Business; one that belongs to another Business is
  indistinguishable from a missing one (`404` after authorization). Deleting a tracking record keeps the analysis, unlinked.
* **Caps:** 100 per Business under a per-Business advisory lock.
* **List:** metadata only (no payload), bounded to 50; the payload is returned by the single-record read.
* **Audit (Q12/Q13):** `tender.analysis.create` and `tender.analysis.delete` are separate event types written by the same
  internal helper in the same transaction as the change. Metadata is allow-listed: coverage status, chunk counts, truncation
  flag, document hash, linked flag; never summary text, quotes or requirements. The audit table has no foreign key to the
  analysis, so deleting an analysis leaves its history intact; nothing cascades. Denials are logs only. The audit table's
  triggers (UPDATE/DELETE/TRUNCATE rejected) are unchanged; only its two CHECK lists were extended.
* **Assertion verifier:** widened to exactly the four analysis operations (same signature, so owner and ACL are kept).
* **Privilege checker:** accepts neither / tracking only / tracking plus analysis; refuses analysis without tracking, any
  partial set, extras and internal helpers.

### Not yet proven (needs a disposable PostgreSQL run, B5)

The same list as batch 2, plus: that `tender_analysis_result_problem` behaves as written on real jsonb (including its use in
a CHECK), that the CHECK on denormalised columns holds for every fixture's valid body, that the immutability trigger lets the
`ON DELETE SET NULL` action through, that a CHECK-constraint replacement on a populated audit table works, that a
12 KiB-compact payload fits the 20,000-byte jsonb ceiling in practice, real nonce replay and concurrency on the cap.
Static contract tests, fake-pool tests and a syntax-only parse are **not** qualification.

## 10. B5 qualification preparation and the audit foreign-key review (2026-11-20)

**Result: the PostgreSQL run itself did NOT happen.** No existing disposable qualification database could be reached and
confirmed safe (see the handover). What follows is the static review and the prepared run.

### 10.1 The audit foreign keys match Q12
`ghm.tender_audit_event.actor_account_id -> ghm.account_identity(id)` and `business_id -> ghm.business(id)` are both
`ON DELETE RESTRICT` (batch 2 migration, lines 61-62). `resource_id` has deliberately **no** foreign key. Nothing in batch 3
changed them (it only replaces the two CHECK lists). The qualification script asserts this from `pg_constraint`.

### 10.2 What `ON DELETE SET NULL` refers to
Exactly one relationship: `tender_analysis.tender_tracking_id -> tender_tracking(id) ON DELETE SET NULL`. It is the optional
link from a saved analysis to a tracking record. It never touches the audit table, an actor, a Business, or analysis content.
Behaviour to prove on PostgreSQL: the cascade is an UPDATE of `tender_analysis`, so it runs the immutability trigger
(`guard_tender_analysis_update`), which allows exactly the change `tender_tracking_id -> NULL` and nothing else.
**Properties and consequences, not assumed harmless:**
* the unlink is a change to a saved analysis that has **no audit event of its own**; the only record is the
  `tender.tracking.delete` event written in the same transaction. That event does not say how many analyses were unlinked.
  This is a decision for the owner (see 10.5), not changed here.
* because audit events are immutable and their foreign keys are RESTRICT, **an account or a Business that has ever written a
  tender record can never be hard-deleted** while its audit history exists. That is what Q12 asks for, but it constrains any
  future account-erasure or Business-closure feature (POPIA). The qualification script asserts the refusal (23503).

### 10.3 12 KiB projection versus the 20,000-byte limit
The Gateway measures compact JSON; PostgreSQL stores `jsonb` whose text form adds one space after each `:` and `,`. Using the
real validator and an independent jsonb-style serializer, the densest accepted payload (119 requirements, 10 dates, 8
missing items, 16 chunks) is 12,208 compact bytes and about 13,900 jsonb-text bytes (x1.14). The schema's structure bounds the
inflation to roughly x1.14, so the real maximum is about 14,000 bytes: it fits with about 6 KB of margin. Pinned by
`src/tender/analysis-storage-size.test.ts`. **This is a computation; the first PostgreSQL run must confirm it.**

### 10.4 Gap found and corrected: text PostgreSQL cannot store
The Tender AI contract (Zod) accepts any JavaScript string. PostgreSQL cannot store U+0000 in `text` or `jsonb`, and a lone
UTF-16 surrogate is invalid UTF-8. The Gateway validators accepted such strings, so they would have passed validation and
then failed inside the database as an error mapped to 503 instead of a clean 400. Corrected on the feature branch:
`src/tender/storable-text.ts` is applied to every free-text field of the analysis projection (and its read side), to `model`
and `promptVersion`, and to the tracking title, reference, issuer and source URL. Nothing is stripped or replaced. This is
**stricter than the Tender AI contract**, recorded as a reviewed difference in `TENDER_AI_CONTRACT_PARITY.md`. Tender AI
should adopt the same rule so that it refuses before it calls.

### 10.5 Migration review: CHECK replacement and trigger ordering
* The audit CHECK replacement (DROP then ADD, same transaction) does not fire the row triggers (ALTER TABLE is not a row
  operation), and ADD validates every existing row; existing tracking events satisfy the wider list, and a violation would
  abort the whole migration. Atomic, no window without a constraint.
* The immutability trigger on `tender_audit_event` is `BEFORE UPDATE OR DELETE` plus a statement-level `BEFORE TRUNCATE`.
  The analysis immutability trigger is `BEFORE UPDATE`; the SET NULL cascade passes it by design (to be proven).
* Open decision for the owner: should `tender.tracking.delete` audit metadata record the number of analyses it unlinked?
  Recommended: yes (`unlinkedAnalyses`), as a one-line addition to the batch 2 delete function. Not changed, because it
  alters the batch 2 audit contract.

### 10.6 Prepared qualification
`scripts/qualify-tender-gateway-postgres.mjs` (called from `scripts/qualify-actor-gateway-principal.mjs`, which already forces
the database to be `ghm_disposable_test` and checks the three role identities). It covers items 1-14 of the request. **It has
never been executed.** It uses its own fixtures, which cannot be deleted afterwards (RESTRICT + append-only), so it must only
ever run against a throw-away database. The existing cleanup and all existing checks are unchanged.
