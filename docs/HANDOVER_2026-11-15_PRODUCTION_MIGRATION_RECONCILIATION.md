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
