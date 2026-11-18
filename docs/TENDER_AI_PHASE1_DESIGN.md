# ZAID Tender AI — GHM Phase 1 design (tracking, saved summaries, audit)

**Branch:** `feat/tender-ai-phase1`, created from GHM `main` at `b73839b2` (2026-11-18).
**Batch 2 (tracking read/write) is implemented on this branch: see §8.**
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
