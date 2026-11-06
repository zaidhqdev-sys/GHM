# PayFast production role-provisioning session handover — 2026-11-05

**Purpose:** durable operator handover for the production PayFast settlement-isolation work. This addendum records the operator's interactive PostgreSQL session on 2026-11-04 22:43–23:01 UTC (2026-11-05 local date, UTC+02:00), the exact observed role state, failed and successful statements, and the remaining gates.

**Target:** Render PostgreSQL production database `ghm_db`, application schema `ghm`.  
**Release context:** `release/payfast-settlement-isolation-main-20261104`; release candidate previously audited at `d3b324baa9ef021e234f1075ac89baaf1c487dec`.  
**Safety status:** provider login has been created and effective database CONNECT verified. The role graph is **not yet accepted as least-privilege**. No PayFast migrations, payment-data writes, callback service deployment, API deployment, PR merge, secret configuration, or network changes were performed in this session.

## 1. Executive state

- `ghm_payment_provider` now exists as a LOGIN / NOINHERIT role with no superuser, CREATEDB, CREATEROLE, replication, or BYPASSRLS attributes.
- Effective `CONNECT` on database `ghm_db` is true for the provider role.
- PostgreSQL reports an inbound membership `ghm_db_user -> ghm_payment_provider` with `admin_option=true`, `set_option=false`, and `inherit_option=false`. The recorded grantor is `postgres`.
- `ghm_app_user` can SET ROLE to `ghm_db_user`; consequently PostgreSQL reports indirect membership in `ghm_payment_provider`. However, current checks report that `ghm_app_user` cannot SET ROLE to the provider and does not inherit provider privileges.
- An attempted ADMIN OPTION revocation executed as `ghm_db_user` did not change the membership because `ghm_db_user` was not the recorded grantor. The warning and follow-up catalog query prove the ADMIN OPTION remains.
- `ghm_db_user` itself has `CREATEDB=true` and `CREATEROLE=true`. Because `ghm_app_user` can SET ROLE to `ghm_db_user`, this is a material pre-existing privilege-escalation concern requiring separate owner-led review.
- The original connection loss during a PL/pgSQL role-creation block remains unexplained. The database subsequently recovered and a simple `CREATE ROLE` succeeded. Server logs have not yet been inspected.

**Release decision remains HOLD:** do not run `npm run migrate`, do not deploy or enable callback traffic, and do not merge PR #207 until the role-administration issue, full pending migration set, backup/restore evidence, network plan, and callback cutover are approved.

## 2. Chronological operator evidence

All statements below were entered by the operator in an interactive `psql` session connected to `ghm_db`. Times are UTC from the user's message timestamps.

### 2026-11-04 22:43:59 — initial DO block lost its connection

The operator attempted:

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'ghm_payment_provider'
  ) THEN
    RAISE EXCEPTION
      'ghm_payment_provider already exists; inspect it instead of modifying it';
  END IF;

  CREATE ROLE ghm_payment_provider LOGIN NOINHERIT;
END;
$$;
```

The client reported `server closed the connection unexpectedly` twice, then reset the connection successfully. A subsequent:

```sql
GRANT CONNECT ON DATABASE ghm_db TO ghm_payment_provider;
```

failed with `ERROR: role "ghm_payment_provider" does not exist`. Therefore the initial block did not leave the role present at the time of that GRANT.

### 2026-11-04 22:44–22:50 — read-only diagnosis

The recovered connection reported:

| Check | Observed result |
|---|---|
| `current_database()` | `ghm_db` |
| `session_user` | `ghm_app_user` |
| `current_user` | `ghm_db_user` |
| `pg_is_in_recovery()` | `false` |
| PostgreSQL version | `18.6 (Debian 18.6-1.pgdg12+2)` |
| `ghm_db_user.rolsuper` | false |
| `ghm_db_user.rolcreatedb` | true |
| `ghm_db_user.rolcreaterole` | true |
| `ghm_db_user.rolreplication` | false |
| `ghm_db_user.rolbypassrls` | false |

Role rows present before provider creation:

| Role | LOGIN | INHERIT | SUPERUSER | CREATEDB | CREATEROLE |
|---|---:|---:|---:|---:|---:|
| `ghm_migrator` | true | false | false | false | false |
| `ghm_runtime` | true | false | false | false | false |
| `ghm_schema_owner` | false | false | false | false | false |

`ghm_db_user` had `ADMIN OPTION=true`, `SET=false`, and `INHERIT=false` memberships in `ghm_migrator` and `ghm_schema_owner`. It also had a separate `ghm_runtime` membership used by the application role chain. Do not revoke the runtime membership blindly; preserve live API operation while an owner-led least-privilege plan is prepared.

### 2026-11-04 22:50:57 — provider role creation succeeded

The operator ran the simple statement:

```sql
CREATE ROLE ghm_payment_provider LOGIN NOINHERIT;
```

PostgreSQL returned `CREATE ROLE`.

A read-only catalog query then verified:

| Attribute | Observed value |
|---|---:|
| `rolcanlogin` | true |
| `rolinherit` | false |
| `rolsuper` | false |
| `rolcreatedb` | false |
| `rolcreaterole` | false |
| `rolreplication` | false |
| `rolbypassrls` | false |

### 2026-11-04 22:52:44 — CONNECT grant and effective privilege

The operator ran:

```sql
GRANT CONNECT ON DATABASE ghm_db TO ghm_payment_provider;
```

PostgreSQL returned:

```text
WARNING: no privileges were granted for "ghm_db"
GRANT
```

A follow-up `has_database_privilege('ghm_payment_provider','ghm_db','CONNECT')` returned `true`. Record this as **effective CONNECT verified**; the warning means this statement did not add a new effective grant (for example, CONNECT may already be available through PUBLIC or another ACL path). Do not claim that the statement created a distinct ACL entry.

### 2026-11-04 22:53–22:57 — membership graph inspection

The membership query for the provider role returned:

| Member | Granted role | ADMIN OPTION | SET OPTION | INHERIT OPTION |
|---|---|---:|---:|---:|
| `ghm_db_user` | `ghm_payment_provider` | true | false | false |

The application role-chain check returned:

| Check | Result |
|---|---:|
| `pg_has_role('ghm_app_user','ghm_payment_provider','MEMBER')` | true |
| `pg_has_role('ghm_app_user','ghm_payment_provider','SET')` | false |
| `pg_has_role('ghm_app_user','ghm_payment_provider','USAGE')` | false |
| `pg_has_role('ghm_db_user','ghm_payment_provider','SET')` | false |

The wider membership graph query returned these ten rows:

| Member role | Granted role | ADMIN OPTION | SET OPTION | INHERIT OPTION |
|---|---|---:|---:|---:|
| `ghm_app_user` | `ghm_db_user` | false | true | true |
| `ghm_app_user` | `pg_read_all_stats` | false | true | true |
| `ghm_app_user` | `pg_signal_backend` | false | true | true |
| `ghm_db_user` | `ghm_migrator` | true | false | false |
| `ghm_db_user` | `ghm_payment_provider` | true | false | false |
| `ghm_db_user` | `ghm_runtime` | false | true | true |
| `ghm_db_user` | `ghm_runtime` | true | false | false |
| `ghm_db_user` | `ghm_schema_owner` | true | false | false |
| `ghm_db_user` | `pg_read_all_stats` | false | true | true |
| `ghm_db_user` | `pg_signal_backend` | false | true | true |

The graph contains two distinct grants from `ghm_db_user` to `ghm_runtime`: a non-admin SET/INHERIT membership and a separate ADMIN OPTION-only membership. Treat these as distinct catalog grants; do not collapse them into one row or revoke both without a compatibility plan.

### 2026-11-04 23:00:40 — attempted ADMIN OPTION revoke did not change the grant

The operator ran:

```sql
REVOKE ADMIN OPTION FOR ghm_payment_provider
FROM ghm_db_user;
```

PostgreSQL returned:

```text
WARNING: role "ghm_db_user" has not been granted membership in role "ghm_payment_provider" by role "ghm_db_user"
REVOKE ROLE
```

A follow-up catalog query still showed `admin_option=true`, `set_option=false`, `inherit_option=false`. This was a no-op for the intended grant; do not record it as a successful privilege reduction.

### 2026-11-04 23:01:30 — actual grantor identified

The operator queried `pg_auth_members.grantor` and established:

| Member | Granted role | Grantor | ADMIN OPTION | SET OPTION | INHERIT OPTION |
|---|---|---|---:|---:|---:|
| `ghm_db_user` | `ghm_payment_provider` | `postgres` | true | false | false |

The remaining ADMIN OPTION belongs to a membership recorded as granted by `postgres`. The next change must be performed through the supported Render/database-owner administrator path authorized to administer that grantor-owned membership. Do not repeat the same REVOKE as `ghm_db_user`, and do not guess at a `GRANTED BY` workaround.

## 3. Interpretation and security implications

1. **Provider role isolation is incomplete.** Although the provider role has no elevated role attributes and the application cannot SET ROLE to it or inherit its privileges, the application is an indirect MEMBER because `ghm_app_user` can SET ROLE to `ghm_db_user`, which has an ADMIN OPTION-only membership in the provider role.
2. **Administrative membership must be reviewed at the actual grantor.** The membership's `grantor` is `postgres`. The attempted revoke by `ghm_db_user` did not remove ADMIN OPTION. Obtain an authorized database administrator to inspect and make the narrowly approved change, then verify `pg_auth_members` including grantor and all three membership options.
3. **The application-to-database-role chain is a separate, material concern.** `ghm_app_user` can SET ROLE to `ghm_db_user`; `ghm_db_user` has CREATEDB and CREATEROLE. That potentially exposes role/database administration through the application login. Do not change these live attributes casually; have the production database owner design a backward-compatible remediation, assess service dependencies, and verify the actual application connection model.
4. **Do not remove the ordinary runtime membership without proof.** The existing production API depends on its current role chain. Preserve required runtime access while removing unnecessary administrative capabilities through an approved, tested plan.
5. **CONNECT is effective, but its ACL source is not yet proven.** The grant command warned no privileges were added; the effective privilege query returned true. Inspect database ACLs if the exact grant source matters.
6. **The connection loss is unresolved.** The later simple CREATE ROLE succeeded and the database answered read-only checks, but this does not explain the earlier server-closed-connection event. Inspect Render PostgreSQL logs for 2026-11-04 22:43–22:45 UTC (include PostgreSQL restart/crash, PANIC/FATAL, OOM, process termination, proxy/network events). Do not assert the event was harmless without evidence.

## 4. Required next actions (ordered)

1. **Pause all release execution.** No migration runner, manual migration SQL, provider callback deployment/traffic, ordinary API deploy, PR #207 merge, or payment-data mutation.
2. **Inspect PostgreSQL/Render logs** for the initial connection loss around 2026-11-04 22:43–22:45 UTC. Record relevant sanitized messages and whether the database restarted or a single backend connection was terminated.
3. **Escalate membership administration to the authorized database owner.** Have the supported Render/database-owner administrator inspect the grantor-owned `postgres -> ghm_db_user membership in ghm_payment_provider` and decide whether to remove ADMIN OPTION while retaining only the required membership semantics. Do not retry the failed revoke as `ghm_db_user`.
4. **Review the broader role escalation.** The owner must review `ghm_app_user -> ghm_db_user` SET membership and `ghm_db_user` CREATEDB/CREATEROLE, plus all memberships and grantors. Plan remediation that preserves live API behavior. Do not revoke runtime memberships without a tested replacement.
5. **Re-run read-only role checks after any approved admin change:** role attributes; all `pg_auth_members` rows with grantor/admin/set/inherit options; `pg_has_role` MEMBER/SET/USAGE checks; `has_database_privilege`; and provider direct memberships / role attributes.
6. **Provision the provider credential securely** only after role ownership and membership are approved. Use the approved Render secret-management workflow for the dedicated callback service. Never paste the password into chat, Git, SQL scripts, terminal command arguments, or logs. No provider credential has been set or shared in this session.
7. **Continue the independent release gates:** exact release checkout and full pending migration list; validated migration ledger and checksums; restore rehearsal and backup/PITR evidence; historical pending attempt #6 classification without automatic backfill/deletion; network/private connectivity and ingress review; callback service qualification and PayFast replay/idempotency tests.
8. Only after all gates have evidence and explicit production-owner approval, schedule the migration and coordinated callback/API cutover. The second PayFast migration revokes generic settlement execution from `ghm_runtime`; the old API ITN path must not be relied upon afterward.

## 5. Do-not-repeat / known outcomes

- Initial PL/pgSQL `DO` role creation: connection lost; after recovery, role absent.
- `GRANT CONNECT` before successful role creation: failed because role did not exist.
- Simple `CREATE ROLE ghm_payment_provider LOGIN NOINHERIT`: succeeded.
- Provider role attribute verification: passed exactly as intended.
- `GRANT CONNECT`: returned warning that no privileges were granted; effective CONNECT query returned true.
- Provider membership inspection: found `ghm_db_user` -> provider, ADMIN OPTION true, grantor postgres.
- `REVOKE ADMIN OPTION` as `ghm_db_user`: did not change the grant; catalog still reports ADMIN OPTION true.
- No migration, table/data mutation, payment attempt backfill/deletion, provider password setup, secret change, Render service creation/deployment, networking change, API deployment, or PR merge occurred in this session.

## 6. Release context retained from the preceding handover

- Exact release candidate previously audited: `d3b324baa9ef021e234f1075ac89baaf1c487dec`.
- Exact-head GitHub Actions run `41925733778` passed the quality job, including build, disposable PostgreSQL migrations, storage qualification, tests, commercial payment settlement identity tests, migration audit policy tests, and runtime boundary verification.
- Production migration audit on that release candidate reported `INVESTIGATE` because exactly two expected PayFast migrations were missing/pending; no unexplained checksum mismatch or unrecognized extra migration was found.
- The two pending migrations are:
  - `20261104120000_bind_commercial_payment_attempt_provider.sql`
  - `20261104130000_isolate_payfast_settlement_identity.sql`
- The second migration requires the provider LOGIN role to exist before it runs; that role now exists, but its membership/administration review remains open.
- The production migration runner applies every pending migration in timestamp order, not just the two PayFast migrations.
- PR #207 remains draft/unmerged. The production API tracks `main` with automatic deployment checks; merging is a production deployment event and must be coordinated with the migration and callback cutover.
- Historical attempt ID 6 remains a separate data-classification issue. Do not infer its provider or mutate it as part of migration.

**Handover rule:** record only observed facts as completed. Keep planned, failed, and pending actions explicitly distinct. Never store credentials or secrets in this document.


## 7. Render PostgreSQL log review — 2026-11-05 follow-up

A read-only Render log query was performed against PostgreSQL resource `dpg-dag0sdtbedkc7389vi2g-a` in workspace `tea-d9svua6417fc73bhcutg`, for **2026-11-04 22:42:00–22:47:00 UTC**.

Observed log evidence:

- PostgreSQL accepted new connections throughout the queried interval, including connections from client addresses `10.31.231.114` and `10.30.241.19`.
- A normal checkpoint started at 22:42:44.282 UTC and completed at 22:42:44.297 UTC, writing zero regular buffers and one SLRU buffer.
- The log records the operator's failed `GRANT CONNECT ON DATABASE ghm_db TO ghm_payment_provider` at 22:43:19.197 UTC with the expected error `role "ghm_payment_provider" does not exist`. This is consistent with the operator's transcript and occurred before the later successful simple `CREATE ROLE`.
- Other observed PostgreSQL sessions authenticated and disconnected normally; the log sample does not show a server restart event.
- A second query filtered the same window for error/fatal/panic/warning levels and terms including PANIC, FATAL, terminating, server process, out of memory, crash, and restart. It returned **zero matching log entries**.

Interpretation (limited to available evidence):

- This log sample provides no evidence of a PostgreSQL instance crash, restart, PANIC, FATAL, OOM, or server-process termination during the queried five-minute window.
- It does **not** establish why the user's `psql` client printed `server closed the connection unexpectedly`. The specific backend/client disconnect may not have been captured in the returned Render log sample, or may have occurred at a different timestamp/source. Do not label the incident resolved.
- Preserve the incident as **unexplained client connection loss; no matching server-level failure found in the queried Render logs**. If needed, obtain Render support/platform diagnostics and correlate the exact client-side timestamp, source IP, connection endpoint/proxy, and backend PID/session.

This section supersedes the earlier statement that Render PostgreSQL logs had not yet been inspected. The broader production release HOLD and all role-graph, credential, migration, backup/restore, network, and callback cutover gates remain unchanged.


## 8. Follow-up read-only Render catalog snapshot — 2026-11-05

A separate read-only Render PostgreSQL connector query was run against resource `dpg-dag0sdtbedkc7389vi2g-a`. It uses a distinct read-only connector identity, so this is independent catalog corroboration, not a replacement for the operator's privileged `psql` session.

### Role attributes observed

| Role | LOGIN | INHERIT | SUPERUSER | CREATEDB | CREATEROLE | REPLICATION | BYPASSRLS |
|---|---:|---:|---:|---:|---:|---:|---:|
| `ghm_app_user` | true | true | false | false | false | false | false |
| `ghm_db_user` | true | true | false | true | true | false | false |
| `ghm_migrator` | true | false | false | false | false | false | false |
| `ghm_payment_provider` | true | false | false | false | false | false | false |
| `ghm_runtime` | true | false | false | false | false | false | false |
| `ghm_schema_owner` | false | false | false | false | false | false | false |

### Relevant memberships and grantors observed

| Member | Granted role | Grantor | ADMIN OPTION | SET OPTION | INHERIT OPTION |
|---|---|---|---:|---:|---:|
| `ghm_app_user` | `ghm_db_user` | `postgres` | false | true | true |
| `ghm_db_user` | `ghm_migrator` | `postgres` | true | false | false |
| `ghm_db_user` | `ghm_payment_provider` | `postgres` | true | false | false |
| `ghm_db_user` | `ghm_runtime` | `ghm_db_user` | false | true | true |
| `ghm_db_user` | `ghm_runtime` | `postgres` | true | false | false |
| `ghm_db_user` | `ghm_schema_owner` | `postgres` | true | false | false |

The snapshot also showed `ghm_app_user` and `ghm_db_user` memberships in `pg_read_all_stats` and `pg_signal_backend`, granted by `postgres` with SET and INHERIT options true and ADMIN OPTION false.

**Interpretation:** the Render connector confirms the provider role remains present with the intended non-elevated attributes, but the `postgres`-granted ADMIN OPTION membership from `ghm_db_user` to `ghm_payment_provider` remains unchanged. It also independently confirms `ghm_app_user` can SET ROLE to `ghm_db_user`, whose CREATEDB and CREATEROLE attributes are true. No remediation was performed by this read-only query.

The query tool rejects multiple SQL statements in a single prepared statement; role attributes and membership graph were therefore queried separately. No data or role changes were made by these catalog checks.


## 9. Further read-only production preflight — database ACLs, function grants, Render services

These checks were executed after the operator said "proceed". They were read-only; no production changes were made.

### Database ACL: CONNECT comes from PUBLIC

The `pg_database.datacl` result for `ghm_db` was:

```text
=Tc/ghm_schema_owner
ghm_schema_owner=CTc/ghm_schema_owner
ghm_runtime=c/ghm_schema_owner
```

The PUBLIC entry `=Tc` includes CONNECT and TEMPORARY. `has_database_privilege('ghm_payment_provider','ghm_db','CONNECT')` returned true. This explains the earlier `GRANT CONNECT` warning: provider CONNECT was already effective through PUBLIC, so the command did not add a provider-specific ACL entry. **No dedicated CONNECT grant is currently evidenced.** This is not a blocker for connection by itself, but it means database-wide CONNECT is not isolated to the provider role. Any tightening of PUBLIC CONNECT is a separate potentially breaking database-wide change and must not be attempted without auditing all database clients.

### Schema privileges

For schema `ghm`:
- `ghm_payment_provider`: USAGE=false, CREATE=false
- `ghm_runtime`: USAGE=true

This is the expected pre-migration state; the second reviewed migration grants provider USAGE. Do not grant it manually ahead of the migration unless the rollout plan is deliberately changed and reviewed.

### Settlement function inventory and effective EXECUTE

The read-only catalog query found only the existing generic settlement function:

`ghm.commercial_apply_payment_result(bigint,text,text,text,text,text,text,text,timestamp with time zone,jsonb)`

Observed:
- Owner: `ghm_schema_owner`
- SECURITY DEFINER: true
- ACL: `ghm_schema_owner=X/ghm_schema_owner`, `ghm_runtime=X/ghm_schema_owner`
- Provider EXECUTE: false
- Runtime EXECUTE: true

The two PayFast-specific functions were not present:
- `ghm.commercial_get_payfast_attempt(bigint)`
- `ghm.commercial_apply_payfast_payment_result(bigint,text,text,text,text,text,text,timestamptz,jsonb)`

This confirms the second migration has not been applied and the runtime still has generic settlement execution. Do not enable a new callback flow against this pre-migration state.

### Render service inventory

A read-only Render service inventory returned these relevant production/workspace services:

- `GHM-Internal-Runtime`, service `srv-damupsek1f9s73eq8kkg`: branch `main`, auto-deploy enabled with `checksPass`, public IP allow-list `0.0.0.0/0`, Frankfurt.
- `ghm-payfast-sandbox-runtime`, service `srv-db5vtgl9fdbs73eaclbg`: branch `main`, auto-deploy enabled on commit, public IP allow-list `0.0.0.0/0`, Frankfurt.
- `ghm-identity-qualification`, service `srv-dbahvenbtjjs73f83rlg`: integration qualification branch, auto-deploy checksPass, public IP allow-list `0.0.0.0/0`.

No dedicated production PayFast callback service was identified in this service inventory. The sandbox runtime is not evidence of a production callback service or production callback cutover. Do not repurpose it without a separate reviewed plan.

### Tooling boundary and action actually taken

The connected Render Postgres SQL action is explicitly read-only (wraps each query in a read-only transaction). It cannot execute `REVOKE`, `GRANT`, `ALTER ROLE`, or other mutations. No alternate Render database-administration action was exposed in the connected tool catalog. Therefore no live role repair was attempted through the connector. This is a real capability boundary, not an instruction to find or invent another employee/admin.

The operator's interactive `psql` connection was authenticated as `session_user=ghm_app_user`, `current_user=ghm_db_user`; the recorded membership was granted by `postgres`. The prior REVOKE attempt as `ghm_db_user` did not alter the grant. Do not claim this is fixed. A further attempt to bypass the grantor boundary from the same application-associated identity would be unsafe and is not justified.

**State after this section:** provider role exists; effective CONNECT is via PUBLIC; no schema USAGE; no PayFast-specific functions; generic runtime settlement function remains executable; no dedicated production callback service found; role membership and broad `CREATEROLE/CREATEDB` escalation remain unresolved. Production release remains HOLD.


## 10. Code review and targeted hardening — 2026-11-05

The operator asked to proceed. Repository review was performed against the current PR #207 head after the operational preflight. This was source review and release-branch editing only; no production database, service, secret, network, payment, or migration state was changed.

### Finding: provider attempt-read routine did not constrain provider identity

The original migration `20261104130000_isolate_payfast_settlement_identity.sql` created `ghm.commercial_get_payfast_attempt(bigint)` as SECURITY DEFINER and granted EXECUTE to `ghm_payment_provider`, but its SELECT predicate originally filtered only by attempt ID. It returned `provider_code` but did not constrain the row to `provider_code='payfast'`. The callback application code independently checked the returned provider code, so this was not an observed settlement bypass; however, the SECURITY DEFINER read boundary itself should enforce provider scope rather than rely on caller code. An unbound or future non-PayFast attempt could otherwise be read through the provider-specific routine.

### Source correction committed

The migration's lookup query now includes:

```sql
WHERE a.id = p_payment_attempt_id
  AND a.provider_code = 'payfast'
LIMIT 1
```

The disposable PostgreSQL qualification script `scripts/qualify-commercial-payment-result-runtime.mjs` now additionally probes the provider read function using a fixture attempt whose `provider_code IS NULL` and asserts that it returns zero rows.

Commits on release branch:
- Migration scope fix: `b17d64f7e3a6bf66555fa724198a60617e6270f4`
- Qualification assertion: `38367760c83fb3e655245b96cac89c5bdf888557`

PR #207 remains open, draft and unmerged. The PR head at the time of this update is `38367760c83fb3e655245b96cac89c5bdf888557`. No CI run was yet returned for this exact new head when checked; do not claim the change has passed CI until an exact-head workflow run completes successfully.

### Additional code review observations

- The dedicated process entry point is `src/payfast-callback-server.ts`, started with package script `npm run start:payfast-callback`. It loads only `PAYFAST_CALLBACK_DATABASE_URL` for its database pool, verifies startup and readiness identity equals `ghm_payment_provider`, requires explicit `PAYFAST_ENVIRONMENT` in production, and requires `PAYFAST_CALLBACK_DATABASE_SSL=true` in production.
- The callback parser restricts form fields, rejects non-string values and applies size/parameter limits. The boundary checks provider, ZAR currency, source IP, signature, merchant, amount, status, merchant payment ID, and PayFast server confirmation before invoking the PayFast-specific settlement routine.
- Proxy trust is disabled by default; configuring a hop count without evidence of the actual Render proxy chain would be unsafe. Keep `PAYFAST_CALLBACK_TRUST_PROXY=false` until the ingress/proxy path is verified.
- The callback code and ADR describe the intended separate service, but repository search did not find an existing production callback service deployment. The Render service inventory likewise did not identify one.
- The package script `start:payfast-callback` exists. The ordinary production API must not receive callback credentials or the provider database URL.
- The qualification script exercises three distinct identities and tests that the provider cannot directly access payment tables or execute the generic settlement function. It also tests provider-bound settlement, replay idempotency, terminal-attempt rejection, and rollback. The new negative lookup-scope assertion awaits exact-head CI.

### Remaining production gates are unchanged

- Production provider-role membership still has `ADMIN OPTION=true`, grantor `postgres`; no production remediation was performed.
- `ghm_db_user` still has `CREATEDB` and `CREATEROLE`, and `ghm_app_user` can SET ROLE to it.
- Provider CONNECT is effective via PUBLIC ACL; the earlier GRANT did not create a dedicated grant.
- Provider has no schema USAGE and PayFast-specific functions are absent in production because migrations have not been applied.
- No production callback service or callback secret is configured.
- Complete production migration ledger audit, historical attempt #6 disposition, restore rehearsal, database ingress/private connectivity plan, callback qualification and supervised cutover remain open.
- The Render SQL connector is read-only and cannot perform role/migration changes.

**Decision:** source-level lookup hardening is committed for CI review. Production remains NO-GO / HOLD. Do not run migrations, merge PR #207, deploy the API or callback, provision credentials, change memberships, or mutate payment records.


## 11. Exact-head CI result for lookup hardening — 2026-11-05

GitHub Actions was queried directly for workflow runs whose `head_sha` equals `9261b8dddb8e35a0e93267d4c6c3a7bb6824a6ab`.

Observed run:
- Workflow: `CI`
- Run ID: `41931655669`
- Run number: `1937`
- Event: `pull_request`
- Head SHA: `9261b8dddb8e35a0e93267d4c6c3a7bb6824a6ab`
- Status: `completed`
- Conclusion: `success`
- Quality job ID: `126929778350`, completed successfully.
- Run URL: https://github.com/zaidhqdev-sys/GHM/actions/runs/41931655669

All 33 job steps reported completed/success, including:
- isolated least-privilege database role setup;
- build;
- applying all migrations to disposable PostgreSQL;
- test suite;
- commercial payment settlement identity qualification against disposable PostgreSQL;
- migration audit policy tests;
- runtime boundary verification.

The updated qualification step `Qualify commercial payment settlement identities against disposable PostgreSQL` passed at this exact head, including the new negative assertion that the provider attempt-read function returns zero rows for an unbound attempt.

PR #207 was rechecked:
- state: open
- draft: true
- merged: false
- head SHA: `9261b8dddb8e35a0e93267d4c6c3a7bb6824a6ab`
- base: `main`
- compare against current main: 37 commits ahead, 0 behind at time of check.

**Interpretation:** source and disposable-PostgreSQL qualification for the latest provider lookup hardening have passed exact-head CI. This does not constitute production migration, production role-graph approval, restore rehearsal, callback deployment, or live payment qualification. Production release remains HOLD pending those independent operational gates.


## 12. Migration/deployment source review and runbook refresh — 2026-11-05

The production rollout runbook was refreshed against the current release source
and exact-head CI evidence. Commit:
`72baed8127bac531d2511af2438eb52615ea0c30`.

Updated document:
`docs/operations/payfast-production-rollout-runbook.md`

The runbook now records:
- Current PR #207 release head and exact-head CI run #41931948641 success.
- The exact effects of both pending PayFast migrations and the corrected
  provider-scoped SECURITY DEFINER lookup.
- Callback service entry point and start command, provider-only DB variable,
  production SSL/environment requirements and readiness identity check.
- Explicit instruction to keep proxy trust disabled until Render ingress is
  verified.
- Current production role graph, provider CONNECT inherited from PUBLIC,
  absent production PayFast functions/schema usage, unreadable authoritative
  migration ledger, unclassified historical attempt #6, broad DB ingress and
  lack of restore rehearsal.
- Coordinated cutover order and explicit stop conditions.

The runbook update is documentation-only. No production database, role,
membership, secret, network, Render service, callback URL, payment data or
deployment was changed.

The runbook documentation commit itself has no workflow run associated with
it at the time of this check; do not describe that docs commit as CI-verified.
The code-bearing PR head `c6f2af481c92eccee63587d7c6fe43e5e247139f`
remains the exact head whose CI run #41931948641 passed.

PR #207 remains open, draft and unmerged. Production remains HOLD.


## 13. Checkout/callback secret boundary and ITN retry review — 2026-11-05

Source review clarified the exact secret/configuration split:

- The ordinary API creates outgoing checkout forms and needs its merchant
  checkout configuration: `PAYFAST_ENVIRONMENT`, `PAYFAST_MERCHANT_ID`,
  `PAYFAST_MERCHANT_KEY`, `PAYFAST_RETURN_URL`, `PAYFAST_CANCEL_URL`,
  `PAYFAST_NOTIFY_URL`, and the shared `PAYFAST_PASSPHRASE` if the
  merchant has configured one.
- The callback process needs `PAYFAST_CALLBACK_DATABASE_URL`,
  `PAYFAST_CALLBACK_DATABASE_SSL=true`, explicit
  `PAYFAST_ENVIRONMENT`, `PAYFAST_MERCHANT_ID`, and the same
  `PAYFAST_PASSPHRASE` if configured.
- The API must not receive the provider DB URL/password or callback DB access.
  The callback does not need the merchant key used to create checkout forms.
- `PAYFAST_NOTIFY_URL` on the checkout API must ultimately point to the
  actual created callback service's HTTPS URL and
  `/api/v1/commercial/payfast/itn`. Do not guess the hostname or switch the
  merchant notify URL before callback readiness and migration verification.
- The merchant passphrase is a PayFast merchant signing secret, distinct from
  the provider DB password. If used, provision it securely to the two
  processes that need it; never log or commit it.

### PayFast protocol cross-check

Official PayFast ITN documentation was reviewed. It confirms the documented
standard ITN statuses are `COMPLETE` and `CANCELLED`, describes notify URL,
signature and server confirmation checks, and says a 200 response stops
retries; a non-200 response causes immediate and later retries. The published
developer IP ranges match the static IPv4 ranges in
`src/resources/commercial/payfast.ts` at this review:
`197.97.145.144/28`, `41.74.179.192/27`,
`102.216.36.0/28`, `102.216.36.128/28`,
`144.126.193.139`.

PayFast support advises that its A records may change and publishes
`www.payfast.co.za`, `api.payfast.co.za`, `ips.payfast.co.za`,
`w1w.payfast.co.za`, and `w2w.payfast.co.za` for firewall monitoring.
These are external references and must be rechecked before any future
allow-list change:
- https://developers.payfast.co.za/docs/itn-instant-transaction-notification/
- https://developers.payfast.co.za/
- https://support.payfast.help/portal/en/kb/articles/what-ip-addresses-does-payfast-use-20-9-2022

### Newly identified callback acknowledgement acceptance gate

The callback currently returns HTTP 400 for permanent validation rejects
(e.g. malformed fields, source IP, merchant/signature/amount mismatch, and
PayFast confirmation response other than VALID), and HTTP 500 for unexpected
internal errors. PayFast documents non-200 ITN responses as retryable, with an
immediate retry followed by a 10-minute retry and exponentially longer
intervals. This creates a potential retry-amplification consideration for
permanently invalid ITNs.

Do not blindly change the endpoint to return 200 before validation or before
durable settlement. Before go-live, add explicit tests and decide policy for
permanent invalid notifications, transient PayFast confirmation failures,
database/settlement failures, and duplicate/replayed notifications. Permanent
rejects should be auditable without generating endless retries; transient
failures should remain retryable; successful acknowledgements must follow
durable idempotent settlement outcome. The detailed gate is now recorded in
the production rollout runbook.

### Current release head note

Documentation-only follow-up commits updated the runbook and this handover
after the code-bearing PR head `c6f2af481c92eccee63587d7c6fe43e5e247139f`
passed exact-head CI run #41931948641. The latest docs commit is not a new
code-bearing CI result. PR #207 remains draft, open and unmerged. No
production changes were made.


## 14. ITN acknowledgement policy implementation — 2026-11-05

The previously documented retry-amplification concern has been addressed in
release-candidate source (not production):

- Added `PayfastItnPermanentError` for validated, non-retryable ITN rejects.
- Added `classifyPayfastItnFailure`: permanent errors and malformed request
  parser statuses 400/413/415 are non-retryable; all unclassified errors
  default to retryable.
- Callback route now returns HTTP 200 for permanent rejection only after
  writing a sanitized structured warning log containing event, reason code
  and error class. Raw form bodies, signatures, names, email addresses,
  merchant/provider payment identifiers and other ITN values are not logged.
- Malformed field sets and parser 400/413/415 errors are acknowledged HTTP
  200 with a `malformed_request` reason.
- Invalid attempt identifiers, missing attempts, provider/currency mismatch,
  source IP/signature/merchant/amount mismatch, invalid payment identifiers
  or status, server-confirmation body other than `VALID`, and known permanent
  settlement conflicts are non-retryable.
- PayFast confirmation endpoint non-success HTTP responses/timeouts, DB
  connection/query failures and unexpected errors remain HTTP 500/retryable.
- HTTP 200 for success occurs only after the settlement database call resolves;
  exact duplicate/replay behavior remains governed by the idempotent database
  settlement function.

Tests added for permanent vs transient classification, malformed request
parser status, non-VALID server confirmation, transient confirmation network
failure, transient database failure, and permanent settlement rejection.
Existing tests also assert signature/provider failures fail closed before
server confirmation.

Commits:
- Typed permanent error and classifier: `d45d0a814154abd7505776a67b40d1d356284b9f`
- Route acknowledgement behavior: `b393f09799949537da5cb81493061699763cd6bf`
- Policy tests: `bfa1dcd3d39fff735eda9b60914ae9607316aded`
- Normalized error reason strings: `ec779700be831c4099e5d9766b7f2a323bf8ae04`
- Runbook policy: `6a0d23ba3f6037e614ee0b6d809ab9a28150c361`

At handover update time PR #207 is open, draft and unmerged, with head
`6a0d23ba3f6037e614ee0b6d809ab9a28150c361`. No workflow run was yet
returned for that exact head. Do not claim CI success until an exact-head
workflow run completes.

Remaining verification: exact-head CI, supervised sandbox callback tests
against PayFast retry semantics, operational monitoring for permanent reject
events, duplicate/replay reconciliation, and all existing production
role/ledger/restore/network/callback deployment gates. Production remains
HOLD; no production resources were changed.


### CI feedback and correction

CI run `41933195727` on code commit
`ec779700be831c4099e5d9766b7f2a323bf8ae04` compiled successfully but its
test suite failed one new assertion only: the test expected the normalized
reason with underscores while the error's human-readable message deliberately
renders underscores as spaces. The other new retry-policy tests passed; later
qualification steps were skipped because the test job failed.

The assertion was corrected in code commit
`d0e2a8caad7fb726d312f0660a53c567f6c472a3` to match the human-readable error
message. Exact-head CI for that correction was not yet returned at the time
of this note. This is a test-only correction; do not claim the acknowledgement
policy is CI-green until the new exact-head run completes successfully.


### Exact-head CI result after ITN acknowledgement correction

The corrected code commit
`d0e2a8caad7fb726d312f0660a53c567f6c472a3` completed exact-head GitHub
Actions CI successfully:

- Workflow run: `41933348996` (CI #1951)
- Conclusion: `success`
- Quality job: successful
- Build: passed
- All migrations on disposable PostgreSQL: passed
- Full test suite, including ITN acknowledgement classification: passed
- Commercial payment settlement identity qualification: passed
- Migration audit policy tests: passed
- Runtime boundary verification: passed

Run URL: https://github.com/zaidhqdev-sys/GHM/actions/runs/41933348996

This validates the code at `d0e2a8caad7fb726d312f0660a53c567f6c472a3`
in CI's disposable environment. The later handover-only commit does not
change application code and is not claimed as a new code-bearing CI run.

PR #207 remains open, draft and unmerged. Production remains HOLD. No
production database, roles, credentials, networking, services, notify URL,
or payment records were changed.


## 15. ITN classification hardening follow-up — 2026-11-05

Post-CI source review found an overly broad catch: all exceptions from
`verifyPayfastItn` had been converted to permanent errors. That would risk
HTTP 200 for an unexpected verification implementation/runtime error.

Correction made:
- Permanent verifier failures now use an explicit allow-list of known
  validation messages only: signature missing/invalid, source IP invalid,
  merchant mismatch, amount mismatch, and payment status missing.
- Unknown verifier errors are rethrown unchanged and remain retryable (HTTP
  500), as are PayFast confirmation network/non-success HTTP errors and
  database failures.
- Added central `payfastItnHttpStatus` mapping and tests for 200 vs 500
  classification, including unexpected verifier errors.

Commits after the last passing code CI:
- `6f34d66486b476a3aac39df0c18ba90e5bfd16f0`: keep unknown verifier errors retryable.
- `567256331335b094f3f66618b36d964ea7e47730`: centralize HTTP status mapping.
- `54fb8481d03fcefe2ae84939dcfb19d42c31b0a8`: normalize permanent reasons.
- `5dda87f80622238ebee67458b047bee836d79ed2`: assert HTTP acknowledgement mapping.
- `e0be0d13750f73697e06a6ff351cb0bb9bc8bea7`: record this review in runbook.

Latest release PR head at time of handover: `e0be0d13750f73697e06a6ff351cb0bb9bc8bea7`.
No exact-head CI result has yet been returned for these post-CI commits.
The previous successful CI run #41933348996 applies to code commit
`d0e2a8caad7fb726d312f0660a53c567f6c472a3` only.

No sandbox credentials or public callback endpoint were supplied, so no
real PayFast sandbox notification/retry test has been executed. No service,
secret, production database, migration, role, notify URL, or payment record
was changed. Next gate: exact-head CI for this hardening, then a supervised
PayFast sandbox ITN run with a verified publicly reachable callback endpoint
and a non-production provider database.


### Exact-head CI result for verifier-classification hardening

CI for head `1ee05eaf63196867376b0bf9588b555c5b540152` completed successfully:
- Run #41934339437 / CI #1961: success.
- Build passed.
- All migrations on disposable PostgreSQL passed.
- Storage getter and lifecycle/tenant qualification passed.
- Full test suite passed, including the new verifier allow-list and HTTP
  acknowledgement mapping tests.
- Commercial payment settlement identity qualification passed.
- Migration audit policy tests passed.
- Runtime boundary verification passed.

[Exact CI run](https://github.com/zaidhqdev-sys/GHM/actions/runs/41934339437)

Latest docs-only follow-up commit: `f3866daac74d6f19d4b33e302367bcf78a21cbd4`.
The code-bearing CI head is `1ee05eaf63196867376b0bf9588b555c5b540152`;
do not describe the later documentation-only commit as a separate code CI
run. PR #207 remains open, draft and unmerged.

Sandbox end-to-end notification/retry testing is still not performed. It
requires a sandbox merchant account, a publicly reachable callback endpoint,
and a separate non-production database/credential. No credentials were
requested or exposed in chat. No callback service or database was created,
and no production resources were modified.


### Sandbox callback deployment reality check — 2026-11-05

Read-only Render inspection of service `ghm-payfast-sandbox-runtime`
(`srv-db5vtgl9fdbs73eaclbg`) confirms it is **not** running the dedicated
PayFast callback process:

- Branch: `main`; latest live commit: `61202bb4f61a465f8776b192927aa22e40297fd1`.
- Build: `npm ci --include=dev && npm run build`.
- Start command: `npm start`, which runs `node dist/server.js`, not
  `npm run start:payfast-callback`.
- Render service health check: `/readyz`.
- Public URL: `https://ghm-payfast-sandbox-runtime.onrender.com`.
- Render logs show `GHM Core Engine listening on port 10000`.
- Service is public (`0.0.0.0/0` service IP allow-list), Frankfurt, free
  plan, and auto-deploys on commits to `main`.

Therefore its name is not evidence of a PayFast callback endpoint. Do not
send ITNs to it, change its start command, add callback credentials, or
repurpose it. A separately provisioned sandbox callback service must run
the release candidate's callback entry point on an isolated non-production
database with a dedicated non-production `ghm_payment_provider` identity.

The callback entry point source requires:
- `PAYFAST_CALLBACK_DATABASE_URL` authenticated directly as
  `ghm_payment_provider`;
- `PAYFAST_ENVIRONMENT=sandbox`;
- `PAYFAST_MERCHANT_ID`;
- `PAYFAST_CALLBACK_DATABASE_SSL=true` when `NODE_ENV=production`;
- the optional shared PayFast passphrase if configured by the sandbox
  merchant; and
- `PAYFAST_CALLBACK_TRUST_PROXY` left false until the actual Render edge
  forwarding chain is verified and sanitized.

No environment-variable values were read or disclosed. No service, database,
credential, secret, deploy, notify URL, or payment record was changed.
Sandbox end-to-end testing remains blocked pending a distinct non-production
database/role, sandbox merchant credentials, and a separately created
callback service with verified proxy/source-IP handling.


### Existing GHM identity qualification Render service — read-only verification (2026-11-05)

The Render workspace does contain a separately named service:
- Name: `ghm-identity-qualification`
- Service ID: `srv-dbahvenbtjjs73f83rlg`
- URL: `https://ghm-identity-qualification.onrender.com`
- Region/plan: Frankfurt / Free
- Branch: `integration/ghm-identity-merge-candidate-20261018`
- Latest live deploy: `dep-dblk9pvb9u1s73bkaaag`
- Deployed commit: `ee91f42503e064571d57e87ed0d5cd1e9d5badd5`
- Build/start: `npm ci --include=dev && npm run build`; `npm start`
- No Render health-check path configured.
- Public service ingress allow-list: `0.0.0.0/0`.

Read-only deployment logs for the live instance explicitly show:
`npm start` -> `node dist/server.js` -> `GHM Core Engine listening on port 10000`.
The package at the deployed commit also defines `start:payfast-callback`
as `node dist/payfast-callback-server.js`, but Render is not invoking it.

Interpretation: the identity-qualification service **does exist and is live**,
but its current deployed process is the ordinary GHM Core Engine. The service
name and integration branch do not prove that identity qualification scripts
have been run against its database, nor that this service is an isolated
PayFast callback runtime. It must not be pointed at PayFast or repurposed
without a reviewed deployment change. This finding corrects any earlier
wording that implied no identity-qualification Render service existed.

The latest live commit is a documentation-only commit on the integration
branch. No environment-variable values were inspected. No deploy, restart,
service configuration, database, secret, callback URL, or payment record was
changed. The separate `ghm-payfast-sandbox-runtime` service remains a
different service and also runs `node dist/server.js`.


### Superseding clarification — identity qualification uses the shared PayFast sandbox DB

This section corrects the interpretation in the immediately preceding Render
service note. The ordinary `node dist/server.js` process is the intended GHM
application runtime for the identity-qualification workload; it is not, by
itself, evidence that the service is unused for qualification or that its DB
is isolated from the PayFast sandbox environment.

The earlier owner-confirmed Render handover
(`docs/operations/handover-production-db-and-render-2026-10-24.md`, addenda
dated 2026-10-26 and 2026-10-31) explicitly records:
- `ghm-identity-qualification` (`srv-dbahvenbtjjs73f83rlg`) targets the
  owner-confirmed non-production database `ghm_payfast_sandbox_db`,
  Render resource `ghm-payfast-sandbox-db`
  (`dpg-db4416vlk1mc73eocug0-a`), not production `ghm_db`.
- Its runtime and migrator URLs were reported as targeting that same sandbox
  database with different credentials. The live secret values were not read
  back.
- A live deployment on 2026-10-31 ran commit
  `7a17a781a9a1910a6ea76b8819f4714680ac282e`; the handover records a
  successful `/readyz` HTTP 200 probe and a read-only role audit of the
  sandbox runtime identity.
- The owner confirms qualification tests have been run through this established
  service against the shared PayFast sandbox DB. This is owner/handover
  evidence of the existing qualification workflow; it is not evidence that
  the new isolated callback listener has been deployed or that real PayFast
  ITNs/retry delivery have been exercised.

The current Render inspection independently confirms the service still exists,
is live on the integration branch, and starts `node dist/server.js`. The
Render service environment association matches the sandbox DB environment.
That process selection is consistent with the established GHM API-based
qualification service; it must not be mistaken for a missing qualification
service. The separate `ghm-payfast-sandbox-runtime` service is also an API
process, not the callback listener.

**Corrected interpretation:** the existing shared PayFast sandbox database is
the intended non-production qualification database and is already used by
the identity-qualification service. Do not create another database or change
the service's database target merely because it is shared by the GHM identity
qualification and PayFast sandbox work. Keep production `ghm_db` excluded.
The sandbox database is a free-tier resource recorded with expiry
`2026-11-08T01:17:15Z`; retention/upgrade is a separate owner decision.

The outstanding distinction is callback cutover: the current service's
`npm start` does not launch `dist/payfast-callback-server.js`. Do not send
PayFast ITNs to the ordinary API endpoint or change the start command without
a reviewed callback deployment plan. No service, DB, secret, environment
variable, migration, notify URL, or payment record was changed by this
clarification.


### Read-only shared PayFast sandbox schema reconciliation — 2026-11-05

Target verified via Render resource metadata and read-only SQL:
- Render DB: `ghm-payfast-sandbox-db`, ID `dpg-db4416vlk1mc73eocug0-a`
- Database: `ghm_payfast_sandbox_db`; PostgreSQL 18; primary; Frankfurt; currently available.
- SQL identity: `session_user=current_user=ghm_payfast_sandbox_db_user`.
- Identity qualification service `ghm-identity-qualification` is in the same Render environment as this DB. The historical owner-confirmed handover records its runtime/migrator URLs target this shared sandbox using distinct credentials; secret values were not inspected.
- Resource expiry recorded by Render: `2026-11-08T01:17:15.779117Z` (free tier).

Read-only catalog findings:
- `ghm.commercial_payment_attempt` exists, but its columns do **not** include `provider_code`.
- `ghm_payment_provider` role is absent.
- `ghm.commercial_get_payfast_attempt(bigint)` and
  `ghm.commercial_apply_payfast_payment_result(...)` are absent.
- The older `ghm.commercial_apply_payment_result(...)` SECURITY DEFINER function still exists.
- The migration ledger relation is `ghm.ghm_schema_migrations`, with columns
  `version`, `name`, `checksum`, `applied_at`.

Conclusion: the release's two PayFast isolation migrations are **not reflected
in the current shared sandbox schema**:
1. `20261104120000_bind_commercial_payment_attempt_provider.sql`
2. `20261104130000_isolate_payfast_settlement_identity.sql`

This conclusion is based on absence of their defining schema/role/function
artifacts, not on a direct ledger-row comparison. The Render SQL connector's
read-only identity cannot use schema `ghm`, cannot SELECT the migration ledger,
and cannot SET ROLE to `ghm_schema_owner` or `ghm_migrator`. Although it has
admin-option membership records for some roles, PostgreSQL reports
`set_option=false`; no role switch was attempted. Therefore exact ledger
rows/checksums and applied migration count remain **unverified**. Obtain those
through the approved owner-controlled read-only audit path using a credential
that is already authorized to assume `ghm_schema_owner`; do not broaden the
Render connector's privileges to work around this limitation.

No migration, DDL, ledger read via elevated role, fixture write, grant, role
creation, credential read, service change, or payment write was performed.
Production `ghm_db` was not queried. Do not apply the two migrations as part
of this audit: they require a separate approved sandbox migration window and
the out-of-band `ghm_payment_provider` role prerequisite.


### Owner-terminal command for exact read-only sandbox ledger reconciliation

The existing `scripts/forensic-migration-reconciliation.mjs` is suitable for
this check: it opens `BEGIN READ ONLY`, verifies the session is
`ghm_migrator`, verifies `current_database()` against
`GHM_MIGRATION_AUDIT_DATABASE`, executes `SET ROLE ghm_schema_owner`,
reads `ghm.ghm_schema_migrations`, and always rolls back. It performs no
migration or write.

The Render SQL connector cannot perform the role switch, and this workspace
cannot access the owner's local terminal or read local environment variables.
Therefore the exact sandbox ledger audit must be executed in the owner's
terminal. Do not paste connection strings, credentials, or environment
variable values into chat.

From a checkout of the release branch, first confirm locally (without printing
the URL) that the existing `GHM_MIGRATOR_DATABASE_URL` is the approved
sandbox migrator connection for `ghm_payfast_sandbox_db`, not production.
Then run:

```sh
GHM_MIGRATION_AUDIT_DATABASE=ghm_payfast_sandbox_db DATABASE_SSL=true npm run audit:migrations
```

The script must report authority `pass: true`, before identity
`ghm_migrator`, after identity `ghm_schema_owner`, and
`expected_database: ghm_payfast_sandbox_db`. Preserve the full JSON output
locally. Share only the non-secret JSON audit report if a second review is
needed. If the identity/database gate fails, stop; do not retry against another
URL, alter role memberships, or run `npm run migrate`.

This is a prepared command, not a claim that the exact ledger audit has already
run. No local terminal or sandbox migrator credential was accessed by ChatGPT.


### Operator-run audit clarification — 2026-11-05

The owner ran `npm run audit:migrations` from PowerShell using Bash-style
inline environment assignment syntax. PowerShell rejected those assignments,
then continued to execute the npm command. As a result, the audit used the
script's default expected database `ghm_db` and reported:
`session_user=current_user=ghm_migrator`, `current_database=ghm_db`,
`SET ROLE ghm_schema_owner` successful, read-only transaction true,
verdict `INVESTIGATE`. This was a production read-only audit, not the
shared sandbox audit. No migration or write was performed. Its results match
the previously recorded production ledger finding: exactly the two PayFast
migrations are missing; no unexplained checksum mismatches or unrecognized
extras.

**Do not interpret that output as sandbox evidence.** For PowerShell, set
environment variables using `$env:NAME = 'value'` syntax. Before running
the audit again, the owner must use the already-approved sandbox-only
`GHM_MIGRATOR_DATABASE_URL` from their secure local secret source. The
previous run connected to production, so the currently loaded local URL must
be treated as production until explicitly switched and verified. Never print
or share the URL. Then set
`$env:GHM_MIGRATION_AUDIT_DATABASE = 'ghm_payfast_sandbox_db'` and
`$env:DATABASE_SSL = 'true'`, run `npm run audit:migrations`, and confirm
the script's authority output says `current_database=ghm_payfast_sandbox_db`
both before and after `SET ROLE`. If it reports `ghm_db` or any other
database, stop; do not proceed. Remove temporary environment overrides after
the run. No local secret was inspected by ChatGPT.


## 18. Shared PayFast sandbox migration and settlement-boundary verification — 2026-11-05

**Scope:** owner-authorized sandbox migration and read-only post-migration verification only. This section records the operator's Terminal 3 / sandbox PostgreSQL session. It does not change or supersede the production release HOLD recorded above.

### Target verification

Before running the migration, the operator verified the local migrator URL metadata without displaying the URL or credentials:

- Database and expected database: `ghm_payfast_sandbox_db`.
- Host and expected host: `dpg-db4416vlk1mc73eocug0-a`.
- Username: `ghm_migrator`.
- Render PostgreSQL resource: `dpg-db4416vlk1mc73eocug0-a` (`ghm-payfast-sandbox-db`).

The first target guard attempt stopped safely because its expected host omitted the trailing `-a`. The expected-host environment value was corrected to the exact sandbox host; the second guard printed `TARGET VERIFIED: sandbox only`. No migration was run on the failed guard attempt.

### Migration execution and ledger evidence

The owner explicitly authorized `npm run migrate` against the verified sandbox target only. The command ran in Terminal 3, not either production terminal. The captured output shows the TypeScript build (`tsc`) completed and the runner accepted existing supported legacy line-ending checksums. The captured terminal output did not include an explicit migration completion summary; therefore success is recorded from the subsequent direct ledger verification, not inferred from the truncated runner output.

A read-only SQL session was opened with:
- `current_database() = ghm_payfast_sandbox_db`
- `session_user = ghm_migrator`
- after `SET LOCAL ROLE ghm_schema_owner`, `current_user = ghm_schema_owner`
- `transaction_read_only = on`

The migration ledger relation was confirmed as `ghm.ghm_schema_migrations`. A direct SELECT returned exactly these two requested rows with exact canonical checksums:

| Version | Migration | Observed checksum | Result |
|---|---|---|---|
| `20261104120000` | `bind_commercial_payment_attempt_provider` | `3f284b7afb1bc83c42331b0346e2853f448948ad9a2f9e92c162c303fb92d3d8` | Exact canonical match |
| `20261104130000` | `isolate_payfast_settlement_identity` | `8804d609a9378fceb20793f687b85d33c9b6d1165be37656dbac437ecaa66011` | Exact canonical match |

### Read-only schema and privilege verification

The operator's read-only catalog queries observed:

| Check | Result |
|---|---|
| `ghm.commercial_get_payfast_attempt(bigint)` exists | true |
| `ghm.commercial_apply_payfast_payment_result(...)` exists | true |
| Both functions owned by `ghm_schema_owner` | true |
| Both functions are `SECURITY DEFINER` | true |
| `ghm_payment_provider` can execute both functions | true |
| `ghm_runtime` can execute either function | false |
| `PUBLIC` can execute either function | false |
| `provider_code` column exists as nullable `text` | true |
| Provider constraint allows only NULL or `payfast` | true |
| `ghm_payment_provider` has `USAGE` on schema `ghm` | true |

The final schema ACL query also reported `ghm_runtime` has schema `USAGE` on `ghm`. This is not function execution authority: the independently checked runtime EXECUTE privilege on both PayFast functions is false. The distinction is intentional and must be preserved in future reviews.

### Result and remaining limits

- **Sandbox database migration and inspected settlement-function ACL boundary: verified.**
- The pre-migration read-only aggregate had reported zero rows in `ghm.commercial_payment_attempt`; no payment attempts or payment records were written as part of this work.
- No production database, production role, production credential, production schema, production network, production service, or production payment data was changed.
- No provider password or callback secret was set or read.
- No callback listener was deployed or configured; no real PayFast sandbox ITN, retry, replay, or payment E2E test was performed.
- No API deployment, PR merge, or production cutover was performed. PR #207 remains draft/unmerged.
- The final SQL output was collected inside the read-only transaction. The operator subsequently executed `ROLLBACK`; PostgreSQL returned `ROLLBACK` and the session returned to the normal prompt. The read-only transaction is therefore confirmed closed.

**Release status remains HOLD for production.** The sandbox migration does not authorize production migration, deployment, callback activation, secret configuration, role/ACL changes, PR merge, or payment writes. Continue to require the independent production role-administration, backup/restore, migration-ledger, network, callback-service, sandbox ITN/retry, monitoring, and owner-approval gates.
