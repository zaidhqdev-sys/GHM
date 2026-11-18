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


## Current branch reconciliation note — 18 November 2026, 03:34 UTC

- Current `main` is `b73839b27ac90446650f921d3e8ce1b5de041f04`. PR #298 is the current runner candidate based on that main; its 50-entry pending inventory and empty execution manifest are candidate branch artifacts, not production authorization.
- PR #296's Business Identity INSERT privilege migration `20261116200000_narrow_business_identity_runtime_insert.sql` is not present in current main or PR #298's 50-entry inventory. It remains isolated on a stale-base, draft, non-mergeable PR branch. Its exact-head CI passed, but it is not included in the current 50-entry plan and must not be applied or silently appended.
- PR #297 and #285 are stale/non-mergeable runner alternatives; PR #286 is separate storage metadata ACL/cutover work. PR #298 remains the sole current runner candidate, draft and unmerged. Its full quality job passed 76/76, while the direct web npm audit remains blocked by the known picomatch advisory.
- No production migration, ACL/role change, inventory expansion, execution batch selection, deployment, or CI rerun was performed during this reconciliation. Keep production execution blocked pending live ledger/checksum reconciliation, role authority resolution, dedicated Actor Gateway credentials/hosting proof, verified backup/recovery and rollback gates.


## 18 November 2026 — fresh production ledger access attempt (read-only)

- Re-read this reconciliation handover, the current role-separation handover, PR #298's migration-batch handover, the exact runner/audit source and PR #298 status before querying the existing Render database.
- Queried Render PostgreSQL service `ghm-db` / database `ghm_db` (PostgreSQL 18, Frankfurt; service ID `dpg-dag0sdtbedkc7389vi2g-a`) through the read-only query interface. The session identity was `session_user=ghm_app_user`, `current_user=ghm_db_user`.
- SELECT from `ghm.ghm_schema_migrations` failed with SQLSTATE 42501 (permission denied). The table owner is `ghm_schema_owner`; its observed ACL grants SELECT to `ghm_auditor`. The current session cannot SET ROLE `ghm_schema_owner`. Therefore **no exact production ledger rows, version list, checksums, ordering or count were retrieved**.
- PostgreSQL table statistics exposed `n_live_tup=105`, but last auto-analyze was 2026-09-21. This is stale approximate statistics, not a verified current count. Earlier handover references to a 105-row ledger must not be treated as a fresh exact production audit.
- Fresh role catalogue confirms `ghm_db_user` retains CREATEROLE, CREATEDB and INHERIT. `ghm_app_user` can SET ROLE `ghm_db_user`. `ghm_db_user` has ADMIN OPTION memberships over `ghm_actor_gateway`, `ghm_auditor`, `ghm_migrator`, `ghm_payment_provider` and `ghm_schema_owner`, with multiple `ghm_runtime` membership rows. This is a live role-authority blocker; no remediation was attempted.
- Catalog search returned zero `ghm.gateway_%` and zero `ghm.assert_actor_gateway%` routines in schema `ghm`. This does not reveal the exact ledger position of their source migrations.
- PR #298's 50-entry candidate inventory and plan-only qualification remain repository/disposable-fixture evidence only. They are not evidence of the exact production pending queue. Its execution manifest remains empty.
- Next safe step: resolve the Render-supported administrator/application login separation and obtain an authorized dedicated `ghm_migrator` connection with verified TLS and documented schema-owner SET capability; then run the existing read-only forensic predeploy audit and preserve its exact output. Do not run `npm run migrate`, do not change production roles/ACLs, and do not grant ledger access to the application login as a workaround.
- A fresh verified production backup/recovery point remains a prerequisite for any eventual role or migration change. No database write, grant, role change, migration, secret, Render configuration, deployment, payment action, paid resource or CI run occurred.


## 18 November 2026 — exact live migrator-principal contract check

- Re-read the production reconciliation, Render role-separation and PR #298 migration-batch handovers, the exact runner source `src/db/migrate.ts` / `src/db/migrator-principal.ts`, and PR state before this read-only follow-up.
- Correction to the prior blocker description: production role `ghm_migrator` **exists** and is LOGIN/NOINHERIT with no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS. It has exactly one direct membership to `ghm_schema_owner` with ADMIN=false, INHERIT=false, SET=true. This single edge matches the intended migration SET path.
- The full principal contract still fails:
  1. `ghm_db_user` is a member of `ghm_migrator` with ADMIN OPTION=true / INHERIT=false / SET=false; live `migrator_member_count=1`, expected 0.
  2. `ghm_db_user` is also a member of `ghm_schema_owner` with ADMIN OPTION=true / INHERIT=false / SET=false. Together with `ghm_migrator`, live `schema_owner_membership_count=2`, expected 1.
  3. The exact direct relation/sequence privilege predicate in the migration runner returns true, expected false.
- Direct ACL expansion confirmed explicit `ghm_migrator` grants by `ghm_schema_owner`: SELECT/INSERT/UPDATE/DELETE on 16 named relations (commercial event/allocation/payment/plan/subscription/trial tables, country, currency, opportunity, opportunity participant/type) and SELECT/USAGE on 23 sequences. No `pg_default_acl` entries for `ghm_migrator` were found. The migration ledger itself grants SELECT to `ghm_auditor`, not `ghm_migrator`.
- The source/operation that created these per-object grants has not yet been attributed. Do not infer it from current ACLs; trace migration history and historical handovers before proposing remediation.
- Render's read-only query connector is bound to `databaseUser=ghm_app_user`, observed session `session_user=ghm_app_user`, `current_user=ghm_db_user`. It cannot SET ROLE to the dedicated migrator or schema owner, so it cannot run the intended forensic audit. The audit must use the dedicated `GHM_MIGRATOR_DATABASE_URL` credential through the approved local checkout with `DATABASE_SSL=true` and verified TLS, once the principal contract has been reconciled.
- Exact live migration ledger rows/checksums/order remain unavailable. The stale 105-row table statistic must not be used as an exact count. PR #298's 50-entry inventory remains candidate-only; execution manifest remains empty.
- No grant, role, ACL, migration, secret, Render setting, deployment or production data changed. No CI was run.


## 18 November 2026 — source trace of live migrator ACLs

Before tracing, the current three handovers, PR #298 metadata, migration runner contract, historical PostgreSQL role-separation runbook/SQL plan, and relevant migration source files were re-read.

**Source attribution — table grants**
- `database/migrations/20260914100000_create_opportunity_core.sql` explicitly grants `SELECT, INSERT, UPDATE, DELETE` on `ghm.opportunity`, `ghm.opportunity_type`, `ghm.country`, and `ghm.currency` to `ghm_migrator`.
- `database/migrations/20260916010000_create_opportunity_participant.sql` explicitly grants the same four table privileges on `ghm.opportunity_participant` to `ghm_migrator`.
- `database/migrations/20260915150000_create_commercial_schema.sql` explicitly grants the same four table privileges on 11 Commercial tables: `commercial_plan`, `commercial_plan_version`, `commercial_plan_entitlement`, `commercial_plan_price`, `commercial_trial`, `commercial_subscription`, `commercial_payment_attempt`, `commercial_payment_transaction`, `commercial_provider_event`, `commercial_event`, and `commercial_founding_allocation`.
- These three source migrations account for all 16 table names observed in the live explicit ACL expansion. Live ACLs identify `ghm_schema_owner` as grantor, consistent with execution under the migration owner; the original migration statements identify the source intent. The grants are explicit legacy migration-authority grants, not default ACL entries.

**Source attribution — sequence grants**
- The Opportunity Core migration grants `USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ghm TO ghm_migrator`.
- The Commercial schema migration repeats the same broad all-sequences grant.
- The Opportunity Participant migration adds explicit `USAGE, SELECT` on `ghm.opportunity_participant_id_seq`.
- Current live ACL expansion now counted **24 distinct sequences** (not 23): account_identity, business, business_membership, commercial_event, commercial_founding_allocation, commercial_payment_attempt, commercial_payment_transaction, commercial_plan_entitlement, commercial_plan, commercial_plan_price, commercial_plan_version, commercial_provider_event, commercial_subscription, commercial_trial, country, currency, enquiry, opportunity_capability_requirement, opportunity, opportunity_participant, opportunity_type, project, project_quote, and review identity sequences. Each has explicit `SELECT` and `USAGE` entries granted by `ghm_schema_owner`.
- The two historical `ON ALL SEQUENCES` statements explain the broad grant pattern, but exact per-sequence provenance cannot be proven from the current ACL alone: each all-sequences statement affects only sequences existing at its execution time, and the later participant migration adds one named sequence. Do not claim the two statements alone prove the origin of every one of the 24 current entries without exact production ledger chronology or a historical ACL snapshot.

**Why the current runner rejects this state**
- Current `src/db/migrator-principal.ts` explicitly requires `direct_relation_privileges=false`.
- Current `src/db/migrate.ts` computes that flag using effective `has_table_privilege` / `has_sequence_privilege` checks across every relation in schema `ghm`; the observed explicit grants cause the predicate to fail.
- The same source contract requires zero members of `ghm_migrator` (live count 1) and exactly one member of `ghm_schema_owner` (live count 2). The extra memberships are documented in the historical role-separation runbook as bootstrap-`postgres` grants with ADMIN OPTION. That handover says `ghm_db_user` cannot revoke them and an independent provider/bootstrap-authority path is required.
- The current `20261112170000_revoke_redundant_migrator_business_mapping_lookup.sql` removes one redundant function EXECUTE grant only; it does not remove relation/sequence ACLs or the bootstrap memberships.
- The current forensic connection still cannot authenticate as `ghm_migrator`; therefore no exact live ledger/checksum audit has been completed.

**Disposition and correction**
- Correct the prior 23-sequence statement: current live explicit ACL expansion reports **24 sequences**. The previous count omitted one sequence and must not be repeated.
- The source of all 16 table grants is now attributed to three named migrations. The broad sequence-grant policy is attributed to the Opportunity Core and Commercial schema migrations, with the Participant migration's named sequence grant also identified; exact historical per-sequence application chronology remains unproven.
- Do not add speculative revoke migrations or alter production grants. Any cleanup must be designed against the exact approved migration history, dependency checks, recovery plan, and provider/bootstrap authority path. In particular, do not remove migration-owner privileges merely to make the current preflight pass.
- No production role, membership, grant, ACL, data, migration, credential, Render setting, deployment, payment state, or paid resource was changed. No CI was run.


## 18 November 2026 — gated remediation plan created

A separate design-only plan was added at `docs/security/PRODUCTION_MIGRATOR_AUTHORITY_REMEDIATION_PLAN_2026-11-18.md` (commit `6f1a7808e3372ddd6e89b7a06713c6b74f146d89`). It sequences the work into: preserve evidence and verify backup; provider/bootstrap-owned removal of the two unintended membership edges; narrowly scoped removal of the 16 table and 24 sequence ACL entries while preserving ownership and the intended migrator SET edge; dedicated migrator read-only preflight and exact ledger export; then exact migration reconciliation before any separately approved execution plan.

This is explicitly a design, not an authorization. No production SQL, role/ACL changes, backup operation, secret access, deployment, migration or CI occurred. PR #298 remains draft and its execution manifest remains empty.


## 18 November 2026 — complete live bootstrap membership inventory correction

A fresh read-only production query of `pg_auth_members` and `pg_roles`, checked against the 12 November database grant-authority handover and PostgreSQL role-separation runbook, establishes **six** bootstrap-`postgres` ADMIN OPTION memberships held by `ghm_db_user`: `ghm_actor_gateway`, `ghm_auditor`, `ghm_migrator`, `ghm_payment_provider`, `ghm_runtime`, and `ghm_schema_owner`. Each has ADMIN=true, INHERIT=false, SET=false. Earlier remediation wording that only identified migrator and schema owner was incomplete.

There is a separate non-admin `ghm_db_user -> ghm_runtime` edge granted by `ghm_db_user` (ADMIN=false, INHERIT=true, SET=true). Preserve that runtime SET edge until the separately gated runtime credential cutover is qualified; do not conflate it with the bootstrap ADMIN OPTION edge. `ghm_app_user -> ghm_db_user` remains grantor postgres, ADMIN=false, INHERIT=true, SET=true. `ghm_db_user` remains LOGIN/INHERIT with CREATEDB=true and CREATEROLE=true, so the legacy application authority chain remains a critical isolation issue.

Live role flags show the target actor-gateway, auditor, migrator, payment-provider and runtime roles are non-elevated; auditor and schema owner are NOLOGIN. Those target flags do not neutralize `ghm_db_user`'s admin-option membership authority. Each of the six edges needs purpose-specific dependency and recovery analysis; do not bulk revoke them. The detailed remediation plan now contains the corrected complete inventory (commit `8994a57dc974690473725bed0792189423443fcb`).

No production membership, role attribute, grant, ACL, data, credential, service, setting, deployment, migration, backup or payment state was changed. No CI was run. PR #298 remains draft and its execution manifest remains empty.
