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



## 67. Guarded five-function storage metadata grant cutover and rollback artifacts (2026-11-16 04:29 UTC)

A dedicated manual cutover/rollback pair has now been authored on PR #286. These are deliberately under `database/cutovers/`, never `database/migrations/`:

- `database/cutovers/20261116010000_revoke_legacy_storage_metadata_runtime.sql`
- `database/cutovers/20261116010000_restore_legacy_storage_metadata_runtime.sql`

Both artifacts are transactional and fail closed unless the session is exactly `session_user=ghm_migrator` and `current_user=ghm_schema_owner`. They verify all five exact legacy function signatures exist, are owned by `ghm_schema_owner`, remain SECURITY DEFINER with one of the two explicitly allowed pinned search paths (`pg_catalog, ghm` or `pg_catalog, ghm, pg_temp`), have no PUBLIC EXECUTE, and that all five signed Actor Gateway wrappers exist and are executable by `ghm_actor_gateway`.

The cutover requires the reviewed pre-state (effective EXECUTE only for `ghm_runtime` among the three application/operator logins) then revokes PUBLIC, runtime, migrator and Actor Gateway EXECUTE on the five legacy functions. The rollback accepts only the fully cut-over state and restores only `ghm_runtime` EXECUTE; PUBLIC, migrator and Actor Gateway remain denied. The separate `ghm.storage_get_public_business_logo(bigint)` function is explicitly outside the cutover and retained.

The disposable qualification script now executes these exact SQL artifacts rather than re-implementing their grants. It is mutation-gated by `GHM_STORAGE_QUALIFICATION_ALLOW_MUTATIONS=true`, requires three distinct explicit localhost URLs for `ghm_runtime`, `ghm_actor_gateway` and `ghm_migrator`, checks the exact pre-state, applies cutover, verifies effective privileges and parse-time direct-call denial, confirms wrapper access, applies rollback, and compares the restored privilege state. The SQL body parser strips the documented outer transaction so the artifact runs inside the qualification script's `ghm_migrator` transaction after `SET LOCAL ROLE ghm_schema_owner`.

The runtime startup ACL model includes the five-signature `storageMetadata` group (10 groups / 1,024 modeled states) and deliberately preserves the public-logo read exception. This is still a modeled application state, not production authorization.

**Qualification status:** the earlier source-only PR head passed CI run #5078 before the SQL artifacts were added. Runs #5079–#5082 were cancelled as successive fixes landed. Run #5083 was started for the SQL parser change; subsequent direct-call probe and documentation commits are newer than that run. Do not call the current PR head green until exact-head CI passes. The latest change uses PREPARE to verify permission denial at parse time rather than calling functions with NULL arguments (which could produce a false-positive 42501 from the function body).

**Production remains blocked:** wrappers are absent in the live production catalog and their migrations remain pending; no grant was revoked or restored in production. Do not execute either SQL artifact against `ghm_db` until the Actor Gateway is actually deployed and reachable, the isolated DB principal is proven in that environment, the exact Resource API runtime ACL model is deployed, all wrapper migrations are applied in an approved sequence, provider lifecycle E2E is qualified, Amanda/Render role-administration escalation is resolved, and a fresh verified production backup/recovery point exists. No change to the current production migration gate; `GHM_PRODUCTION_MIGRATION_BATCH` remains unset.


## 68. Storage metadata legacy grant cutover qualification — exact-head PASS (2026-11-16 04:55 UTC)

The exact current PR #286 head `d8d6640fd48dfc03cbc4dbf65ed2968acabb1704` passed GitHub Actions CI run [#5104](https://github.com/zaidhqdev-sys/GHM/actions/runs/43806583544). Both `quality` and `web-quality` jobs passed. The PostgreSQL qualification log confirms:

- Five legacy storage function signatures and pre-cutover ACL snapshot: PASS.
- Disposable cutover SQL applied: PASS.
- PUBLIC and runtime EXECUTE revoked on all five legacy functions: PASS.
- Actual direct function execution denied for `ghm_runtime`, `ghm_migrator`, and `ghm_actor_gateway` across all five functions: PASS.
- Actor Gateway storage wrappers retain EXECUTE: PASS.
- Exact legacy function ACL rollback: PASS.

The previous failing probe returned `permission denied for schema ghm`. That is a valid denial: PostgreSQL checks schema USAGE before function EXECUTE. The test was corrected to accept schema-level or function-level permission denial, while independent effective-ACL checks still verify the legacy function EXECUTE privileges are absent. The probe now performs actual SELECT invocation inside a transaction that is rolled back; it does not use PREPARE. No function body mutation is retained even if an unexpected call succeeds.

**Qualification conclusion:** the guarded five-function cutover and rollback pair is qualified on disposable PostgreSQL at the exact current PR head. This does not qualify production application or production deployment. PR #286 remains draft/open/unmerged. Production inspection previously confirmed all five legacy functions still grant `ghm_runtime` EXECUTE and the five Actor Gateway wrappers are absent; their migrations remain pending. No production SQL, grant, role membership, migration, secret, Render setting or deployment was changed.

**Production gate remains CLOSED.** Do not execute either artifact on `ghm_db` until deployed/reachable Actor Gateway and Resource API plus isolated database-principal proof, an approved wrapper-migration sequence, provider lifecycle E2E in the target environment, Amanda/Render role-administration escalation resolution, and a fresh verified backup/recovery point are all established. `GHM_PRODUCTION_MIGRATION_BATCH` remains unset. PayFast remains paused.


## 70. Runtime storage metadata stage assertion restored — exact-head CI PASS (2026-11-16 10:42 UTC)

A source review of PR #286 found that the intended exact five-signature assertion for `RUNTIME_MANUAL_CUTOVER_FUNCTION_GROUPS.storageMetadata` was unintentionally inside a line comment because a literal escaped newline had been written instead of a source newline. The assertion was restored as executable test code in commit `8660a91e9523a3729ceecac0797cdb0f0c5bb516`. The test now directly deep-compares the group with the exact five reviewed signatures and continues to exercise the 1,024 modeled cutover combinations while retaining `ghm.storage_get_public_business_logo(bigint)`.

Exact-head GitHub Actions run [#5109](https://github.com/zaidhqdev-sys/GHM/actions/runs/43850805507) completed successfully for that exact commit. Both `quality` and `web-quality` passed; the Cloudflare Pages integration check also passed.

PR #286 remains draft/open/unmerged. No production database, ACL, role, migration, secret, Render setting or deployment was changed. The live production wrappers remain absent and their migrations pending; production migration execution remains unauthorized and `GHM_PRODUCTION_MIGRATION_BATCH` remains unset. The independent Actor Gateway hosting/network blocker, isolated-principal proof, approved wrapper migration sequence, provider lifecycle E2E, Amanda/Render role-administration escalation and fresh verified backup/recovery point remain outstanding. This code/test pass does not resolve those gates.
