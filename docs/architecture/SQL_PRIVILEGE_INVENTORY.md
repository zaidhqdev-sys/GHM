# GHM SQL / Privilege Inventory

## Status

**Construction inventory — reconciled against the current GHM source tree and captured PostgreSQL evidence.**

No PostgreSQL roles or privileges are changed by this documentation reconciliation.

## Runtime SQL inventory

### `src/server.ts`

The canonical runtime shell performs one database connectivity query during startup:

```sql
SELECT 1
```

It does not mutate application schema or create product tables. Health/readiness routes have explicit operational contracts.

### Resource repositories

The current construction resource repositories now contain governed SQL for the qualified Business Identity, Project, Enquiry, Review, Opportunity Core, Project Quote, and Business Offering slices. Their exact table/column and authorization requirements are owned by their respective resource contracts and qualification evidence.

Runtime privilege grants are therefore derived from measured repository SQL for each qualified slice rather than inferred from legacy database ownership.

### `src/db/pool.ts`

Defines the shared PostgreSQL pool. It contains no SQL statements of its own.

### `src/db/transaction.ts`

Defines the transaction boundary and issues only transaction-control commands around caller work:

- `BEGIN`
- caller repository work
- `COMMIT`
- `ROLLBACK`

### `src/db/authorized-transaction.ts`

Passes the authenticated `AuthContext` through the same checked-out PostgreSQL client/transaction. It contains no independent database pool or unawaited authorization query.

## Migration SQL inventory

### `src/db/migrate.ts`

The migration runner is separate from application startup and belongs to migration authority, not runtime authority.

Its database interactions include transaction control, advisory locking, migration-ledger reconciliation, repository migration execution, checksum recording, and rollback on failure.

The migration runner is qualified using `GHM_MIGRATOR_DATABASE_URL`, connecting as `ghm_migrator` and explicitly setting `ghm_schema_owner` for migration work. Identity, ledger reconciliation, repeat/no-op behavior, commit, and checksum integrity have passed for the current construction migrations.

The exact DDL authority remains with `ghm_schema_owner`; runtime must not inherit migration/schema-owner authority.

## Current source-to-privilege conclusion

At the current construction stage:

| Capability | Current source requirement | Target authority |
|---|---|---|
| PostgreSQL connection | Yes | Runtime |
| `SELECT 1` startup probe | Yes | Runtime |
| Qualified resource SELECT/INSERT/UPDATE | Yes, per governed repository | Runtime, exact measured grants |
| Qualified resource DELETE | Only where a contract explicitly requires it | Not granted by default |
| Sequence usage | Only where identity inserts require it | Runtime, exact measured grants |
| Schema CREATE | No | Migration/schema-owner only |
| Arbitrary DDL | No | Migration/schema-owner only |
| `CREATEDB` | No | Never runtime |
| `CREATEROLE` | No | Never runtime |
| `TRUNCATE` | No | Not runtime |
| `REFERENCES` | No | Not runtime unless explicitly qualified |
| `TRIGGER` | No | Not runtime unless explicitly qualified |
| Migration ledger read/write | Migration runner only | Migration authority |
| Migration advisory lock | Migration runner only | Migration authority |

## Live privilege reconciliation

The captured legacy database still contains the broad legacy `ghm_db_user` authority. That exceeds the intended measured runtime boundary.

The dedicated `ghm_runtime` boundary has been independently qualified for the current construction slice, including positive ACL checks and negative probes for DDL, destructive operations, migration-ledger mutation, sequence mutation, and role escalation.

The unresolved bootstrap memberships remain provider/bootstrap-authority work and must not be represented as runtime authority.

## Canonical GHM schema boundary

The first canonical GHM Business Identity slice is repository-owned and migration-controlled. Subsequent qualified construction slices have been added through the same governed process.

The legacy public-schema objects remain evidence of the old construction database and are not grounds for copying a product schema wholesale. Each future capability requires source evidence, an explicit contract, migration ownership, repository SQL, authorization, and qualification.

## Qualification implications

The runtime privilege model is now capability-derived rather than based on legacy ownership. Qualified resource operations have corresponding measured authority; runtime retains no schema-owner or migrator escalation path.

Remaining authority work is controlled cleanup and future extension, not reconstruction of the already-qualified first slices.

## Remaining authority work

1. Resolve bootstrap `ghm_db_user` memberships through the independent provider/bootstrap authority path.
2. Establish/reconcile the dedicated GHM application schema and future-object defaults before relying on them broadly.
3. Measure and decide the final TEMP privilege for `ghm_runtime`.
4. Derive exact privileges for each future governed resource from its repository SQL.
5. Remove unnecessary legacy authority only after recovery/replacement gates permit it.

## Production safety

Zaid Connect and QuoteFlow remain on their existing Supabase production backends throughout this construction work. No production routing, credentials, DNS, environment variables, or traffic were changed.


## Authentication and provider-business mapping function authority — 2026-11-12

The isolated Authentication Issuer has a separate exact ten-function allow-list. It receives no direct GHM table/view/sequence privileges and no schema CREATE; startup verifies the database login/effective role and ACL set before opening the listener.

The Resource API runtime's current `ghm.auth_*` executable set is exactly two functions:
- `ghm.auth_lookup_external_identity(text,text)` — Connect person identity lookup.
- `ghm.auth_lookup_business_external_mapping(text,text)` — provider business ID to canonical GHM business ID lookup.

The mutating helper `ghm.auth_link_business_external_mapping(text,text,bigint)` is no longer callable by any application role. Migration `20261112080000_signed_connect_business_provisioning_gateway.sql` revokes PUBLIC, runtime, migrator, Actor Gateway, issuer and payment-provider EXECUTE. It remains owned by `ghm_schema_owner` and is called only inside the signed `ghm.gateway_provision_connect_business` wrapper.

The wrapper validates signed operation `business.connect.provision`, checks active actor/business role, serializes external ID creation, creates Business + owner membership + mapping atomically, and returns existing mappings only to an active member or system admin. It locks actor and membership rows and rejects mapping races that do not create the exact expected mapping.

Actor Gateway's exact function allow-list is now 33 signed/typed operations. The disposable qualification proves concurrent provisioning creates one Business, an unrelated account cannot resolve it without membership, active members can resolve idempotently, runtime cannot call the helper or read mapping rows directly, and a forced mapping-insert failure rolls back Business and membership.

The HTTP route `POST /v1/connect/businesses/provision-or-resolve` and the GHM-side HTTP adapter client are implemented. The adapter is not yet mounted in the main Connect service router; full product API wiring remains an integration gate, not a database permission gap.
## Actor Gateway database authority — 2026-11-12

The dedicated `ghm_actor_gateway` login has an explicit 33-function signed/typed-operation allow-list established by the gateway migrations. It must not have direct table/view/sequence privileges or schema CREATE. The functions are SECURITY DEFINER operations owned by `ghm_schema_owner`, each with a fixed `search_path`, signed request-context validation and explicit grants to the gateway role.

The current source now verifies at Actor Gateway startup, before opening the HTTP listener:
- exact effective ordinary function set across the entire `ghm` schema (trigger-returning functions excluded);
- zero direct GHM table/view/foreign-table/sequence privileges;
- schema USAGE present and CREATE absent;
- no PUBLIC EXECUTE on any function executable by the gateway;
- no `ghm_runtime` EXECUTE on gateway-specific functions;
- no unsafe global future-function defaults for PUBLIC, runtime, issuer, gateway, migrator or payment-provider roles.

The disposable qualification script invokes the same verifier against the real `ghm_actor_gateway` login. This guard detects privilege drift; it does not change grants. The 33-function count is derived from the current migration GRANT statements and must be updated only alongside a reviewed typed operation, migration, tests and qualification evidence.


The migration history contains nine older account-ID overloads that were explicitly dropped by the later signed-assertion migrations. The only surviving unsigned helper was `assert_actor_gateway(bigint)`, which is not called by the current gateway code; migration `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql` revokes PUBLIC, runtime, migrator and gateway execution from that helper. The exact current allow-list is 33 signed/typed operations, and disposable qualification verifies the unsigned helper returns SQLSTATE 42501.


### Production Actor Gateway live catalogue snapshot — 2026-11-14

Read-only Render PostgreSQL catalog queries against 'ghm_db' report:

- Schema 'ghm' is owned by 'ghm_schema_owner'; its ACL grants USAGE/CREATE to owner, USAGE to 'ghm_runtime' and 'ghm_payment_provider'; 'ghm_actor_gateway' has neither USAGE nor CREATE.
- Actor Gateway contract routine count is zero (no 'assert_actor_gateway', 'assert_actor_gateway_capability' or 'gateway_*' routines); executable routine count for 'ghm_actor_gateway' is zero. The reviewed application contract currently expects 33 signatures, allowing the three campaign-review signatures to be absent together for the earlier pre-campaign subset.
- There are 62 SECURITY DEFINER routines, all owned by 'ghm_schema_owner'; 5 have the exact pinned search_path 'pg_catalog, ghm, pg_temp'. The other 57 require per-routine comparison against the full reviewed authority inventory; do not infer they are unsafe solely from this aggregate count.
- Existing relation-level checks found zero direct table/sequence privileges for 'ghm_actor_gateway'. The absence of those direct privileges is correct but insufficient without schema USAGE and the signed function allow-list.
- The migration ledger remains unreadable to the application query principal; do not grant it SELECT. Use the existing read-only migrator audit path once a safe production invocation is available.

No production changes were made during this catalogue capture. This snapshot is diagnostic, not an approved privilege cutover.


### Production SECURITY DEFINER ACL and search_path inventory — 2026-11-14

Read-only live catalog counts for non-trigger SECURITY DEFINER routines in 'ghm': 62 total; 5 have exact 'search_path=pg_catalog, ghm, pg_temp'; 57 do not; 8 have any configured path explicitly including 'pg_temp'. PUBLIC EXECUTE is 0. 'ghm_runtime' EXECUTE is 46 and 'ghm_app_user' effective EXECUTE is also 46 due to inherited role authority. 'ghm_payment_provider' EXECUTE is 2; 'ghm_actor_gateway' EXECUTE is 0. All 62 are owned by 'ghm_schema_owner' and use trusted languages.

The non-exact group is not homogeneous: observed paths include 'pg_catalog, ghm' (no explicit pg_temp), 'ghm, pg_catalog' (schema order differs), and 'ghm, pg_temp' (pg_catalog absent). These require per-routine source/definition and migration comparison. Do not bulk alter or classify all 57 identically.

The schema-scoped function default ACL for 'ghm_schema_owner' grants EXECUTE to 'ghm_runtime' only. The global function default ACL for 'postgres' includes PUBLIC and 'ghm_db_user' EXECUTE; this is a future-object creation risk distinct from current routines, whose live PUBLIC EXECUTE count is zero. Migration-created functions must run under the intended owner and reviewed defaults.

No production grants, definitions, function settings, defaults, roles or objects were changed.


### Exact production SECURITY DEFINER search_path distribution — 2026-11-14

The authoritative production snapshot covers 62 non-trigger SECURITY DEFINER functions in 'ghm':

| Function setting | Count |
|---|---:|
| 'search_path=pg_catalog, ghm' | 53 |
| 'search_path=pg_catalog, ghm, pg_temp' | 5 |
| 'search_path=ghm, pg_temp' | 3 |
| 'search_path=ghm, pg_catalog' | 1 |
| **Total** | **62** |

ACL counts for the same scope: PUBLIC EXECUTE 0; 'ghm_runtime' EXECUTE 46; effective 'ghm_app_user' EXECUTE 46 through inherited membership; 'ghm_payment_provider' EXECUTE 2; 'ghm_actor_gateway' EXECUTE 0. All are owned by 'ghm_schema_owner'. The 57 non-exact functions are not a homogeneous group. Review each signature/body/proconfig and migration provenance; no bulk search_path alteration is approved.

The count deliberately excludes trigger-returning routines using 'p.prorettype <> trigger'::regtype. An earlier broad count of 63 included a trigger-returning routine; use 62 for comparable inventory going forward.

The repository's 'scripts/audit-security-definer-authority.mjs' is deliberately restricted to local 'ghm_disposable_test'; it must not be pointed at production or have its guard weakened. The production 'npm run audit:migrations' path is a separate read-only ledger reconciliation tool, but an approved production invocation path is still unresolved.


### Source reconciliation of four non-canonical SECURITY DEFINER search paths — 2026-11-14

The four routines outside the exact canonical 'pg_catalog, ghm, pg_temp' setting were compared against production definitions and repository source:

- 'auth_bootstrap_founder_system_admin(text)' matches '20261005211000_correct_founder_system_admin_bootstrap_existing_account.sql'; owner-only EXECUTE is expected and observed.
- 'auth_create_account(...)' matches '20261004020000_create_auth_account_registration.sql'; 'ghm_runtime' EXECUTE is expected and observed.
- 'auth_read_connect_identity_authority(bigint)' has a live definition and runtime EXECUTE, but its creating migration was not located in the bounded source review. Provenance remains unresolved.
- 'replace_business_hours(bigint,bigint,jsonb)' matches '20260916223000_create_business_hours.sql'; runtime EXECUTE is expected in the base migration and is intentionally retained by '20261111130000_add_signed_business_hours_gateway.sql' until the separate manual cutover.

The exact intended normalization exists in '20261112090000_pin_security_definer_search_path.sql' (blob 'd0d3ce9eb9d76ac23ba6ec9d8f27df7ec30f73df'). It checks owner='ghm_schema_owner' and sets every GHM SECURITY DEFINER routine to 'pg_catalog, ghm, pg_temp'. It explains that omitting explicit 'pg_temp' allows PostgreSQL to search the session temporary schema before ordinary schemas.

Effective-path nuance: the 3 routines set to 'ghm, pg_temp' implicitly search 'pg_catalog' before those entries and explicitly place temporary schema last; they are effectively temp-safe but non-canonical. The one 'ghm, pg_catalog' routine is not equivalent: it omits explicit temp and puts 'ghm' ahead of 'pg_catalog'. The 53 'pg_catalog, ghm' routines omit explicit temp. The 5 canonical routines already match.

The live catalogue is inconsistent with the all-routine normalized state intended by the migration, but without a live ledger result we cannot decide whether the migration is unapplied or catalog drift occurred later. Production ledger head/checksums remain unverified. Do not run the manual Business Hours cutover: its source explicitly requires a qualified deployed Actor Gateway, verified identities and a fresh independently verified backup. No production change was made.


### Post-normalization migration source consistency note — 2026-11-14

Source review confirms migrations '20261112020000', '20261112030000' and '20261112080000' create SECURITY DEFINER routines with 'search_path=pg_catalog, ghm' (no explicit 'pg_temp') immediately before '20261112090000_pin_security_definer_search_path.sql', which loops over all GHM SECURITY DEFINER routines and normalizes them to 'pg_catalog, ghm, pg_temp'. Later '20261112140000' and '20261112150000' gateway/storage migrations explicitly use the canonical setting. Therefore live path groups cannot be attributed solely to current CREATE FUNCTION declarations: determine whether the pin migration was applied or later definitions reintroduced settings using the read-only production migration ledger and bounded post-pin DDL review. No production changes.


### 2026-11-14 Worker qualification and migration audit execution boundary

Exact-head CI run '43594131250' on 'c105c690c570dd3035bd1ae265f3464c2a61526d' passed both quality and web-quality jobs. Quality included Cloudflare Worker bundle without deploy, local Worker runtime smoke test, disposable PostgreSQL Actor Gateway principal and all gateway/issuer cutover qualification. No production DB was used.

Worker source/config: 'workers/actor-gateway/index.ts' and 'workers/actor-gateway/wrangler.jsonc'. It wraps the existing app; requires Hyperdrive, edge rate limiter, public ES256 keys and gateway capability assertion secret; performs startup DB identity/ACL checks; 16 KiB JSON body cap; startup fail-closed 503. Render Node entry remains unchanged. Wrangler config contains placeholder Hyperdrive ID and local disposable DB URL; it is not production-deployable and was not deployed.

The production read-only migration audit requires 'GHM_MIGRATOR_DATABASE_URL', exact login/session identity 'ghm_migrator', and 'SET ROLE ghm_schema_owner'. It uses 'BEGIN READ ONLY' and rolls back. Existing CI only configures disposable 'ghm_disposable_test'; no production audit secret/invocation is configured. No dedicated production migration runner exists in the Render service inventory. Do not repurpose the application runtime, add a paid service, or use the mutating migration command. Candidate is owner-controlled one-off local execution if the owner already has the migrator credential; never place credentials in chat or docs.

The current source tree has only three migrations after '20261112090000_pin_security_definer_search_path.sql'; the two that create SECURITY DEFINER functions explicitly set canonical 'pg_catalog, ghm, pg_temp'. This does not explain live drift without ledger provenance. Keep production catalog state read-only until that ledger audit is complete.


### 2026-11-14 Connect identity-authority provenance status

The exact symbol 'auth_read_connect_identity_authority' and close variants returned no results in the repository's indexed code search; the bounded current-tree migration/cutover review also did not identify its creator. Treat it as production-observed with unresolved source provenance. Do not invent a migration version or alter the function based on missing source. Resolve through historical Git refs/PRs or approved backup/catalog archive evidence.

The verified production ledger audit command is 'npm run audit:migrations' -> 'scripts/forensic-migration-reconciliation.mjs'. It requires the dedicated 'GHM_MIGRATOR_DATABASE_URL', targets 'ghm_db', opens 'BEGIN READ ONLY', requires session/current user 'ghm_migrator', verifies SET ROLE 'ghm_schema_owner', reads the ledger and rolls back. If the dedicated URL is not already available to the owner in a secure local secret store, stop; do not substitute app/db-user credentials, create a new credential, or add a service as part of this investigation. Do not use 'npm run migrate' or the predeploy pending-allowance variant for the forensic audit.
