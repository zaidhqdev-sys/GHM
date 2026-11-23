# Production Migration Dependency Matrix — 20 November 2026

**Status:** READ-ONLY DEPENDENCY ANALYSIS — no production batch authorized  
**Branch:** feat/actor-gateway-production-migration-batches  
**PR:** #298 (draft/open)  
**Target:** Render ghm-db / ghm_db, PostgreSQL 18  
**Execution manifest:** config/production-migration-batches.json = []

## Evidence boundary

Derived from the branch's 50-entry production pending inventory, migration SQL, Actor Gateway app/server, Resource API routers, and production role/service handovers. This is source-contract analysis, not proof of deployed service state.

Not established: exact deployed Resource API commit and route flags; deployed Actor Gateway service/URL (the owner-selected single Free Render service already exists; its inspected deployments failed at startup and no healthy Gateway process is live); live ledger/checksum match; live Gateway function catalogue/ACL; fresh recoverable backup; provider-authorized PostgreSQL role/migrator ACL remediation.

## Service and principal contracts

| Component | Contract | Required proof |
|---|---|---|
| Resource API | Existing GHM-Internal-Runtime; ghm_runtime; GHM_RUNTIME_DATABASE_URL; startup asserts session_user=current_user=ghm_runtime | Verify exact deployed commit, route flags and secret-to-role binding without disclosing secrets. Keep legacy access until each replacement route is live and rollback is defined. |
| Actor Gateway | One dedicated ghm-actor-gateway service; ghm_actor_gateway; GHM_ACTOR_GATEWAY_DATABASE_URL; capability assertion secret and ES256 public-key contract | Form remains unsubmitted. Require certificate-verified TLS if using the external URL; if using the same-region internal URL, document an explicit exception because Render internal TLS uses a self-signed certificate and cannot provide CA/hostname verification. In either case verify session_user=current_user=ghm_actor_gateway, exact startup ACL, /healthz, positive/negative routes, restart and cold-start recovery. Never put its DB URL on Resource API. |
| Migration operator | One-off runner; ghm_migrator then explicit SET ROLE ghm_schema_owner | No hosted migration service. Live preflight blocked by bootstrap membership authority and direct ACLs on 16 relations / 24 sequences. |
| Schema owner | ghm_schema_owner, NOLOGIN | No app/service/password. Preserve ownership and intended migrator SET membership. |
| Storage provider attestation | Actor Gateway login plus distinct provider workflow assertion | Prove provider assertion producer, secret custody and replay rejection; actor identity alone is insufficient. |
| Auth Issuer | Planned ghm_auth_issuer | Role and service absent in last recorded live snapshot; do not assume cutover. |
| PayFast | Separate ghm_payment_provider function boundary | PayFast remains paused; no activation or callback deployment is authorized. |

### Source route map

Actor Gateway routes are authenticated under /v1 and include actor/me; registration identity GET/PUT; admin capability list/draft/transition; supplier classification; Business profile; Business Capability/evidence; Saved Businesses; Business Hours; Trust Scores; Business Logo; Storage metadata lifecycle; Connect business provisioning; campaign/directory review; commercial document authority/approval and payment preparation.

Resource API branch routers include /api/v1/businesses/:businessId/registration-identity, /api/v1/business-capabilities, /api/v1/saved-businesses and storage/logo routes. Gateway clients are conditional and can be configured fail-closed. Before cutover verify production flags and prove no route silently falls back to legacy runtime SQL when Gateway is required.

## Migration-by-migration dependency matrix

Pre-service = schema/function creation before traffic switches. Cutover = runtime access is removed and the replacement must already be live. Support = compatibility/privilege change for an existing Resource API path. These labels do not define a batch boundary.

| Version | Migration | Dependency and gate |
|---|---|---|
| 20261110010000 | add_business_supplier_classification | Resource API / ghm_runtime compatibility; preserve legacy function until signed Gateway route is live. |
| 20261110100000 | create_account_onboarding_progress | Verify deployed onboarding API/schema compatibility and runtime table ACL needs. |
| 20261110120000 | create_business_relationship_outcome_read_models | Confirm read-model consumers; runtime is SELECT-only on new tables. |
| 20261110140000 | allow_pending_storage_object_cleanup | Verify storage lifecycle caller and cleanup semantics; SECURITY DEFINER runtime function. |
| 20261110160000 | add_admin_capability_catalogue_governance | Existing runtime capability routes initially use legacy functions; signed Gateway replacement follows. |
| 20261110210000 | add_actor_gateway_principal_guard | Requires existing LOGIN/NOINHERIT non-elevated role and exact bounded bootstrap membership shape; provider authority remains unresolved. |
| 20261110220000 | add_actor_gateway_self_identity_read | Principal guard; early ID-based wrapper is not yet signed; do not expose before later assertion binding. |
| 20261110230000 | add_gateway_business_registration_identity_read | Principal guard and route contract; signed assertion binding follows. |
| 20261110233000 | add_gateway_business_registration_identity_write | Legacy runtime function and Gateway wrapper coexist; keep legacy path until signed replacement and route are ready. |
| 20261110240000 | enforce_capability_catalogue_cross_row_invariants | Preflight existing catalogue rows against new invariants; trigger owner/search_path and write compatibility. |
| 20261110250000 | add_gateway_capability_governance | Initial ID-based Gateway functions; signed assertion/request-context bindings follow. |
| 20261110260000 | gateway_supplier_classification_cutover | Revokes legacy runtime supplier RPC before signed binding at 20261111030000. Must not be independently executed or exposed in an intermediate state. |
| 20261110265000 | reconcile_business_profile_legacy_contract | Validate Business profile schema/patch compatibility; retain runtime function until signed replacement. |
| 20261110270000 | gateway_business_profile_update | Revokes legacy runtime profile RPC before signed binding at 20261111040000. Must be coordinated with signed binding and service cutover. |
| 20261111020000 | bind_capability_gateway_actor_to_signed_assertion | Gateway-only HMAC secret, nonce replay protection, operation binding and negative tests. |
| 20261111030000 | bind_supplier_gateway_actor_to_signed_assertion | Signed supplier.classification.update operation; exact route/function signature must match. |
| 20261111040000 | bind_business_profile_gateway_actor_to_signed_assertion | Signed business.profile.update; exact route/function signature must match before runtime revocation is relied upon. |
| 20261111050000 | bind_registration_and_self_identity_to_signed_gateway_actor | Signed actor identity and registration read/write operations; Resource API client mapping and negative tests. |
| 20261111060000 | bind_gateway_assertions_to_request_context | Replaces assertion contract with context-bound signature and expanded operation allowlist; all Gateway callers must use matching payload/version. |
| 20261111070000 | add_signed_business_capability_mutations | Requires request-context verifier; signed capability replace/verify/evidence submit/review operation names must match routes. |
| 20261111100000 | add_signed_saved_business_gateway | Requires request-context assertions; Resource API Saved Business client must target Gateway before any future legacy revoke. |
| 20261111130000 | add_signed_business_hours_gateway | Requires signed business.hours.replace operation and compatible member read/write routes. |
| 20261111140000 | add_business_hours_read_projections | Verify signed private member read and safe public projection; confirm Resource API public consumers. |
| 20261111150000 | add_signed_trust_score_gateway | Requires signed trust.score.calculate operation; runtime public projection is a separate contract. |
| 20261111160000 | add_signed_business_logo_gateway | Requires signed logo binding and canonical storage object identity; coordinate upload completion flow. |
| 20261111170000 | add_trust_score_read_projections | Verify public projection exposure and signed Gateway member read semantics. |
| 20261111210000 | revoke_runtime_account_external_identity_table_access | Confirm auth uses retained SECURITY DEFINER functions; no direct table/sequence consumers remain. |
| 20261111220000 | revoke_unused_auth_runtime_entry_points | Prove deployed Resource API/clients do not call auth_revoke_session, auth_change_password or auth_disable_account. |
| 20261111230000 | add_token_bound_recovery_revocation_result | Verify recovery implementation and deployed route compatibility before relying on new result semantics. |
| 20261111240000 | revoke_runtime_quoteflow_migration_provisioning | Confirm no active migration/provisioning caller remains; re-sign-up policy alone does not prove callers are gone. |
| 20261111250000 | revoke_runtime_external_identity_link | Prove identity-link flow no longer calls the direct runtime function. |
| 20261111260000 | revoke_runtime_external_identity_bootstrap | Prove onboarding/registration no longer depends on runtime external-identity bootstrap. |
| 20261112020000 | add_token_bound_password_recovery_reset | Verify deployed reset route uses token hash, one-use binding and current password policy. |
| 20261112030000 | add_conditional_password_rehash | Verify login path uses conditional compare-and-update; test concurrency and unchanged-hash behaviour. |
| 20261112040000 | revoke_runtime_quoteflow_reset_enrollment_registration | Prove reset-enrollment route no longer invokes function; validate support/recovery behaviour. |
| 20261112050000 | revoke_public_default_function_execution | Global PUBLIC EXECUTE change; requires complete live function/grant inventory and explicit allowlist for every deployed principal. |
| 20261112070000 | revoke_legacy_unsigned_actor_gateway_overloads | Requires signed verifier and all dependent operations installed/tested; prove no client calls ID-only assert_actor_gateway(bigint). |
| 20261112080000 | signed_connect_business_provisioning_gateway | Signed business.connect.provision replaces direct mapping helper; verify Resource API onboarding client targets Gateway; do not assume Auth Issuer exists. |
| 20261112090000 | pin_security_definer_search_path | Catalogue-wide ownership and SECURITY DEFINER preflight; postflight every privileged function has ghm_schema_owner and pinned pg_catalog, ghm, pg_temp. |
| 20261112140000 | add_signed_storage_metadata_actor_gateway | Requires request-context signed assertion and correct storage ownership/create/read/deletion route mapping. |
| 20261112150000 | add_storage_provider_workflow_attestation | Requires both actor assertion and distinct provider signature/nonce/context; prove producer, secret custody and replay rejection. |
| 20261112170000 | revoke_redundant_migrator_business_mapping_lookup | Confirm migration runner does not use direct lookup and SET ROLE owner path remains sufficient; does not resolve wider migrator ACL blocker. |
| 20261116140000 | generalize_commercial_payment_provider_code | Verify existing payment-attempt rows and constraints; does not authorize provider activation. |
| 20261116150000 | create_commercial_consent_evidence | Validate immutable document/status/consent evidence tables, triggers, owner and grants; no ungoverned direct writes. |
| 20261116160000 | add_commercial_document_approval_authority | Validate immutable scoped grant/revoke ledger and event references; no approval route before signed Gateway functions. |
| 20261116170000 | add_founder_only_commercial_document_authority_gateway | Requires founder bootstrap state and signed one-use assertion; SQL derives canonical founder actor, not caller-supplied approver. |
| 20261116180000 | add_founder_only_commercial_document_approval_transition | Requires active scoped founder grant, latest draft status, operation-specific assertion and exact immutable version. |
| 20261116190000 | add_commercial_consent_payment_prepare_gateway | Requires approved exact version, explicit consent, idempotency and signed assertion; remains pending_checkout/trialing; no provider call. |
| 20261117010000 | revoke_runtime_business_registration_identity_write | Explicit post-deployment cutover; SQL preflights signed Gateway function, owner and Gateway EXECUTE before revoking runtime. Requires live route and rollback plan. |
| 20261117020000 | revoke_runtime_capability_governance | Explicit post-deployment cutover; preflights signed verifier, four Gateway operations, owner, SECURITY DEFINER, pinned path, Gateway EXECUTE and runtime denial. |

## Ordering hazards

1. Supplier and Business Profile revocations at 20261110260000 and 20261110270000 precede signed replacements at 20261111030000 and 20261111040000. Their intermediate state is not a deployable service cutover. Treat as one reviewed, non-interruptible migration/deployment window or redesign and requalify the SQL sequence. Never select either revocation independently.
2. Do not expose the initial ID-only Gateway wrappers. Traffic requires the signed verifier, operation wrappers, nonce/context rules and startup ACL contract.
3. Do not revoke Auth runtime functions by timestamp. Map each exact Resource API route/caller and prove the deployed commit no longer calls it. Auth Issuer is absent in the last recorded live inventory.
4. PUBLIC EXECUTE revocation needs a complete live function/grant inventory and explicit allowlist for every deployed principal.
5. pin_security_definer_search_path is catalogue-wide; require live owner inventory and exact postflight.
6. Storage provider attestation is a two-party proof; Actor Gateway identity is not provider proof.
7. Commercial payment preparation is not payment activation. PayFast remains paused.
8. 20261117010000 and 20261117020000 are final post-deployment runtime revocations requiring live route, principal and ACL evidence.

## Batch decision

No safe first production batch can be approved. There is no verified deployed service commit/route matrix, fresh live ledger/checksum reconciliation, verified recoverable backup, or resolution of PostgreSQL bootstrap/migrator authority and Gateway identity/ACL readiness.

Keep the manifest exactly []. Keep PR #298 draft/unmerged. Do not run production SQL, change roles/ACLs, submit/deploy the Gateway form, or alter existing Render services. No new paid resource is required or authorized. PayFast remains paused.


## 20 November 2026 — supplier/profile migration sequencing correction

Source review confirmed two automatic migrations previously combined additive Gateway wrapper creation with premature removal of the existing Resource API runtime path:
- `20261110260000_gateway_supplier_classification_cutover`
- `20261110270000_gateway_business_profile_update`

Both now retain the explicit legacy `ghm_runtime` function grant during the additive migration phase while continuing to revoke PUBLIC access. The initial ID-only Gateway wrapper grants were removed from these two migrations; Gateway EXECUTE is granted only when the later signed-assertion migrations replace the wrappers:
- `20261111030000_bind_supplier_gateway_actor_to_signed_assertion`
- `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion`

Two new manual-only cutover scripts were added:
- `database/cutovers/20261120010000_revoke_legacy_supplier_classification_runtime.sql`
- `database/cutovers/20261120020000_revoke_legacy_business_profile_runtime.sql`

They revoke PUBLIC, runtime, migrator and Gateway access to the legacy signatures, but only after their corresponding signed Gateway routes are deployed, end-to-end verified and rollback-rehearsed. They are not in `database/migrations` and are not part of the automatic pending inventory.

Contract tests now assert the legacy runtime path is retained during additive migration and that the separate manual cutover contains the explicit revocation. This is source/test work only; disposable PostgreSQL and exact-head CI remain required. The production batch manifest remains `[]`; no production SQL, ACL, migration, secret, Render setting or deployment was changed.


## 21 November 2026 — source/deployment dependency reconciliation addendum

This addendum supersedes stale statements in the original evidence boundary and Actor Gateway service row where they conflict with the later 21 November Render inspection recorded in the PR #298 handover.

### Verified deployment state

- Resource API service `GHM-Internal-Runtime` is live on old commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`; its process-start logs do not prove current route integration or runtime principal. Current main is `0dc1b27c2b7de71c77d071966a9f374e13075e2b`, and the PR #298 file set does not change the Resource API app/server route code.
- Actor Gateway service `ghm-actor-gateway` exists as the owner-selected Free Frankfurt service, but latest inspected deployment failed at `database_privileges_assertion`; it is not healthy and no live Gateway route is available.
- The live production DB has no effective `ghm_actor_gateway` schema USAGE or function EXECUTE, while the migration source's principal guard grants schema USAGE and signed Gateway migrations grant only the intended operation functions. Do not bypass the fail-closed startup assertion.
- The service form is not a remaining prerequisite; successful deployment/readiness is.

### Source-to-migration sequence findings

1. The production pending inventory in this branch is a 50-entry source inventory, not a verified live queue. The last exact production audit remains historical (15 November) and reported 42 pending; the current live ledger is unreadable through the available connector identity. Never treat either the 50-entry branch inventory or the old 42 count as today's exact pending queue.
2. Migration `20261110210000_add_actor_gateway_principal_guard` is additive and refuses to proceed unless `ghm_actor_gateway` is LOGIN/NOINHERIT/non-elevated and its only direct administrative membership is the bounded `ghm_db_user` ADMIN=true / INHERIT=false / SET=false edge. The latest read-only production catalog inspection observed this edge and the expected role attributes; the migration then grants `USAGE ON SCHEMA ghm` and the guard function. It does not remove existing Resource API runtime grants.
3. Early Gateway wrapper migrations are additive foundation only. Initial ID-only wrappers must not be exposed as production request paths; later signed-assertion/context migrations must be applied and the service must use matching operation names, payload/context and one-use nonce semantics before any route is considered cut over.
4. The supplier/profile migrations `20261110260000` and `20261110270000` now preserve legacy runtime grants in the automatic migration phase. Their runtime revocations are separate manual-only cutovers (`database/cutovers/20261120010000...` and `...20020000...`) after deployed signed routes, end-to-end proof and rollback rehearsal. They must not be confused with an automatic migration batch.
5. The signed Gateway sequence spans capability, supplier classification, Business profile, registration identity, saved businesses, Business Hours, Trust Score, logo, Connect provisioning and Storage metadata. Storage completion additionally requires the independent provider workflow attestation; Actor Gateway identity alone is insufficient.
6. `20261112050000_revoke_public_default_function_execution` is global for functions created by `ghm_schema_owner`. It changes future default privileges and must be gated by a complete live function/ACL inventory and explicit allow-lists for every deployed principal. Existing per-function grants are not automatically removed by this migration.
7. `20261112090000_pin_security_definer_search_path` is catalogue-wide and has a hard preflight: every SECURITY DEFINER function/procedure in schema `ghm` must already be owned by `ghm_schema_owner`; it then pins each path to `pg_catalog, ghm, pg_temp`. The live production read-only inventory found multiple routines outside that owner/path contract. Do not execute this migration until a complete, reviewed ownership reconciliation is ready; do not patch functions ad hoc.
8. Several later migrations revoke legacy runtime auth/external-identity/QuoteFlow entry points. Each requires exact deployed caller/route proof, not an assumption based on user migration policy. These are not interchangeable with Gateway cutovers.
9. The final `20261117010000` registration-identity and `20261117020000` capability-governance revocations are explicitly post-deployment cutovers. Their SQL preflights the signed function owner, SECURITY DEFINER, pinned path, Gateway EXECUTE and runtime denial.

### Batch conclusion

No production batch can be safely derived from source order alone. Production batches must be exact contiguous prefixes of the *fresh live pending queue*, with matching checksums, no out-of-order gaps and all cutover dependencies satisfied. The source inventory is not a substitute for the live ledger. The approved forensic audit is still blocked; migrator/bootstrap authority and the complete catalogue-wide ownership remediation remain unresolved. Therefore:
- keep `config/production-migration-batches.json` exactly `[]`;
- do not execute automatic migrations or manual cutovers;
- do not deploy Resource API or Actor Gateway as a substitute for database readiness;
- keep PR #298 draft/unmerged;
- no production SQL, service setting, secret, credential, payment state, or paid resource is changed by this analysis.


## 21 November 2026 — correction from complete live SECURITY DEFINER catalogue

The earlier statements in this matrix that the live database had routines outside the `ghm_schema_owner` ownership contract are superseded by the complete 21 November catalogue reconciliation at `docs/security/PRODUCTION_SECURITY_DEFINER_CATALOGUE_RECONCILIATION_2026-11-21.md`.

The complete live query found 63/63 SECURITY DEFINER functions owned by `ghm_schema_owner`; no procedures and no ownership exceptions. The known issue is path normalization: only 5/63 currently have exact `pg_catalog, ghm, pg_temp`; 58 require the migration's path update. No direct PUBLIC EXECUTE or grantable EXECUTE entries were found. ACLs and ownership are to remain unchanged.

The existing migration `20261112090000_pin_security_definer_search_path.sql` has a satisfied ownership preflight in this snapshot and applies the exact path to all SECURITY DEFINER functions/procedures. This does not authorize applying it: fresh live ledger/checksum, contiguous pending prefix, migrator authority, backup/rollback, and coordinated service readiness remain prerequisites. The dependency analysis in this matrix should be read with this correction.

## 22 November 2026 — migrator direct-privilege source guard coverage

The migration runner's `ghm_migrator` direct-relation privilege preflight includes both relation-level and column-level ACL checks across GHM tables, partitioned tables, views, materialized views and foreign tables, plus sequence privileges. Column-level checks cover SELECT, INSERT, UPDATE and REFERENCES. This closes a source-level blind spot where a column ACL could exist without the corresponding table-level privilege. The guard is fail-closed before `SET ROLE ghm_schema_owner`; exact-head CI passed on continuation commit `d99e3081df855887493a6425fdc61c0a3d0aafb8` (run [44965859436](https://github.com/zaidhqdev-sys/GHM/actions/runs/44965859436)). This is not a live production ACL result and does not resolve provider-owned role memberships or current production ACLs. The live production ledger, checksums, verified backup/recovery point, and deployed Gateway readiness remain unverified. Keep execution manifest exactly `[]` and PR #298 draft/unmerged.

## 22 November 2026 — PostgreSQL 18 MAINTAIN privilege included in migrator ACL boundary

The follow-up source review found that PostgreSQL 18 table-level `MAINTAIN` was absent from the migrator's direct relation privilege deny-list. The production migration runner now checks `MAINTAIN` alongside SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER, and the source contract requires the privilege to remain denied. The guard remains fail-closed before `SET ROLE ghm_schema_owner`.

The runner and contract commits are `3627c749d21ffa39f10eda20a4b47e9fd91d9639` and `e4e813468936f637d6f73149f1b5d9a9e14ba014`. Exact-head workflow [44967285945](https://github.com/zaidhqdev-sys/GHM/actions/runs/44967285945) is still queued/pending; the runner-only predecessor [44967283129](https://github.com/zaidhqdev-sys/GHM/actions/runs/44967283129) remains in progress and is not exact-head evidence. No CI pass is claimed for this addition.

This is a source guard, not a live production ACL audit. Keep the production batch manifest exactly `[]`; provider-owned role memberships, fresh recovery evidence, live ledger/checksum reconciliation and deployed Gateway readiness remain independent blockers. PR #298 remains draft/unmerged; no production or Render changes were made.


## 22 November 2026 — Render PostgreSQL TLS semantics clarified

Render's official PostgreSQL connection documentation distinguishes the two transport paths: same-region internal connections use the private network and may optionally use TLS with a self-signed certificate; internal certificates do not support `verify-ca` or `verify-full`. External connections are always encrypted with Render-managed TLS certificates and require TLS. Source: [Render PostgreSQL connection documentation](https://render.com/docs/postgresql-creating-connecting).

The Actor Gateway source policy now supports both modes: `internal` requests TLS encryption but deliberately disables certificate verification because the internal certificate is self-signed; `external` requests TLS with Node's certificate verification. Therefore, internal mode is encrypted but is not certificate-authenticated and must not be described as strict/verified TLS. The production Actor Gateway row above is corrected to require an explicit documented exception for internal mode, or certificate-verified TLS through the external URL. Do not select a mode based on assumptions: confirm the actual service/database region and URL pairing first. No Render URL, environment variable, secret, database or deployment was inspected or changed.

This documentation correction does not clear deployment readiness. A healthy deployed Gateway, exact deployed commit, startup principal/ACL evidence, route matrix, restart/cold-start evidence, provider authority remediation, fresh backup/restore evidence and live ledger/checksum audit remain outstanding. Keep the production migration manifest exactly `[]` and PR #298 draft/unmerged.

## 22 November 2026 — live Render Gateway state update

Read-only Render inspection of the existing Frankfurt Free service `ghm-actor-gateway` found branch `main`, auto-deploy disabled, health path `/healthz`, and no successful deployment in the inspected history. Latest deployment checked out `0dc1b27c2b7de71c77d071966a9f374e13075e2b`, built successfully, then failed startup at `database_privileges_assertion` / `database_privileges_rejected`. The qualified TLS correction on `feat/pr298-github-continuation-20261122` is therefore not deployed. Do not treat source CI as live Gateway readiness. No environment values/secrets were read and no service, database, role, ACL or deployment changes were made. Deployment branch alignment, effective privilege diagnosis, transport pairing, healthy startup, route matrix and recovery tests remain blocked pending explicit authorization and prerequisite evidence.

## 22 November 2026 — read-only production ACL diagnosis

Read-only catalog inspection of `ghm-db` / `ghm_db` ran as `session_user=ghm_app_user`, `current_user=ghm_db_user` (not the Gateway runtime identity). The `ghm_actor_gateway` role exists with restrictive flags, no direct role memberships were returned, database CONNECT=true/CREATE=false, but effective `ghm` schema USAGE=false/CREATE=false. No `gateway_*` or `assert_actor_gateway*` functions were found in schema `ghm`; all 39 expected signatures in the checked-in Gateway allowlist were absent. Direct table/sequence grants and executable ACL entries for that filtered routine set were absent. This is consistent with the Gateway startup privilege assertion failure, but does not establish whether the cause is unapplied migrations, a different service database target, or configuration drift. A read-only query of `ghm.ghm_schema_migrations` was denied with SQLSTATE 42501; no privilege bypass was attempted. No production state was changed. Correct runtime-target and authorized ledger evidence remain prerequisites; do not grant privileges or apply migrations based on this observation alone.


## 23 November 2026 — recovery export validation checkpoint

The owner created and downloaded a logical export from the existing Render ghm-db / ghm_db Recovery page on 23 Nov 2026. Local directory-format archive listing (68 entries), extraction, inventory (65 .dat files; 537,326 bytes; zero empty files), toc.dat catalogue parsing with PostgreSQL 18.6 (pg_restore --list, exit 0; source dump 18.7), and data-section processing (pg_restore --data-only --file NUL, exit 0) succeeded. This is structural/catalogue/data-section decode evidence only. No actual restore, row verification, ledger/checksum reconciliation or application validation occurred; do not mark restore-tested or fully recoverable. SHA-256 output available in transcript is truncated and is not a verified checksum. Backup remains local; do not upload it. Render Support states logical exports remain available for seven days; PITR is three days and creates a separately billed instance, so no PITR instance was created. No production DB operation or paid resource change occurred. Production migration manifest remains []. See the 23 Nov consolidated audit checkpoint in the main handover for the no-repeat checklist.


## 23 November 2026 — PR/base reconciliation and qualification state

Read-only current GitHub inspection found current main `93ff3c774ce225760b0e3e2cf99a770b38e8a097`. PR #298 head `b6b96c44ac26544156e099373d3185a965b880fd` is open/draft, mergeable=false (`dirty`), 443 commits and 56 files; current-main compare is 443 ahead / 94 behind. Only Cloudflare Pages is present as a successful exact-head check; no quality/web-quality result observed and commit status is pending. PR #297 head `304da520c5cfe1e77b479a97dfdd9d951fa6e245` is open/draft, mergeable=false (`dirty`), 119 commits / 28 files, with only Cloudflare Pages success observed. PR #303 head `3af71a78b86c74864092150c6d036b312cf5ce45` is open/draft, mergeable=true (`clean`) against current main; exact-head Cloudflare Pages, web-quality and quality checks all passed. PR #303 remains separate and draft. Production migration manifest remains exactly []. Do not merge or mark ready any PR from this evidence. Next task: isolated conflict inventory and dependency-aware reconciliation plan for #298/#297 against current main, preserving original local worktree and existing user changes. No code, refs, PR metadata, production DB, Render services, credentials, ACLs or deployment changed during this inspection.


## 23 November 2026 — source-tree migration batch reconciliation findings

Current main has the legacy full-queue production allowlist runner and seven-entry pending inventory, but no batch selector module/tests or production batch manifest. PR #298 adds a checksum-bound contiguous-prefix batch selector, signed-cutover dependency guard, plan-only runner mode and an empty execution manifest. PR #297 implements a different older batch/inventory API and must not be combined with PR #298's shape. Current main has two later 20 Nov signed Business Capability migrations absent from PR #298's 50-entry inventory: 20261120010000_add_signed_business_capability_create.sql and 20261120011000_allow_signed_business_capability_create_assertion.sql. The current seven-entry production pending inventory does not list them. Their live applied/pending status is unknown because the production ledger read remains denied; do not infer or change the inventory without authorized live ledger/name/checksum evidence. Recommended integration: new isolated branch from current main, selectively re-implement PR #298's single batch design on current main, preserve all mainline security changes, keep manifest exactly [], and exclude PR #297's competing API. Preserve the known local merge-in-progress and PR303 worktrees. PR #298/#297 are dirty/conflicted and not CI-qualified; PR #303 is clean and its exact-head quality/web-quality/Cloudflare checks passed but remains draft. No source, branch, PR, production or Render state changed during this source-only inventory.


## 23 November 2026 — isolated integration branch

Created `feat/production-migration-batches-mainline-20261123` from exact current main `93ff3c774ce225760b0e3e2cf99a770b38e8a097` for a selective, mainline-based migration-batch integration. Branch creation only; no source changes yet. This branch avoids modifying PR #298/#297 and known local merge-in-progress state. Preserve current-main migration source and seven-entry pending inventory, do not guess production applied status, and keep manifest empty. No production or Render changes.


## 23 November 2026 — selective batch selector foundation

Created isolated branch from current main and added a checksum-bound exact contiguous-prefix migration batch selector with explicit batch ID, ordered/unique identity validation, checksum match and signed cutover/replacement dependency guards; added 14 focused unit tests and initialized `config/production-migration-batches.json` to exactly []. Commits: `1a7b5f7`, `c3423d4`, `199c130`. This is not yet wired into `migrate.ts`, and no CI/local test result is claimed. Current-main seven-entry pending inventory remains unchanged because live applied status of two newer Business Capability migrations is unknown. Next: integrate fail-closed into current-main runner, preserve existing target/SSL/role/checksum/name guards, wire test script, and verify no SQL execution without explicit batch. No production/Render/local worktree changes.


## 23 November 2026 — production batch gate integration (CI pending)

Current-main migration runner now requires an explicitly named, checksum-bound, exact contiguous-prefix batch for production ghm_db before migration SQL; selected versions alone pass through execution loop. Non-production remains all-pending. Existing target/SSL/migrator/SET ROLE/advisory-lock/allowlist/out-of-order/checksum guards are preserved. Ledger query now reads version/name/checksum and verifies current-repository names. Added selector, ledger-name and runner wiring/order tests to package test command; CI push trigger includes isolated branch. Branch `feat/production-migration-batches-mainline-20261123`, head `646a8253906126d48913123d92d470f2b7b56a18`. Manifest remains exactly []; current seven-entry inventory untouched pending live ledger. Exact-head CI run 45216633082 had quality in progress, web-quality queued, Cloudflare Pages in progress at checkpoint; no pass yet. No production/Render/local worktree changes.


## 23 November 2026 — initial CI build failure and correction

CI run 45216633082 at initial integration head 646a825 failed TypeScript Build due to duplicate `AppliedMigrationLedgerEntry` and `assertAppliedMigrationNames` declarations in migration-order.ts (TS2300/TS2451). Database qualification and tests were skipped. Removed the duplicate block in commit `6f5525372f93cc194c22db3f50b932697798c17a` on isolated mainline branch. Corrected-head CI status pending at this checkpoint; no pass claimed. No production changes.


## 23 November 2026 — PR #305 created; exact-head CI pending

Draft PR #305 opened from `feat/production-migration-batches-mainline-20261123` to current main. Head `6f5525372f93cc194c22db3f50b932697798c17a`; base `93ff3c774ce225760b0e3e2cf99a770b38e8a097`; mergeable=true at creation. Cloudflare Pages preview passed, but exact-head `quality`/`web-quality` checks were not present and commit status remained pending/empty. Earlier head 646a825 failed TypeScript Build due to duplicate ledger guard declarations; corrected in 6f552537. No local validation run. Keep PR draft; obtain full exact-head CI through a clean worktree/normal owner push or authorized workflow dispatch. Do not treat preview as CI. No production changes; manifest remains [].



## 23 November 2026 — Render read-only ledger access evidence

A direct Render read-only query against existing `ghm-db` confirmed database `ghm_db` is available and the connection is `session_user=ghm_app_user`, `current_user=ghm_db_user`, with `transaction_read_only=on`. The ledger `ghm.ghm_schema_migrations` exists and is owned by `ghm_schema_owner`; ACL grants SELECT to `ghm_auditor` only. The auditor has schema USAGE and ledger SELECT, but the current `ghm_db_user` session cannot SET ROLE to it. Therefore no production ledger rows/checksums or exact pending queue could be retrieved. Catalog metadata also reports `ghm_db_user` as NOSUPERUSER with CREATEDB and CREATEROLE; no role mutation was performed. The proposed dedicated auditor login is a production role/credential change and remains unperformed pending explicit authorization and a secure secret-entry path. This evidence supersedes the earlier statement that access was merely assumed to be denied: the denial was reproduced through Render's read-only query path. No production writes, migration, deploy, or new branch/CI qualification occurred.



## 23 November 2026 — Amanda auditor-login prerequisite role audit

Before implementing Amanda's already-recommended dedicated login, used the existing Render read-only query path to verify `ghm_auditor`:
- NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS; INHERIT=true; no role memberships.
- `ghm` schema USAGE=true and CREATE=false.
- Only non-system relation privilege in `ghm` is SELECT on `ghm_schema_migrations`; no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER or other relation grants.
- `public` schema USAGE and database CONNECT/TEMP are present as ordinary PUBLIC defaults; database CREATE=false.
This verifies the target role is appropriately read-only for the ledger. Amanda's prescribed next step is a dedicated LOGIN member of `ghm_auditor`, direct connection as that login, and post-creation verification. The owner-controlled password must be entered through a secure interactive path (not chat/Git/logs). The Render query connector is read-only and cannot perform CREATE ROLE; no login or credential was created in this step. Do not ask Amanda to repeat the recommendation; use the already documented answer.


## 23 November 2026 — live production pending queue reconciled

Dedicated `ghm_audit_login` session successfully read 105 production ledger rows under `BEGIN READ ONLY`; owner subsequently confirmed `ROLLBACK;` succeeded and closed the transaction. Compared with exact PR #305 source head `bcbeeb817c53569a6a3ac71df7d270b10a4bca9f` (147 `database/migrations/*.sql` files): 95 applied version/name pairs overlap the current source with 0 name mismatches; 10 ledger-only rows match the retained production historical registry; 52 repository migrations are pending in the exact order documented in the migration handover. The seven-entry production pending allowlist contains seven valid pending identities but omits 45 of 52, including the first pending migration; it cannot authorize execution of the current queue. PR #305 execution manifest remains `[]`. The two 20 Nov signed Business Capability migrations are absent from the live ledger and are therefore pending. The supplier-classification and Business Profile runtime cutovers and their signed replacement dependencies are all pending; PR #305 selector guards remain applicable.

**Checksum scope is still open:** the 95 overlapping applied SQL file contents have not yet been fully rehashed against the live ledger using the canonical SHA-256/LF and legacy CRLF rules and production provenance exceptions. Version/name reconciliation and retained historical registry matching are not a substitute for that checksum audit. No production migration, DDL, ACL/role/credential change, Render change or deployment was performed. No new branch or CI run was created.


## 23 November 2026 — checksum audit preparation; overlap count corrected

Corrected the live ledger/source arithmetic: production has 105 rows = 1 bootstrap + 94 applied migrations overlapping the exact PR #305 source tree + 10 ledger-only retained historical rows. The PR #305 source tree contains 147 migration SQL files, so the pending queue is 52 (147 - 1 bootstrap - 94 applied). The previous 95-overlap figure accidentally included the bootstrap; the 52 pending figure remains correct.

Checksum source rules are documented in `src/db/migration-checksum.ts`: SHA-256 UTF-8 after CRLF/CR -> LF normalization, accepting the legacy CRLF digest as a compatibility fallback. The 16-entry historical provenance exception registry and 10-entry retained historical registry were inspected. A digest derived from connector-rendered text did not match a known explicit historical checksum, so that method is rejected as byte-inexact; no checksum mismatch is asserted. Complete the 94 applied source-overlap comparisons using exact Git blob bytes from PR #305 head `bcbeeb817c53569a6a3ac71df7d270b10a4bca9f`, plus verify the 10 retained ledger-only rows and exception registry. No production write or CI rerun.
