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
