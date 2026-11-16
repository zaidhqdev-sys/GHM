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

## 26. Repository-side migration-4 drift classifier implementation (2026-11-15 22:19 UTC)

Following the corrected section 25 assessment, a read-only classifier has been added to PR #285:

- `scripts/storage-migration-drift-classifier.mjs` classifies catalog evidence as `PRE_MIGRATION`, `POST_MIGRATION`, `PARTIAL_DRIFT`, or `UNKNOWN_DRIFT`.
- `scripts/storage-migration-drift-classifier.test.mjs` covers exact pre-migration state, exact migration-4 state, SECURITY DEFINER-only partial drift, constraint/function mismatch, unexpected gateway/PUBLIC execution ACLs, and missing/unknown catalog state.
- `scripts/preflight-first-four-production-migrations-readonly.mjs` now includes `migration_4_schema_state` in its JSON report and warns that `PARTIAL_DRIFT` / `UNKNOWN_DRIFT` are hard stops. The script remains `BEGIN READ ONLY`, enforces client TLS verification, and never applies migrations or repairs the ledger.
- `package.json` test command now runs the classifier's Node test file.

Important: `POST_MIGRATION` is only a structural schema classification. It does not mean the migration ledger is correct, establish provenance, or authorize manual ledger insertion. `PRE_MIGRATION` is likewise not execution authorization; all other migration/gateway/recovery gates remain.

Latest code commit at this checkpoint: 77986c3659031de215132f4b60e4b37c3aae749b. CI run 43768580042 (run 5011) was queued at handover update time; no pass is claimed. The prior read-only production observation is classified as `PARTIAL_DRIFT` by design because the function is SECURITY DEFINER but retains the old available-only body and old lifecycle constraint.

No production SQL, migration ledger, grant, role, secret, Render service, deployment or application data was changed. Preserve the untracked local `.bak` file.

Next: wait for exact-head CI on the classifier and test wiring. Once green, fetch the exact branch head and rerun the read-only preflight only to verify it reports `PARTIAL_DRIFT` for the current production state. Then investigate provenance from backups/audit logs and continue the separate storage gateway cutover design; do not run production migrations.
## 27. Classifier hardening and latest checkpoint (2026-11-15 22:20 UTC)

The storage migration-4 classifier was hardened after review:

- It now requires a validated lifecycle constraint and the expected `ghm.storage_object` return type before it can report either known state.
- A `POST_MIGRATION` classification requires the exact expected ACL entries for `ghm_schema_owner` and `ghm_runtime`; extra PUBLIC, migrator, gateway, or other-role grants fail closed.
- PostgreSQL's `::text` casts in catalog-rendered function/constraint definitions are accounted for.
- Missing catalog state and an unvalidated constraint cannot be classified as a safe pre/post state.

Latest code changes include classifier commit `eafd537814096d3b38014273f97955ebdc06d195`; the immediately preceding preflight wiring commit is `11c0a33bba0df6daaaab03c7fb1eca9e13c07574`. The exact branch head when this note was authored is being refreshed by this documentation commit. Workflow run 5017 for the classifier code commit was pending at last check; no pass is claimed.

The observed production state remains expected to classify `PARTIAL_DRIFT`: SECURITY DEFINER is present, but the live function body still only allows `available` rows and the lifecycle constraint still requires `available_at` for `deletion_pending`.

Do not apply migration 4, manually insert a ledger row, revoke runtime grants, or modify production to force a classification. Keep the untracked `.bak` file preserved. Next step remains exact-head CI, then rerun the read-only preflight against `ghm_db` and verify the explicit `PARTIAL_DRIFT` output.
## 28. CI failure and classifier correction (2026-11-15 22:31 UTC)

Exact-head CI for commit 0064f8dcad6ce0c964b71cb772af64ca8674f464 (run 5018) completed with `web-quality` PASS and `quality` FAIL. The failure was isolated to the new classifier test `unknown or missing catalog state is not treated as safe`: an unvalidated constraint was returned as `PARTIAL_DRIFT`, while the contract requires `UNKNOWN_DRIFT` whenever catalog evidence is incomplete or the constraint is not validated.

Correction committed as `5d613db38aee1b554f73942959db9316e04d7939`: the classifier now immediately returns `UNKNOWN_DRIFT` when the constraint/function definition is missing, the constraint is not validated, or the function return type is not `ghm.storage_object`. This makes incomplete catalog evidence fail closed before any semantic partial-drift matching.

CI for this correction has not yet been observed. Do not claim a pass. Next step: inspect the new exact-head CI run, diagnose any further failure from logs, and only after exact-head quality/web-quality pass, fetch that commit and rerun the read-only production preflight. Production remains untouched.

## 29. Exact-head CI passed; production preflight confirms migration-4 partial drift (2026-11-15 22:37 UTC)

### Exact-head source and CI evidence

- The owner fetched PR #285 branch `feat/production-migration-batch-execution-20261115` and checked out exact HEAD `82ccc3643d4b22dec4bef1bac1fbc1e1831a85bb`.
- The local backup `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak` remains untracked and preserved. The branch tree contains no tracked copy of this backup.
- Exact-head GitHub Actions run **#5020** (`43769828614`) completed successfully against `82ccc3643d4b22dec4bef1bac1fbc1e1831a85bb`: both `quality` and `web-quality` PASS. The quality job included the build, disposable PostgreSQL migration/guard/rollback qualifications, complete test suite, Actor Gateway smoke qualification, storage gateway qualification, and security-boundary checks. This is CI/disposable evidence only, not production authorization.
- PR #285 remains open and draft. No merge is performed.

### Owner-run production read-only preflight

The owner ran `npm run preflight:first-four-production-migrations` with `DOTENV_CONFIG_PATH=C:\\GHM\\.env` and the read-only acknowledgement. Exit code was **0** and the script returned `READ_ONLY_PREFLIGHT_ONLY`.

Observed identity and transport:
- Database `ghm_db`; `session_user=ghm_migrator`; `current_user=ghm_schema_owner`.
- `transaction_read_only=on`; client TLS verification enforced.

Classifier result: **`PARTIAL_DRIFT`** for migration 4. Exact live evidence:
- `ghm.storage_mark_deletion_pending(bigint)` exists, returns `ghm.storage_object`, is SECURITY DEFINER, owned by `ghm_schema_owner`, and has `search_path=pg_catalog, ghm`.
- Its body still updates only rows with `status = 'available'` and retains the old “not available or does not exist” exception.
- ACL is `{ghm_schema_owner=X/ghm_schema_owner,ghm_runtime=X/ghm_schema_owner}`; runtime EXECUTE is true and gateway EXECUTE is false.
- The validated `storage_object_lifecycle_check` still requires `available_at IS NOT NULL` for `deletion_pending`, unlike migration 4's intended lifecycle rule.
- The four observed rows (two `pending`, two `deleted`) have zero rows incompatible with the proposed constraint.
- The supplier-classification function and the other six checked objects are absent; all expected-create checks report no unexpected collision.

### Decision and hard stops

1. Treat this as a successful diagnostic run that has identified a real production partial-drift state, not a successful migration preflight or execution authorization.
2. Do **not** run migration 4, migrations 5+, `npm run migrate`, or set `GHM_PRODUCTION_MIGRATION_BATCH`.
3. Do **not** repair/insert the migration ledger row, alter the function or constraint, or revoke runtime grants to force a desired state.
4. First investigate the provenance of the existing SECURITY DEFINER function and runtime grant using authoritative backups, Render/audit evidence, and the storage gateway handover. Then plan a separately qualified signed storage gateway deployment/cutover and legacy five-function grant transition.
5. The independent production gates remain unresolved: Amanda's Render support conversation and `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md` remain the authority for the Dashboard-managed administrator versus SQL-created restricted-login model; the Render role-authority/membership issue is not resolved. A fresh verified production backup/recovery point is also not confirmed. Production Actor Gateway deployment/credentials and end-to-end smoke evidence remain prerequisites.
6. Preserve the untracked local `.bak` file.

No production migration, DDL/DML, ledger repair, role/grant change, secret, Render configuration, deployment, or application data was changed by this preflight.

### Next step

Continue with a read-only provenance investigation of the migration-4 function/constraint and the five legacy storage metadata function grants. Use the storage gateway handover and Amanda's Render support guidance; do not make production changes while the backup, role-authority, and gateway cutover gates remain open.


## 30. Migration-4 provenance traced to October baseline; classifier corrected (2026-11-15 22:41 UTC)

### Provenance findings

Repository history establishes that the production SECURITY DEFINER function attributes are part of the original, intended storage persistence boundary—not evidence by themselves of a partial November migration:

- `20261004220000_create_storage_object.sql` creates `ghm.storage_object` with the original lifecycle CHECK requiring `available_at IS NOT NULL` when status is `deletion_pending`.
- `20261004221000_establish_storage_persistence_boundary.sql` creates the five legacy storage metadata functions and grants the intended runtime function EXECUTE privileges.
- `20261004222000_harden_storage_persistence_function_authority.sql` explicitly converts the legacy functions, including `storage_mark_deletion_pending(bigint)`, to SECURITY DEFINER; pins `search_path=pg_catalog, ghm`; and grants EXECUTE to `ghm_runtime`. This is the documented baseline that matches the observed production function owner/search path/SECURITY DEFINER/runtime ACL.
- The original November 10 migration commit `bd69850693f75da6e3a5d98462ed436323662ad5` initially added the function replacement (pending + available predicate) and authority statements. It did **not** initially replace the lifecycle constraint.
- PR #279, merged 2026-11-14 as commit `20a873af736ea19554021414f65d37cb68a02b64`, amended that same migration to replace the lifecycle constraint while preserving `available_at` and `deleted_at`. The merged migration now changes both the function predicate and constraint. Its PR body explicitly records that no production migration was run.

This is strong repository provenance for the older function attributes, but does not prove when/how the current production function was last changed. The live body and constraint still match the October baseline; the current production migration ledger and exact migration checksum must still be reconciled before any execution decision.

### Classifier defect corrected

The prior classifier incorrectly treated SECURITY DEFINER as a migration-4-only signal and expected SECURITY INVOKER in the pre-migration state. That contradicted the October migration history and caused a false `PARTIAL_DRIFT` classification for a production-shaped October baseline.

The classifier now recognizes the exact pre-migration baseline as:
- the validated original lifecycle constraint;
- the old available-only function body;
- SECURITY DEFINER, owner `ghm_schema_owner`, pinned `pg_catalog, ghm` search path;
- exactly the schema-owner and runtime EXECUTE ACL entries, with no gateway/PUBLIC/migrator/extra grants.

Unexpected authority changes still fail closed. The test fixture now models the actual October SECURITY DEFINER baseline and tests unexpected ACL/security-mode deviations. Code commits:
- `3d0852eaee692259c04c8868dceb9fa0bd253d52` — classifier correction.
- `ad073358e3327c45d0a6ef48b38e20418d43e976` — baseline authority tests.

The current branch HEAD is `ad073358e3327c45d0a6ef48b38e20418d43e976`. Exact-head CI for this correction is pending/not yet verified. Do not rely on the classifier correction until CI passes and the owner reruns the read-only production preflight.

### Updated production interpretation and next actions

The previous `PARTIAL_DRIFT` finding is superseded as a classifier conclusion: based on the repository's October baseline, the supplied live function/constraint/ACL output appears to match **PRE_MIGRATION**, not partial migration-4 application. The original production output remains read-only evidence and has not changed.

1. Fetch the exact new branch head, preserve the untracked local `.bak`, and wait for exact-head CI.
2. Once CI passes, rerun only `npm run preflight:first-four-production-migrations` against `ghm_db`; confirm `PRE_MIGRATION` and inspect exact catalog output again.
3. Independently reconcile the migration ledger row/checksum and the exact canonical migration file against the live ledger before planning execution.
4. Keep the five legacy storage function grants unchanged until the signed Actor Gateway cutover is deployed, verified and separately approved. The storage gateway design and disposable cutover rehearsal do not authorize production grant revocation.
5. Amanda's Render support conversation and `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md` remain authoritative for the Dashboard-managed admin / SQL-created restricted-login separation. The Render role-authority issue and a fresh verified production backup/recovery point remain independent hard gates.

No production migration, ledger repair, DDL/DML, grant/role change, secret, Render configuration, deployment or application data was changed during this investigation. Preserve the untracked local `.bak`.


## 31. Exact-head CI failure diagnosed and fixture corrected (2026-11-15 22:44 UTC)

The owner correctly did not run the proposed PowerShell preflight command because exact-head CI had failed. No local fetch/checkout or production preflight is assumed after that point.

### Failed workflow #5023

- Run: `43770662196`; head at time of run: `126565f19675d7e677e235f2986ea2046f760e3d`.
- `web-quality`: PASS.
- `quality`: FAIL at `Test suite`.
- The full suite reported 1,019 passing tests; the focused storage classifier test file reported 7 passing and 1 failing.
- Failing case: `fails closed when post-migration function has unexpected gateway or PUBLIC execute` expected `PARTIAL_DRIFT`, actual `UNKNOWN_DRIFT`.
- Root cause was a malformed test fixture: its function definition did not contain the SQL predicate pattern required to establish the post-migration function shape. The classifier therefore correctly returned UNKNOWN_DRIFT before evaluating the unexpected grant assertion. This was a test-fixture defect, not evidence of a production or database failure.
- The fixture also accidentally retained `SECURITY INVOKER` in the October baseline function text even though the separate securityDefiner catalog flag was true. Corrected the fixture to SECURITY DEFINER so it matches the October migration source.

### Correction

- Commit `f6eaa1265c4d2f2e7df10c5e73ba9abc5eeadb41` corrects the fixture to use SECURITY DEFINER and a realistic pending/available UPDATE predicate.
- The exact-head CI for this correction must pass before asking the owner to fetch the branch or run any preflight.
- No production action is authorized by this test correction. The production state remains as last observed; only read-only inspection has been performed.

### Owner instruction / next gate

The owner explicitly stated that the proposed command was not run because CI failed. Respect that: do not ask them to run the preflight again until the latest exact branch HEAD has successful `quality` and `web-quality` checks. Keep the untracked local `.bak` preserved. Continue to treat production backup/recovery, Render role-authority (Amanda support conversation), signed Actor Gateway cutover, and migration-ledger/checksum reconciliation as separate gates.


## 32. Corrected storage classifier exact-head CI passed (2026-11-15 22:49 UTC)

- Owner reported CI passed. Verified latest branch workflow **#5025**, run ID `43771069353`, completed with conclusion `success` against branch HEAD `89d2fe11a88a955286cb63e39ff6d06a3280a1a1`.
- Both required jobs passed: `quality` and `web-quality`.
- Workflow #5024 (`43771045550`) for code commit `f6eaa1265c4d2f2e7df10c5e73ba9abc5eeadb41` was cancelled by the subsequent workflow; do not interpret it as the successful run. The later #5025 run includes the corrected code at the same branch state plus the handover record and is the verified successful exact-head run.
- PR #285 remains open and draft; no merge.
- This CI success qualifies the corrected classifier/test code only. It does not authorize production migration execution, ledger repair, grant changes, or deployment.
- Next owner action may now be limited to fetching the exact qualified branch head and rerunning the read-only production preflight. Preserve the untracked local `.bak` file. If the corrected preflight reports `PRE_MIGRATION`, continue with read-only migration ledger/checksum and provenance reconciliation; do not execute a migration until all independent production gates are cleared.


## 33. Corrected production preflight confirms exact October baseline (2026-11-15 22:54 UTC)

The owner fetched and checked out the CI-qualified branch, verified HEAD `09c4d485d642ceb3c1c1805467fb4128c08065f5`, and reran the read-only production preflight. The untracked local backup `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak` remains present and untouched.

Observed result:
- Verdict `READ_ONLY_PREFLIGHT_ONLY`; exit code 0.
- Classifier: **`PRE_MIGRATION`**. This supersedes the initial false `PARTIAL_DRIFT` result from the earlier classifier.
- Identity: database `ghm_db`, session user `ghm_migrator`, current user `ghm_schema_owner`; transaction read-only is on and client TLS verification is enforced.
- The existing `storage_mark_deletion_pending(bigint)` body, lifecycle constraint, owner, pinned search path and exact owner/runtime ACL match the October baseline.
- Other six expected-create objects are absent with no unexpected name collisions.
- Two pending and two deleted storage rows; zero incompatible rows under the proposed lifecycle constraint.
- Supplier-classification function is absent.
- No production DDL/DML, migration, ledger repair, grant/role change, secret, Render configuration, deployment or application data was changed.

### Next read-only gate: full production migration ledger/provenance reconciliation

The repository already contains the dedicated, TLS-verified, `BEGIN READ ONLY` forensic audit. Its production pending allowlist is `config/pending-migrations.production.json` (42 entries in the checked branch); retained-history and historical-checksum provenance are in the corresponding production config files. Run the existing `npm run audit:migrations:predeploy` command only after the owner fetches the latest handover-updated branch head. This audit permits the explicitly allowlisted pending set but does not apply migrations. Capture the full JSON output and exit code. A PASS_WITH_PENDING verdict is an audit result only—not authorization to execute pending migrations.

The standalone legacy `audit-applied-migration-checksums.cjs` script uses an unverified TLS configuration and is not the preferred production audit; use the forensic reconciliation command with verified TLS instead.

Production migration execution remains blocked pending exact ledger/provenance PASS, a fresh verified production backup/recovery point, resolution of Render role-authority with Amanda's support guidance, deployed and verified signed Actor Gateway/storage path, and a separately qualified small-batch/rollback plan. Keep all five legacy storage grants unchanged until the gateway cutover is proven and explicitly planned.


## 34. Production ledger/provenance audit passed with pending migrations (2026-11-15 23:04 UTC)

The owner supplied the complete tail of the existing production forensic audit output after the read-only storage preflight.

Observed audit result:
- Verdict: **`PASS_WITH_PENDING`**; exit code 0.
- `unexplained_mismatches`: empty.
- `name_mismatches`: empty.
- `unrecognized_extra`: empty.
- `pending_allowlist_mismatch_count`: 0.
- All 10 `approved_retained_historical` entries were reported as `VERIFIED_RETAINED_HISTORY`.
- The audit reports the expected pending migration inventory (42 entries in this branch's production allowlist); these remain pending and unapplied.
- Historical exception audit retained provenance-only entries and marked repository-identical historical hashes as redundant, without treating them as current-ledger mismatches.

This is the required ledger/name/checksum/allowlist reconciliation result. It is not production migration authorization and does not establish that any pending migration is safe to execute without its independent dependency, privilege, gateway and rollback gates.

### Latest PR/CI state after the owner's audit

- PR #285 remains **open, draft, unmerged**.
- The PR branch advanced beyond the owner's checked-out audit head `09c4d485d642ceb3c1c1805467fb4128c08065f5` to `4c6260c0c4d80a13c61af3bfd7b20c7e0789c6fb`.
- Exact-head workflow **#5027**, run ID `43772180560`, completed successfully on `4c6260c0c4d80a13c61af3bfd7b20c7e0789c6fb`.
- Both `quality` and `web-quality` passed. The quality job also completed disposable PostgreSQL qualification for the first four pending migrations, supplier-classification ACL/rollback, storage lifecycle and gateway qualification; this is disposable-environment evidence only, not production execution.- The owner's local untracked `.bak` remains a preservation requirement; do not add, delete, overwrite or stage it.
### Next action

Fetch and inspect the current PR branch head before any further command. Then rerun only the TLS-verified read-only `npm run audit:migrations:predeploy` on that exact current head and capture its verdict/exit code. Do not run the production migration runner, set `GHM_PRODUCTION_MIGRATION_BATCH`, repair the ledger, change grants/roles, or deploy.

### Independent execution blockers remain

1. A fresh, verified production backup/recovery point has not been established; the previously located November 4 archive is not proof of a current recoverable backup.
2. Render's database role-authority / delegated CREATEROLE membership issue remains with Render support. Amanda's support conversation and `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md` remain the reference; do not assume SQL-level revocation is effective until Dashboard-managed role authority is resolved and verified.
3. Signed Actor Gateway and storage-provider attestation path must be deployed/configured and smoke-tested in the production topology before storage legacy grant cutover.
4. Keep all five legacy storage metadata grants unchanged until the signed gateway path and separately rehearsed grant-cutover/rollback plan are proven.
5. Review each next pending migration's production dependencies, effective privileges, application compatibility and rollback separately; execute only small, verified contiguous batches after all gates are cleared.

No production migration, ledger repair, DDL/DML, role/grant change, secret, Render configuration, deployment or application data was changed by the audit.


## 35. Handover commit exact-head CI passed; next audit must use this head (2026-11-15 23:35 UTC)

The handover update in section 34 created commit `3a3fdd675302c53dcb00cf9c994e42c2e4f2f81e`. Exact-head CI workflow **#5028** (run ID `43773290668`) completed successfully on that exact commit:
- `quality`: PASS.
- `web-quality`: PASS.

PR #285 remains open, draft and unmerged. This CI pass qualifies the documentation/code snapshot; it does not execute or authorize production migrations.

### Owner's next local step

Fetch the current PR branch and verify exact HEAD `3a3fdd675302c53dcb00cf9c994e42c2e4f2f81e`. Preserve the existing untracked `.bak` file. Then run only the TLS-verified, read-only production reconciliation command `npm run audit:migrations:predeploy` from this exact checkout, with `DOTENV_CONFIG_PATH=C:\\GHM\\.env` and the repo's documented production audit confirmation variable. Capture the complete JSON output and exit code.

Do not run the production migration runner, set a production batch variable, repair the ledger, alter grants/roles, or deploy. Once the fresh exact-head audit is reviewed, proceed to resolve the independent backup/recovery, Render role-authority (including Amanda's support correspondence), and production gateway readiness gates before planning any first migration batch.



## 36. Fresh exact-head production reconciliation audit passed (2026-11-15 23:36 UTC)

The owner supplied the completed output from the TLS-verified, read-only `npm run audit:migrations:predeploy` after the section 35 instruction.

Observed result:
- Verdict: **`PASS_WITH_PENDING`**; exit code **0**.
- `unexplained_mismatches`: empty.
- `name_mismatches`: empty.
- `unrecognized_extra`: empty.
- `pending_allowlist_mismatch_count`: **0**.
- All ten approved retained historical entries are verified as `VERIFIED_RETAINED_HISTORY`.
- Historical exception provenance is internally consistent; entries matching current repository bytes are marked redundant, not treated as unexplained ledger mismatches.
- The full pending inventory remains pending; the audit does not apply migrations or authorize execution.

The audit was performed after the owner fetched the CI-qualified branch state recorded in section 35. The latest handover/CI-qualified reference at that checkpoint was `3a3fdd675302c53dcb00cf9c994e42c2e4f2f81e`, with workflow #5028 successful (`quality` and `web-quality`). No claim is made that the audit itself executed SQL beyond read-only catalog/ledger inspection.

### Decision

The production migration ledger/name/checksum/allowlist reconciliation gate is now **PASS**. Together with the separately reported storage preflight result `PRE_MIGRATION`, this removes the previous inventory/provenance uncertainty. It does not clear the operational execution gates.

### Next work: first-pending migration qualification

Proceed with source-only review of the exact first pending migration and its dependent cutover chain before any production batch is considered:
1. Review `20261110010000_add_business_supplier_classification.sql` and its dependent `20261110260000_gateway_supplier_classification_cutover.sql` plus the signed-assertion binding migration(s).
2. Confirm the effective function ACL at creation time, especially that the caller-supplied account-ID SECURITY DEFINER function cannot be executed by `PUBLIC`, `ghm_runtime`, or `ghm_migrator`, and only the intended schema-owner/gateway wrapper path can invoke it.
3. Trace the exact deployed Actor Gateway and Resource API routes/client compatibility, not just SQL object creation; do not infer production readiness from disposable CI.
4. Document rollback and the smallest safe contiguous batch. Keep the batch unconfigured and do not run `npm run migrate`.

Independent hard gates remain: fresh verified production backup/recovery point; Render role-authority remediation tracked through Amanda's support conversation and the role-separation handover; production Actor Gateway/storage path deployment, credentials and smoke evidence; and the separate storage legacy-grant cutover plan. Preserve the untracked local `.bak` file.

No production migration, ledger repair, DDL/DML, role/grant change, secret, Render configuration, deployment, or application data was changed by this audit.



## 37. Exact-head CI fully passed on bounded migration runner (2026-11-15 23:41 UTC)

The owner reported that all three checks passed. Verified the associated GitHub Actions workflow and PR metadata:

- PR #285 head: `531911ef731a9394fc3c4e519e9e1b0d3501e2c5`.
- CI workflow run **#5030**, run ID `43775874907`, completed with conclusion **SUCCESS** on that exact commit.
- Required jobs: `quality` — SUCCESS; `web-quality` — SUCCESS.
- The workflow reports two jobs; the owner's UI showed three successful checks. The workflow's two job conclusions are independently confirmed.
- PR #285 remains **OPEN, DRAFT, UNMERGED**; base `main`, branch `feat/production-migration-batch-execution-20261115`. No merge or deployment was performed.

This exact-head CI result qualifies the current branch snapshot, including the bounded production batch selection, storage drift classifier/preflight, and disposable PostgreSQL / application qualification steps present in the workflow. It is not production migration execution evidence and does not authorize setting `GHM_PRODUCTION_MIGRATION_BATCH`.

### Next safe step

Continue with the first-pending migration's source/dependency/effective-ACL review and confirm the relevant Actor Gateway/Resource API route compatibility against the current branch. Keep any production batch unset. The production backup/recovery point and Render administrator-role separation remain hard blockers; follow Amanda's Render support conversation and `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md` rather than improvising role changes. The production signed Actor Gateway/storage deployment and smoke test, plus the separate five-function legacy storage-grant cutover/rollback plan, are also outstanding.

Preserve the untracked local `.bak` file:
`database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak`.

No production migration, ledger repair, DDL/DML, role/grant change, secret, Render configuration, deployment, or application data was changed for this CI verification.



## 38. First supplier-classification migration and gateway route review (2026-11-15 23:46 UTC)

### Exact branch and CI recheck

- PR #285 remains open, draft and unmerged on branch `feat/production-migration-batch-execution-20261115`.
- Current PR head is `d86783327f83ca9379135e3ba1e5a678203d9e58`, the handover-only commit recorded in section 37.
- Exact-head CI workflow **#5031**, run ID `43776315934`, completed successfully on `d86783327f83ca9379135e3ba1e5a678203d9e58`. Both reported jobs, `quality` and `web-quality`, passed.
- PR #272 (unified Actor Gateway integration) is merged; its historical PR body contains pre-merge wording and must not be treated as current PR state. The merged Actor Gateway, isolated Authentication Issuer and Worker source are in mainline, but production services have not been deployed.

### Migration 1 — source and ACL findings

Reviewed `database/migrations/20261110010000_add_business_supplier_classification.sql`:

- Adds `ghm.business.is_supplier boolean NOT NULL DEFAULT false`, normalizes legacy NULL values to false, and records that this is descriptive Marketplace metadata—not verified capability or Trust evidence.
- Creates `ghm.update_business_supplier_classification(bigint,bigint,boolean)` as SECURITY DEFINER, owned by `ghm_schema_owner`, with pinned `search_path = pg_catalog, ghm`.
- The function checks an active owner/administrator membership before changing the Business row.
- It explicitly revokes all execution from `PUBLIC`, `ghm_runtime`, and `ghm_migrator`. The owner retains its inherent owner execution authority; there is no direct grant to `ghm_actor_gateway` on this legacy implementation.
- The PR #285 runner has an additional exact-version post-batch guard that repeats the runtime EXECUTE revocation in the same transaction after this migration. The full runner still validates all applied migration checksums and holds the existing advisory lock/transaction for the selected batch.
- Existing migration contract tests assert the absence of a runtime grant and the exact revocation. The disposable PostgreSQL supplier qualification tests runtime denial, gateway-only denial to runtime, inability to SET ROLE to the gateway, forged/expired/replayed/context-substituted assertion rejection, owner success and ordinary-member denial.

### Supplier gateway and application route compatibility

Reviewed the supplier cutover and signed-assertion sequence:

- `20261110260000_gateway_supplier_classification_cutover` creates the initial gateway wrapper using the earlier `assert_actor_gateway` session-user check and grants the wrapper to `ghm_actor_gateway`; it also revokes runtime execution on the legacy function.
- `20261111030000_bind_supplier_gateway_actor_to_signed_assertion` upgrades the wrapper to a short-lived signed HMAC assertion (v1).
- `20261111060000_bind_gateway_assertions_to_request_context` replaces that interface with the context-bound v2 assertion. It binds the signature to the exact `businessId` and `isSupplier` arguments and recreates the supplier wrapper with the final seven-argument contract.
- Current `src/actor-gateway/supplier-classification-reader.ts` creates the v2 assertion and calls that seven-argument wrapper. The Worker wires this reader into the authenticated Actor Gateway app.
- Current Actor Gateway app route is `PUT /v1/businesses/:businessId/supplier-classification`; it derives the actor from the verified bearer token, validates the body to the single boolean `isSupplier`, and returns a fail-closed error when the reader is unavailable.
- Resource API `HttpSupplierClassificationGatewayClient` calls that exact HTTPS route, forwards only the bearer token and `{isSupplier}`, rejects redirects, and has no legacy SQL fallback. The Business PATCH handler permits the supplier-only update and routes it through this client; mixed profile/supplier updates are rejected.
- The current Business Identity repository contains no direct call to the legacy supplier function. Public Business/Directory projections expose the canonical boolean, and the historic Connect Marketplace handover confirms supplier/contractor remains classification only.
- The deployed production GHM runtime SHA `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf` was inspected: its `src/http/app.ts` and Business Identity repository do not contain the supplier gateway client or supplier classification function call. It is older than the merged gateway integration. The currently deployed app therefore does not provide the new supplier gateway route. The new source path returns 503 when no gateway client is configured; it does not fall back to direct database execution.

### Sequencing conclusion

1. Migration 1's ACL design is fail-closed for the new legacy SECURITY DEFINER function, and the exact-version post-batch guard reinforces the runtime revocation.
2. The final deployed supplier route expects the context-bound v2 database wrapper introduced at migration `20261111060000`. Do **not** deploy the Actor Gateway Worker or enable supplier writes during the intermediate unsigned/v1 wrapper states. The Worker/client source and final SQL contract must be released as a compatible unit.
3. The production Actor Gateway, Authentication Issuer and Resource API deployment topology remains unresolved under the existing zero-additional-spend constraint. No production gateway URL, DB credential, assertion secret or issuer secret has been provisioned; the existing live runtime is not a substitute for the isolated gateway/issuer.
4. The runner requires the exact contiguous pending prefix. Reaching migration 110600 means all earlier pending migrations—including storage migration 4 and the intervening gateway/identity changes—must be qualified in order. Do not skip migration 4 or use an out-of-order/manual ledger adjustment. The separate storage gateway and five-function legacy grant cutover remain independent gates.
5. The current production backup/recovery point and Amanda/Render administrator-role separation remain unresolved hard gates. The historical issuer handover also records the lack of a qualified zero-cost isolated issuer/gateway hosting path and the production role/ACL/network/TLS gaps. Do not treat merged source or disposable CI as production readiness.

### Decision

Source review confirms the supplier-classification SQL and current gateway client/Worker route are designed to meet at the final context-bound signed assertion contract. It does **not** establish that the live production app can currently serve the feature or that any migration batch is ready for production. Keep `GHM_PRODUCTION_MIGRATION_BATCH` unset, keep all production roles/grants/secrets/services unchanged, and do not run `npm run migrate`.

No production SQL, migration, ledger repair, DDL/DML, role/grant change, secret, Render/Cloudflare configuration, deployment, or application data was changed during this review. Preserve the untracked local `.bak` file.



## 39. Ordered first-four migration qualification review (2026-11-15 23:53 UTC)

### Exact-head CI and PR state

- PR #285 head: `41202d20d01f9a54f248bf072a719610bb9346cc`.
- Workflow #5032, run ID `43776795728`, completed SUCCESS on that exact head.
- `quality` and `web-quality` both passed.
- PR #285 remains OPEN, DRAFT, UNMERGED. No production execution or deployment.

### Disposable first-four qualification scope

Reviewed `scripts/qualify-first-four-pending-migrations-postgres.mjs`. It is hard-gated to `NODE_ENV=test`, distinct runtime and migrator URLs, localhost, and database `ghm_disposable_test`. It verifies:
- migration 2 onboarding table runtime SELECT/INSERT/UPDATE and denied DELETE/TRUNCATE/REFERENCES/TRIGGER, sequence privileges and validated constraints;
- migration 3 SELECT-only runtime access on four relationship/outcome tables, denied write privileges, expected seed rows and validated constraints;
- migration 4 storage lifecycle row compatibility, validated lifecycle constraint, SECURITY DEFINER owner/search_path and effective runtime EXECUTE.

This script is a post-apply disposable qualification. It does not run production SQL and is not evidence that the production storage gateway is deployed or safe.

### Migration-by-migration review findings

**1 — `20261110010000_add_business_supplier_classification`**
- Adds the descriptive Business classification and a SECURITY DEFINER update function owned by `ghm_schema_owner`, with pinned search_path and explicit EXECUTE revocation from PUBLIC, runtime and migrator.
- The function accepts caller-supplied account ID, so it must remain inaccessible to untrusted/direct runtime callers. The later signed gateway chain is required before writes are exposed. See section 38.

**2 — `20261110100000_create_account_onboarding_progress`**
- Creates a constrained per-account progress table and grants runtime SELECT/INSERT/UPDATE plus sequence USAGE/SELECT; destructive table privileges are denied.
- The current Resource API repository binds every query to `context.userId`, and route/service layers require authenticated, authorized onboarding context. However, the table has no row-level security policy. A caller holding the shared `ghm_runtime` SQL credential can bypass those application predicates and read or alter another account's progress. This is an application-vs-database authority gap to record; the disposable test currently verifies table-level ACLs but not cross-account isolation under direct runtime SQL. Do not represent table grants alone as tenant isolation.

**3 — `20261110120000_create_business_relationship_outcome_read_models`**
- Creates relationship/outcome tables, foreign keys, lifecycle/provenance/visibility checks, indexes and 5 relationship + 6 outcome type seeds. Runtime receives SELECT only; writes are denied.
- The current repository checks active membership in the requested Business and scopes rows to that Business. However, the schema introduces `visibility` and `verification_status` fields while the current read queries do not filter either field. The repository currently returns matching Business rows regardless of `private`/other visibility and verification state. The exact product visibility policy must be reconciled and enforced before exposing these read models. The disposable qualification validates grants/constraints/seeds, not these application authorization semantics.

**4 — `20261110140000_allow_pending_storage_object_cleanup`**
- Replaces the lifecycle constraint to allow deletion-pending rows with or without `available_at`, preserving the recorded timestamp.
- Replaces `ghm.storage_mark_deletion_pending(bigint)` with a SECURITY DEFINER function that accepts only an object ID and performs no actor, tenant, membership or signed provider-attestation check.
- It explicitly grants EXECUTE to `ghm_runtime`. This is a direct shared-runtime database authority path, not a signed gateway operation. The existing five-function storage finding remains open; the production read-only preflight confirms this migration is currently in PRE_MIGRATION state and found two pending/two deleted rows compatible with the new predicate.
- Do not apply migration 4 until the complete signed Storage Metadata Gateway/provider-attestation path is live and tested, and the separate five-function legacy grant cutover plus rollback are approved and rehearsed. The current gateway construction handover states the Resource API repository still invokes the legacy functions and no complete provider transition/cutover exists.

### Ordered-prefix decision

The first-four disposable qualification is useful test evidence, but the four migrations are **not approved as one production batch**:

1. Migration 2 needs an explicit decision on whether cross-account isolation is acceptable at the application layer for a shared runtime credential, or whether DB-level tenant enforcement is required.
2. Migration 3's visibility and verification semantics are not fully enforced by the current repository queries.
3. Migration 4 introduces/retains direct runtime execution of an actor-agnostic SECURITY DEFINER storage transition. This is a hard stop until the signed storage gateway and provider attestation cutover are complete.
4. The supplier write route and context-bound v2 SQL wrapper are not present in the currently deployed production Resource API/Actor Gateway topology (section 38).

Therefore do not set `GHM_PRODUCTION_MIGRATION_BATCH`, do not run `npm run migrate`, and do not treat the disposable first-four test as production authorization. If later execution gates are resolved, re-evaluate whether the first three can be qualified as a smaller contiguous prefix while migration 4 remains blocked; the runner's exact-prefix rule must be respected.

### Outstanding hard gates

- Fresh verified production backup and tested recovery point.
- Amanda/Render support resolution of the Dashboard-managed administrator membership and effective CREATEROLE/role grant authority; use the existing role-separation handover, do not improvise SQL revokes.
- Production Actor Gateway and Resource API route/service topology, credentials, signed assertion secret and end-to-end smoke tests.
- Complete signed Storage Metadata Gateway including provider-attested availability/deletion transitions; separately rehearsed five-function legacy storage grant cutover/rollback.
- Resolve onboarding direct-runtime tenant isolation and relationship/outcome visibility/verification semantics before treating migrations 2 and 3 as application-ready.

No production SQL, DDL/DML, ledger repair, grant/role change, secret, Render/Cloudflare configuration, deployment, or application data was changed during this review. Preserve the untracked local `.bak` file.



## 40. Correction: reconcile first-four findings with authoritative storage and tenant-isolation handovers (2026-11-15 23:58 UTC)

### Exact-head CI

- Commit `1755535a2377a2ef2ed42be13eb9e614759ccf2c` passed workflow #5033, run ID `43777265390`.
- Jobs `quality` and `web-quality` both completed SUCCESS.
- PR #285 remains open, draft and unmerged.

### Important correction to section 39 — storage gateway implementation status

Section 39's wording that the signed Storage Metadata Gateway/provider-attestation implementation is incomplete was too broad and conflicts with the authoritative `docs/HANDOVER_2026-11-12_STORAGE_METADATA_GATEWAY.md`. That storage handover is authoritative for storage implementation status and supersedes older historical paragraphs within itself.

The signed storage gateway source implementation **already exists and has been qualified on disposable PostgreSQL 18**:
- Actor v2 assertions cover pending creation, metadata read and deletion-pending request.
- Availability and deletion completion require the separate Resource API provider-workflow HMAC attestation, independently verified by PostgreSQL.
- Five signed database wrappers, Actor Gateway reader, HTTP routes, Resource API gateway client, fail-closed production mode and adversarial tests exist.
- The five-function legacy grant revocation and rollback have a localhost-only disposable rehearsal. It denies direct calls by runtime, migrator and Actor Gateway login during the rehearsal, verifies replacement wrapper grants, then restores original ACLs.
- This is not a production cutover. The five legacy grants remain in the production pre-cutover state. The external provider end-to-end deployed Resource API ↔ Actor Gateway ↔ PostgreSQL ↔ R2 journey remains outstanding and must use a dedicated non-production bucket; do not mutate `zaid-ghm-production`.

The new migration `20261110140000_allow_pending_storage_object_cleanup` modifies one of the legacy functions and grants its EXECUTE to `ghm_runtime`. This is an additional direct-call path to include in the same legacy storage grant review/cutover. The signed gateway wrapper can use the function under its SECURITY DEFINER owner context, but the direct runtime grant must not be treated as safe merely because the Resource API uses the gateway in production mode. Keep the five-function (and migration-4 ACL) production cutover blocked until the supported Render role authority, backup/recovery and deployed non-production end-to-end gates are satisfied.

The production Resource API source wiring was verified at this PR head:
- `src/http/app.ts` sets `storageMetadataGatewayRequired = config.isProduction || ...`.
- When production storage is enabled, startup requires `GHM_ACTOR_GATEWAY_URL` and `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET`.
- It constructs `HttpStorageMetadataGatewayClient` and injects it into storage routes.
- If the gateway is absent in production, the storage route fails closed (503); it does not silently fall back to `src/storage/repository.ts`.
- The deployed production runtime SHA `c7cf1eb...` is older than this source wiring, and no production service/secret deployment has been performed. Thus source implementation is present; live production deployment/readiness is not established.

### Migration 2 — onboarding tenant boundary: refine, do not overstate

The migration grants `ghm_runtime` table SELECT/INSERT/UPDATE and does not define RLS. The application repository scopes all reads/writes to the authenticated `context.userId`; HTTP input rejects account IDs, and the service requires authenticated context. The existing tenant-isolation qualification script demonstrates runtime role identity and tenant membership resolution through the application helper.

A direct SQL session using the shared `ghm_runtime` credential can query arbitrary account IDs because the database does not receive an independently authenticated per-request actor assertion for this table. This is a real limitation of the shared runtime credential boundary, but adding RLS without a non-forgeable database actor context would not by itself solve it. Do not add a caller-settable GUC and call that secure. Treat this as an explicit threat-model decision: either onboarding remains inside the trusted Resource API boundary with query-level account scoping, or a future signed database actor boundary is designed and qualified. Section 39's wording that this is automatically a production blocker is not a settled architecture decision.

### Migration 3 — relationship/outcome visibility: policy decision required

The current repository enforces active membership in the requested Business and scopes the query to that Business. The schema stores `visibility` and `verification_status`, but the current read query does not filter those fields. This is not yet proof of a cross-tenant disclosure: the endpoint is Business-member-only, and the intended semantics of `private`, `participants`, `authenticated`, `public`, and each verification state have not been established by the migration alone.

Before broadening this endpoint or treating the fields as enforcement, reconcile the product policy with the relationship/outcome governance contract. At minimum, document whether member-visible records may include unverified assertions, and whether a member of either participating Business can see records marked private. Add tests for the selected policy. Until then, keep the endpoint's existing active-membership gate and do not describe the schema fields as independently enforced access controls.

### Revised ordered-prefix decision

- Migration 1: function ACL/source contract is restricted; supplier write remains gated on the signed gateway and final context-bound wrapper sequence, plus production service deployment.
- Migration 2: application-level account scoping is implemented. Direct shared-runtime SQL is a known trust-boundary limitation requiring explicit architecture treatment; no superficial RLS/GUC patch.
- Migration 3: active Business membership is enforced in the repository; visibility/verification semantics need policy reconciliation before expanding exposure.
- Migration 4: signed storage gateway implementation is already present and disposable-qualified, but its new direct runtime grant and the legacy function grants still require the separate manual production ACL cutover. Deployed provider end-to-end validation is outstanding.

No migration batch is approved for production by this section. Keep `GHM_PRODUCTION_MIGRATION_BATCH` unset and do not run `npm run migrate`. The fresh verified production backup, Amanda/Render administrator-role separation, production Actor Gateway/Resource API deployment and secrets, dedicated non-production provider end-to-end test, and exact storage ACL cutover/rollback remain independent gates.

No production database, role/grant, secret, Render/Cloudflare setting, service, deployment, bucket, object, or application data was changed during this correction. Preserve the untracked local `.bak` file.



## 41. Next contiguous gateway/capability migration chain review (2026-11-16 00:12 UTC)

### Exact-head CI and PR state

- PR #285 remains OPEN, DRAFT and UNMERGED.
- Exact current head before this handover update: `7ba77c22577e7814f5872cb3b6f454ff8ca27b01`.
- CI workflow #5034, run ID `43777685857`, completed SUCCESS; `quality` and `web-quality` both passed.
- This confirms the correction in section 40. It does not qualify the next documentation commit until its own workflow completes.

### Migrations 5–14: governance and gateway foundation

Reviewed the next ordered migration files after the first four, through `20261110270000_gateway_business_profile_update`, plus the later signed-assertion migrations `20261111020000` and `20261111050000`–`20261111060000`.

**5 — `20261110160000_add_admin_capability_catalogue_governance`**
- Creates three SECURITY DEFINER catalogue mutation functions with a pinned `pg_catalog, ghm` search path, owner `ghm_schema_owner`, and explicit runtime EXECUTE grants.
- These legacy functions accept a caller-supplied account ID and independently check that it is an active admin/system admin. Because the shared runtime credential can invoke them directly, those grants are a known transitional actor-spoofing path; HTTP role checks do not protect direct SQL callers.
- This is not an unrecorded defect: the authoritative capability governance handover explicitly tracks it, the exact three signatures are in the reviewed runtime allow-list/manual-cutover group, and the separate manual cutover SQL revokes them from PUBLIC, runtime, migrator and gateway login.
- The signed capability gateway wrappers are added later and then upgraded to the v2 request-context-bound HMAC assertion. The disposable cutover qualification proves all three legacy runtime calls are denied while gateway list/create/update/transition still work. **Do not run the manual cutover in production until the gateway deployment and admin route end-to-end checks pass and the backup/Render role gates are cleared.**

**6 — `20261110210000_add_actor_gateway_principal_guard`**
- Fails closed unless the isolated `ghm_actor_gateway` LOGIN is NOINHERIT and has no superuser/createdb/createrole/replication/bypass-RLS attributes.
- The exact intended membership is one bounded administrative membership: `ghm_db_user` is a member of `ghm_actor_gateway` with ADMIN OPTION true, INHERIT false, SET false; no other membership involving the gateway is accepted.
- This resolves an important interpretation in the Render role discussion: the presence of the `ghm_db_user → ghm_actor_gateway` ADMIN OPTION membership is an intentional guard prerequisite, not by itself evidence of an unintended runtime inheritance path. Whether production currently matches the complete exact guard remains unverified; do not improvise a revoke. Follow Amanda/Render support and perform a read-only catalog check only after the backup/support gates are satisfied.
- The initial `assert_actor_gateway(bigint)` proves only the database login and active account. It is not sufficient actor identity proof by itself; later signed assertion migrations upgrade feature wrappers.

**7–8 — `20261110220000`, `20261110230000`, `20261110233000`**
- Add gateway-only actor self-identity read and Business registration identity read/write wrappers.
- Registration legacy RPC grants are intentionally retained during the staged API transition. The later signed assertion chain upgrades these wrappers to cryptographic actor proof.
- Migration 102330 also fixes the legacy registration upsert's ambiguous conflict target by naming its primary-key constraint. This is a functional SQL correction, not a new authority grant.

**9 — `20261110240000_enforce_capability_catalogue_cross_row_invariants`**
- Adds a SECURITY DEFINER trigger enforcing serialized hierarchy/cycle/replacement invariants and immutable published slugs. The trigger function is owned by schema owner, pinned search path, and EXECUTE revoked from PUBLIC/runtime/gateway. Trigger execution does not require application-role direct EXECUTE.
- The transaction-scoped advisory lock deliberately serializes hierarchy writes; review performance impact under expected catalogue write volume before future high-volume use, but it is an administrative low-frequency operation.

**10–11 — `20261110250000_add_gateway_capability_governance`, `20261110260000_gateway_supplier_classification_cutover`**
- Add gateway-only wrappers. At this intermediate stage the wrappers use the original login-only assertion and the legacy capability RPCs remain callable by runtime pending the manual cutover.
- Supplier legacy runtime EXECUTE is revoked by the supplier cutover migration; the signed wrapper is subsequently upgraded to v2 context-bound assertion.
- Do not deploy a Worker against the intermediate login-only interfaces. The final Worker/client and database wrappers must be released as a compatible v2 context-bound contract.

**12–14 — `20261110265000_reconcile_business_profile_legacy_contract`, `20261110270000_gateway_business_profile_update`, then signed binding migrations**
- Reconcile the profile function contract and add a gateway-only wrapper; the original runtime RPC remains until its separately governed cutover.
- `20261111020000` introduces the capability HMAC verifier, short-lived one-use nonce and signed capability operations.
- `20261111050000` upgrades actor identity and registration identity wrappers to signed assertions.
- `20261111060000` upgrades the assertion to v2 and binds the HMAC to canonical request context / exact operation arguments, including capability list/create/update/transition, supplier classification, Business profile, actor identity and registration read/write. The current Actor Gateway readers construct this v2 assertion. This is the final contract; do not expose intermediate wrapper overloads.

### Manual cutover evidence and limits

- Capability manual cutover file: `database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql`. It is deliberately outside `database/migrations`; it must remain a separately authorized manual operation after the API is deployed and verified.
- Its disposable qualification uses three distinct runtime, gateway and migrator connections on localhost `ghm_disposable_test`, applies the cutover, proves direct runtime and gateway calls to all three legacy functions are denied, proves signed gateway list/create/update/transition remain functional, and verifies effective runtime EXECUTE is false for legacy and gateway wrappers.
- The runtime privilege verifier explicitly models this as one of the independently qualified manual cutover groups (512 reviewed combinations across nine groups). Do not change the allow-list or treat the group as already cut over in production.
- The signed assertion secret is protected from runtime/gateway table reads; the gateway signs with its separately provisioned secret and PostgreSQL verifies it. The Worker must not receive the ES256 private key or issuer database credentials.

### Decision / next review boundary

The next contiguous migration chain has explicit gateway foundations and later signed wrappers, plus a separately rehearsed capability legacy-grant cutover. No new production-ready batch is established: the gateway deployment topology is still not qualified under the no-additional-spend constraint, the production backup/recovery point is missing, and Render-supported role authority remains unresolved. Keep all production batch input unset, do not run `npm run migrate`, and do not apply any manual cutover.

Next repository review should continue with the signed Business Capability mutation / Saved Business / Business Hours / Trust Score / Business Logo sequence and their separate runtime grant cutovers, without repeating already completed capability or storage work.

No production database, migration ledger, role/grant, secret, Render/Cloudflare resource, service, deployment, provider bucket/object or application data was changed during this review. Preserve the untracked local `.bak` file.



## 42. Signed Business Capability, Saved Business, Business Hours, Trust Score and Logo review (2026-11-16 00:17 UTC)

### Exact-head CI and PR state

- PR #285 remains OPEN, DRAFT and UNMERGED.
- Exact head reviewed: `34eaf87d706837377c78f63482879f7ec961906c`.
- CI workflow #5035, run ID `43779093006`, completed SUCCESS. Both `quality` and `web-quality` passed.
- This qualifies the section 41 documentation update and source snapshot reviewed here. No merge or production deployment.

### Shared signed-assertion contract

The feature migrations extend `ghm.assert_actor_gateway_capability` with a bounded operation allow-list, 60-second timestamp window, one-use nonce, constant-time HMAC comparison, active-account check and exact request-context binding. The verifier is SECURITY DEFINER with pinned `pg_catalog, ghm` search path, owned by `ghm_schema_owner`, revoked from PUBLIC/runtime/migrator and executable by `ghm_actor_gateway` only. Feature wrappers independently pin their search path, are schema-owner owned, and grant EXECUTE only to the gateway login.

The Resource API uses the matching HTTP gateway clients; production mode marks Saved Business, Business Hours, Trust Score and Business Logo gateway routes as required. Missing clients fail closed rather than using the legacy repository path. Storage startup separately requires the Actor Gateway URL and provider workflow attestation secret when production storage is enabled.

### Feature findings

**Business Capability and evidence — `20261111070000`**
- Signed wrappers cover assertion replacement, verification transition, evidence review and evidence submission. Context binds exact business/capability/evidence IDs, payload fields, status transition, decision and reason.
- Evidence submission additionally checks active Business membership and owner/administrator role in SQL. Verification delegates to the existing verifier-authority function, so a Business owner cannot self-verify.
- The disposable qualification applies the manual cutover and proves direct runtime calls, evidence INSERT/sequence access and runtime calls to the new gateway wrappers are denied; signed gateway flows pass; tampered payload, replay, actor/target substitution and non-management submission are denied.
- The cutover is separate: `database/cutovers/20261111030000_revoke_legacy_business_capability_runtime_mutations.sql`. It removes legacy mutation function EXECUTE and direct evidence INSERT/sequence privileges. Not applied to production.

**Saved Business — `20261111100000`**
- Signed list/get/create/delete wrappers bind account ownership to the signed actor; get/list are account-scoped and create/delete delegate to existing owner-bound functions.
- The disposable qualification verifies three distinct database identities, direct runtime table/column reads, legacy RPCs and sequence are denied after cutover; signed CRUD passes; cross-account access, actor substitution, request-target substitution and replay are denied.
- Manual cutover `database/cutovers/20261111110000_revoke_legacy_saved_business_runtime.sql` revokes table/column privileges, sequence usage and legacy function grants. It also removes the legacy functions' grant to the gateway login so only signed wrappers remain.

**Business Hours — `20261111130000` and `20261111140000`**
- Signed replacement binds the Business ID and complete hours payload. Signed read requires an active Business membership; public projection returns hours only for active, approved, verified Businesses.
- The legacy replacement function itself checks active owner/administrator membership and validates JSON payload before replacing the rows.
- Manual cutover `database/cutovers/20261111130000_revoke_legacy_business_hours_runtime.sql` revokes legacy replacement, direct table SELECT and sequence access. The disposable qualification is localhost-only with separate runtime/gateway/migrator identities and tests signed read/write, cross-Business and assertion denial paths.
- The public SQL projection returns the composite `business_hours` row; retain the existing API DTO boundary and do not expose raw DB rows directly.

**Trust Score — `20261111150000` and `20261111170000`**
- Signed calculation binds Business ID and delegates to the existing owner/administrator-authorized calculator.
- Signed get/list permit public results only for active, verified, approved Businesses; private results require active owner/administrator membership. Public get/list SQL projections apply the same active/verified/approved predicate.
- Manual cutover `database/cutovers/20261111150000_revoke_legacy_trust_score_runtime.sql` revokes legacy calculator, direct table SELECT and sequence access while retaining the two constrained public projection functions for runtime.
- Disposable qualification checks private/public separation, actor and target substitution, replay, runtime denial and exact post-cutover ACL matrix.
- As with Business Hours, SQL functions return the table composite type. Preserve API response mapping and avoid exposing raw database rows as a public contract.

**Business Logo — `20261111160000`**
- Signed binding binds Business ID and storage object ID. The underlying SECURITY DEFINER function verifies active owner/administrator membership, locks the Business row, and requires the object to match that Business's tenant, resource type/ID, `business_logo` class, public visibility and available status.
- The public logo getter joins on the same tenant/resource/object-class/visibility/availability constraints and only exposes active, approved, verified Businesses.
- Manual cutover `database/cutovers/20261111160000_revoke_legacy_business_logo_runtime.sql` revokes the old caller-supplied-account-ID binding function from runtime.
- Disposable qualification proves runtime denial, signed bind/unbind, cross-Business object denial, actor/target substitution, replay, public projection and exact ACLs.

### Important release boundary

These migrations add signed gateway entry points but deliberately retain legacy runtime grants until their corresponding separate cutovers. Passing disposable cutover qualification does not mean those cutovers have happened in production. The production Resource API source is gateway-required, but the deployed production runtime SHA remains older than this integration and no live end-to-end gateway deployment is proven.

Do not apply any of the five manual cutovers until the compatible Resource API and Actor Gateway release is deployed and end-to-end qualified, the signed assertion secret and database principal are correctly provisioned, a fresh verified backup/recovery point exists, and Render support resolves the production role-authority question. Keep the production migration batch unset and do not run `npm run migrate`.

### Next review boundary

Continue through the ordered authentication and identity hardening migrations beginning `20261111210000`, including recovery-token, QuoteFlow provisioning and runtime entry-point revocations. Reconcile each automatic migration with its separate cutover/rollback and existing issuer handover; PayFast remains paused and out of scope.

No production database, migration ledger, role/grant, secret, Render/Cloudflare setting, service, deployment, provider bucket/object or application data was changed. Preserve the untracked local `.bak` file.



## 43. Authentication lifecycle and QuoteFlow reset authority migration review (2026-11-16 00:23 UTC)

### Exact-head CI and PR state

- PR #285 remains OPEN, DRAFT and UNMERGED.
- Exact source/handover head reviewed: `1e0f440fae24c283ff6064c08b1e2b5f3cabb224`.
- CI workflow #5036, run ID `43779637883`, completed SUCCESS; both `quality` and `web-quality` passed.
- This qualifies section 42's documentation update and the reviewed source snapshot. No production migration, service or cutover.

### Migrations 21–26: direct identity and auth entry-point removal

**21 — `20261111210000_revoke_runtime_account_external_identity_table_access`**
- Removes all direct runtime privileges on `account_external_identity` and its sequence.
- Preserves narrow SECURITY DEFINER identity lookup/link/bootstrap/provision functions for a staged transition. Subsequent migrations revoke runtime EXECUTE on provisioning, link and bootstrap individually.
- This is a staged authority reduction, not a complete identity cutover by itself. The runtime retains only the explicitly intended mapping lookups after the full issuer and Actor Gateway cutovers; Connect Business mapping creation is separately moved to signed Actor Gateway provisioning.

**22 — `20261111220000_revoke_unused_auth_runtime_entry_points`**
- Removes runtime/PUBLIC EXECUTE on legacy session revoke, password change and account-disable functions that are not part of the supported Resource API route contract.
- Keep these disabled; do not restore them as a workaround for issuer deployment.

**23 — `20261111230000_add_token_bound_recovery_revocation_result`**
- Adds an internal SECURITY DEFINER recovery redemption routine keyed by a 32-byte token hash, atomically consumes one unexpired unused token and revokes that account's sessions; returns the account and revoked-session count.
- The externally granted compatibility wrappers are token-bound (no caller-supplied account ID), but this is a transitional Resource API runtime grant. The final Authentication Issuer allow-list does not include either `auth_redeem_recovery` wrapper; no application persistence callsite for these wrappers was found in the reviewed source. Do not add them to the issuer allow-list merely because the migration creates them. The supported password reset route uses migration 1202's combined token-bound reset operation.
- Migration also revokes the caller-supplied-account-ID all-session revocation wrapper from runtime.
**24–26 — `20261111240000`, `20261111250000`, `20261111260000`**
- Revoke runtime/PUBLIC EXECUTE on QuoteFlow migration account provisioning, external identity linking and external identity bootstrap, respectively.- Provisioning remains an operator/migrator capability. Identity link/bootstrap are not ordinary Resource API runtime operations; Business provisioning is through the signed Actor Gateway transaction.
- These are forward-only privilege reductions in the ordered migration chain; do not restore old runtime function grants to get an older API artifact working.

### Migrations 1202–1204: token-bound recovery and operator-only enrollment

**1202 — `20261112020000_add_token_bound_password_recovery_reset`**
- The reset function requires a 32-byte token hash, normalized login email and non-empty new password hash.
- It locks and validates one unused, unrevoked, unexpired recovery token; requires an active account and active credential whose normalized login email matches; excludes accounts with a `reset_required` QuoteFlow migration enrollment; consumes the token, updates only the password hash and Argon2 parameters, and revokes all sessions in the same transaction.
- It preserves the existing login email and returns account ID plus revoked-session count. EXECUTE is granted to runtime only as a staged pre-issuer state; the issuer cutover later revokes runtime and grants this function to the issuer.
- This is the supported token-bound reset path. The HTTP/application layer hashes the supplied password and opaque token before invoking SQL.

**1203 — `20261112030000_add_conditional_password_rehash`**
- Performs an optimistic compare-and-swap: it updates an active account's hash only if the stored hash still equals the exact hash the login flow verified. This prevents a stale login from overwriting a concurrent reset/change.
- The SQL function accepts an account ID, so it is safe only behind the trusted Authentication Issuer login path after cutover; it must not be exposed as a general caller-controlled runtime authority. Its staged runtime grant is removed by the issuer manual cutover, which grants the exact function to `ghm_auth_issuer`.

**1204 — `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration`**
- Removes PUBLIC/runtime EXECUTE on enrollment registration. Recording approved migration provenance remains a migrator/operator action.
- The issuer may look up and complete an already-approved enrollment through its separate allow-list; it cannot create or modify the approval provenance.

### Authentication Issuer cutover — source and disposable evidence versus production state

Reviewed:
- `database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql`
- `scripts/qualify-auth-issuer-cutover.mjs`
- `src/auth-issuer/database-privileges.ts`
- `src/auth-issuer/database-principal.ts`
- `docs/architecture/AUTH_ISSUER_CUTOVER_AND_ROLLBACK_RUNBOOK.md`

The manual cutover is deliberately outside the automatic migration chain. It checks `session_user=ghm_migrator`, `current_user=ghm_schema_owner`, validates the isolated issuer LOGIN/NOINHERIT and bounded Render administrator membership exception, clears accidental issuer relation/sequence/function grants, revokes runtime auth lifecycle EXECUTE and grants the exact ten-function issuer allow-list. The issuer receives schema USAGE but no schema CREATE or direct relation/sequence privileges. Resource API runtime is expected to retain exactly two external identity/mapping lookup functions. The cutover also revokes direct application execution of the Business external mapping-link helper, which is now called only inside signed Actor Gateway provisioning.

The disposable qualification exercises separate runtime, issuer, Actor Gateway and migrator connections, exact allow-lists, default function ACLs, PUBLIC/runtime/unexpected-role EXECUTE denial, lifecycle and runtime denials, and rollback. This is strong source/isolated test evidence only. The authoritative runbook states:
- no production `ghm_auth_issuer` role exists and no issuer service is deployed;
- no production issuer secret, route or client origin has been configured;
- GHM Internal Runtime remains on main with auto-deploy OFF;
- QuoteFlow native app needs a reachable HTTPS issuer origin; Connect native bearer calls require exact CORS origin handling; a private-only Render issuer would not satisfy those clients;
- the current issuer has no recovery email delivery adapter; generic password recovery and QuoteFlow migration-reset recovery intentionally fail closed with 503 until approved delivery exists;
- current external DB TLS mode encrypts but disables certificate verification; internal mode is acceptable only on a verified private same-region path;
- client compatibility, signing-key overlap, refresh pepper continuity and exact rollback artifact must be proven before cutover.

Do not apply the issuer manual cutover. It would remove Resource API auth lifecycle calls and break registration/login/refresh/logout/reset if traffic is not already routed to the deployed issuer. No issuer role, service, secret, network setting or client configuration has been created in production.

### Release decision and next review boundary

- Migrations 21–26 and 1202–1204 are a coherent staged reduction of legacy authentication and QuoteFlow operator authority, not an independently executable production batch.
- Keep the issuer manual cutover separate from migrations and blocked until an issuer service is actually deployable within the existing no-additional-spend constraint, reachable by GHM web/Connect/QuoteFlow over reviewed HTTPS, and passes full client lifecycle tests.
- Recovery delivery remains a distinct functional blocker; do not claim password recovery is end-to-end ready.
- Fresh verified production backup/recovery, Amanda/Render role authority and membership reconciliation, TLS/network design, compatible Actor Gateway/issuer deployment, secret/key continuity, client origin configuration and rollback remain mandatory gates.
- Continue the next ordered migration review after `20261112040000`, reconciling each automatic migration with its existing manual cutover, runtime allow-list state and application callsites. Do not repeat issuer/storage/capability cutover qualification already recorded.
- Keep `GHM_PRODUCTION_MIGRATION_BATCH` unset; do not run `npm run migrate` and do not execute any manual cutover.

No production database, migration ledger, role/grant, secret, Render/Cloudflare setting, service, deployment, routing, client configuration or application data was changed during this review. Preserve the untracked local `.bak` file.



## 44. Default ACL, Connect provisioning, SECURITY DEFINER and provider-attestation chain review (2026-11-16 00:29 UTC)

### Exact-head CI and PR state

- PR #285 remains OPEN, DRAFT and UNMERGED.
- Exact source/handover head reviewed: `097da6fb92da879fee4469b9ee587bb0c548ee80`.
- CI workflow #5037, run ID `43780194969`, completed SUCCESS. Jobs `quality` and `web-quality` both passed.
- This qualifies section 43's handover update and the source snapshot reviewed here. The new section 44 commit still needs its own CI.

### Migrations 1205, 1207–1209 and 1214–1217

**1205 — `20261112050000_revoke_public_default_function_execution`**
- Changes global default privileges for functions created by `ghm_schema_owner`, revoking PostgreSQL's default PUBLIC EXECUTE. This is intentionally global for that owner, not limited to schema `ghm`; per-schema REVOKE cannot cancel a global default grant.
- The matching contract test verifies the global (no `IN SCHEMA ghm`) behavior. The Authentication Issuer and Actor Gateway startup ACL verifiers inspect both global and GHM-schema function defaults and reject unexpected executable defaults. The disposable issuer qualification installs and removes unsafe default probes.
- This is a broad forward-looking privilege policy. Any future function created by `ghm_schema_owner` must receive explicit intended role grants. Do not silently re-add PUBLIC EXECUTE to make a new function work.

**1207 — `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads`**
- Removes PUBLIC, runtime, migrator and Actor Gateway EXECUTE from the unsigned `assert_actor_gateway(bigint)` overload. Current signed typed operations must use the context-bound HMAC assertion. Keep the old overload owner-controlled only.

**1208 — `20261112080000_signed_connect_business_provisioning_gateway`**
- Adds `business.connect.provision` to the signed operation allow-list and a schema-owner-owned SECURITY DEFINER wrapper that binds the external Connect Business UUID, name and derived slug to the assertion.
- The database transaction takes an advisory lock keyed by provider + external UUID, resolves an existing mapping without relinking, or atomically creates the canonical Business, active owner membership and `supabase` external mapping. It requires an active authenticated business/admin actor and validates UUID/name/slug. Mapping-link failure rolls back the Business and membership; no name/email/slug inference is used.
- The Actor Gateway Express app has `POST /v1/connect/businesses/provision-or-resolve`, authenticates the ES256 bearer once, derives actor from the verified subject and rejects extra caller-supplied identity fields. The Worker injects `PostgresConnectBusinessProvisioningReader`; the reader signs the exact request context and invokes the database wrapper. Unit/HTTP contract tests cover verified actor, invalid input and membership denial. The HTTP Resource API gateway client exists, but this review did not find a production Connect route integration/cutover; this remains a separate product-adapter deployment task, not permission to switch Connect production.
- The legacy mapping-link helper is revoked from PUBLIC/runtime/migrator/Actor Gateway direct EXECUTE; the SECURITY DEFINER wrapper invokes it under its owner context.
- The original construction contract and qualification explicitly prohibit treating the fixed `supabase` provider key as active Supabase Auth or as authorization to cut over Connect. Existing production mapping populations and product routing remain untouched.

**1209 — `20261112090000_pin_security_definer_search_path`**
- Preflights that every GHM SECURITY DEFINER function is owned by `ghm_schema_owner`; otherwise the migration aborts.
- Sets every GHM SECURITY DEFINER function to `pg_catalog, ghm, pg_temp`, explicitly placing temporary schema last to prevent caller-created temporary objects shadowing privileged references. A contract test verifies both owner preflight and exact path.
- This is a broad one-time hardening migration; inspect its exact production inventory before execution and do not assume a successful disposable run proves every production function has the expected owner.

**1214 — `20261112140000_add_signed_storage_metadata_actor_gateway`**
- Extends the v2 signed operation allow-list and adds gateway-only actor-bound create/read/deletion-pending wrappers. Creation validates Business Logo metadata and active owner/administrator membership; read enforces public active Business Logo or active Business membership; deletion-pending requires active owner/administrator membership.
- Provider-confirmed `mark_available` and `mark_deleted` are deliberately not completed by this migration; they are added in 1215 with a separate proof. The new wrapper does call the existing deletion-pending helper under SECURITY DEFINER owner context; production direct runtime EXECUTE on the legacy helper remains part of the outstanding ACL cutover.

**1215 — `20261112150000_add_storage_provider_workflow_attestation`**
- Creates separate 32-byte provider-attestation secret and one-use nonce tables, inaccessible to PUBLIC/runtime/Actor Gateway/migrator direct table privileges.
- Adds a separate HMAC domain, short validity window, replay protection and exact stored-metadata context checks. Availability and deletion completion require BOTH the signed user actor assertion and a provider workflow attestation; the provider verifier is callable only under Actor Gateway database session context.
- The disposable qualification script refuses non-localhost databases, requires three distinct runtime/gateway/migrator connections, explicit mutation opt-in and both secrets. It tests legitimate lifecycle, actor and provider proof, replay, expiry, invalid signature, context substitution, cross-Business actor, wrong state, metadata mismatch and effective ACLs. This is a disposable PostgreSQL qualification, not an external provider/R2 end-to-end deployment test and not production secret provisioning.

**1216 — campaign/directory-review gateway manual cutover**
- `database/cutovers/20261112160000_campaign_directory_review_actor_gateway.sql` is a separately coordinated manual cutover, not an automatic migration. It extends the signed operation allow-list, creates gateway wrappers for campaign create/update and owner directory-review presentation, and revokes legacy runtime function EXECUTE.
- Matching rollback `database/cutovers/20261112161000_campaign_directory_review_actor_gateway_rollback.sql` restores legacy runtime grants and removes gateway EXECUTE. Both require `session_user=ghm_migrator` and `current_user=ghm_schema_owner`. The source has HTTP route tests for verified actor derivation and caller-supplied actor rejection.
- The manual cutover comment explicitly requires old Resource API instances out of traffic before committing. It has not been applied to production.

**1217 — `20261112170000_revoke_redundant_migrator_business_mapping_lookup`**
- Removes the redundant `ghm_migrator` EXECUTE grant on the Business external mapping lookup; the Connect commercial preparation route continues to use the intended `ghm_runtime` grant. This does not remove the runtime route's required lookup.

### Release and execution boundary

- The source has a coherent Connect provisioning gateway route and Worker wiring, but this does not establish that the Worker or the Resource API client is deployed or that Connect production uses the route.
- The signed storage provider proof has local disposable qualification, but no deployed provider end-to-end test against a dedicated non-production bucket is established by these artifacts.
- The campaign/directory-review grant cutover is a separate manual operation with a rollback; do not execute it before compatible Worker/Resource API release and traffic drain.
- Migration 1209 must be run only after production ownership preflight can be performed safely and the exact production SECURITY DEFINER inventory is understood.
- The no-additional-spend gateway topology, verified production backup/recovery, Amanda/Render administrator-role authority and exact role ACL reconciliation remain unresolved. No production credentials, service or deployment should be improvised.
- Keep `GHM_PRODUCTION_MIGRATION_BATCH` unset. Do not run `npm run migrate`, do not apply manual cutovers, and do not change production Connect routing.

### Next review boundary

The current repository migration inventory ends at `20261112170000` in this snapshot. Before proceeding further, compare the exact PR head migration tree, migration ledger inventory and handovers/PRs/branches again; do not invent a next migration or create duplicate work. The next useful work is a consolidated readiness/compatibility matrix for the existing Actor Gateway + Resource API + Auth Issuer release under the user's no-extra-paid-service constraint, followed by exact production read-only role/backup evidence only when support and backup prerequisites allow it.

No production database, migration ledger, role/grant, secret, Render/Cloudflare setting, service, deployment, bucket/object, Connect routing or application data was changed during this review. Preserve the untracked local `.bak` file.



## 45. Consolidated production release-readiness matrix (2026-11-16 00:36 UTC)

### Exact-head CI and PR state

- PR #285 remains OPEN, DRAFT, mergeable and UNMERGED.
- Exact reviewed head: `9abcd5bc21266e8e2f0c9e9a31d6090e706e0a05`.
- GitHub Actions CI run #5038, run ID `43780844068`, completed SUCCESS. `quality` and `web-quality` both passed.
- This matrix is a documentation/readiness artifact, not production approval. The new section 45 commit requires its own CI status check.

### Release matrix — source qualification is not production readiness

| Component / boundary | Current evidence | Production state / blocker | Disposition |
|---|---|---|---|
| Resource API — GHM Internal Runtime | Mainline source includes gateway-required storage configuration and gateway clients. A manual build using `npm ci --include=dev && npm run build` succeeded in the prior deployment attempt. | Current live deployment remains `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`. The later build `fe5a82d856f8733d0094e7d4599733da93537719` failed at startup because production storage requires `GHM_ACTOR_GATEWAY_URL`; auto-deploy remains OFF. | Do not deploy again or add a dummy URL. The gateway must be genuinely reachable and qualified first. |
| Actor Gateway application / Cloudflare Worker | Unified gateway code, signed feature readers, Worker adapter, startup principal/ACL checks, body limits and rate limiting pass exact-source disposable CI and local Wrangler/Workerd smoke. | No production Worker deployment, production route/domain, Tunnel, VPC Service or Hyperdrive configuration. Wrangler Hyperdrive ID is all-zero placeholder; `workers_dev=false`; no deployment workflow. | Source is qualified; production service is NOT deployed. Do not guess URL or replace placeholder. |
| Actor Gateway database principal | Disposable PostgreSQL enforces the bounded `ghm_actor_gateway` principal, exact function allow-list and zero direct relation/sequence access. | Production lacks the complete current gateway schema/function state; the existing app identity has broad effective role authority. Fresh production role/ACL proof and Render-supported authority correction are outstanding. | No role/grant changes until Amanda/Render-supported plan and backup gates clear. |
| Authentication Issuer | Isolated issuer code and ten-function database allow-list pass disposable cutover, lifecycle, rollback and SECURITY DEFINER inventory qualification. | No production `ghm_auth_issuer` role or deployed issuer service. Cloudflare Workers Free Argon2id feasibility failed the GHM password-hashing CPU budget; do not weaken Argon2id. No qualified $0 compute/hosting path is established. | Do not deploy issuer on Cloudflare Workers or co-host it without a new, proven isolation and performance design. |
| Password recovery / QuoteFlow reset recovery | Token-bound reset completion and session revocation are qualified. | No recovery email delivery adapter. Recovery initiation deliberately returns HTTP 503. | Functional go-live blocker; no paid provider or new service without separate owner decision. |
| Connect | Signed Business provisioning gateway and Resource API clients exist; source-level tests cover actor derivation and atomic provisioning. | No production Actor Gateway origin or proven deployed route; Connect browser/native origin/CORS and end-to-end client compatibility not yet verified against a live issuer/gateway. | Keep Connect production routing/cutover disabled until HTTPS endpoints and full client journeys pass. |
| QuoteFlow | Issuer migration-reset completion and standard login/session issuance are source/disposable qualified. | Native app requires a reachable HTTPS issuer origin; recovery initiation is unavailable (503); issuer not deployed. | Do not enable QuoteFlow issuer migration/Gate A or change app endpoints yet. |
| Storage provider / metadata | Signed storage metadata gateway and separate provider HMAC attestation pass disposable PostgreSQL qualification; API startup explicitly requires gateway URL and provider attestation secret when production storage is enabled. | No production gateway endpoint, Hyperdrive, provider attestation secret or end-to-end bucket/provider proof. The current production startup failure is consistent with this missing dependency. | Keep storage-enabled deployment blocked; do not disable storage or bypass the gateway guard. |
| Database recovery / migration authority | Read-only production migration audit and first-four-migration structural preflight were previously completed. Bounded runner requires an explicit exact next-prefix batch of at most five. | Fresh verified production backup/restore point remains missing; 4-Nov archive is stale for subsequent role work. Full production migration ledger/ownership/ACL authority and Render role-admin issue remain unresolved. | No production DDL, migration batch or manual grant cutover. Keep `GHM_PRODUCTION_MIGRATION_BATCH` unset. |
| Network / TLS | Cloudflare Workers VPC + Hyperdrive + Tunnel is a documented private-network candidate; VPC is currently described as free during beta. | It still requires a continuously available tunnel host. No eligible isolated always-on host exists. Existing Render web services are Free and not production-qualified; public DB allowlist `0.0.0.0/0` is not approval for public Hyperdrive ingress. | No Tunnel/VPC/Hyperdrive provisioning or DB allowlist change. Laptop/mobile are not a production always-on connector-host solution. |
| Render administration | Amanda's guidance: retain Dashboard-managed admin; use SQL-created restricted service logins; keep `ghm_runtime` and `ghm_migrator` separate; preserve SET-only schema-owner path. | Production role-administration / effective membership authority remains unresolved with Render support. The intended Actor Gateway exception is only `ghm_db_user` member of `ghm_actor_gateway` with ADMIN=true, INHERIT=false, SET=false; this does not excuse broad app-role administration. | Do not improvise REVOKE/GRANT or role membership changes. Obtain supported remediation and re-check live catalog read-only. |

### Deployment topology decision under current cost and device constraints

The Actor Gateway Worker source can run on Cloudflare, but it needs a private database path through Hyperdrive/VPC and a continuously running tunnel agent. The current Render production API is a Free web service that sleeps/restarts and is not an approved isolated tunnel host. The other existing production Free service is a separate application and is not available to repurpose. Sandbox/qualification services are excluded. No existing user-controlled device is approved as an always-on production connector host; the laptop is not continuously available, and the phone is not a supported private-network database tunnel host.

The isolated Authentication Issuer has a separate compute problem: the Worker Free Argon2id benchmark did not meet GHM's current password-hashing CPU budget. Combining it with the Actor Gateway Worker or weakening Argon2id would collapse security boundaries or reduce password security. Do neither. No additional paid service, Render plan, database, schedule, or other recurring cost is authorized by this matrix.

**Decision: NO-GO for production gateway/issuer rollout under the currently evidenced zero-additional-cost resources.** This is a concrete resource/architecture constraint, not a missing code task. Do not create resources or alter production to experiment.

### Required dependency order if a viable host/compute path is later established

1. Obtain a fresh production backup and independently verify restore/recovery. Preserve the 4-Nov archive as historical only.
2. Resolve Render role-admin and membership authority through Amanda/Render support. Reconcile `ghm_runtime`, `ghm_migrator`, `ghm_schema_owner`, `ghm_db_user`, `ghm_actor_gateway` and `ghm_auth_issuer` against the current source guard with read-only catalog evidence before mutation.
3. Confirm the production migration ledger, exact pending prefix and ownership/default-ACL/SECURITY DEFINER inventory through the authorized migrator path. Do not use the app identity as migration authority.
4. Prove a no-cost, always-available, isolated private DB connector host and a separate issuer compute path that preserves Argon2id. If no such resources exist, stop and present the cost/availability trade-off to the owner; do not silently create paid infrastructure.
5. Qualify non-production VPC/Hyperdrive/Tunnel connectivity with certificate verification, least-privilege database credentials, exact startup ACLs, failure/retry behavior and secret separation. Independently qualify issuer startup and client reachability.
6. Deploy compatible gateway and issuer artifacts only after the previous gates. Verify HTTPS health/readiness plus authenticated positive and negative business operations; verify registration, login, refresh rotation, logout, password reset, Connect Business provisioning and QuoteFlow migration completion from real test clients.
7. Implement and verify approved recovery delivery before advertising recovery. Then configure the existing Resource API with the exact observed gateway origin and provider attestation secret, and manually deploy with auto-deploy OFF.
8. Only after live compatibility and backup/rollback rehearsal, execute production migrations in exact contiguous batches of at most five; perform each manual legacy-grant cutover separately after its corresponding gateway route is live and verified. Capture before/after ACLs and ledger state for every batch.

### Immediate next action

The only safe next work while the no-go gates remain is repository/source and evidence reconciliation: check the current main/PR/branch/handover state, compare the remaining pending migrations with existing feature cutovers, and prepare exact read-only production evidence requests for the backup and Render role-authority issues. Do not create another implementation branch or duplicate Actor Gateway/issuer PRs. Do not run `npm run migrate`, apply manual cutovers, create Cloudflare resources, alter Render configuration, set production secrets, change client origins, or trigger a production deploy.

PayFast remains paused until sandbox access returns. Legal-document work remains paused. No production database, migration ledger, role/grant, secret, Render/Cloudflare resource, service, deployment, network allow-list, route, product client or application data was changed during this matrix review. Preserve the untracked local `.bak` file.

## 46. Current PR head, exact-head CI and branch reconciliation (2026-11-16 00:55 UTC)

### Exact GitHub state rechecked before continuation

- PR #285 is OPEN, DRAFT, mergeable and UNMERGED.
- The source head reviewed before this handover-only update was `d8b986412106b09ffd1e9d123722856a845b3967` on `feat/production-migration-batch-execution-20261115`; base `main` is `61cd1121a1fb30e3b28c250b7b6812707f1c9109`.
- That source head compared as 103 commits ahead, 0 behind, with current main as merge base. The PR's actual diff remains 15 intended files; the 103-commit ancestry is not 103 changed files.
- Exact-head GitHub Actions workflow #5039, run ID `43781450072`, completed SUCCESS on `d8b9864`. Both `quality` and `web-quality` passed. This supersedes the section 45 checkpoint (head `9abcd5b`, workflow #5038) for the source snapshot.
- This section was then appended as a handover-only commit `c219ba2c2e33678aa533cf15d9f76257e8c8ea22`, which is now the PR head. Its exact-head CI run has not yet been returned by GitHub and remains unverified; do not call the handover update CI-qualified until that run is confirmed.
- PR #285 remains unmerged and draft. The successful Cloudflare Pages preview comment is a PR preview only, not a production Actor Gateway deployment or database connectivity proof.

### Migration inventory and review boundary

- The PR's `config/pending-migrations.production.json` still contains the exact 42-entry production pending inventory ending at `20261112170000_revoke_redundant_migrator_business_mapping_lookup`.
- The reviewed migration source for 1205, 1207, 1208 and 1209 matches the findings recorded in section 44. The storage chain 1214–1215 and manual campaign/directory-review cutover 1216 are already documented there; do not duplicate their implementation or treat the manual cutover as an automatic migration.
- Migration 1208's signed Connect provisioning route and Worker reader exist in source, but no production Connect Resource API route integration/cutover was established in the reviewed source snapshot. Keep Connect routing unchanged.
- The 42-entry list is an inventory reconciliation, not permission to execute. Keep `GHM_PRODUCTION_MIGRATION_BATCH` unset and do not run `npm run migrate`.

### Next repository-only work

1. Continue the exact file-by-file review of the pending migration chain against the existing Resource API, Actor Gateway, Authentication Issuer and QuoteFlow callsites; prioritize migrations whose revocations would change live application behavior.
2. Reconcile the remaining manual cutovers and rollback scripts with their exact traffic-drain and route prerequisites; do not repeat already qualified gateway/issuer/storage implementation.
3. Keep the production rollout NO-GO under the existing no-additional-cost host/compute constraints. No new branch, paid service, Cloudflare resource, Render setting, secret or production deployment is authorized by this review.
4. Only request new production evidence when it is read-only and can be obtained through the already supported credential/backup process. Do not attempt role changes or ledger repair.

No production database query/mutation, migration, ledger repair, role/grant change, secret, Render/Cloudflare configuration, service, deployment, bucket/object, product routing or application data was changed during this continuation. Preserve the local untracked `.bak` file.

## 47. First-prefix and capability cutover source reconciliation (2026-11-16 01:05 UTC)

### Exact PR-head CI confirmation

- PR #285 head remains `273d368dea2226beba70bab62caabfcca96e24d7`, OPEN, DRAFT and UNMERGED.
- Exact-head CI workflow #5041, run ID `43783331896`, completed SUCCESS. Both `quality` and `web-quality` passed.
- This confirms the Section 46 handover correction commit is CI-qualified. No source or production change was included in this continuation.

### Migration 1 — supplier classification: reconcile an earlier handover discrepancy

Direct inspection of `database/migrations/20261110010000_add_business_supplier_classification.sql` confirms the current PR-head SQL:
- creates the descriptive `ghm.business.is_supplier` column;
- creates the SECURITY DEFINER legacy implementation with pinned `pg_catalog, ghm` search path and active owner/administrator membership check;
- explicitly revokes all function privileges from PUBLIC, `ghm_runtime` and `ghm_migrator`; it does NOT grant runtime EXECUTE.

Some earlier provisional handover wording described this migration as granting `ghm_runtime` EXECUTE. That wording is inaccurate for the current exact PR-head file and is superseded by this direct source inspection and the later detailed source review in this handover. The runner's exact-version post-batch runtime REVOKE therefore repeats an already-present revocation for the current SQL. It is idempotent and fail-closed, but redundant for this exact migration file. Do not change the historical migration or runner as part of this review; any cleanup would need a separate checksum/runner/test impact review.

### Migration 5 — capability governance: confirmed manual cutover hard stop

Direct inspection confirms:
- `20261110160000_add_admin_capability_catalogue_governance.sql` creates three schema-owner-owned SECURITY DEFINER functions that accept caller-supplied account IDs and grants EXECUTE to `ghm_runtime`. This is the known shared-runtime actor-attribution exposure; application HTTP role checks do not independently constrain direct SQL callers.
- `20261110250000_add_gateway_capability_governance.sql` adds gateway wrappers but explicitly leaves the legacy runtime grants in place pending a separate API cutover.
- Signed, request-context-bound gateway wrappers are added/qualified later in the chain; their existence does not revoke the three legacy RPC grants.
- The existing manual cutover is `database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql`. Its header requires deployed Actor Gateway, configured `GHM_ACTOR_GATEWAY_URL`, and end-to-end verified capability administration routes. It revokes the three legacy functions from PUBLIC, runtime, migrator and gateway login.
- Existing disposable qualification `scripts/qualify-capability-governance-cutover-postgres.mjs` applies that manual cutover on localhost-only disposable PostgreSQL, proves direct legacy calls are denied for runtime and gateway, and proves signed gateway list/create/update/transition still work.

### Operational consequence

- Migration 5 is an explicit stop boundary, not a routine next batch. The production runner only permits a contiguous pending prefix, so later migrations cannot be selected while migration 5 remains pending.
- Do not automatically add its REVOKEs to the migration runner or convert the manual cutover into an automatic migration. That would bypass the documented API traffic cutover sequence.
- No capability manual cutover has been applied to production. No production Actor Gateway URL or compatible live route is established. The capability cutover therefore remains blocked by the existing Section 45 NO-GO decision and its backup/Render role-authority gates.
- Migrations 1–3 remain subject to their individual disposable qualification and production backup/role gates. Migration 4 remains the separate storage-gateway hard stop already documented. Nothing in this review authorizes production execution.

No production query or mutation, migration, ledger repair, grant/role change, secret, deployment, service/configuration change, or application routing change was performed. The local untracked `.bak` file remains protected.

## 48. Registration identity and capability-chain compatibility review (2026-11-16 01:08 UTC)

### Migrations 10230000–10270000

- `20261110230000_add_gateway_business_registration_identity_read` adds a gateway-only read wrapper while explicitly retaining the existing Resource API runtime RPC pending a separate API cutover.
- `20261110233000_add_gateway_business_registration_identity_write` fixes the legacy write function's ambiguous `ON CONFLICT (business_id)` target by using the named primary-key constraint. It deliberately retains the legacy runtime EXECUTE grant and adds a gateway wrapper; therefore the gateway wrapper's presence alone is not a completed application cutover.
- `20261110240000_enforce_capability_catalogue_cross_row_invariants` installs a SECURITY DEFINER trigger for hierarchy and replacement invariants, with schema-owner ownership and direct EXECUTE revoked from PUBLIC/runtime/gateway. Trigger execution is not dependent on application-role EXECUTE.
- `20261110250000_add_gateway_capability_governance` adds gateway wrappers but deliberately retains the three legacy runtime capability grants. The already-existing manual cutover and its disposable qualification are recorded in Section 47; migration 5 remains the first hard stop.
- `20261110260000_gateway_supplier_classification_cutover` installs the transitional gateway wrapper and revokes legacy supplier function runtime EXECUTE. The later 11030000/11060000 migrations upgrade the wrapper to the signed context-bound assertion contract.
- `20261110265000_reconcile_business_profile_legacy_contract` is a forward-only reconciliation of the live Business profile function/schema contract; it is not a gateway cutover by itself. It must be reviewed against the actual production schema and Resource API contract before execution.
- `20261110270000_gateway_business_profile_update` installs a gateway wrapper and revokes the legacy Resource API runtime function grant. Its route must be released compatibly with the signed gateway contract before the migration is considered safe for production.

### Signed assertion transition — migrations 11020000–11060000

- These migrations progressively replace login-only/caller-asserted gateway interfaces with signed assertions, nonce replay protection, and finally v2 assertions bound to the exact request context.
- The final migration recreates the gateway wrapper signatures and removes the earlier overloads; therefore a Worker/client deployed against the intermediate signatures is not compatible with the final database contract.
- The final signed assertion functions are explicitly limited to the Actor Gateway database principal, with PUBLIC/runtime/migrator execution revoked and gateway execution granted.
- This chain is source-level security design, not a live deployment. The gateway Worker must be released against the final v2 signatures and exact canonical context serialization; do not apply the chain while any live gateway/client uses the earlier contract.

### Compatibility and execution disposition

- Registration identity retains legacy runtime EXECUTE at this point in the chain; confirm the corresponding Resource API route integration and any later cutover before selecting the relevant migration batch.
- Supplier classification and Business profile have database revocation steps in their migrations; they require compatible Resource API-to-gateway route deployment before those migrations are applied.
- Capability governance is separately blocked by its manual cutover at migration 5.
- No production migration or manual cutover is approved by this review. The strict prefix runner, backup/restore gate, Amanda/Render role-authority gate, and Section 45 no-additional-cost deployment NO-GO remain binding.

No production database or application state was changed. No migration, ledger, role/grant, secret, service, network, routing, deployment or storage object was touched. Preserve the local untracked `.bak` file.

## 49. Issuer cutover and downstream migration contract revalidation (2026-11-16 01:12 UTC)

### Exact-head CI

- The preceding handover commit `c42e5f3445d213b9ad7f5ff65227d01fabfcae25` passed exact-head CI workflow #5043: `quality` and `web-quality` both SUCCESS.
- PR #285 remains OPEN, DRAFT and UNMERGED. This section is a new documentation-only commit; its own CI must be checked separately.

### Revalidation against the actual manual issuer cutover SQL

The source files `database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql`, `database/cutovers/20261112020000_authentication_issuer_privilege_rollback.sql`, and `scripts/qualify-auth-issuer-cutover.mjs` were inspected against the existing issuer runbook. The source confirms:

- The cutover is explicitly manual-only and rejects any execution unless `session_user=ghm_migrator` and `current_user=ghm_schema_owner`.
- It requires a pre-existing `ghm_auth_issuer` LOGIN/NOINHERIT principal with the narrowly bounded Render administrator membership exception. It resets accidental direct relation, sequence and function grants, then grants the exact ten-function issuer allow-list.
- The Resource API runtime's auth lifecycle functions are revoked at cutover. Its only retained authentication-related direct function authority is the two documented external person-identity and external Business-mapping lookups. The Business mapping-link helper is explicitly revoked from application principals and used inside signed Actor Gateway Business provisioning.
- QuoteFlow reset-enrollment registration remains migrator/operator-only; the issuer can only read and complete an already approved enrollment.
- Rollback is also manual-only and restores only the documented pre-issuer Resource API auth-function allow-list. It does not restore migration/operator privileges removed by earlier migrations, direct table/sequence access, application binaries, secrets or routing.
- Disposable qualification requires local `ghm_disposable_test` and separate issuer, runtime, migrator and Actor Gateway connections. It is not production evidence.

### Downstream migration contract cross-check

- Migration 1205 removes global PUBLIC EXECUTE defaults for functions created by `ghm_schema_owner`; intended application functions must receive explicit per-role grants.
- Migration 1207 revokes the obsolete caller-account-ID `ghm.assert_actor_gateway(bigint)` helper from PUBLIC and all application logins.
- Migration 1208 moves Connect Business creation, owner membership and provider mapping into a single signed Actor Gateway transaction, and revokes direct application execution of the internal mapping-link helper.
- Migration 1209 preflights that every GHM SECURITY DEFINER function is owned by `ghm_schema_owner` and pins its search path to `pg_catalog, ghm, pg_temp`.
- Storage migrations 1214–1215 introduce separate actor and provider workflow attestations for storage state transitions. Their presence in source does not mean provider secrets, gateway routes or production storage cutover are live.

These checks agree with the existing runbook and earlier sections; no contradictory SQL contract was found. They do not change the existing deployment NO-GO or authorize any manual cutover.

### Next review boundary

No additional pending migration follows the 1217 inventory endpoint. The remaining work is release/cutover evidence and reconciliation, not inventing another migration batch: exact integration of the dependent Issuer and Actor Gateway branches, application/client compatibility, non-production end-to-end tests, verified production backup/restore, Amanda/Render role-authority resolution, network/TLS decision and the existing no-additional-cost deployment constraints. Do not start a new branch, create paid resources, alter production or bypass the manual cutovers.

No production database query/mutation, migration, ledger repair, role/grant change, secret, Render/Cloudflare configuration, deployment, storage object or application data was changed. Preserve the local untracked `.bak` file.

## 50. Mainline integration and production migration stop-boundary enforcement review (2026-11-16 01:16 UTC)

### Exact CI and branch state

- Section 49 handover commit `74e3dffc2b3b6863eb01e67e80acf2b5f0375eb2` passed exact-head CI workflow #5044, run ID `43784649947`; both `quality` and `web-quality` completed SUCCESS.
- PR #285 remains OPEN, DRAFT and UNMERGED at head `74e3dffc2b3b6863eb01e67e80acf2b5f0375eb2`.
- The PR branch compares against current `main` as 108 commits ahead, 0 behind, with 15 intended changed files. The 108 commits are ancestry, not changed-file count.
- PR #276 (isolated Authentication Issuer stacked on Actor Gateway) is CLOSED and MERGED at `1d78d2b992acf92f1359b396f3ccc759c1ff6bd6`. Current main is the PR #285 base and includes that merged integration. Do not continue describing Issuer/Actor Gateway source integration as an unmerged dependent branch. Its production deployment/cutover remains blocked by the operational gates.

### Critical finding — the migration runner does not enforce the documented capability cutover stop

Direct source review of `src/db/production-migration-batch.ts` and `src/db/migrate.ts` confirms:
- Production batch selection enforces an explicit JSON array, exact ordered next-pending prefix, no duplicate versions, and a maximum of five migrations.
- It does not encode a semantic/manual-cutover stop boundary.
- It contains no capability cutover ACL-state check, no storage cutover ACL-state check, and no manual-cutover marker/attestation check before selecting later pending migrations.
- Therefore a five-entry first-prefix request can include migration 5 `20261110160000_add_admin_capability_catalogue_governance`, which grants `ghm_runtime` EXECUTE on three SECURITY DEFINER functions accepting caller-supplied account IDs. The batch selector itself does not prevent crossing that security boundary.
- The separate manual cutover `database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql` explicitly requires a deployed and end-to-end-verified Actor Gateway before revoking those legacy grants. The manual SQL exists, but that release prerequisite is not represented in the migration runner.
- Existing first-four disposable qualification explicitly asserts migration 4's storage deletion-pending function is SECURITY DEFINER and runtime EXECUTE remains true. The read-only production preflight classifies migration 4's structural state and explicitly says it does not authorize execution or ledger repair.

### Required handling

- Do not execute a five-migration first batch. The documented review boundary is after the first four, with migration 5 treated as a manual-cutover-sensitive boundary.
- Do not assume the prose handover alone is a machine-enforced stop. Before any future production execution, add and qualify an explicit runner guard that prevents crossing the capability boundary until the required cutover evidence and effective ACL state are established; define equivalent protection for any storage cutover boundary.
- Keep `GHM_PRODUCTION_MIGRATION_BATCH` unset. No production migrations or manual cutovers are approved. Do not modify the production ledger, role/grants or migration history.
- The guard design must preserve exact-prefix semantics and must not use a caller-controlled environment acknowledgement as the sole proof of a completed cutover. It must be tested on disposable PostgreSQL with both blocked and permitted states before any production consideration.

### Correction to the next-work description

The Issuer and Actor Gateway source integration is already merged through PR #276 and present on current main. Remaining work is to verify the migration branch's compatibility with that merged source, complete the runner's semantic stop-boundary enforcement, and satisfy non-production E2E plus the existing production backup, Amanda/Render role-authority, network/TLS and no-additional-cost gates. Do not create another architecture branch or repeat the merged implementation.

No production database query/mutation, migration, ledger repair, role/grant change, secret, Render/Cloudflare configuration, deployment, storage object or application data was changed. Preserve the local untracked `.bak` file.

## 51. Cutover checkpoint matrix — correct route status and runner-guard design boundary (2026-11-16 01:24 UTC)

### Exact CI and repository state

- Exact-head workflow #5045, run ID `43785227607`, completed SUCCESS on commit `0435ead125340facd5d20babe8e3e0bd806f3e0f`; both `quality` and `web-quality` passed.
- PR #285 remains OPEN, DRAFT and UNMERGED at that head.
- PR #276 is merged and its isolated Issuer/Actor Gateway source is present on the PR #285 base. Do not create duplicate Issuer/Gateway implementation.

### Correction — capability API routing is already in source

The exact PR-head source was checked:
- `src/http/capability-catalogue-router.ts` sends all four administrative capability catalogue operations (list, create, update, transition) through `CapabilityGovernanceGatewayClient`; missing gateway returns 503 and there is no legacy repository fallback for these admin operations.
- `src/http/app.ts` constructs `HttpCapabilityGovernanceGatewayClient` from the configured Actor Gateway origin and injects it into the capability catalogue router.
- `src/actor-gateway/server.ts` wires `PostgresCapabilityGovernanceReader`; `src/actor-gateway/app.ts` exposes the authenticated capability administration routes.
- `PgCapabilityRepository` still contains the historical direct legacy mutation methods, but the administrative HTTP routes do not call those methods in this source snapshot. Do not describe the capability HTTP route integration as missing. Its production deployment and end-to-end operation are still unproven.

### Why a single migration-5 stop is not a complete runner design

- Capability migration `20261110160000` creates the three legacy caller-account-ID SECURITY DEFINER functions and grants runtime EXECUTE. The final signed v2 capability wrappers are installed by `20261111060000_bind_gateway_assertions_to_request_context`. The separate manual capability cutover then revokes the legacy runtime functions after the deployed gateway/admin routes are end-to-end verified.
- Storage migration `20261110140000_allow_pending_storage_object_cleanup` is even earlier in the pending prefix. The signed storage wrapper/provider-attestation migrations are `20261112140000` and `20261112150000`. The authoritative storage design records that the five-function legacy grant cutover has only been rehearsed on disposable PostgreSQL; no production revocation has occurred. The production Resource API runtime is older than the gateway-required source and the provider end-to-end journey remains outstanding.
- Therefore simply refusing to run migration 5 until the capability cutover is complete, or refusing to run anything after migration 4 until the storage cutover is complete, would prevent the ordered migration chain from reaching the later wrapper definitions needed for those cutovers. Do not add a simplistic static stop that creates this deadlock, and do not bypass exact-prefix or migration-ledger rules to work around it.
- The capability and storage groups are not the only manual boundaries. `src/db/runtime-database-privileges.ts` defines nine independently qualified manual cutover groups: campaign/directory review, Authentication Issuer, registration identity, capability governance, Business Capability mutations, Saved Business, Business Hours, Trust Score and Business Logo. Its existing 512-stage allow-list models exact effective runtime SECURITY DEFINER EXECUTE combinations from the disposable baseline; production enforcement is explicitly gated until production catalog evidence is captured and reconciled.

### Required runner-guard design before implementation

The guard must be a migration-aware checkpoint matrix, not one global version stop:
1. Map each of the nine manual cutover groups to (a) the exact migration that first creates/re-grants legacy authority, (b) the final signed replacement-wrapper migration, (c) the manual cutover SQL and rollback, and (d) the exact effective ACL state required after cutover.
2. Preserve contiguous-prefix and maximum-five semantics. Allow only the documented bridge prefix needed to install a group's final signed wrappers; once that group's wrapper boundary is reached, block later migrations until live catalog inspection proves the corresponding legacy runtime/PUBLIC/migrator/gateway grants are gone and the required replacement gateway grants remain.
3. Where bridge migrations leave a legacy grant temporarily active, explicitly document the required release order and traffic/maintenance conditions. A caller-controlled environment variable is not evidence of a deployed route or completed cutover.
4. Reuse the exact function signatures and group definitions already present in `runtime-database-privileges.ts`, but do not assume its disposable baseline is production evidence. Capture and reconcile the production catalog through the approved read-only process before relying on its stage allow-list for production.
5. Add pure unit tests for each blocked/permitted boundary and disposable PostgreSQL tests proving effective ACL inspection rejects a legacy grant and accepts only the exact post-cutover ACL state. Keep manual cutover SQL outside the automatic migration runner.
6. Treat storage separately: its current five-function cutover is a disposable rehearsal, not an approved production script. Reconcile the authoritative storage design and rollback/traffic-drain procedure before claiming a machine-verifiable storage cutover stage.

### Current disposition

No runner code was changed in this continuation because the source confirms that a single migration-5 stop or migration-4 stop would deadlock the strict ordered chain. The correct next repository task is to finish the nine-group migration/cutover checkpoint matrix and then implement/test the guard against that matrix. This is repository-only work; production remains NO-GO under the existing no-additional-cost, backup/recovery, Amanda/Render role-authority, network and deployment constraints.

No production database query/mutation, migration, ledger repair, role/grant change, secret, Render/Cloudflare configuration, deployment, storage object or application data was changed. Preserve the local untracked `.bak` file.


## 52. Nine-group cutover matrix — source-mapped boundaries and catalog-check design (2026-11-16 01:32 UTC)

### Exact CI and branch state

- Section 51 commit `458c04a9bb1a1ff53e55ff356fd2d485ffd50166` passed exact-head CI workflow #5046; both `quality` and `web-quality` succeeded.
- PR #285 remains OPEN, DRAFT and UNMERGED. No production action was taken.

### Source-mapped manual cutover groups

The nine group definitions in `src/db/runtime-database-privileges.ts` were compared with the migration SQL, manual cutover SQL, rollback SQL where present, and the corresponding qualification commands. The mapping below distinguishes what is directly evidenced from what is still missing.

| Group | Gateway/final source boundary | Manual cutover source | Status / caveat |
|---|---|---|---|
| Campaign / directory review | Signed campaign/review wrappers are created by the coordinated cutover itself, after the shared signed assertion infrastructure is present. | `database/cutovers/20261112160000_campaign_directory_review_actor_gateway.sql`; rollback `...12161000_campaign_directory_review_actor_gateway_rollback.sql`. | Explicit operator identity guard; old Resource API instances must be out of traffic. |
| Authentication Issuer | Existing auth lifecycle functions; staged auth changes include migrations 1202–1204. | `database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql`; rollback `...12020000_authentication_issuer_privilege_rollback.sql`. | Exact issuer role, ten-function allow-list, runtime revocations and two retained runtime identity lookups. Must not run before issuer/client traffic cutover. |
| Registration identity | Read/write wrappers begin at 10230000/10233000; signed assertion-bound wrappers are upgraded by 11050000 and context-bound by 11060000. | No matching manual registration-identity revoke/rollback SQL was found in the inspected `database/cutovers/` paths. | **Unresolved inconsistency:** the runtime privilege test says this group is accepted only before an explicit manual gateway cutover, but the corresponding cutover/rollback artifact has not been located. Do not treat this group as cut over or machine-enforce a post-cutover state until its authoritative SQL and rollback are found or authored and qualified. |
| Capability governance | Legacy functions introduced by 10160000; gateway wrappers 10250000; signed assertion progression 11020000 and final v2 context binding 11060000. | `database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql`. | Manual-only; requires deployed and E2E-verified gateway/admin routes. Revokes the three legacy functions from PUBLIC/runtime/migrator/gateway. No rollback artifact was found in the inspected paths. |
| Business Capability mutations | Signed wrappers: 11070000. | `database/cutovers/20261111030000_revoke_legacy_business_capability_runtime_mutations.sql`. | Also revokes evidence INSERT and sequence access. Header requires deployed/qualified routes, resolved Render role model and fresh verified backup. No rollback artifact was found in inspected paths. |
| Saved Business | Signed gateway migration: 11100000. | `database/cutovers/20261111110000_revoke_legacy_saved_business_runtime.sql`. | Revokes table/column, sequence and legacy function access; gateway wrappers replace legacy calls. |
| Business Hours | Signed gateway/read projection migrations: 11130000/11140000. | `database/cutovers/20261111130000_revoke_legacy_business_hours_runtime.sql`. | Revokes legacy function, direct table SELECT and sequence access. |
| Trust Score | Signed gateway/projection migrations: 11150000/11170000. | `database/cutovers/20261111150000_revoke_legacy_trust_score_runtime.sql`. | Revokes legacy calculator, table SELECT and sequence; preserves constrained public projections. |
| Business Logo | Signed binding migration: 11160000. | `database/cutovers/20261111160000_revoke_legacy_business_logo_runtime.sql`. | Revokes the legacy caller-account-ID binding function. Public approved-logo getter is intentionally retained. |

The nine-group TypeScript model and its 512-combination unit tests describe function EXECUTE states, but they do not prove that every corresponding manual cutover file exists, has a rollback, or has been applied in production. In particular, registration identity's test/documentation mismatch must be resolved, and the capability/business-capability cutovers have no rollback SQL in the inspected source paths.

### Separate storage boundary — not one of the nine groups

Storage is not represented in `RUNTIME_MANUAL_CUTOVER_FUNCTION_GROUPS`. The disposable privilege baseline currently retains five legacy storage SECURITY DEFINER functions. Migrations 1214/1215 add the signed actor wrappers and separate provider attestation path, but the production Resource API is older than the gateway-required storage integration and the external provider E2E journey remains unproven. The authoritative storage design records only disposable cutover rehearsal; no production revocation occurred. Do not fold storage into the nine-group function mask or claim its cutover is represented by that mask. Its five-function ACL, direct table/sequence access, provider attestation provisioning, and rollback/traffic-drain procedure require a separate exact matrix and source artifact review.

### Critical implementation detail for a safe migration runner guard

The existing `RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL` uses `has_function_privilege(session_user, ...)`. In the migration runner, the connection identity is deliberately `session_user=ghm_migrator` while `current_user=ghm_schema_owner`. Reusing that query verbatim in the migration runner would inspect the migrator's function EXECUTE rather than the application's effective `ghm_runtime` authority. The runner guard must query the named role `ghm_runtime` explicitly (and fail if the role is absent), while preserving the migration session/operator identity checks.

Further, the nine-group function mask does not inspect the direct relation and sequence privileges revoked by several cutovers (Business Capability evidence, Saved Business, Business Hours, Trust Score). A complete guard must check those exact table/column/sequence ACLs too; checking SECURITY DEFINER function EXECUTE alone is insufficient. PUBLIC grants and inherited memberships must be included in effective privilege evaluation, not only direct ACL rows.

### Guard implementation prerequisites — still not satisfied

1. Capture and reconcile the actual production `ghm_runtime` effective function, relation/column and sequence privileges through the approved read-only catalog process. The 43-function/512-stage disposable baseline is not production evidence.
2. Resolve the registration-identity cutover/rollback artifact mismatch and identify the intended exact post-cutover ACL.
3. Add or document rollback for manual cutovers whose current source only provides forward revoke SQL, or explicitly record why rollback is a coordinated application rollback plus exact GRANT restoration rather than a separate SQL file.
4. Build a matrix that covers each migration bridge prefix, wrapper-ready point, manual cutover, post-cutover effective ACL, and any direct relation/sequence revocation. Include the separate storage boundary.
5. Implement a guard that queries effective privileges for `ghm_runtime` from the migrator connection, compares only against production-reconciled states, and refuses both unexpected grants and missing required gateway/public grants. Do not accept a caller-controlled environment variable as proof.
6. Add pure boundary tests and disposable PostgreSQL tests for every permitted bridge prefix, every blocked post-wrapper/pre-cutover state, each exact permitted post-cutover state, inherited/PUBLIC grants, table/column/sequence grants, and rollback state.
7. Keep manual cutovers outside automatic migration execution. The runner must not execute them, skip migrations, alter the ledger, or bypass contiguous-prefix and maximum-five semantics.

No runner code was changed in this step: the mapping review exposed unresolved source artifacts and the current privilege query's session-user mismatch. Implementing against the unverified disposable baseline would create false assurance. Continue source reconciliation and close these prerequisites first.

No production database query/mutation, migration, ledger repair, role/grant change, secret, Render/Cloudflare configuration, deployment, storage object or application data was changed. Preserve the local untracked `.bak` file.


## 53. Registration identity cutover evidence correction (2026-11-16 01:38 UTC)

### Exact CI and source correction

- Section 52 commit `d18b619f0743cf92e3a5f85538629a3f8345f1d0` passed exact-head CI workflow #5047; the workflow completed SUCCESS.
- PR #285 remains OPEN, DRAFT and UNMERGED.
- A targeted repository search for registration-identity cutover SQL found no matching manual revoke/rollback artifact. The migrations create signed gateway wrappers but explicitly retain the Resource API legacy RPCs. The test's statement that the functions are accepted only before an explicit manual cutover is therefore not backed by an identified cutover artifact in the inspected branch.
- Corrected the misleading source comment in `src/db/runtime-database-privileges.ts`: the nine groups are a function-only modeled stage inventory; they do not prove the corresponding cutover/rollback SQL exists or that any cutover stage is active in production.
- Source correction commit: `b405bec35957627440d62edb81d3a6318a5f9df2`. Its exact-head CI must be checked separately.

### Registration identity disposition

Do not invent or run a registration identity revoke. The Resource API registration routes and their gateway client, migration grants, and production runtime version must be reconciled first. If a manual revoke is required, author a forward cutover and an explicitly qualified rollback that match the deployed route contract and exact effective ACL state. Until then, the registration identity functions remain a documented unresolved boundary, not a completed cutover.

No runner code, migration SQL, production catalog, database role/grant, secret, deployment or application data was changed. Preserve the local untracked `.bak` file.


## 54. Registration identity removed from modeled completed-cutover stages (2026-11-16 01:43 UTC)

### CI and PR state before this change

- Section 53 handover commit `b52a6ef2a3942d070ded8d51fcaa143734b852a4` passed exact-head CI workflow #5049; both `quality` and `web-quality` succeeded.
- The source-comment correction commit `b405bec35957627440d62edb81d3a6318a5f9df2` had workflow #5048 cancelled by the newer commit run, not a test failure. The subsequent handover commit's successful CI covered the accumulated branch state.
- PR #285 remains OPEN, DRAFT and UNMERGED.

### Corrective source change

The previous nine-group privilege model treated registration identity as a completed manual cutover group, despite the absence of an authoritative registration-identity revoke/rollback SQL artifact and despite migrations explicitly preserving the legacy Resource API grants until a separately qualified Resource API cutover.

Corrected the model:
- Removed registration identity from `RUNTIME_MANUAL_CUTOVER_FUNCTION_GROUPS`.
- Removed the four derived post-registration stage exports.
- Reduced the modeled group count from nine to eight, and modeled combinations from 512 to 256.
- Updated the fully modeled post-cutover function inventory from 13 to 15, retaining both `ghm.read_business_registration_identity(bigint,bigint)` and `ghm.update_business_registration_identity(bigint,bigint,text,text,text)` in every modeled state.
- Replaced the misleading test that claimed registration functions were absent after a manual cutover with a test asserting they remain present in every modeled stage until a real cutover artifact is identified, authored and qualified.

Commits:
- Source: `7af4979ec45476bf732d2cbf26ff0fc4cd92fd51`
- Tests: `1bf1b35508697365ba0f06e58c3090f6b284ebe3`

### Scope and limitations

This is a correction to a disposable-baseline privilege-stage model and its unit tests only. It does not revoke any production privilege, establish production ACL truth, add a Resource API registration identity route, create a manual cutover, or approve migration execution. The existing SQL still retains the legacy registration identity runtime grants; that is the honest modeled state.

The migration runner semantic stop-boundary guard remains unimplemented. Its design still requires production-reconciled effective role privileges and coverage of function, relation/column, sequence, PUBLIC and inherited membership grants. The existing query's `session_user` behavior remains unsuitable for checking `ghm_runtime` when the runner session is `ghm_migrator`.

No production database query/mutation, migration, ledger repair, role/grant change, secret, Render/Cloudflare configuration, deployment, storage object or application data was changed. Preserve the local untracked `.bak` file.


## 55. SECURITY DEFINER inventory reconciliation after Campaign/Review qualification (2026-11-16 02:26 UTC)

### Exact-head CI failure and diagnosis

- CI #5054 ran against commit `6e336f049f6f0cf3b8d6d98492a0d4c567a6d5ad`.
- `web-quality` passed and the complete Node test suite passed (the prior stale 14-versus-15 expected-array failure was corrected).
- The disposable PostgreSQL Campaign/directory-review signed Actor Gateway qualification then failed at its post-cutover call to `assertRuntimeDatabaseFunctionPrivileges`.
- The qualification had successfully applied `database/cutovers/20261112160000_campaign_directory_review_actor_gateway.sql`, verified the ACL matrix and completed cleanup. Its resulting SECURITY DEFINER EXECUTE inventory contained 38 functions.
- The 43-entry baseline had included three Campaign/Review legacy functions that this just-applied manual cutover correctly removed, plus two registration-identity legacy signatures that were not present in the actual query result. The inventory query explicitly filters on `p.prosecdef`; absence from this result does not prove that a function was dropped or that its EXECUTE grant was revoked.

### Corrective model and test changes

- Removed the two registration-identity signatures from the 43-entry SECURITY DEFINER baseline, yielding 41 entries.
- Updated the fully modeled eight-cutover inventory from 15 to 13 functions.
- Updated the unit test's expected post-cutover list and renamed/replaced the registration-identity assertion so it no longer claims these two RPCs are entries in the SECURITY DEFINER inventory.
- Source correction commit: `6f465db19889e32c76b86c10cd86d587ae82937e`.
- Test correction commit: `573e84368dee3a66a229a074739d8b926556201e`.
- CI #5055 was queued for the source-only commit and may be superseded by the test commit. Exact-head CI for `573e84368dee3a66a229a074739d8b926556201e` is the required verification; do not treat this correction as passed until both jobs and all later qualification steps succeed.

### Important unresolved ACL distinction

This model only describes the query's SECURITY DEFINER function EXECUTE inventory. It is not a complete inventory of all functions, function grants, table/column grants, sequence grants, PUBLIC privileges or inherited role memberships. Registration identity's actual function existence, `prosecdef` flags and effective runtime EXECUTE privileges must be inspected separately through the approved catalog audit before any registration-identity cutover decision. Do not infer a revoke or a cutover from omission in this filtered result.

No production database query/mutation, migration, ledger repair, role/grant change, secret, Render/Cloudflare configuration, deployment, storage object or application data was changed. PR #285 remains draft and unmerged. Preserve the local untracked `.bak` file.


## 56. Actor Gateway principal CI failure — registration identity inventory state is inconsistent (2026-11-16 02:29 UTC)

### Exact-head CI #5057

- Exact PR head: `0e63461b2efc6e2940d62dd6b6b3411b56b9cba9`.
- Workflow #5057 failed. `web-quality`, build, migration application, supplier classification qualification, first-four migration qualification, SECURITY DEFINER inventory syntax, and isolated Authentication Issuer principal qualification passed.
- Failure: `Qualify isolated actor gateway database principal`. Later steps were skipped.
- The failure occurs at `assertRuntimeDatabaseFunctionPrivileges`, before the gateway-specific ACL and signed-assertion tests.

### Exact failure evidence

The disposable pre-Campaign-cutover runtime query returned 43 SECURITY DEFINER functions, including both:
- `ghm.read_business_registration_identity(bigint,bigint)`
- `ghm.update_business_registration_identity(bigint,bigint,text,text,text)`

The Section 55 source correction incorrectly reduced the baseline to 41 and therefore made these two observed pre-cutover functions unexpected. The 41-entry correction is not valid for this pre-cutover state.

There is also an unresolved cross-qualification discrepancy: CI #5054's Campaign/directory-review qualification reported a 38-function inventory after applying the Campaign cutover, with the two registration identity functions absent. The inspected Campaign cutover SQL revokes only the three Campaign/directory-review legacy functions; it does not revoke either registration identity function. Thus the 38-function result cannot currently be explained by the inspected cutover SQL. Do not assume the Campaign cutover removes registration identity authority.

### Corrective disposition

- Do not make another allow-list count edit based only on these two runs.
- Reconcile the exact database state and full catalog evidence immediately before and after the Campaign qualification: `pg_proc.prosecdef`, function existence, effective `EXECUTE` for `ghm_runtime`, PUBLIC and inherited memberships, and the qualification script's transaction/connection lifecycle.
- Verify whether the two registration functions change owner, SECURITY DEFINER status, or effective privileges during an earlier qualification step. Identify the exact statement and stage if they do.
- The SECURITY DEFINER inventory model must represent actual observed stages, not force an expected count. Keep registration identity unresolved until the catalog transition is explained and the Resource API route/cutover/rollback contract is evidenced.

No production database query/mutation, migration, ledger repair, role/grant change, secret, Render/Cloudflare configuration, deployment, storage object or application data was changed. PR #285 remains draft and unmerged. Preserve the local untracked `.bak` file.


## 57. Restore observed 43-function pre-Campaign SECURITY DEFINER baseline (2026-11-16 02:33 UTC)

### Exact-head CI #5058

- CI #5058 ran on the prior handover head `a869cb1c9d69fc59b6547a6cd1dca87aa879b615`.
- `web-quality`, build, disposable migration application, supplier classification qualification, first-four migration qualification, inventory-script syntax, and isolated Authentication Issuer principal qualification passed.
- `Qualify isolated actor gateway database principal` failed at the exact runtime function EXECUTE inventory comparison. Later steps were skipped.
- The actual pre-Campaign inventory in this run contained 43 SECURITY DEFINER functions, including `ghm.read_business_registration_identity(bigint,bigint)` and `ghm.update_business_registration_identity(bigint,bigint,text,text,text)`.
- This proves the Section 55 reduction from 43 to 41 was incorrect for the pre-Campaign state. Section 56's instruction not to adjust counts speculatively remains valid, but the pre-Campaign observed inventory is now direct evidence for restoring the two signatures.

### Corrections made

- Restored both registration identity signatures to `RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS`; expected baseline returns to 43.
- Restored the fully modeled eight-cutover function inventory from 13 to 15; neither registration identity signature belongs to an identified manual cutover group.
- Restored unit assertions that both signatures remain in every modeled state until a real, evidenced cutover exists.
- Source correction commit: `ba7b246bc54dc2b9eb65424c4829e0fcf6b7f3f8`.
- Test correction commit: `c3b3139e58050df0f24a08747255a2d0f49a594d`.
- This restores the pre-Campaign model to direct observed evidence; it does not explain CI #5054's 38-function post-Campaign result. The discrepancy remains open and must be explained from exact before/after catalog snapshots and connection/session context. Do not invent a registration identity revoke or treat the two functions as cut over.

### Current verification state

- Handover update is being committed after the source and test corrections. Exact-head CI must be checked on the final handover commit, not inferred from intermediate commits.
- PR #285 remains draft and unmerged. No production database query/mutation, migration, ledger repair, role/grant change, secret, Render/Cloudflare configuration, deployment, storage object or application data was changed. Preserve the local untracked `.bak` file.


## 58. Registration identity cutover modeled and exact-head CI passed (2026-11-16 03:14 UTC)

### Exact-head verification

- PR #285 head: `b90e959b9cfae6dcd5e64dcda9fc8fd12bf15d09`.
- Workflow run #5063 / run ID `43796446852`.
- `quality` and `web-quality` both completed successfully; the PR reports all 3 required checks successful.
- PR #285 remains OPEN, DRAFT and UNMERGED.

### Root cause of the 38-function qualification mismatch

The previous sections correctly identified that the expected incompatible-constraint exception in the Business registration migration is a deliberate negative test. It is not the cause of the earlier runtime EXECUTE inventory failure.

The missing stage-model evidence was the existing manual registration-identity cutover:
- `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql` explicitly revokes ordinary `ghm_runtime` EXECUTE on the two legacy registration identity RPCs.
- The signed Actor Gateway registration identity wrappers are the intended access path after this cutover.
- The previous stage model accounted for the Campaign/Review cutover but did not include this separate registration-identity cutover. Its expected count therefore did not describe the qualified post-cutover state.

### Corrective commits

- Source model: `47ad842d413908634db71d971b622cfafff03031`.
- Unit tests: `b90e959b9cfae6dcd5e64dcda9fc8fd12bf15d09`.

The model now includes registration identity as its own independent manual cutover group:
- 9 identified cutover groups and 512 modeled combinations.
- 43-function pre-cutover SECURITY DEFINER baseline retained.
- Both registration legacy signatures remain present before the registration cutover and are removed from the modeled runtime EXECUTE inventory only in stages where that cutover is applied.
- Fully modeled post-cutover inventory: 13 functions.
- Tests assert the registration cutover's effect at every modeled stage rather than treating the two functions as absent from the baseline.

### Disposable PostgreSQL evidence in CI #5063

The isolated Actor Gateway principal qualification passed. The registration identity cutover qualification explicitly reported:
- Manual registration identity cutover SQL applied to the disposable database.
- Ordinary runtime denied on both legacy registration RPCs after cutover.
- Signed Gateway read and write remained available.
- Cross-business read/write substitution denied.
- Altered-payload replay denied.
- Disabled actor read/write denied.
- Ordinary runtime could not execute the unsigned identity helper or Gateway wrappers, assume the Gateway role, or assume schema-owner authority.

The full workflow also passed runtime-boundary verification, the SECURITY DEFINER authority comparison, and the remaining quality job steps. The expected incompatible-constraint exception was again followed by the qualification's explicit PASS result and transaction rollback.

### Scope and release gate

This resolves the CI stage-model mismatch; it does not mean the manual cutover has been applied to `ghm_db` or production runtime privileges. CI used disposable PostgreSQL only. No production migration, manual cutover, ledger change, grant/revoke, role membership, Render/Cloudflare setting, deployment, secret or application data was changed.

PR #285 stays draft/unmerged. The successful checks do not authorize production migration execution or merge by themselves. Continue with the separately required production read-only migration inventory, production-only Project↔Opportunity reconciliation, and explicit release gates before any production rollout.


## 59. Current handover reconciliation and next production read-only audit (2026-11-16 03:20 UTC)

### Superseding interpretation of Sections 56–58

Sections 56–57 are historical records of the earlier uncertainty about the two Business registration identity RPCs. They must not be used as the current stage-model conclusion.

Section 58 records the later source and qualification evidence:
- The explicit manual cutover is `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql`.
- It revokes ordinary `ghm_runtime` EXECUTE on the two legacy registration identity RPCs.
- Signed Actor Gateway wrappers remain the supported access path after the cutover.
- The independent registration cutover is modeled as its own group; it is not attributed to the Campaign/Review cutover.
- Exact code/test head `b90e959b9cfae6dcd5e64dcda9fc8fd12bf15d09` passed all three required checks in workflow run `43796446852`.

The current PR head subsequently advanced to the handover-only commit `205336bcfb5e8e40ab3f8eae650c1260aa184293`. This documentation-only head has not yet been independently verified by a new workflow run. PR #285 remains open, draft and unmerged.

### Production migration audit — next action, read-only only

The repository's supported forensic audit entry point is `scripts/forensic-migration-reconciliation.mjs`. It:
- Requires `GHM_MIGRATOR_DATABASE_URL`, `DATABASE_SSL=true`, verified TLS (`rejectUnauthorized: true`), and the explicit `ghm_db` production target.
- Opens `BEGIN READ ONLY`, verifies `session_user=ghm_migrator`, `current_user=ghm_schema_owner` after `SET ROLE`, and `current_database=ghm_db`.
- Reads the live `ghm.ghm_schema_migrations` ledger and compares it with repository migration bytes, historical provenance exceptions and retained historical entries.
- Rolls back the read-only transaction; it does not apply migrations or repair the ledger.

The production pending allowlist currently contains 42 version/name entries in `config/pending-migrations.production.json`. This is an expected repository configuration, not proof of the live production pending inventory. The live database result must be freshly captured and compared against it. A prior production observation of 137 repository migrations / 105 live ledger rows / 42 pending entries is historical evidence only and must not be presented as a current result until rerun against the present `ghm_db`.

### Operator runbook — exact local PowerShell invocation

From `C:\GHM`, after confirming the checkout is on the intended PR head and the existing local `.env` contains the already-issued `GHM_MIGRATOR_DATABASE_URL` (do not display or paste the URL or credentials):

```powershell
PS C:\GHM> Write-Host "=== VERIFY READ-ONLY PRODUCTION MIGRATION AUDIT INPUTS ==="
>>
>> $env:DATABASE_SSL = "true"
>> $env:GHM_MIGRATION_AUDIT_DATABASE = "ghm_db"
>> $env:GHM_MIGRATION_AUDIT_TARGET = "production"
>> Remove-Item Env:GHM_MIGRATION_AUDIT_ALLOW_PENDING -ErrorAction SilentlyContinue
>>
>> node --input-type=module -e '
>> import "dotenv/config";
>> const url = process.env.GHM_MIGRATOR_DATABASE_URL;
>> if (!url) throw new Error("GHM_MIGRATOR_DATABASE_URL is missing");
>> const parsed = new URL(url);
>> if (parsed.pathname !== "/ghm_db") throw new Error("Refusing: expected ghm_db");
>> if (["localhost","127.0.0.1","::1"].includes(parsed.hostname)) throw new Error("Refusing local database");
>> if (process.env.DATABASE_SSL !== "true") throw new Error("DATABASE_SSL must be true");
>> console.log(JSON.stringify({ database: parsed.pathname.slice(1), host: parsed.hostname, tls: "verified by audit script", credentialsPrinted: false }));
>> '
>>
>> if ($LASTEXITCODE -ne 0) { throw "Audit input verification failed" }
>>
>> Write-Host "=== RUN READ-ONLY PRODUCTION MIGRATION RECONCILIATION ==="
>> node scripts/forensic-migration-reconciliation.mjs
>>
>> if ($LASTEXITCODE -ne 0) { throw "Read-only migration audit returned INVESTIGATE or failed; preserve the full output" }
```

Do not use `--allow-pending` for the first capture. The first run must establish the actual live inventory and verdict without pre-authorizing pending migrations. Capture the complete JSON output. Do not print environment variables, connection strings, passwords, or private keys.

### Project ↔ Opportunity reconciliation remains a separate production-only read-only task

The current repository contract confirms:
- Project has a unique `opportunity_id` reference to `ghm.opportunity(id)` with `ON DELETE RESTRICT`.
- Project creation creates a project-type Opportunity and inserts the Project within one authorized transaction.

This source contract does not establish the live production data state. Before any rollout, perform a separate `BEGIN READ ONLY` production query to count and list:
- Projects with NULL `opportunity_id`.
- Projects whose `opportunity_id` has no matching Opportunity.
- Duplicate Project references to one Opportunity.
- Referenced Opportunities with an unexpected type/status or inconsistent Business/owner relationship.
- Orphan project-type Opportunities, distinguishing legitimate non-Project opportunities from true reconciliation candidates.

Do not update rows, create missing Opportunities, delete records, or repair links during this audit. The SQL must be designed against the exact current schema and run only after the migration inventory and current schema contract are confirmed. Capture counts and bounded, non-sensitive identifiers; never export private registration identity or personal data.

### Current release gate

- PR #285: open, draft, unmerged; code/test head `b90e959b` passed; handover-only head `205336bc` requires its own exact-head check.
- Production migration audit: NOT YET RE-RUN against current `ghm_db`; no fresh result claimed.
- Project ↔ Opportunity production reconciliation: NOT YET RUN; no data-integrity conclusion claimed.
- No production migrations, manual cutovers, ledger edits, role/grant changes, deployments, Render settings, secrets or application data have been changed by this work.

## 60. Production audit evidence reconciled and repository audit paths confirmed (2026-11-16 03:36 UTC)

This section supersedes the *current-status* statements in Section 59. Section 59 remains as the historical operator instructions that existed before the owner supplied the new evidence.

### Production migration ledger/provenance audit — PASS_WITH_PENDING

The owner reran `scripts/forensic-migration-reconciliation.mjs` against Render `ghm-db` / `ghm_db` on 2026-11-16. The successful invocation explicitly used `--allow-pending`, selecting the production pending-allowlist comparison mode. This is an audit-policy flag only; it does not execute, authorize, or apply any migration.

Captured result:
- Target database: `ghm_db`.
- Repository migrations: **137**.
- Pending migrations: **42**.
- Pending version/name inventory: exact match to `config/pending-migrations.production.json`.
- Approved retained historical ledger entries: **10**, all verified.
- Unexplained checksum mismatches: **0**.
- Migration name mismatches: **0**.
- Unrecognized extra ledger rows: **0**.
- Orphaned historical exceptions: **0**.
- Invalid retained-history entries: **0**.
- Authority: `session_user=ghm_migrator`; after `SET ROLE`, `current_user=ghm_schema_owner`; database `ghm_db`.
- Transaction: `BEGIN READ ONLY`; the script rolls back the transaction. TLS certificate verification is enforced by the script (`rejectUnauthorized: true`).
- Final verdict: **`PASS_WITH_PENDING`**, process exit code **0**.

The initial run without `--allow-pending` returned `INVESTIGATE` because the script's strict mode requires zero missing migrations. The subsequent allowlist-mode run proved the 42 live pending migrations exactly match the reviewed production allowlist. Neither result means those migrations have been applied. All 42 remain unapplied and individually subject to the separate execution/dependency/security gates in this handover.

The owner retained the full local report as `production-migration-audit-20261116.txt`; it is an untracked local evidence file, not part of this documentation commit. Do not add local environment backups or unrelated preflight files to Git.

### Project ↔ Opportunity production reconciliation — already completed 2026-11-15

The separate production-only reconciliation is **not outstanding**. The authoritative recorded evidence is in `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md`, section dated 2026-11-15. It records a read-only aggregate/join inspection against Render `ghm-db` / `ghm_db` with:
- `ghm.project` rows: **0**.
- Projects without Opportunity links: **0**.
- Invalid/missing/non-project Opportunity links: **0**.
- Project/Opportunity creator-account mismatches: **0**.
- Active project-type Opportunities: **0**.
- Orphan project-type Opportunities: **0**.
- Projects with active creator participant: **0**; missing expected active creator participants: **0**.
- Active project Opportunity type definitions: **1**.
- Restrictive `project_opportunity_fk` and partial unique `project_opportunity_unique` index: both present.

Recorded disposition: **PASS — zero-row baseline; no backfill required**. This is the November 15 production evidence, not a claim that this data reconciliation was rerun on November 16. Section 59's statements that this work was not yet run are superseded.

### Repository audit coverage — existing entry points, no duplicate tool required

The current repository already separates offline policy checks from live production inspection:

- `npm run test:migration-audit-policy` runs `scripts/migration-audit-checksum.test.mjs`, covering checksum normalization, historical provenance, retained-history classification, production/qualification target separation, the pinned production pending allowlist, and strict TLS policy. CI invokes this command in its `Migration audit policy tests` step.
- `npm test` also includes the compiled migration checksum/target-guard tests.
- `npm run audit:migrations` invokes the live forensic reconciliation in strict mode; it requires the migrator database credential and a live database connection.
- `npm run audit:migrations:predeploy` invokes the same live audit with `--allow-pending`; this verifies the live pending inventory against the production allowlist. It does not apply migrations.

Therefore, repository-only migration policy checks already run in CI, while the full ledger reconciliation necessarily requires the authorised production connection. Do not add a second overlapping audit implementation. The remaining useful consolidation is to make the operator runbook call these named npm scripts consistently and preserve their output as evidence.

### Exact-head CI and release disposition

- Branch: `feat/production-migration-batch-execution-20261115`.
- Source/test head before this documentation-only update: `7bc093ac2de83a26f8dab7a973c0de933a6b9a11`.
- GitHub Actions CI run **#5065** (`43797488894`) for that source/test head completed successfully.
- This handover correction was committed as `94c1930fe451392adfbaa06234d4043c2fb65a91`. The workflow configuration ignores Markdown-only changes (`paths-ignore: '**/*.md'` and `docs/**`), so no new CI run was triggered for this documentation-only commit. No source or test files changed in that commit.
- PR #285 remains open, draft and unmerged.
- No production migration, manual cutover, ledger edit, role/grant change, deployment, Render setting, secret, or application-data mutation was performed by these audits or this handover update.

### Current release gate

- Production migration inventory/provenance audit: **PASS_WITH_PENDING**; 42 migrations remain unapplied and allowlisted.
- Production Project ↔ Opportunity reconciliation: **PASS** on the November 15 zero-row evidence; no backfill required.
- Repository migration audit policy: covered by the existing CI command and tests; no duplicate audit script is warranted.
- Production migration execution: **BLOCKED** pending the remaining ordered migration review, exact prerequisites, verified backup/recovery point, and Actor Gateway hosting/credential/network gates.
- PR #285: keep open and draft. A passing CI run and reconciled audit documentation do not authorise merge or production execution.
