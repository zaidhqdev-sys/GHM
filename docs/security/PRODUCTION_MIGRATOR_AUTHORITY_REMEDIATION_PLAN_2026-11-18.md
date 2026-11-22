# Production Migrator Authority Remediation Plan — 18 November 2026

## Status and scope

**Design only — not approved for execution.** This document translates the source and live-catalogue findings into a controlled remediation sequence. It does not authorize production SQL, provider actions, role changes, grants/revokes, credential rotation, migrations, deployment, or CI.

Target remains the existing Render PostgreSQL service `ghm-db` / database `ghm_db` (PostgreSQL 18, Frankfurt). No additional paid services or infrastructure are part of this plan.

PR #298, `feat/actor-gateway-production-migration-batches`, remains open and draft. Its 50-entry candidate inventory is repository evidence only; its production execution manifest must remain empty until the exact production ledger is retrieved and reconciled.

## Evidence reviewed before designing

The current role-separation, production reconciliation and PR #298 handovers; PR #298 metadata and branch; `src/db/migrator-principal.ts`; `src/db/migrate.ts`; the historical role-separation runbook and SQL plan; and the three source migrations named below were reviewed.

### Live role state

The available Render read-only query connector authenticates as `session_user=ghm_app_user`, `current_user=ghm_db_user`. It is not the dedicated migrator connection.

The production `ghm_migrator` role exists and has the expected basic restrictions: LOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION and NOBYPASSRLS. Its intended sole direct membership is `ghm_schema_owner`, with ADMIN OPTION=false, INHERIT=false and SET=true.

The live catalogue also shows:
- `ghm_db_user` is a member of `ghm_migrator` with ADMIN OPTION=true; live `migrator_member_count=1`, while the runner contract requires 0.
- `ghm_db_user` is a member of `ghm_schema_owner` with ADMIN OPTION=true; live `schema_owner_membership_count=2`, while the runner contract requires exactly 1.
- The historical role-separation runbook attributes these additional memberships to bootstrap-`postgres` authority and records that `ghm_db_user` cannot remove them. Provider/bootstrap authority is required; do not improvise a revoke through the application role.

### Live object ACL state and source attribution

The explicit ACL expansion identifies `ghm_schema_owner` as grantor and 16 application relations plus 24 sequences with explicit privileges for `ghm_migrator`. No `pg_default_acl` entry granting privileges to `ghm_migrator` was found.

The 16 relation grants are accounted for by:
- `20260914100000_create_opportunity_core.sql`: `opportunity`, `opportunity_type`, `country`, `currency` (four relations).
- `20260915150000_create_commercial_schema.sql`: 11 Commercial relations.
- `20260916010000_create_opportunity_participant.sql`: `opportunity_participant` (one relation).

Sequence-grant policy originated in broad `ON ALL SEQUENCES IN SCHEMA ghm` grants in the Opportunity Core and Commercial schema migrations, plus the explicit `opportunity_participant_id_seq` grant. Exact historical per-sequence application chronology is not proven from current ACLs alone. The live 24-sequence set is recorded in the current role-separation handover; do not infer per-sequence creation chronology.

The current runner checks effective table/sequence privileges across schema `ghm` and requires `direct_relation_privileges=false`. It also requires the exact membership counts above, database CONNECT=true/CREATE=false, migrator schema USAGE=false/CREATE=false, and a non-login, non-privileged `ghm_schema_owner` that owns schema `ghm` and has database CREATE. After the identity preflight, the runner performs `SET ROLE ghm_schema_owner` before migration-ledger access and migration execution.

### Ledger access state

SELECT from `ghm.ghm_schema_migrations` through the available Render connector failed with SQLSTATE 42501. The ledger is owned by `ghm_schema_owner`; its observed SELECT ACL is for `ghm_auditor`, not the application/admin-derived session. The connector cannot SET ROLE to `ghm_migrator` or `ghm_schema_owner`. The approximate `n_live_tup=105` statistic is stale (last auto-analyze 2026-09-21) and is not an exact ledger count.

No exact production migration versions, checksums, order, or pending prefix has been retrieved.

## Remediation sequence — gated, no execution yet

### Corrected complete live membership inventory — 18 November 2026

A fresh read-only production `pg_auth_members` query, cross-checked against the 12 November database grant-authority handover and the historical role-separation runbook, found **six** distinct bootstrap-`postgres` ADMIN OPTION edges from `ghm_db_user`:

| Member | Granted role | Grantor | ADMIN | INHERIT | SET |
|---|---|---|---:|---:|---:|
| `ghm_db_user` | `ghm_actor_gateway` | `postgres` | true | false | false |
| `ghm_db_user` | `ghm_auditor` | `postgres` | true | false | false |
| `ghm_db_user` | `ghm_migrator` | `postgres` | true | false | false |
| `ghm_db_user` | `ghm_payment_provider` | `postgres` | true | false | false |
| `ghm_db_user` | `ghm_runtime` | `postgres` | true | false | false |
| `ghm_db_user` | `ghm_schema_owner` | `postgres` | true | false | false |

The `ghm_runtime` membership has a **second, separate** edge granted by `ghm_db_user`: ADMIN=false, INHERIT=true, SET=true. Preserve this non-admin runtime SET path until the separately gated application-credential/runtime cutover is qualified. Do not conflate it with the bootstrap ADMIN OPTION edge.

The application login `ghm_app_user` is itself a member of `ghm_db_user` (grantor `postgres`, ADMIN=false, INHERIT=true, SET=true). Live role flags confirm `ghm_db_user` is LOGIN/INHERIT and retains CREATEDB=true and CREATEROLE=true. Thus the legacy app-to-db-user authority chain remains a separate high-priority isolation issue; removal of membership edges alone does not retire or neutralize that chain.

The live role flags for `ghm_actor_gateway`, `ghm_migrator`, `ghm_payment_provider`, and `ghm_runtime` are LOGIN/NOINHERIT and have no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS attributes. `ghm_auditor` and `ghm_schema_owner` are NOLOGIN/NOINHERIT and likewise non-privileged. These safe target-role flags do not neutralize the ADMIN OPTION held by `ghm_db_user`.

**Correction:** earlier versions of this plan scoped bootstrap cleanup to only the `ghm_migrator` and `ghm_schema_owner` memberships. That was incomplete. The full live catalogue has six bootstrap ADMIN OPTION edges. Do not treat all six as an automatically approved bulk revoke: each role has a distinct purpose and must have its active credential, recovery, service, and operational dependencies checked.

### Gate 0 — preserve and approve the evidence

1. Preserve the current role membership, role attributes, schema/table/sequence ACLs, object owners, schema owner, ledger owner/ACL and Render service identity as a dated evidence snapshot.
2. Obtain a fresh verified production backup/recovery point and confirm its restore procedure and recoverability before any production authority change.
3. Keep production traffic, runtime configuration, payment state, and migration execution unchanged.
4. Obtain explicit provider support confirmation of the permitted bootstrap/admin mechanism for the specific role-membership and ACL cleanup. Do not assume Render's dashboard query identity is the provider superuser.

**Stop condition:** no verified backup, no provider-confirmed authority path, or incomplete pre-change evidence means no mutation.

### Gate 1 — provider/bootstrap-owned membership correction

Through the provider-confirmed bootstrap authority only, remove only the two unintended membership edges:
- `ghm_db_user` as a member of `ghm_migrator`;
- `ghm_db_user` as a member of `ghm_schema_owner`.

Preserve the intended `ghm_migrator -> ghm_schema_owner` membership exactly: ADMIN OPTION=false, INHERIT=false, SET=true. Do not drop either role. Do not remove the application-to-database-user membership in this step; the old application authority path is a separate deferred gate in the historical runbook.

After provider action, re-read `pg_auth_members` and role flags. Required counts: `migrator_member_count=0`, `schema_owner_membership_count=1`, `schema_owner_direct_membership_count=0`, `direct_membership_count=1`, and `exact_schema_owner_membership=true`.

### Gate 2 — remove legacy migrator object ACLs without changing ownership

Only after Gate 0 and provider authority are satisfied, use an authority that can act as the recorded grantor `ghm_schema_owner` (or the provider-confirmed equivalent) to remove the legacy explicit ACL entries from `ghm_migrator` on the 16 named relations and the 24 specifically inventoried sequences.

This is an ACL cleanup, not an ownership transfer:
- Keep `ghm_schema_owner` as owner of schema `ghm`, the migration ledger and its governed objects.
- Keep the intended `ghm_migrator -> ghm_schema_owner` SET membership.
- Do not grant schema USAGE or CREATE directly to `ghm_migrator`.
- Do not grant ledger SELECT directly to `ghm_migrator`; the runner obtains access after SET ROLE to the owner.
- Do not change `ghm_runtime` ACLs, runtime default privileges, application data, or unrelated principals.
- Do not blindly revoke all privileges on every object in schema `ghm`; operate only on the evidenced explicit migrator entries after confirming the exact current ACL and grantor per object.

The cleanup must be idempotently specified and its postconditions independently queryable before it is performed. If any object has a different owner/grantor or unexpected ACL drift, stop and re-plan rather than broadening the cleanup.

### Gate 3 — dedicated migrator identity preflight only

Once the provider and ACL corrections are complete, use the existing dedicated `GHM_MIGRATOR_DATABASE_URL` secret/connection path in the approved local checkout with verified TLS (`DATABASE_SSL=true`). Do not use the Render application/admin query connector as a substitute.

First run only the existing identity preflight/read-only forensic audit. It must establish:
- `current_user=session_user=ghm_migrator`;
- exact role flags and membership counts required by `src/db/migrator-principal.ts`;
- database CONNECT=true and CREATE=false;
- migrator schema USAGE=false and CREATE=false;
- no effective direct relation or sequence privileges for the migrator;
- `ghm_schema_owner` is NOLOGIN, non-privileged, owns schema `ghm`, and has database CREATE;
- the single intended migrator SET membership is intact.

Then verify `SET ROLE ghm_schema_owner` yields `current_user=ghm_schema_owner`, while `session_user` remains `ghm_migrator`, and that the ledger can be read without modifying it. Capture exact ledger rows, versions, checksums and ordering.

**This gate is read-only.** Do not run `npm run migrate`, apply a production pending prefix, or populate PR #298's execution manifest during this phase.

### Gate 4 — exact reconciliation and separately approved migration plan

Compare the exact production ledger export with the exact PR head's migration inventory and checksums. Identify applied, missing, divergent, duplicate, out-of-order and approved-retained entries. Resolve every unexplained difference before creating a production execution manifest.

Only after exact reconciliation, backup verification, successful plan-only qualification, and an explicit production execution decision may a separate migration plan be considered. PR #298 remains draft and its manifest empty until those conditions are met.

## Rollback and stop rules

- Before a change, capture the exact pre-change ACL and membership state so rollback can restore only entries actually altered.
- If provider support cannot perform the narrowly scoped bootstrap membership correction, stop; do not attempt it as `ghm_db_user`.
- If the ACL cleanup would alter ownership, runtime privileges, default ACLs, or unrelated principals, stop.
- If the migrator identity preflight fails, stop before ledger audit or migration execution.
- If the ledger cannot be read exactly, stop; do not substitute statistics, repository counts, local qualification databases or candidate inventories.
- Any rollback must use the verified recovery point and provider-supported authority path. Do not drop roles or disable the existing recovery/application path as a shortcut.

## Explicit non-actions in this design pass

No production SQL or ACL changes, role/membership changes, backup operations, secret reads/rotations, Render configuration changes, migrations, deployment, traffic/payment changes, paid infrastructure or CI were performed. This document is a design record only.


## 18 November 2026 — production role/service dependency map

Added `docs/security/PRODUCTION_ROLE_SERVICE_DEPENDENCY_MAP_2026-11-18.md` (commit `f455277958d96783f235a2928073d95a3494c848`). This was preceded by re-reading the existing remediation plan, role/migration/hosting/Auth Issuer/PayFast handovers, relevant PR states, source principal contracts and live Render/DB inventory.

The map distinguishes:
- `ghm_runtime`: intended active Resource API identity; service is GHM-Internal-Runtime. The actual secret value was not read, so the configured identity remains to be independently verified without disclosing the credential.
- `ghm_migrator`: operator-controlled standalone migration identity; no Render service. Current live direct ACL and bootstrap membership contract still fails.
- `ghm_schema_owner`: NOLOGIN schema/ledger ownership identity; preserve its ownership and the one intended migrator SET edge.
- `ghm_actor_gateway`: role exists but has no gateway functions/grants or dedicated production service. The always-on Render host is explicitly cost-blocked; do not use the Resource API or a sandbox service as substitute.
- `ghm_auditor`: NOLOGIN audit privilege role with ledger SELECT; only observed member is legacy `ghm_db_user` via bootstrap ADMIN OPTION, so it is not an independent usable audit login.
- `ghm_payment_provider`: correct production LOGIN role and two PayFast settlement functions now exist; provider can execute both while runtime cannot. This corrects stale older PayFast handovers, but does not mean PayFast is activated or a production callback service exists. PayFast remains paused.
- `ghm_auth_issuer`: source implementation exists, but production role and dedicated service are absent.

Fresh role/privilege checks also reconfirmed six bootstrap-`postgres` ADMIN OPTION memberships held by `ghm_db_user`, plus the separate non-admin runtime SET edge and the app-user-to-db-user legacy edge. A point-in-time `pg_stat_activity` sample showed only the current connector as `ghm_app_user`; it is not evidence that services never connect.

No environment variable values or credentials were read. No role, ACL, service, secret, backup, deployment, migration, payment state or CI was changed. No additional cost.


## 18 November 2026 — production legacy runtime authority finding

Added `docs/security/PRODUCTION_LEGACY_RUNTIME_AUTHORITY_FINDINGS_2026-11-18.md` (commit `3f85fa345bcaa4acc6fb4da8146326efb62060be`). This follows the existing role/service map, migrator remediation plan, legacy role dependency and audit contracts, 12 November database authority handover, migration reconciliation/batch handovers, and PR #275/#298/#296/#299 review.

Critical correction: merged PR #275's dedicated runtime identity guard is **not deployed**. Render service `GHM-Internal-Runtime` is still on `main` at live commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`, with auto-deploy OFF. The 15 November attempts at `8f3ee574...` and `fe5a82d8...` failed. Source at live commit requires generic `DATABASE_URL`; startup only does `SELECT 1`; no runtime principal assertion. The exact current DB login remains unproven because Render env values were not read. Do not treat listening logs as identity proof.

Fresh read-only production checks: `ghm_app_user -> ghm_db_user` is ADMIN=false / INHERIT=true / SET=true. `ghm_db_user` remains LOGIN/INHERIT with CREATEDB and CREATEROLE; it has bootstrap ADMIN OPTION memberships. Effective privilege checks show `ghm_app_user` has public-schema CREATE and SELECT/INSERT/UPDATE/DELETE on five legacy public tables. `ghm_runtime` has no CRUD on those legacy tables; `ghm_migrator` has no direct CRUD there. `ghm_db_user` owns `public`, five legacy tables, five sequences and ten indexes (plus PostgreSQL TOAST internals). No owned routines/default ACLs/large objects/public triggers were returned. Two legacy `public.users` rows remain subject to the separate QuoteFlow provenance hold; no row contents were queried.

Next sequence is explicit: safely establish the dedicated runtime credential identity; resolve failed deployment blockers; perform a controlled, approved cutover and identity qualification; prove recovery/background/support dependencies absent; then separately qualify migrator and legacy object/data disposition. No revokes or role mutations are authorized.

No secret values, user records or env-var values read. No production changes, CI, deployment, migration, backup, payment action or additional cost.


## 18 November 2026 — exact Render deployment blockers established

Added `docs/security/PRODUCTION_RUNTIME_DEPLOYMENT_BLOCKERS_2026-11-18.md` (commit `ddfebdf6fbe90b4d893690254ce6335b0ad09419`). This review first re-read the runtime findings, role/service map, migrator plan, migration reconciliation, database authority, Actor Gateway hosting handover and PR #275/#298/#296/#299.

Render event/log evidence now establishes both November 15 failures:
1. Deploy `dep-dbsv8cuk1f9s73ada3ig`, commit `8f3ee574...`: build command was `npm ci && npm run build`; TypeScript failed TS7016 for `pg`, `express`, `jsonwebtoken`, plus TS7006 implicit-any errors caused by missing Express types. The exact repository manifest has `@types/pg`, `@types/express`, and `@types/jsonwebtoken` in devDependencies. Correct deployment build command is `npm ci --include=dev && npm run build`.
2. Deploy `dep-dbsva6c9v7es73bordlg`, commit `fe5a82d8...`: build succeeded, then process exited with `GHM_ACTOR_GATEWAY_URL is required when production storage is enabled`. This is the intentional fail-closed application guard. No dedicated production Actor Gateway host exists, and the hosting handover blocks another paid always-on service. No placeholder, self-reference, sandbox URL, or bypass is acceptable.

Therefore the build fix alone cannot make PR #275 deployable. Keep auto-deploy OFF; wait for an affordable/approved genuine gateway host, qualify its identity/credential/ACL/signed assertion contract, then prepare the runtime cutover. Do not deploy, edit environment variables, change roles/ACLs, or incur cost.

No Render configuration, secrets, deployment, database, CI, payment state or hosting resource was changed.

## 22 November 2026 — provider/bootstrap authority escalation brief (prepared, not sent)

The source and handover review confirms that the next production-authority dependency is outside repository code. The following is a narrowly scoped support request prepared for the authorized owner/operator to send through the existing Render support channel. It has **not** been sent by this work and does not authorize a provider or database mutation.

### Draft support request

> We need guidance on the supported Render PostgreSQL administrator/bootstrap authority path for two specific role-membership rows in our production database `ghm_db` (PostgreSQL 18).
>
> Our read-only catalogue evidence shows `ghm_db_user` has two bootstrap-granted memberships created by `postgres`:
>
> - `ghm_db_user` is a member of `ghm_migrator`, with ADMIN OPTION=true, INHERIT=false, SET=false.
> - `ghm_db_user` is a member of `ghm_schema_owner`, with ADMIN OPTION=true, INHERIT=false, SET=false.
>
> Our intended migration identity is the existing restricted LOGIN/NOINHERIT role `ghm_migrator`. Its intended sole membership is `ghm_migrator -> ghm_schema_owner`, with ADMIN OPTION=false, INHERIT=false, SET=true. The production migration runner explicitly checks that the first two `ghm_db_user` membership edges are absent and that the intended migrator-to-owner SET edge remains exactly as specified.
>
> We understand from the prior support conversation that Render's Dashboard-managed administrator has managed-role semantics and that ordinary application credentials must not be used as a substitute for provider/bootstrap authority. We are not asking for superuser credentials, a bypass, or a change to Render's managed credential model.
>
> Please confirm:
>
> 1. Whether Render support can perform, or authorize a provider-controlled procedure to remove, only the two identified `ghm_db_user` membership edges while preserving the existing `ghm_migrator -> ghm_schema_owner` edge and all unrelated role memberships, role attributes, ownership and ACLs.
> 2. If support cannot perform that operation, what exact supported administrator/bootstrap mechanism is available to the database owner to make this narrowly scoped correction safely.
> 3. What before/after catalogue evidence Render can provide so we can verify the exact membership options and grantor without exposing credentials.
> 4. Whether this operation has any provider-managed side effects or restrictions that must be included in a rollback plan.
>
> Please do not change any role, membership, grant, ACL, credential, service setting, or database object until we have reviewed the proposed procedure and separately confirmed the required backup/recovery evidence and owner authorization.

### Separate backup/recovery request

Before any role or ACL mutation, obtain a fresh production recovery point and written confirmation of:
- the exact database/service and snapshot/recovery-point timestamp;
- the supported restore procedure and any restore limitations;
- how recoverability can be verified without restoring over production;
- the expected recovery-point and recovery-time objectives.

A snapshot creation or restore test is not requested or performed by this document. Keep it separate from the role-membership support question so neither is mistaken for authorization to mutate production.

### Scope guard

- Do not ask support to remove the other four bootstrap ADMIN OPTION edges (`ghm_actor_gateway`, `ghm_auditor`, `ghm_payment_provider`, `ghm_runtime`) in this first request. Their dependencies are separate and they are not part of the two-edge migrator runner contract correction.
- Preserve `ghm_db_user -> ghm_runtime` non-admin runtime SET membership and the existing `ghm_app_user -> ghm_db_user` relationship until the separately gated runtime credential transition is qualified.
- Do not execute `REVOKE`, `GRANT`, `ALTER ROLE`, migrations, or a production audit through the current application/admin-derived connector as a workaround.
- No support request was sent, no provider action was requested by the assistant, and no production database, backup, role, membership, ACL, credential, Render setting, deployment, payment state, or paid resource was changed.
