# GHM Production Migration Reconciliation — Actor Gateway Continuation

**Audit evidence date:** 2026-11-15 16:43 UTC  
**Repository reviewed:** `zaidhqdev-sys/GHM`, current `main` at `a81f61959aadbc1c5b017d3cb80bcae0854f3ef0`  
**Production target:** Render `ghm-db` / `ghm_db`, PostgreSQL 18, Frankfurt  
**Status:** INVESTIGATE — exact pending inventory recorded; production execution remains blocked  
**Scope:** Read-only source/PR/branch review and handover only. No migration, role, grant, credential, secret, deployment, environment or data mutation.

## 1. Latest supplied production audit

The user's exact production audit reported:

| Field | Result |
|---|---:|
| Repository migrations | 137 |
| Live production ledger rows | 105 |
| Pending migrations | 42 |
| Pending allowlist matches | false |
| Pending allowlist mismatch count | 1 |
| Unexplained checksum mismatch count | 0 |
| Name mismatch count | 0 |
| Unrecognized extra count | 0 |
| Orphaned historical exception count | 0 |
| Invalid retained-history count | 0 |
| Verdict | `INVESTIGATE` |

The latest applied migration reported for the production ledger was `20261109210000_deactivate_unrecognized_public_directory_records`. All 42 pending versions are later than that version in the supplied audit.

This remains the latest authoritative full-ledger audit in this handover. A subsequent Render connector read-only SQL query ran as `session_user=ghm_app_user`, `current_user=ghm_db_user`; that identity was denied SELECT on `ghm.ghm_schema_migrations`. No attempt was made to SET ROLE, bypass the ACL, or use a different credential. Therefore that connector query did not refresh the ledger audit.

## 2. Exact 42-item pending inventory from the supplied audit

### 2026-11-10 (14)

1. `20261110010000_add_business_supplier_classification`
2. `20261110100000_create_account_onboarding_progress`
3. `20261110120000_create_business_relationship_outcome_read_models`
4. `20261110140000_allow_pending_storage_object_cleanup`
5. `20261110160000_add_admin_capability_catalogue_governance`
6. `20261110210000_add_actor_gateway_principal_guard`
7. `20261110220000_add_actor_gateway_self_identity_read`
8. `20261110230000_add_gateway_business_registration_identity_read`
9. `20261110233000_add_gateway_business_registration_identity_write`
10. `20261110240000_enforce_capability_catalogue_cross_row_invariants`
11. `20261110250000_add_gateway_capability_governance`
12. `20261110260000_gateway_supplier_classification_cutover`
13. `20261110265000_reconcile_business_profile_legacy_contract`
14. `20261110270000_gateway_business_profile_update`

### 2026-11-11 (18)

15. `20261111020000_bind_capability_gateway_actor_to_signed_assertion`
16. `20261111030000_bind_supplier_gateway_actor_to_signed_assertion`
17. `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion`
18. `20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor`
19. `20261111060000_bind_gateway_assertions_to_request_context`
20. `20261111070000_add_signed_business_capability_mutations`
21. `20261111100000_add_signed_saved_business_gateway`
22. `20261111130000_add_signed_business_hours_gateway`
23. `20261111140000_add_business_hours_read_projections`
24. `20261111150000_add_signed_trust_score_gateway`
25. `20261111160000_add_signed_business_logo_gateway`
26. `20261111170000_add_trust_score_read_projections`
27. `20261111210000_revoke_runtime_account_external_identity_table_access`
28. `20261111220000_revoke_unused_auth_runtime_entry_points`
29. `20261111230000_add_token_bound_recovery_revocation_result`
30. `20261111240000_revoke_runtime_quoteflow_migration_provisioning`
31. `20261111250000_revoke_runtime_external_identity_link`
32. `20261111260000_revoke_runtime_external_identity_bootstrap`

### 2026-11-12 (10)

33. `20261112020000_add_token_bound_password_recovery_reset`
34. `20261112030000_add_conditional_password_rehash`
35. `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration`
36. `20261112050000_revoke_public_default_function_execution`
37. `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads`
38. `20261112080000_signed_connect_business_provisioning_gateway`
39. `20261112090000_pin_security_definer_search_path`
40. `20261112140000_add_signed_storage_metadata_actor_gateway`
41. `20261112150000_add_storage_provider_workflow_attestation`
42. `20261112170000_revoke_redundant_migrator_business_mapping_lookup`

## 3. Exact allowlist mismatch

Current `main` has seven entries in `config/pending-migrations.production.json`:

- `20261110100000_create_account_onboarding_progress`
- `20261110120000_create_business_relationship_outcome_read_models`
- `20261110140000_allow_pending_storage_object_cleanup`
- `20261110210000_add_actor_gateway_principal_guard`
- `20261110220000_add_actor_gateway_self_identity_read`
- `20261110230000_add_gateway_business_registration_identity_read`
- `20261110233000_add_gateway_business_registration_identity_write`

All seven are members of the supplied 42-item production pending set. The file omits the other 35 pending migrations. The audit's mismatch count of one is the failed set comparison; it is not one individual missing migration.

**Do not simply replace the seven entries with all 42.** The current production migration runner imports this file, checks the pending set against it, then iterates every repository migration and executes every not-yet-applied migration inside one transaction. It has no batch/through-version execution boundary. Replacing the file with all 42 would authorize all 42 to run in one production migration invocation.

Relevant current source:
- `src/db/migrate.ts`
- `src/db/production-pending-migration-allowlist.ts`
- `scripts/forensic-migration-reconciliation.mjs`
- `config/pending-migrations.production.json`

The forensic audit's `npm run audit:migrations:predeploy` is read-only. Do not confuse it with `npm run migrate`, which executes pending SQL.

## 4. Why the 42 migrations must not be applied as one batch yet

The queue is not a single additive Actor Gateway installation. It combines onboarding and relationship read models, capability governance, Actor Gateway operations, authentication/identity privilege changes, QuoteFlow migration revocations, global function default-privilege hardening, Connect business provisioning and storage metadata/provider workflows.

Source review of representative current-main migrations found production-impacting cutovers and revocations, including:

- `20261110260000_gateway_supplier_classification_cutover` revokes `ghm_runtime` execution on the legacy supplier-classification function and grants the gateway wrapper.
- `20261110270000_gateway_business_profile_update` revokes `ghm_runtime` execution on the legacy Business profile update function and grants the gateway wrapper.
- `20261111220000_revoke_unused_auth_runtime_entry_points` removes runtime execution on auth session/password/account administration functions.
- `20261111240000`, `20261111250000`, and `20261111260000` remove runtime execution on QuoteFlow migration provisioning and external-identity linking/bootstrap functions.
- `20261112050000_revoke_public_default_function_execution` changes global default privileges for functions created by `ghm_schema_owner`.
- `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads` removes execution on the old unsigned gateway assertion helper.
- `20261112080000_signed_connect_business_provisioning_gateway` moves Connect business provisioning and mapping into a signed gateway operation and revokes the old mapping helper.
- `20261112140000_add_signed_storage_metadata_actor_gateway` creates gateway storage operations and revokes legacy runtime execution on those operations.
- `20261112150000_add_storage_provider_workflow_attestation` introduces a separate provider-workflow attestation secret/nonce boundary and gateway-only transitions.

These are deliberate security changes, but applying them before the corresponding gateway/auth service and client paths are live and qualified risks breaking active production workflows. The latest production GHM runtime deployment is still the older live commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`; a later deployment failed startup because production storage requires `GHM_ACTOR_GATEWAY_URL`. The production Actor Gateway has not been deployed or smoke-tested.

The assertion migration `20261111020000_bind_capability_gateway_actor_to_signed_assertion` creates the protected assertion secret table and nonce table but does not provision the secret row. Secret provisioning is a separate controlled step and must not be assumed complete after applying migrations.

## 5. Production Actor Gateway prerequisite evidence

Read-only production checks recorded on 2026-11-15:

- `ghm_actor_gateway` exists as LOGIN / NOINHERIT with SUPERUSER, CREATEDB, CREATEROLE, REPLICATION and BYPASSRLS all false.
- Its observed sole membership relationship is the Render administrator `ghm_db_user` as a member of `ghm_actor_gateway`, with ADMIN OPTION=true, INHERIT=false and SET=false. The gateway role itself has no outgoing memberships.
- Current migration `20261110210000_add_actor_gateway_principal_guard.sql` intentionally allows exactly this one bounded `ghm_db_user` membership and rejects all other membership relationships/options. Older handover wording that says the guard rejects every membership involving the gateway is superseded.
- `ghm_db_user` still has CREATEROLE/CREATEDB and ADMIN OPTION over protected roles. This is the separate role-authority issue covered by Amanda's Render support conversation and `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md`. Do not improvise grants or role changes.
- The prior read-only production catalog query found zero `ghm.gateway_*` and zero `ghm.assert_actor_gateway*` functions installed. The 42 pending migrations include the function installation chain.
- A fresh verified production backup/recovery point remains unconfirmed; the last identified archive was 4 November, before the 10 November role work.
- No production Actor Gateway DB credential or assertion secret has been provisioned/verified for a dedicated service.

## 6. Repository / PR / branch reconciliation

Current `main` was `a81f61959aadbc1c5b017d3cb80bcae0854f3ef0` at the time of this review. Open PR inventory was rechecked before documenting:

- PR #284 — Actor Gateway assertion replay/timestamp qualification; open draft, head `4c5710f50bc61a611e07f5ef904d319019bf1782`, exact-head CI run `43752492009` passed. Test-only; no production migration.
- PR #264 — gateway registration identity milestone; open, documentation-only, head `b2f7f1d514dd380db1579c907cf06efa9ff48fa1`.
- PR #243 — supplier classification / Connect Marketplace; open draft, head `1246ed74a81b3fc607e6f65f3cd8036bc081ab1b`.
- PR #244 — Business engagement/Analytics API; open draft, head `f418407bface1146e4cf0147424fb91bff81328a`.
- PR #233 PayFast and PR #201 QuoteFlow legal acceptance remain separate; do not bring PayFast or paused legal work into this Actor Gateway migration task.

Migration-related branches were also checked:
- `fix/exact-production-pending-migration-allowlist` at `9ea0de17bf029ed78b2b856c8576dbf9ee6d885f` is 559 commits behind current main and contains an obsolete one-entry allowlist; do not reuse.
- `fix/migration-runner-strict-tls-20261115` at `a90a7873407b3f1f3fe942ed1b572c3c85f15740` is diverged (16 ahead / 56 behind) and changes migration-runner/principal/checksum code; do not merge or cherry-pick without a full reconciliation.
- `fix/migration-audit-ssl-url-override-20261115` and `fix/production-migration-audit-tls-verification-20261115` are stale behind main with no remaining diff against current main.
- No open production migration-runner PR was found.

## 7. Safe next implementation sequence

1. Refresh the exact read-only production audit from the user's existing `C:\GHM-main` checkout using the strict-TLS forensic audit. Preserve the exact 42-list and summary as evidence; do not run `npm run migrate`.
2. Complete a file-by-file migration dependency and effective-ACL review of all 42 pending migrations, including the API/client route state and any existing manual cutovers.
3. Design a staged production migration mechanism. Separate the exact pending inventory snapshot from explicit execution-batch approval. Require a named batch and exact ordered version/name list; enforce a contiguous prefix of pending migrations and refuse gaps/out-of-order application. Add disposable PostgreSQL 18 tests for prefix application, refusal of unapproved entries, refusal of a skipped earlier migration, rollback, and repeat-run behavior.
4. Do not make `config/pending-migrations.production.json` authorize all 42 until the staged runner is implemented and qualified.
5. Clear the independent production gates before any DDL/role/secret/cutover: Amanda/Render role-administration remediation, fresh verified backup/recovery point, dedicated Actor Gateway DB login/secret handling, gateway service deployment and authenticated smoke tests.
6. Only after the staged plan and all production gates pass should an explicit production migration execution be scheduled and authorized.

## 8. Change record

This handover records source review and the user's supplied read-only audit. It does not claim a new production audit was run. No production SQL, migration, role/grant, secret, environment variable, Render service, Cloudflare resource, deployment or application data was changed.


## 9. Incremental production migration runner implementation (2026-11-15)

The user chose an incremental rollout model: apply one migration at a time, or a small tightly coupled batch, verify the result, and only then select the next batch. This is now represented in code on branch `feat/production-migration-batch-execution-20261115` (not merged/deployed):

- `src/db/production-migration-batch.ts` parses the explicit `GHM_PRODUCTION_MIGRATION_BATCH` JSON environment value and selects only the exact next pending prefix.
- Production batches must contain 1–5 ordered `{version,name}` entries. Missing/invalid JSON, empty or oversized batches, duplicates, name/version mismatch, skipped earlier pending migrations, reordering, unknown migrations and attempts to execute an already-complete batch are rejected.
- The migration runner validates the complete production pending inventory first, then executes only the selected batch. The selected batch remains inside the runner's existing single transaction and advisory lock; a failed migration rolls back the whole batch. Non-production migration behavior remains unchanged.
- `config/pending-migrations.production.json` now records all 42 exact pending version/name entries from the user's 2026-11-15 read-only audit. This file is an inventory/allowlist check, not an execution authorization: the separate explicit batch variable is required to execute anything against `ghm_db`.
- The existing migration-checksum test file now includes parser/selection tests for the batch boundary. The normal `npm test` command already includes this test file.

Branch commit sequence:
- Runner change: `e59f59f6067f217362c06b85174af30862b90959`
- Batch selector: `a04930bb141c596fb18baf7e54c269d0ce80fc36`
- Full 42-entry inventory: `570ac466b0ed324429d1fa2cd458e61ae4a986c7`
- Batch tests: `d2691389544060ce5fff7cdc90b192ab93fa1a4d`
- Version-regex correction: `db92ac3ee3904d38b64cfe64b0ee193f426b8d6c`
- Generic selector signature correction: `2e7c37fcbf2db88d917c49b3dcc197adf4960001`
- Generic selector return type correction (preserves full SQL-bearing migration records): `0dbfb6405c385340ca1ea1c78fae37a9c7b8a221`
- Corrected parser/selector return annotations: `010abc386b4461cb8df1500e4c958a92400778cc`

### Qualification and operational limits

- This is implementation on an isolated feature branch only. It has not been merged, deployed, or run against production. CI/build qualification is still required.
- Do not set `GHM_PRODUCTION_MIGRATION_BATCH` in Render yet. Do not run `npm run migrate` against production.
- The exact first migration and first batch still require migration-by-migration dependency and effect review, including current production schema/ACL evidence and matching application routes. The helper intentionally insists on the earliest pending prefix, so the first batch cannot skip the earlier supplier-classification migration.
- The transaction boundary is the complete selected batch, not one transaction per migration. Keep independent migrations in one-entry batches; group migrations only when a demonstrated dependency requires atomicity.
- The prior production gates remain: Amanda/Render administrator-role separation issue unresolved, fresh verified production backup/recovery point not confirmed, and dedicated Actor Gateway service/credentials/secret not provisioned. This code does not bypass those gates.
- The latest production inventory remains the user-supplied audit summarized above; no new production audit was run during this implementation.

No production SQL, migration, role/grant, secret, environment variable, service, deployment, or application data was changed.


### Additional integrity safeguard

During final review, the batch loop was separated from the full applied-history checksum pass. The runner now continues to validate every already-applied migration checksum before executing the selected batch; limiting execution must not limit historical integrity checks. Change: `6221982b06e7162c3925c126460f61438164cd1d`. CI must qualify this final change before the PR can be considered merge-ready.


### First pending migration: transitional security guard

A read-only production catalogue query (Render `ghm_db`) returned no current `ghm.update_business_supplier_classification` or `ghm.gateway_update_business_supplier_classification` function. The first pending migration `20261110010000_add_business_supplier_classification` creates the legacy caller-supplied identity function and grants `ghm_runtime` EXECUTE. That would create a temporary identity-impersonation path if applied by itself.

To preserve the user's incremental rollout without opening that path, the runner now applies an explicit production-only post-batch guard in the same transaction whenever that migration is selected:

`REVOKE EXECUTE ON FUNCTION ghm.update_business_supplier_classification(bigint, bigint, boolean) FROM ghm_runtime`

This is intentionally separate from the historical migration file/checksum. It is applied atomically immediately after the migration, before COMMIT. The later gateway cutover migration still installs the signed gateway function and performs its own revocation. A unit test asserts the guard is selected only for the exact migration version.

Changes:
- Post-batch guard selector: `f5c68b6ccca8952fdbade0deff0bbb83ab5fc08e`
- Atomic runner integration: `af2169854eaa6dfd057ff83f82e92b252a07b685`
- Guard contract test: `34dc7bf0c469159137336455befda72f9c109d6c`

This is code-level qualification only. No production migration was run. Before first production execution, the guard must be confirmed in the disposable PostgreSQL qualification and the production migration runner must be requalified against the latest head.


### CI qualification update (2026-11-15)

The first inventory-contract test run exposed the expected-set test still pinning the former seven-entry allowlist. That test was updated to pin all 42 entries; an intermediate edit had a malformed duplicate block, which was corrected before the successful run. No production state was touched during this correction.

Latest exact PR-head CI: run `43757998434` (run #4961) completed successfully on commit `ae27246ed14e40c3da73bdb0da5ed6d43af5d9bc`:
- TypeScript build passed.
- Disposable PostgreSQL 18 applied the complete repository migration sequence successfully.
- Actor Gateway local smoke test and database-principal qualification passed.
- Full test suite passed.
- Migration audit policy tests passed with the 42-entry inventory.
- Remaining isolated PostgreSQL security/cutover qualifications passed.
- Web quality/build/tests passed.

This qualifies the current implementation on disposable CI infrastructure only. PR #285 remains a draft; no production migration has been executed and the independent Render role/backup/Actor Gateway service gates remain. Current branch has subsequent documentation-only handover commit(s) after the qualified code commit; if code changes are made, rerun exact-head CI before merge.


## 10. Exact-head reconciliation and first-prefix security review (2026-11-15)

### PR #285 exact current state

- PR #285 remains OPEN, DRAFT and mergeable; base is `main`, head branch is `feat/production-migration-batch-execution-20261115`.
- Current main at review: `61cd1121a1fb30e3b28c250b7b6812707f1c9109`.
- Current PR head at review: `42e86d8ddf4c2184108a8d65b813a86d882ed468`. The previously recorded `ae27246ed14e40c3da73bdb0da5ed6d43af5d9bc` is the code-qualified parent; `42e86d8d` adds the subsequent CI/handover record.
- Exact-head checks on `42e86d8d` completed successfully: `quality` and `web-quality` in workflow run `43758290924`, plus the Cloudflare Pages check. This is code qualification on CI/disposable infrastructure, not production qualification.
- Six changed files: production pending inventory, this handover, two migration test files, `src/db/migrate.ts`, and `src/db/production-migration-batch.ts`.
- No submitted PR reviews or inline review threads were present at this check. Keep the PR draft until the remaining source/production gates are resolved.
- No production SQL, migration, role/grant, secret, environment, Render or Cloudflare change was performed.

### First pending migration and guard qualification gap

- `20261110010000_add_business_supplier_classification` creates `ghm.update_business_supplier_classification(bigint,bigint,boolean)` and grants EXECUTE to `ghm_runtime`.
- The PR runner selects a production-only post-batch guard for this exact migration and executes the REVOKE inside the same transaction before COMMIT. The migration file's historical bytes/checksum remain unchanged.
- Current unit coverage asserts that the helper returns the expected REVOKE SQL for this exact version and no guard for the next migration. The exact-head CI passed, but the current test is a helper/contract test: it does not itself demonstrate the production-only runner path applying that REVOKE against disposable PostgreSQL and then observing the effective runtime privilege.
- Before first production execution, add or run a disposable PostgreSQL 18 qualification that exercises the exact guard SQL/effective privilege result and verifies the batch transaction/rollback behavior. Do not treat the helper string assertion alone as end-to-end database proof.

### Fifth pending migration is a deliberate gateway cutover boundary

- `20261110160000_add_admin_capability_catalogue_governance` creates three SECURITY DEFINER legacy functions that accept caller-supplied `p_actor_account_id` and grants EXECUTE to `ghm_runtime`:
  - `ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)`
  - `ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer)`
  - `ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer)`
- This is an actor-attribution risk if the general runtime can invoke those functions directly. Do not treat the successful full migration-chain CI as proof that this legacy grant is safe.
- The subsequent `20261110250000_add_gateway_capability_governance` installs signed Actor Gateway wrappers, but its SQL explicitly retains the legacy runtime grants until a separately approved API cutover.
- The repository already contains the intended manual cutover at `database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql`. Its header requires the Actor Gateway to be deployed, `GHM_ACTOR_GATEWAY_URL` configured, and capability administration routes end-to-end verified before applying it. The disposable qualification script `scripts/qualify-capability-governance-cutover-postgres.mjs` tests direct legacy RPC denial and continued gateway operations after that cutover.
- Do not add an automatic post-migration REVOKE for these three functions to the generic migration runner: that would bypass the documented application cutover sequence and could break a still-active legacy application path.
- Because the production runner enforces a contiguous pending prefix, migration 5 is a hard stop: do not advance to migration 6 or later until the gateway and capability route prerequisites are satisfied and the manual cutover is separately executed and verified.

### Provisional first-prefix execution plan

- Keep production batches to one migration at a time unless a documented dependency requires a small atomic batch.
- The first four pending migrations are candidates for separate review/qualification, not production authorization:
  1. `20261110010000_add_business_supplier_classification` — only with the runner's same-transaction runtime EXECUTE guard proven on disposable PostgreSQL.
  2. `20261110100000_create_account_onboarding_progress` — additive onboarding table/index/privilege change.
  3. `20261110120000_create_business_relationship_outcome_read_models` — additive relationship/outcome read-model schema; complete remaining SQL and application compatibility review before selection.
  4. `20261110140000_allow_pending_storage_object_cleanup` — changes the storage-object lifecycle constraint and installs a runtime cleanup function; verify existing production status distribution and storage deletion workflow compatibility before selection.
- Migration 5 is not in this provisional first-four set. Stop there until the gateway deployment, capability API route verification, and manual cutover conditions are met.
- The first four are not yet approved for production execution. The fresh verified production backup/recovery point and Amanda/Render role-administration issue remain unresolved; the production Actor Gateway has no verified deployed endpoint/DB connection/credentials. No production migration may be run while these gates remain open.
- The production pending inventory remains based on the user's supplied read-only audit (137 repository migrations, 105 ledger rows, 42 pending, INVESTIGATE). No new full production ledger audit was performed in this review.


## 11. Disposable PostgreSQL qualification added for the first migration guard (2026-11-15)

- Added `scripts/qualify-production-migration-batch-guards-postgres.mjs` and package command `npm run qualify:production-migration-batch-guards`.
- The script is hard-restricted to `NODE_ENV=test`, database `ghm_disposable_test`, localhost connections, and distinct `ghm_runtime` / `ghm_migrator` credentials. It refuses any other database name or host before opening connections.
- It executes the exact first pending migration SQL through the same BEGIN/COMMIT stripping helper used by the runner, observes the historical grant to `ghm_runtime`, applies the exact production post-batch REVOKE, and verifies `has_function_privilege(..., 'EXECUTE') = false` while still in the transaction.
- It then rolls back and checks the runtime function privilege has returned to its exact pre-qualification state. This exercises the SQL and transaction semantics, unlike the existing helper-string unit assertion.
- It does not apply the production migration ledger row, does not call the production runner, and has no production URL path accepted by its safety guards.
- Source-level review of the first four migrations found existing app integration for #2 (onboarding routes/repository) and #3 (read-only relationship/outcome routes/repository); #4 has existing storage metadata repository/service calling `storage_mark_deletion_pending`. Their current contract tests cover SQL shape and grants, but migration-specific disposable PostgreSQL behavior and production data compatibility still need qualification.
- #4 changes a CHECK constraint on `ghm.storage_object`; before any production application, inspect live status counts and confirm all existing rows satisfy the new lifecycle predicate. No production data distribution was queried in this review.
- The new script and package command are code additions only. They have not yet been executed in this environment because no approved disposable PostgreSQL connection details are available here. Exact-head CI must run after these commits, and the script should be run by the user against the disposable PostgreSQL 18 qualification database before considering migration 1 production-ready.
- The earlier independent production gates remain unchanged: verified fresh backup/recovery point, Amanda/Render role-administration resolution, and deployed/verified Actor Gateway prerequisites before the capability cutover at migration 5.


## 12. Guard qualification now exercises the runner helper and is wired into CI (2026-11-15)

- Refined `scripts/qualify-production-migration-batch-guards-postgres.mjs` to import the compiled `getProductionMigrationPostBatchGuards` from `dist/db/production-migration-batch.js`; it no longer duplicates the production REVOKE as its expected implementation.
- The qualification asserts the helper selects exactly the expected single guard for migration `20261110010000_add_business_supplier_classification`, then executes the returned statement against PostgreSQL 18 inside the same transaction as the actual historical migration SQL.
- Corrected the exact SQL assertion to string equality (rather than a mistakenly over-escaped regular expression).
- Added a CI step immediately after the complete disposable PostgreSQL migration chain: `npm run qualify:production-migration-batch-guards`. The job uses the pre-created isolated `ghm_runtime` and `ghm_migrator` roles and the explicit `ghm_disposable_test` localhost target.
- The qualification replays only the first migration's SQL within a transaction after the CI chain, observes the transient runtime grant, applies the actual runner guard helper output, verifies runtime EXECUTE denial and function owner, then ROLLBACKs and verifies the prior runtime privilege state is restored. It does not write a ledger row or persist schema/grant changes.
- Commits added after `c8c2ccd8`: `199b3233` (use actual helper), `95d7685a` (wire CI step), `323f1fee` (correct exact guard assertion). Await exact-head CI before treating this qualification as passed.

## 13. Review of pending migrations 2–4 (2026-11-15)

### 2. `20261110100000_create_account_onboarding_progress`

- Additive table with account FK/cascade, unique (account, journey, step), constrained journey/step identifiers, three-state lifecycle and timestamp consistency checks.
- Runtime receives SELECT/INSERT/UPDATE and sequence USAGE/SELECT; DELETE/TRUNCATE/REFERENCES/TRIGGER are explicitly revoked. Ownership is assigned to `ghm_schema_owner`; `ghm_migrator` is revoked.
- Existing onboarding HTTP router, repository and service exist. Existing migration contract tests check account ownership, uniqueness, lifecycle and grants.
- Remaining qualification: disposable PostgreSQL insert/update/read and negative lifecycle/tenant-scope checks using the actual repository behavior. Confirm whether the runtime repository intentionally relies on FK cascade for account deletion; do not infer delete privileges from that FK.

### 3. `20261110120000_create_business_relationship_outcome_read_models`

- Adds relationship/outcome type and record tables, restrictive business/account/opportunity FKs, provenance/authority/verification/lifecycle/visibility constraints, temporal validity, JSON object checks, indexes and seeded reference types.
- Runtime is granted SELECT only; all mutation privileges are explicitly revoked. This is an additive read-model foundation, not a migration of existing production relationship/outcome records.
- Existing read-only HTTP routers, repositories and services are present; contract tests assert provenance/lifecycle and read-only grants.
- Remaining qualification: disposable PostgreSQL verify seed idempotence (ON CONFLICT), FK behavior, constraints and effective runtime SELECT-only privileges. Check current production object-name collisions before deployment; none were queried in this review.

### 4. `20261110140000_allow_pending_storage_object_cleanup`

- Drops and recreates `ghm.storage_object_lifecycle_check` to allow `deletion_pending` for both previously pending and available objects without changing `available_at`; adds SECURITY DEFINER `storage_mark_deletion_pending(bigint)`, owned by schema owner, with runtime EXECUTE.
- Existing storage repository/service calls this function. Existing contract tests assert lifecycle semantics and that timestamps are preserved.
- This is the first of migrations 2–4 that changes a live existing table constraint. Before production, obtain a read-only distribution of all existing `ghm.storage_object.status` values and validate every row against the proposed new predicate, including timestamp consistency. Also verify the existing constraint name and function signature/owner/grants match assumptions.
- No production status distribution, table scan, or catalog verification was performed in this review.

### Revised status

- Migration 1: runner guard now has an end-to-end disposable PostgreSQL qualification wired into CI; exact-head CI pending.
- Migrations 2–3: structurally additive, with application integrations and contract tests; dedicated database behavior/effective-grant qualification still outstanding.
- Migration 4: storage lifecycle compatibility is a mandatory pre-production data check.
- None of migrations 1–4 is authorized for production yet. Fresh verified backup/recovery point, Amanda/Render role-administration resolution and the Actor Gateway prerequisite before migration 5 remain outstanding. No production DB or runtime changes were made.


## 14. Exact-head disposable PostgreSQL guard qualification passed (2026-11-15)

- On exact PR head `d7209752b856d03f22d9f4421feddbbbe30af575`, GitHub Actions `quality` job `132956166221` completed the new step **“Qualify production migration batch guard and rollback on disposable PostgreSQL”** successfully.
- The preceding full migration chain on disposable PostgreSQL 18 also completed successfully in the same job.
- This is the first observed end-to-end CI execution of the added qualification against the real compiled runner guard selector and PostgreSQL transaction semantics. It is not a production database execution.
- At the time of this note, `web-quality` and Cloudflare Pages had passed; the overall `quality` job was still running later unrelated database/security qualification steps. Do not describe the whole workflow as green until the full job completes.
- The guard qualification itself is now evidenced PASS. Production remains blocked by independent backup/recovery, Amanda/Render role-administration, and staged application/gateway prerequisites. No production DB changes.


## 15. First-four post-apply PostgreSQL qualification added (2026-11-15)

- Added `scripts/qualify-first-four-pending-migrations-postgres.mjs`, package command `npm run qualify:first-four-pending-migrations`, and a CI step immediately after the first-migration guard qualification.
- The script refuses to run unless `NODE_ENV=test`, both distinct runtime/migrator URLs point to localhost, and the database is exactly `ghm_disposable_test`.
- Migration 2 checks effective `ghm_runtime` SELECT/INSERT/UPDATE permissions, denial of DELETE/TRUNCATE/REFERENCES/TRIGGER, sequence USAGE/SELECT, and the presence of all six validated onboarding constraints.
- Migration 3 checks effective runtime SELECT-only access across all four relationship/outcome tables, confirms the five relationship and six outcome reference seeds, and verifies the expected validated business-rule constraints.
- Migration 4 inspects every existing row in the disposable storage table grouped by status against the proposed lifecycle predicate, verifies the lifecycle constraint is validated, and checks `storage_mark_deletion_pending(bigint)` is SECURITY DEFINER, owned by `ghm_schema_owner`, has the pinned search_path and runtime EXECUTE grant.
- This is post-apply qualification on the disposable CI database, not production evidence. It does not read production data, mutate production state, or authorize the migrations.
- The script has been added but the new exact-head CI has not yet been observed. Review any CI failure before proceeding.
- No production storage status distribution was queried. Production migration 4 still requires a separate read-only status/count and catalog check before any production execution.


## 16. Migration 4 storage gateway cutover boundary clarified (2026-11-15)

A cross-check against the existing authoritative storage handover and the exact gateway implementation changes the provisional first-four production sequence:

- The November 12 storage handover explicitly records five legacy SECURITY DEFINER metadata functions that remain directly executable by `ghm_runtime` and do not independently establish database actor/tenant authority: `storage_create_pending`, `storage_get_object`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`.
- Migration `20261110140000_allow_pending_storage_object_cleanup` creates the fifth function in that set, `ghm.storage_mark_deletion_pending(bigint)`, owned by `ghm_schema_owner` and granted EXECUTE to `ghm_runtime`. This extends the existing direct-runtime surface; the application-side authorization check is not a substitute for the database boundary.
- Signed storage gateway wrappers and the Resource API gateway client exist in source. The design/handover states production must use the gateway client, require `GHM_ACTOR_GATEWAY_URL` and `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET`, and fail closed rather than fall back to direct legacy SQL.
- The repository contains a disposable-only five-function grant revocation/rollback rehearsal at `scripts/qualify-storage-metadata-runtime-grant-revocation-postgres.mjs`, but this is not a production cutover script. No separate production manual cutover artifact or production grant revocation is established by this review.
- Therefore migration 4 is NOT approved for production until the deployed Resource API ↔ Actor Gateway ↔ PostgreSQL storage path is verified, the provider-attestation secret is securely provisioned, all storage lifecycle journeys are smoke-tested, and a separate reviewed/approved five-function legacy grant cutover/rollback plan exists. Do not add an automatic runner REVOKE without first proving the deployed app no longer depends on those legacy functions.
- The strict contiguous-prefix runner means migration 4 is a stop boundary: do not execute migration 5 or later while 4 remains pending. This is an additional gate on top of the capability governance cutover at migration 5.
- The older statement that migrations 1–4 were provisional first-prefix candidates is superseded. Migration 1–3 remain candidates for individual qualification only; migration 4 is a hard storage-gateway cutover gate.

## 17. Read-only production preflight utility and CI finding/fix

- Added `scripts/preflight-first-four-production-migrations-readonly.mjs` and `npm run preflight:first-four-production-migrations`.
- The utility requires the explicit acknowledgement `GHM_PRODUCTION_MIGRATION_PREFLIGHT_CONFIRM=ghm_db:read-only`, `DATABASE_SSL=true`, a non-local `ghm_db` URL, and a verified TLS connection. It insists on `session_user=ghm_migrator`, `current_database()=ghm_db`, and a read-only transaction.
- It reports migration 2/3 object-name collisions, the complete existing `storage_object.status` distribution against migration 4's proposed CHECK predicate, the current storage lifecycle constraint, and the effective runtime/gateway privileges/owner/search_path for the two relevant legacy functions. It performs no DDL/DML and rolls back its read-only transaction.
- This utility has NOT been run against production; it is prepared for the user's local `C:\GHM-main` checkout after the PR is reconciled/merged and the exact code is available. No production URL or credential was accessed in this session.
- The first CI attempt for the new post-apply qualification failed at its metadata inspection because `ghm_migrator` intentionally has no schema USAGE on `ghm`. This is a valid least-privilege behavior, not a production issue.
- Fixed the qualification to use its existing permitted `SET ROLE ghm_schema_owner` membership inside a transaction for catalog/data inspection, while preserving the separate real `ghm_runtime` connection for effective ACL checks. This is test-only and the next exact-head CI must confirm the fix.
- Exact failed run: `43762264142`, quality job `132959478036`; the first migration's actual-runner guard/rollback qualification passed before the new first-four qualification encountered the schema permission error. Web quality passed. Overall quality failed, so do not treat that head as green.
- Current production remains untouched. No migration, grant, secret, deployment, Render setting or application data was changed.


## 18. Qualification least-privilege correction and final review checkpoint (2026-11-15)

- The first-four PostgreSQL qualification initially attempted catalog/seed/storage reads directly as `ghm_migrator` and failed with `permission denied for schema ghm`. This confirms the migration's intended least-privilege boundary.
- Corrected the script to open a migrator connection, start a transaction, `SET LOCAL ROLE ghm_schema_owner`, verify `session_user=ghm_migrator` and `current_user=ghm_schema_owner`, then perform catalog and fixture inspection through that scoped owner context. Effective privileges remain queried explicitly for `ghm_runtime` using the separate runtime login.
- A follow-up review found several later seed/constraint/storage queries still used the raw migrator pool; all were changed to the scoped schema-owner inspection client. The next exact-head CI must confirm this full correction.
- The production preflight utility now uses the same operator identity pattern inside `BEGIN READ ONLY`: migrator session, schema-owner current role, TLS required, exact `ghm_db` database, and explicit read-only acknowledgement. Object collision results use the unambiguous `object_exists` field.
- Added a CI syntax check for the production preflight script. The preflight itself is intentionally not executed in CI because it targets production and must never be given a production URL in CI.
- Storage handover cross-check confirms the three actor-authorized signed wrappers plus two dual-proof provider transition wrappers are implemented in source, and the Resource API fails closed in gateway-required mode. However, the five legacy metadata function grants are only rehearsed for revoke/rollback on disposable PostgreSQL; there is no production cutover script or verified deployed service/secret. This is why migration 4 remains a hard stop.
- Latest code/CI workflow change at this checkpoint: `f6127003d7310d5bd00b1f8c0e7b588eb79c04bf`. Exact-head CI for this SHA has not yet been observed. Previous failed quality run `43762264142` remains superseded by the scoped-role fix; do not report it as a pass.
- PR #285 remains OPEN, DRAFT and mergeable. No reviews/threads were present at the last check. No production migration, role/grant, secret, Render configuration, service deployment or application data was changed.


## 20. Production preflight TLS check clarification (2026-11-15)

- The read-only preflight configures the PostgreSQL client with `ssl: { rejectUnauthorized: true }`, so TLS is enforced by the client connection itself.
- Removed the server-side `ssl` GUC check because it reports server capability/configuration, not the encryption state of an individual client connection. The report now states `tls_enforced_by_client: true` based on the explicit verified client configuration.
- Latest code commit for this correction: `dfc0b1400f6b1cc94b43a8c94e67363d9f473120`. Exact-head CI has not yet been observed for this SHA. Do not claim the new first-four qualification passes until the quality job reaches and completes that step.


## 21. Exact-head CI completed successfully (2026-11-15 21:20 UTC)

- Exact branch head `e8bddb05c23a3719d00a33e7db62c0fb16c28d28` completed GitHub Actions run `43762783722` (CI run number 4987) with overall conclusion `success`.
- All three required checks passed: `quality`, `web-quality`, and `Cloudflare Pages`. The PR remains open and draft; CI success does not merge or authorize production execution.
- The quality job's new first-four post-apply qualification ran successfully against the isolated disposable PostgreSQL 18 database. Captured output:
  - `MIGRATION 2 ONBOARDING EFFECTIVE ACLS + VALIDATED CONSTRAINTS: PASS`
  - `MIGRATION 3 READ-ONLY EFFECTIVE ACLS + SEED DATA + VALIDATED CONSTRAINTS: PASS`
  - `MIGRATION 4 STORAGE ROW COMPATIBILITY + VALIDATED CONSTRAINT + FUNCTION ACL: PASS`
  - `DISPOSABLE FIRST-FOUR MIGRATION POST-APPLY QUALIFICATION: PASS`
- The same quality job passed the full migration application to disposable PostgreSQL, bounded batch guard/rollback qualification, full test suite, migration audit policy tests, runtime boundary verification, and the existing Actor Gateway/auth issuer/storage/capability/security qualification steps.
- The production preflight script received syntax validation only. It has not been run against `ghm_db`; no production inventory, status distribution, constraint or grant has yet been observed by this script.
- Important boundary: these are disposable-database qualification results, not production compatibility evidence. Migration 4 remains blocked on the signed storage gateway production deployment, provider-attestation secret, end-to-end lifecycle smoke tests, and a separately reviewed five-function legacy grant cutover/rollback plan. Do not interpret its disposable pass as production approval.
- PR #285 remains OPEN / DRAFT / mergeable at the time of this checkpoint. No merge, deployment, production migration, grant change, secret change, Render configuration change or production data mutation occurred.
- Next action: run the prepared read-only preflight from the PR branch against production `ghm_db` using the existing `ghm_migrator` connection and TLS verification. Capture the complete output in the handover, then select only the earliest eligible migration(s). The backup and Render role-administration gates remain independent requirements for production DDL.


## 22. Production preflight evidence and repository-only continuation (2026-11-15)

### Exact production read-only preflight supplied by the owner

The owner ran `npm run preflight:first-four-production-migrations` from the exact PR #285 checkout, loading the existing `C:\\GHM\\.env` through `DOTENV_CONFIG_PATH`. The process returned exit code 0 and reported:

- `database_name=ghm_db`, `session_user=ghm_migrator`, `current_user=ghm_schema_owner`, `transaction_read_only=on`.
- `tls_enforced_by_client=true` using `rejectUnauthorized: true`.
- Existing `ghm.storage_mark_deletion_pending(bigint)`: SECURITY DEFINER, owner `ghm_schema_owner`, runtime EXECUTE=true, Actor Gateway EXECUTE=false, pinned `search_path=pg_catalog, ghm`.
- Existing lifecycle constraint `storage_object_lifecycle_check` is validated. Observed storage rows: 2 `deleted` and 2 `pending`; zero rows in either group violate the proposed migration-4 predicate.
- The named function `update_business_supplier_classification` was absent. The five migration-2/3 target tables were absent. The named `storage_mark_deletion_pending` function existed.
- The preflight verdict is deliberately `READ_ONLY_PREFLIGHT_ONLY`. No DDL/DML, migration, role/grant, secret, deployment or application data was changed.

This is a new direct production read-only observation, not merely disposable CI evidence. The output did not include an exact signature/return-type comparison for the existing storage function; the revised preflight now reports expected operation (create vs replace), unexpected object collisions, and function return type. Re-run that revised preflight before finalizing migration-4 compatibility. Do not call the existing function-name match an unexpected collision: migration 4 uses `CREATE OR REPLACE FUNCTION`, so it is an intended replacement candidate whose signature/return type/owner/configuration/ACL still require exact reconciliation.

### Source review findings — no blind changes

- PR #272 is merged and contains the unified Actor Gateway source integration. Its handover still says no production Actor Gateway service/endpoint has been deployed or smoke-tested, and that production gateway hosting/network/secret prerequisites remain unresolved.
- PR #284 remains open/draft and is limited to signed assertion replay/timestamp qualification.
- PR #285 remains open/draft/mergeable. At this update its head is `95730b6a443a8c161440843fe4a96871321a70c9`; the preceding code qualification evidence is tied to `e8bddb05c23a3719d00a33e7db62c0fb16c28d28`, not this new head. Exact-head CI must be checked before treating the preflight refinement as qualified.
- Amanda's Render support conversation remains the operational authority: Dashboard-managed default credential for controlled administration; SQL-created restricted login identities for normal app execution; retain distinct `ghm_runtime` and `ghm_migrator`; preserve the supported SET-only schema-owner path. The unresolved administrator/role-membership issue is not fixed by repository edits.

### Two sequencing/security conclusions

1. The migration-1 post-batch guard revokes runtime EXECUTE on `ghm.update_business_supplier_classification(bigint,bigint,boolean)` immediately after migration `20261110010000`. The signed gateway cutover migration `20261110260000_gateway_supplier_classification_cutover` is later in the pending prefix. Therefore the runner's current guard can revoke a still-needed legacy API path long before its gateway cutover unless the deployed application route is already switched and verified. Production preflight found the legacy function absent at the time of inspection, but this does not prove all deployed API/client paths are switched. Do not apply migration 1 with this guard until the exact production call path is proven safe. Do not simply delete the guard either: migration 1's SECURITY DEFINER function accepts caller-supplied account identity and grants runtime EXECUTE. The correct repository fix is to model the application cutover boundary explicitly and qualify the sequence.
2. Migration `20261110140000_allow_pending_storage_object_cleanup` intentionally replaces the existing `storage_mark_deletion_pending(bigint)` function and retains/grants runtime EXECUTE. The production preflight confirms that direct runtime grant already exists, so the migration does not newly create that particular grant in the observed production state. However, it broadens the function's accepted lifecycle transition to include pending uploads and keeps a SECURITY DEFINER direct-runtime entry point. The five-function signed Storage Metadata Gateway wrappers exist in source, but their existence is not production deployment or cutover evidence. Do not automatically revoke legacy grants in this migration or in the generic runner; preserve the current app path until the gateway route, provider attestation, deployed service, secrets and rollback plan are verified.

### Repository-only change completed

Updated `scripts/preflight-first-four-production-migrations-readonly.mjs` in commit `95730b6a443a8c161440843fe4a96871321a70c9` to:
- classify expected objects by operation (`create` versus `replace`) rather than label every existing object a collision;
- report `unexpected_collision` separately;
- include the existing function return type in the storage function inspection;
- use `object_name_checks` rather than the misleading `object_name_collisions` label;
- describe migration 4 as replacing the existing SECURITY DEFINER function and retaining runtime EXECUTE, and retain the explicit gateway cutover warning;
- state migration 1's same-transaction guard requirement accurately.

No migration SQL, production role/grant, secret, service, deployment or application data was changed by this commit.

### Next repository work

- Reconcile the migration-1 runner guard with the actual supplier-classification application rollout. Determine whether the current production route uses the legacy runtime RPC or signed gateway route; do not infer from merged source alone. Add a qualification that prevents the migration runner from revoking the legacy function before the cutover is ready.
- Extend migration-4 qualification to assert the exact pre-existing function signature, return type, owner, search_path and effective grants before/after `CREATE OR REPLACE`, and test both pending and available object deletion-request semantics without altering timestamps.
- Reconcile all five storage legacy functions against the exact signed wrapper calls and the deployed app release; keep the production grant cutover as a separately planned, reversible operation.
- Update this handover after each repository change and check exact-head CI. Keep PR #285 draft; no merge or production migration authorization is implied.


## 23. Supplier-classification migration ACL correction (2026-11-15)

### Finding and correction

The earlier implementation added a generic runner post-batch REVOKE after migration `20261110010000`. Review against the actual later cutover migration `20261110260000_gateway_supplier_classification_cutover` showed that this was the wrong place to perform the revocation: it could break a still-active legacy Resource API path before the signed Actor Gateway route was deployed and verified. The generic post-batch guard/helper has therefore been removed from the runner.

The safer database boundary is now enforced directly in migration `20261110010000_add_business_supplier_classification`:

- The SECURITY DEFINER implementation accepts a caller-supplied account ID, so it must not be executable by the general runtime login.
- The migration explicitly revokes all privileges from `PUBLIC`, `ghm_runtime`, and `ghm_migrator`.
- It does not grant EXECUTE to `ghm_runtime`.
- The later gateway cutover migration `20261110260000_gateway_supplier_classification_cutover` creates the signed gateway wrapper, grants that wrapper to `ghm_actor_gateway`, and retains revocation of direct runtime access to the underlying function.
- The gateway wrapper calls the underlying function as its SECURITY DEFINER owner; the general runtime does not need direct EXECUTE.

This removes the temporary caller-supplied actor-identity function from the general runtime surface rather than relying on an extra post-batch runner mutation. The old post-batch guard qualification has been converted to a disposable PostgreSQL ACL/rollback qualification that verifies the migration itself does not grant runtime EXECUTE. The source contract test also asserts the exact revoke list and absence of a runtime grant. CI now invokes it as `qualify:supplier-classification-migration-acl`.

### Current code changes

- Removed runtime EXECUTE grant from migration `20261110010000`: commit `9f1ce592253dad2c36e076c8c0e9c9533b64998f`.
- Added contract assertion against runtime EXECUTE: commit `3752f8261d6722fa6c5ce097210a7cc65b75b84f`, then tightened it to require revocation from PUBLIC/runtime/migrator in commit `3b75213666eae1ae38a18824d7790491444464f2`.
- Removed the generic post-batch guard helper and runner hook: commits `59d654a5b66746dbb90eb0014f2a1be0b9c9aeca` and `37af8f41fe950f5f039b0e55e45c33db81cf6a49`.
- Reworked the disposable PostgreSQL qualification and CI command to assert the migration's own ACL boundary and rollback: commits `ba75a1001ce0cb102dfb837215371cc1904edd6d`, `44b42c46495c1f4ff6eb5bb0c5c7c0476ce8c2c5`, `1d95f3bef1e846fc298019884984f92183c3c64a`, `6c7cd2e07fe536f995ec5e485408b2c47f6a8db2`, `0111cf4ce05de06d8b8a6b0c94f66cae2ed30a8b`.
- Updated the production preflight's object operation classification and supplier ACL warning: commits `95730b6a443a8c161440843fe4a96871321a70c9` and `3fc5e6b476b575ced0d06ec2547db493c76dc059`.

### Qualification status and limits

These are repository changes only. They have not yet been confirmed by exact-head CI. The earlier successful CI run `43762783722` applies to the earlier code head and does not qualify these corrections. The PR remains draft. No production migration, role/grant, secret, Render setting, deployment, or application data was changed.

The owner-supplied production preflight observed that `ghm.update_business_supplier_classification` did not yet exist in `ghm_db`, so this correction does not require removing a currently observed production grant. It does mean the future migration will create the function without granting the runtime login direct execution.

### Updated next sequence

1. Verify the latest branch diff and exact-head CI for all changes above.
2. Re-run the revised read-only production preflight to capture expected `create` versus `replace` operations, unexpected object collisions, and the exact storage function return type.
3. Complete the first-four SQL/application compatibility review. Migrations 1–3 may be structurally eligible after disposable qualification, but this does not override the independent fresh-backup and Render role-administration gates.
4. Keep migration 4 blocked until the deployed Resource API ↔ Actor Gateway ↔ PostgreSQL storage path, provider attestation, lifecycle smoke tests and separate reversible five-function legacy grant cutover are verified.
5. Keep the capability gateway cutover at migration 5 as a hard stop until its service/client deployment and separately qualified manual cutover are ready. Do not infer production readiness from merged source or disposable CI.

Amanda's Render support conversation remains the source-of-truth operational guidance: Dashboard-managed default credential for controlled administration; SQL-created restricted logins for normal execution; retain separate runtime/migrator identities and the SET-only schema-owner path. The Render role-administration issue and fresh verified production recovery point remain independent production blockers.


### Exact-head CI checkpoint after ACL correction

- Current PR #285 head: `6234dd834a3fe2e196e085f899252dfb95145d68`.
- GitHub Actions run `43766139175` (run number 5002) is running for this exact PR head. `web-quality` has passed; `quality` is still in progress.
- The quality job is expected to execute the disposable PostgreSQL migration chain, the revised supplier ACL/rollback qualification, the first-four qualification, and the complete test suite. No pass is claimed until the run finishes successfully.
- The earlier rapid-push runs `43765933938` and `43766098321` were cancelled by concurrency while commits were still being added; they are not failures of the code and are not qualification evidence.
- PR #285 remains OPEN / DRAFT / mergeable. No production changes were made.


## 24. Exact-head qualification and storage schema/ledger drift finding (2026-11-15)

### Exact-head CI evidence

- Commit dc670aee3b334c8d0aef601a73547c9cdca4ec56, CI run 43766335290 (run 5005): quality and web-quality both passed.
- The quality logs explicitly recorded:
  - SUPPLIER MIGRATION DOES NOT GRANT RUNTIME EXECUTE: PASS
  - SECURITY DEFINER FUNCTION OWNER PRESERVED: PASS
  - ROLLBACK RESTORES PRE-QUALIFICATION FUNCTION PRIVILEGE STATE: PASS
  - GHM SUPPLIER MIGRATION ACL QUALIFICATION: PASS
  - Migration 2 onboarding effective ACLs/validated constraints: PASS.
  - Migration 3 read-only effective ACLs/seeds/validated constraints: PASS.
  - Migration 4 disposable storage row compatibility/constraint/function ACL: PASS.
  - Complete disposable first-four post-apply qualification: PASS.
  - Full test suite step passed.
- Commit c4095e2a43bdc5b282cbed75bdd0d221933238cb, CI run 43766669234 (run 5006): both quality and web-quality passed. This additionally syntax-checks and builds the revised read-only preflight that now includes the exact storage function definition and ACL in its report.
- The successful CI runs use disposable PostgreSQL 18 and test/build environments. They did not touch production.

### Production migration-4 schema/ledger mismatch

The owner's production read-only preflight (the earlier version of the script) reported all of the following while the forensic migration inventory still listed 20261110140000_allow_pending_storage_object_cleanup as pending:

- ghm.storage_mark_deletion_pending(bigint) exists, is SECURITY DEFINER, owned by ghm_schema_owner, has search_path=pg_catalog, ghm, and is executable by ghm_runtime.
- The live storage_object_lifecycle_check is validated and its definition already matches the predicate written by migration 4, including allowing deletion_pending without requiring available_at IS NOT NULL.
- Two pending and two deleted storage rows were observed; all four satisfy that predicate.
- The original earlier migrations 20261004220000_create_storage_object.sql and 20261004221000_establish_storage_persistence_boundary.sql define the earlier lifecycle predicate (deletion-pending requires available_at IS NOT NULL) and create storage_mark_deletion_pending(bigint) as SECURITY INVOKER. Migration 4 changes that function to SECURITY DEFINER and broadens the allowed transition to pending uploads.
- Therefore production currently exhibits the schema/function shape expected after migration 4, while its migration ledger still reports migration 4 as unapplied. This is evidence of schema/ledger drift or out-of-band DDL; the origin is not established by the preflight and must not be guessed.

Do not blindly execute migration 4 or manually insert its ledger row. First inspect the revised preflight output, compare the complete live pg_get_functiondef and ACL with the exact repository migration, verify constraint definition/validation and the relevant function ownership/configuration, then determine the approved provenance/reconciliation path. The revised script now returns pg_get_functiondef(p.oid) and p.proacl for this exact comparison. This remains read-only.

The fact that the four observed rows satisfy the target predicate does not resolve the ledger/provenance mismatch, nor does it clear the separate signed storage gateway and five-function legacy grant cutover gates.

### Current PR / branch state

- PR #285 remains OPEN / DRAFT / mergeable; no merge or deployment.
- Latest branch HEAD at this checkpoint: c4095e2a43bdc5b282cbed75bdd0d221933238cb.
- No production migration, role/grant, secret, Render configuration, service, deployment or application data was changed.
- Amanda's Render support conversation remains preserved in docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md; her recommendation remains Dashboard-managed admin for controlled administration and SQL-created restricted logins for normal application execution. The outstanding Render role-authority issue and fresh verified backup/recovery point remain independent blockers.

### Next operator step

Fetch the exact PR #285 head locally, preserving the untracked .bak file, and run only npm run preflight:first-four-production-migrations with DOTENV_CONFIG_PATH=C:\GHM\.env and the existing read-only acknowledgement. Capture the complete JSON, especially storage_mark_deletion_pending.definition and storage_mark_deletion_pending.acl. Do not run npm run migrate, set GHM_PRODUCTION_MIGRATION_BATCH, or change any production role/grant.

## 25. Corrected production migration-4 drift assessment — exact function/constraint output (2026-11-15 22:15 UTC)

The owner's latest read-only preflight at branch HEAD cf5487f5ab097df43d9546c88eded3507f2d7ac3 returned the exact function definition and ACL. This supersedes the earlier preliminary interpretation in section 24.

### Exact live state observed

- ghm.storage_mark_deletion_pending(bigint) exists, returns ghm.storage_object, is SECURITY DEFINER, owned by ghm_schema_owner, and has search_path=pg_catalog, ghm.
- Its body updates only rows where status = 'available'. It does not support status = 'pending'; its exception text is the older 'not available' wording.
- Its ACL is {ghm_schema_owner=X/ghm_schema_owner,ghm_runtime=X/ghm_schema_owner}. Thus runtime EXECUTE is present; gateway EXECUTE is absent. The function has not been cut over to the signed storage gateway.
- The live validated storage_object_lifecycle_check still requires available_at IS NOT NULL for deletion_pending.
- The repository migration 20261110140000_allow_pending_storage_object_cleanup.sql instead changes the constraint to allow deletion_pending without requiring available_at, changes the function predicate to status IN ('pending', 'available'), changes the exception text to 'not pending or available', revokes PUBLIC and ghm_migrator, and grants ghm_runtime.
- The observed function body and constraint therefore do not match migration 4's intended post-migration state. The observed SECURITY DEFINER attribute, owner, search_path and runtime grant are only overlapping attributes, not proof of migration application.
- The four observed storage rows (two pending, two deleted) are compatible with the existing constraint. They do not prove that pending-upload deletion is supported.

### Corrected conclusion

Production has a partial schema/security overlap with migration 4, not a demonstrated completed application of migration 4. The migration ledger still lists it pending. The precise provenance of the SECURITY DEFINER conversion and existing runtime grant is unknown. Do not execute migration 4 merely because it is pending, and do not mark it applied manually. First identify the source of the partial function change and reconcile it with the repository migration and signed gateway cutover design.

The earlier section 24 statement that the live constraint already matched migration 4 is superseded by this section. The live constraint definition in the owner's latest output is explicit and retains available_at IS NOT NULL for deletion_pending.

### Repository correction versus production correction

Repository changes can and should make future execution safer: detect this exact partial state, stop with a clear drift verdict, and require an explicit reconciliation path. Repository code cannot retroactively establish who changed production, nor can a code fix safely infer that a pending migration should be recorded as applied. Any production repair or migration-ledger reconciliation is a separate controlled database operation, after provenance and recovery are established.

### Next safe implementation

Add a read-only migration-4 drift classifier/contract test to the branch. It should compare the live constraint expression, function definition, owner, prosecdef, proconfig, and ACL against:
1. the exact pre-migration state from migrations 20261004220000 and 20261004221000;
2. the exact intended migration-4 state;
3. known partial/unknown states.

It must return PRE_MIGRATION, POST_MIGRATION, PARTIAL_DRIFT, or UNKNOWN_DRIFT, and must fail closed for the last two. Do not alter production or auto-repair the ledger. Add disposable PostgreSQL 18 tests for each classification and for refusing migration 4 when production-shaped partial drift is simulated.

### Operator evidence / safety

- Exact production read-only identity: session_user=ghm_migrator, current_user=ghm_schema_owner, transaction_read_only=on, client TLS verification enforced.
- The revised preflight exited 0 and made no DDL/DML changes.
- No production migration, ledger update, grant, role, secret, deployment, service or data change occurred.
- Untracked local backup remains database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak; preserve it and do not stage or delete it.
- PR #285 remains OPEN / DRAFT; exact observed branch head was cf5487f5ab097df43d9546c88eded3507f2d7ac3.
