# Actor Gateway production privilege remediation plan — 20 November 2026

**Status:** DESIGN ONLY — NOT APPROVED FOR PRODUCTION EXECUTION  
**Target:** Existing Render PostgreSQL `ghm-db` / `ghm_db`, PostgreSQL 18, Frankfurt  
**Related:** PR #298 (draft), PR #301/#302 (merged), PR #300/#297 (separate, draft)  
**Production migration manifest:** `config/production-migration-batches.json` remains `[]`

## 1. Purpose and hard boundary

This plan converts the 20 November read-only production catalogue evidence into an ordered remediation design. It does not authorize SQL writes, migrations, role membership changes, GRANT/REVOKE, credential changes, service configuration, deployment, or payment activation.

Do not fix the startup assertion by weakening it. Do not grant broad schema/table/sequence access to `ghm_actor_gateway`. Do not run a non-contiguous migration subset. Do not use the Render query connector's `ghm_db_user` identity as a substitute for the dedicated migration principal.

## 2. Evidence captured from production (read-only)

Target database: `ghm_db`; inspection identity: `session_user=ghm_app_user`, `current_user=ghm_db_user`. These were catalogue SELECTs through the Render Postgres query connector; no write statements were run.

| Check | Observed value | Meaning |
|---|---:|---|
| `ghm_actor_gateway` role exists | true | Role was provisioned out-of-band |
| Gateway database CONNECT | true | Required connection privilege exists |
| Gateway database CREATE | false | Correctly restricted |
| Gateway `ghm` schema USAGE | false | Immediate startup blocker |
| Gateway `ghm` schema CREATE | false | Correctly restricted |
| Gateway executable functions | 0 | No Gateway API functions are installed in production |
| Runtime executable Gateway functions | 0 | No Gateway wrapper exposure to runtime |
| Gateway direct relation privileges | 0 | No direct table/view/sequence privileges |
| SECURITY DEFINER functions | 63 total | Catalogue inventory |
| SECURITY DEFINER owner mismatch | 0 | All 63 are owned by `ghm_schema_owner` |
| SECURITY DEFINER pinned-path compliant | 5 | Exact required value is `pg_catalog, ghm, pg_temp` |
| SECURITY DEFINER path non-compliant | 58 | All 58 have a different function-level path |
| Global function default ACL row for `ghm_schema_owner` | absent | PostgreSQL global default remains unresolved at this snapshot |
| Schema-specific function default ACL | `ghm_runtime=EXECUTE/ghm_schema_owner` in `ghm` | Existing future-function grant to runtime; startup assertion classifies this as unsafe |
| PUBLIC-executable Gateway functions | none installed | No Gateway function objects currently exist |

### SECURITY DEFINER path distribution

| Existing function-level `search_path` | Count |
|---|---:|
| `pg_catalog, ghm` | 54 |
| `ghm, pg_temp` | 3 |
| `ghm, pg_catalog` | 1 |
| `pg_catalog, ghm, pg_temp` | 5 |
| **Total** | **63** |

All 58 non-compliant functions already have the intended owner. The outstanding defect is their function-level search_path setting, not 58 ownership failures. The pending migration `20261112090000_pin_security_definer_search_path` is designed to normalize every SECURITY DEFINER function in schema `ghm` to `pg_catalog, ghm, pg_temp`, after an owner preflight.

### Important correction to earlier handover shorthand

An earlier query counted only global default-ACL rows and reported zero. A wider read-only query found a schema-specific default ACL row in schema `ghm`: `ghm_runtime=U/ghm_schema_owner` (EXECUTE granted to runtime by schema owner). Therefore it is incorrect to say that no function default ACL exists. There is no global row, but there is a schema-specific runtime EXECUTE default. The current Gateway source marks any non-owner function default grantee in global or `ghm` scope as unsafe. This exact schema-specific row therefore needs an explicit disposition before Gateway startup can pass.

### Gateway function allowlist

The production catalogue currently has no Gateway functions at all. The live executable-function count is therefore zero, not a partially granted set. The source allowlist is defined in `src/actor-gateway/database-privileges.ts` and contains the exact signed wrapper signatures expected by the Gateway. Those functions must be installed by the reviewed migration chain, owned by `ghm_schema_owner`, SECURITY DEFINER, pinned to the required search_path, granted EXECUTE only to `ghm_actor_gateway`, and denied to `PUBLIC` and `ghm_runtime`. Do not grant a wildcard or all-functions privilege to make the count match.

## 3. Separate blockers — do not conflate them

1. **Gateway startup ACL:** `ghm_actor_gateway` lacks schema USAGE and has zero executable Gateway wrappers. This is why the current service exits at `database_privileges_assertion`.
2. **Function hardening/defaults:** 58 existing SECURITY DEFINER functions need the pinned path migration; the schema-specific default EXECUTE grant to `ghm_runtime` conflicts with the Gateway's future-function-default assertion and needs an explicit, compatibility-reviewed change.
3. **Migration authority:** the existing production migrator handover records bootstrap-`postgres` ADMIN OPTION memberships and direct ACLs on 16 relations / 24 sequences that do not satisfy the current runner contract. The available Render query connector is not the dedicated `ghm_migrator` identity and cannot prove the migration runner's exact live ledger view. Only Render/provider bootstrap authority can resolve the bootstrap membership edges; do not attempt to remove them through `ghm_db_user`.
4. **Ledger and recovery:** the 105-row production ledger is a dated November 9 snapshot, not a current execution authorization. The November 14 logical export was restored locally, but this is not a fresh backup or a Render PITR/restore test.
5. **Application readiness:** deployed Resource API commit, feature flags, Gateway URL and all route-to-wrapper mappings still require verification. A successful Gateway /healthz alone is not proof that all traffic routes are safely cut over.

## 4. Ordered remediation design

### Gate A — refresh production evidence and recovery first

Before deriving any production batch:
- Obtain a fresh Render-generated logical backup and verify its checksum, object size and timestamp.
- Restore it into an isolated local PostgreSQL 18 database; compare ledger row count, min/max versions, exact version/name pairs, checksums, table counts and key invariants.
- Obtain a documented Render PITR/restore capability and recovery owner/steps; local logical restore alone is not PITR evidence.
- Retrieve the exact live migration ledger through an authorized read-only path. Do not use `n_live_tup` or the November 9 export as a substitute.
- Reconcile every applied row against canonical or explicitly approved historical provenance, including name equality and duplicates. Recompute the exact pending suffix.
- Do not put secrets or database URLs in the handover.

**Stop condition:** no current exact ledger plus verified recovery evidence means no production batch can be selected.

### Gate B — resolve migration-runner bootstrap authority separately

- Have Render/provider support or the authorized bootstrap administrator resolve the six recorded bootstrap-`postgres` ADMIN OPTION membership edges for `ghm_db_user`; use the latest complete role-membership inventory, not an assumed subset.
- Re-run read-only role-membership checks and confirm the runner's exact expected counts and flags: `ghm_migrator` is LOGIN/NOINHERIT/non-superuser/non-createdb/non-createrole/non-replication/non-bypassrls; its only direct membership is `ghm_schema_owner` with ADMIN=false, INHERIT=false, SET=true; no role is a member of `ghm_migrator`; schema-owner membership counts match the runner contract.
- Resolve the explicit direct grants on the 16 relations and 24 sequences only through an authorized provider/bootstrap path and a reviewed ACL plan. Preserve the intended `SET ROLE ghm_schema_owner` runner model and ledger ownership.
- Verify the dedicated migration connection as `session_user=current_user=ghm_migrator` with strict TLS. Do not use the Render connector's `ghm_db_user` session as migration authorization.

**Stop condition:** if bootstrap authority cannot be obtained, do not run migrations through `ghm_db_user`, do not weaken `assertMigratorDatabaseIdentity`, and do not improvise grants.

### Gate C — repair the migration sequence before selecting a contiguous prefix

PR #298 currently records 50 pending migration entries and an empty batch manifest. The pending sequence contains ordering hazards before the signed Gateway replacements:
- `20261110260000_gateway_supplier_classification_cutover` revokes the legacy runtime supplier RPC before `20261111030000_bind_supplier_gateway_actor_to_signed_assertion`.
- `20261110270000_gateway_business_profile_update` revokes the legacy runtime profile RPC before `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion`.

These are not safe intermediate states. Because the batch runner requires an exact contiguous prefix, later selecting only `20261112050000` or `20261112090000` is not permitted and must not be attempted.

Before any prefix can be selected, redesign the unapplied migration sequence so additive signed Gateway functions and their tests precede the corresponding legacy runtime revocations. Keep cutovers as explicit, separately gated manual operations where appropriate. Preserve historical applied migration bytes; any edits to still-pending migration files require refreshed inventory/checksum reconciliation and full disposable-PostgreSQL qualification. Do not alter already-applied migrations.

Also review the early ID-only Gateway wrappers: they must not be exposed as an operational path before the signed assertion and request-context binding migrations have installed the exact signed contract.

**Stop condition:** no first batch until the first contiguous prefix has no intermediate route outage, no unsigned actor-ID trust, and no unqualified runtime revocation.

### Gate D — reconcile function defaults and SECURITY DEFINER hardening

- Retain the owner preflight in `20261112090000_pin_security_definer_search_path`. On the captured catalogue all 63 functions already have owner `ghm_schema_owner`; expected postflight is zero non-compliant paths and all 63 at `pg_catalog, ghm, pg_temp` (plus any functions created by the pending sequence).
- Preserve the global `ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` intent in `20261112050000`.
- Separately resolve the observed schema-specific `ghm_runtime=EXECUTE` default ACL. The Gateway assertion requires no non-owner function default grantees. Before revoking this default, inventory every existing Resource API runtime function caller and ensure each required existing function has an explicit, reviewed EXECUTE grant; prove all future function creation paths grant only their intended service principal. The schema-scoped REVOKE affects future functions, not existing function ACLs, but it can break later migrations if their explicit grants are incomplete.
- Do not simply suppress `unsafe_function_defaults` in Gateway source or remove the check. Update the SQL migration and disposable qualification together, and prove the expected default ACL state through `pg_default_acl` after the migration.
- Verify all SECURITY DEFINER functions have owner `ghm_schema_owner`, `prosecdef=true`, exact pinned path; enumerate PUBLIC EXECUTE and unexpected direct grantees; test caller-created temporary-object shadowing.
- Verify all Gateway wrappers are exact-signature grants to `ghm_actor_gateway` only; no PUBLIC/runtime EXECUTE, no grant option, no direct relation privileges, no schema CREATE, and database CREATE remains false.

### Gate E — provision and qualify the Gateway principal/function surface

After the migration sequence and authority gates above are solved:
- Confirm role attributes and membership shape using the exact login session; `session_user=current_user=ghm_actor_gateway` under strict TLS.
- Grant only `USAGE` on schema `ghm`; do not grant schema CREATE or any table/view/sequence privilege.
- Install only the exact signed wrappers from `src/actor-gateway/database-privileges.ts`; each must be owner `ghm_schema_owner`, SECURITY DEFINER, exact pinned path, EXECUTE granted to Gateway, denied to runtime and PUBLIC.
- Provision the 32-byte capability assertion secret into the database using the reviewed secret-insertion path; do not expose it in SQL logs, output or handover. Verify HMAC, operation/context binding, expiry and nonce replay rejection.
- Run positive and negative PostgreSQL qualifications for every installed wrapper, forged signatures, replay, actor substitution, tenant isolation, wrong operation, expired assertion, direct table access, legacy runtime RPC denial, PUBLIC denial, and unexpected grantee checks.
- Require the Gateway startup privilege assertion to pass unchanged and the service to return /healthz only after identity and ACL verification.

### Gate F — route readiness and manual runtime cutovers

- Verify exact deployed Resource API commit, route flags, Gateway origin, TLS and secret/role binding without disclosing values.
- For each route group, map the exact Resource API caller, Gateway wrapper, operation name, signed context, expected business authorization and rollback.
- Run end-to-end authenticated positive/negative tests through the real deployed Resource API and Gateway; verify no legacy runtime fallback.
- Only after a route group is live and rollback-ready may its corresponding manual runtime cutover be considered. The final 20261117010000 / 20261117020000 revocations remain post-deployment gates; they must not be used to make startup pass.
- Verify restart, health, Free-plan cold start and caller timeout behaviour. Do not add mutation retries without operation-specific idempotency evidence.
- Keep PayFast/payment activation and all commercial payment switches paused.

## 5. Required disposable qualification matrix

The PR must add or retain disposable PostgreSQL 18 qualification for:
- 63-function owner/search_path inventory and postflight, including temp-schema shadowing resistance.
- Global and schema-specific default function ACLs, including the current runtime-default row and explicit grants for existing runtime consumers.
- Exact Gateway schema/function allowlist and denial of PUBLIC/runtime/direct relation privileges.
- Gateway LOGIN role attributes, membership graph and session identity.
- Every signed operation: valid signature, wrong signature, wrong actor, wrong operation, altered context, expired assertion, nonce replay.
- Legacy runtime compatibility before cutover and explicit denial after each cutover stage.
- Failure atomicity: migration errors roll back both DDL and ledger writes.
- Exact contiguous-prefix selection, no skipped migrations, no stale inventory, no duplicate version/name, no already-applied selection.
- Plan-only mode makes no ledger/DDL changes.
- Full clean-database replay of the complete pending sequence and application-level route smoke tests.

CI success on a disposable database is necessary but not sufficient for production execution.

## 6. Current disposition

- PR #298 remains draft/open; its manifest remains `[]`.
- PR #297 remains separate; do not combine its older 48-entry inventory with PR #298's 50-entry inventory.
- PR #300 remains separate; its Business Capability implementation is not implicitly included in a production batch.
- PRs #301 and #302 are merged; their qualification is not a production migration authorization.
- No production migration, SQL write, role/ACL change, credential/secret change, Render environment change or deployment is authorized by this document.
- No additional paid service or database is required or approved.
- PayFast remains paused.

**Next implementation task:** convert Gate C and Gate D into a reviewed source/migration correction on PR #298, with disposable PostgreSQL tests and exact-head CI. Keep the production manifest empty. Do not execute production migrations.
