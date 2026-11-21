# Production SECURITY DEFINER catalogue reconciliation — 21 November 2026

## Scope and evidence

Read-only catalogue inspection of Render `ghm-db` / database `ghm_db`. The query inspected every routine in schema `ghm` where `prosecdef=true` and `prokind IN ('f','p')`, capturing exact identity signature, owner, routine-level search_path, direct ACL, and effective EXECUTE for `ghm_runtime`, `ghm_migrator`, and `ghm_payment_provider`. No SQL mutation was issued.

This is a point-in-time catalogue snapshot, not a complete runtime call graph and not a migration-ledger audit.

## Executive result

| Check | Live result |
|---|---:|
| SECURITY DEFINER routines | 63 |
| Functions | 63 |
| Procedures | 0 |
| Owner = `ghm_schema_owner` | 63 / 63 |
| Other owners | 0 |
| Exact required path `pg_catalog, ghm, pg_temp` | 5 / 63 |
| Paths requiring normalization | 58 / 63 |
| Direct PUBLIC EXECUTE | 0 |
| Direct EXECUTE grant options | 0 |
| Direct `ghm_runtime` EXECUTE | 46 routines |
| Direct `ghm_migrator` EXECUTE | 2 routines |
| Direct `ghm_payment_provider` EXECUTE | 2 routines |
| `ghm_schema_owner` EXECUTE | 63 routines |
| `ghm_schema_owner` default-function ACL rows | 0 |

**Correction to earlier handover wording:** the live owner preflight does not currently fail. All 63 inspected SECURITY DEFINER functions are already owned by `ghm_schema_owner`. There is no ownership reassignment plan required by the current catalogue evidence. The actual discrepancy is routine-level search_path normalization.

## Exact current search_path groups

- 54 routines: `search_path=pg_catalog, ghm` (missing explicit trailing `pg_temp`).
- 3 routines: `search_path=ghm, pg_temp` (missing explicit `pg_catalog` first).
- 1 routine: `search_path=ghm, pg_catalog` (wrong order and missing explicit trailing `pg_temp`).
- 5 routines: already `search_path=pg_catalog, ghm, pg_temp`.

The 58 nonconforming signatures are listed below. Every one is currently owned by `ghm_schema_owner`.

### Current `search_path=pg_catalog, ghm` — 54 routines

```text
ghm.auth_bootstrap_external_identity(text,text,text,text)
ghm.auth_change_password(bigint,bigint,text,text,text,integer,integer,integer)
ghm.auth_create_session_with_refresh(bigint,bytea)
ghm.auth_disable_account(bigint)
ghm.auth_internal_revoke_all_sessions_for_account(bigint,text,timestamp with time zone,bigint)
ghm.auth_internal_revoke_session_family(bigint,text,timestamp with time zone)
ghm.auth_issue_recovery(bigint,bytea,timestamp with time zone)
ghm.auth_link_business_external_mapping(text,text,bigint)
ghm.auth_link_external_identity(text,text,bigint)
ghm.auth_lookup_account_external_mapping(text,text)
ghm.auth_lookup_business_external_mapping(text,text)
ghm.auth_lookup_external_identity(text,text)
ghm.auth_lookup_password_by_normalized_email(text)
ghm.auth_read_account_email(bigint)
ghm.auth_redeem_recovery(bytea)
ghm.auth_revoke_all_sessions_for_account(bigint,text)
ghm.auth_revoke_by_refresh_hash(bytea,text)
ghm.auth_revoke_session(bigint,text)
ghm.auth_rotate_refresh(bytea,bytea)
ghm.auth_set_password(bigint,text,text,text,integer,integer,integer)
ghm.auth_validate_session(bigint)
ghm.calculate_business_trust_score(bigint,bigint)
ghm.commercial_apply_payfast_payment_result(bigint,text,text,text,text,text,text,timestamp with time zone,jsonb)
ghm.commercial_apply_payment_result(bigint,text,text,text,text,text,text,text,timestamp with time zone,jsonb)
ghm.commercial_get_payfast_attempt(bigint)
ghm.connect_integration_create(text,text)
ghm.connect_integration_disable(text)
ghm.connect_integration_enable(text)
ghm.connect_integration_revoke(text)
ghm.connect_service_assertion_consume(text,text,timestamp with time zone)
ghm.create_campaign(bigint,bigint,text)
ghm.create_saved_business(bigint,bigint)
ghm.delete_saved_business(bigint,bigint)
ghm.get_business_directory_review_presentation(bigint,bigint)
ghm.is_business_capability_publicly_evidence_eligible(bigint)
ghm.is_directory_listing_founder_reviewer(bigint)
ghm.list_businesses_for_directory_review(bigint,text,integer,integer)
ghm.read_business_registration_identity(bigint,bigint)
ghm.replace_business_capability_assertions(bigint,bigint,jsonb)
ghm.review_business_directory_listing(bigint,bigint,text,text)
ghm.set_business_logo_object(bigint,bigint,bigint)
ghm.set_trust_score_updated_at()
ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text)
ghm.storage_get_object(bigint,bigint)
ghm.storage_get_public_business_logo(bigint)
ghm.storage_mark_available(bigint,text)
ghm.storage_mark_deleted(bigint)
ghm.storage_mark_deletion_pending(bigint)
ghm.submit_business_directory_review(bigint,bigint)
ghm.transition_business_capability_evidence(bigint,text,bigint,text)
ghm.transition_business_capability_verification(bigint,text,text,bigint,text)
ghm.update_business_profile(bigint,bigint,jsonb)
ghm.update_business_registration_identity(bigint,bigint,text,text,text)
ghm.update_campaign(bigint,bigint,text,text)
```

### Current `search_path=ghm, pg_temp` — 3 routines

```text
ghm.auth_bootstrap_founder_system_admin(text)
ghm.auth_create_account(text,text,text,text,text,integer,integer,integer)
ghm.auth_read_connect_identity_authority(bigint)
```

### Current `search_path=ghm, pg_catalog` — 1 routine

```text
ghm.replace_business_hours(bigint,bigint,jsonb)
```

## Five routines already at the required path

```text
ghm.auth_complete_quoteflow_migration_reset(bytea,text,integer,integer,integer)
ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)
ghm.auth_provision_migration_account(text,text,text,text)
ghm.auth_provision_quoteflow_migration_business(text,text,text,text,bigint,text,text,timestamp with time zone)
ghm.auth_register_quoteflow_migration_reset_enrollment(bigint,text,text,text,text,text)
```

## ACL and authority boundary

The inspected SECURITY DEFINER catalogue has 46 routines with direct `ghm_runtime` EXECUTE, two with direct `ghm_migrator` EXECUTE, and two with direct `ghm_payment_provider` EXECUTE. All 63 are executable by `ghm_schema_owner`. No direct PUBLIC EXECUTE entries or grantable EXECUTE entries were found. There are no default-function ACL rows for `ghm_schema_owner` at either global or schema scope in this snapshot.

These are catalogue observations, not approval to change or revoke any role's grants. The path-normalization migration must preserve all existing ACLs. Its SQL uses `ALTER FUNCTION/PROCEDURE ... SET search_path`; it does not issue GRANT, REVOKE, ALTER OWNER, or default-privilege changes.

## Dependency visibility and limits

A `pg_depend` inspection across the 63 routines found 131 catalog dependency rows:
- 63 namespace dependencies (`pg_namespace`);
- 55 language dependencies (`pg_language`);
- 13 return-type dependencies (`pg_type`).

No table or function-body dependencies were exposed by these rows. PostgreSQL does not record a complete dependency graph for arbitrary PL/pgSQL body references, dynamic SQL, external callers, or application routes. Therefore these 131 rows must not be represented as a complete operational dependency map.

The existing disposable qualification script `scripts/qualify-security-definer-search-path-postgres.mjs` deliberately creates a caller-controlled temporary object with the same unqualified name as a GHM table, runs a SECURITY DEFINER canary with the required path, checks that the GHM object wins, and rolls back. Its contract test also checks the migration's whole-catalogue owner preflight and function/procedure path loop.

## Correction plan

1. Keep the existing migration `20261112090000_pin_security_definer_search_path.sql` as the intended catalogue-wide normalization. Its owner preflight is satisfied by this snapshot (63/63).
2. Do not add ALTER OWNER statements or hand-edit individual routines. They are not supported by this evidence and would expand the change unnecessarily.
3. Before execution, reconcile the exact current migration ledger and checksum; confirm this migration is the next member of the approved contiguous pending prefix.
4. Run the existing disposable PostgreSQL qualification against a fresh disposable database and verify all SECURITY DEFINER routines have exact `search_path=pg_catalog, ghm, pg_temp` after migration.
5. Capture before/after full SECURITY DEFINER authority inventories and compare definitions, ownership, direct ACLs, role memberships, schema/database/column privileges and default ACLs. Only the 58 path settings should change; no ACL or ownership change is acceptable.
6. Re-run the production catalogue query after a separately authorized migration. Verify 63/63 owners unchanged, 63/63 exact paths, no unexpected ACL delta, and the existing runtime allow-list contract independently.

## Readiness decision

This corrects the earlier assertion that production ownership discrepancies are the blocker. The current owner preflight is satisfied; the path normalization is the concrete outstanding catalogue condition. This does **not** authorize execution: the exact live migration ledger/checksum audit, migrator authority, approved backup/rollback evidence, complete caller/route review, and coordinated Gateway/Resource API readiness remain outstanding.

No production SQL/DDL, ACL, role membership, routine definition, search_path, migration, Render setting/deployment, credential, secret, payment state, or backup was changed during this inspection. Production migration manifest remains `[]`.
