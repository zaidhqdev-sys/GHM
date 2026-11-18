# Render / GHM Actor Gateway Role-Separation Handover

**Date:** 2026-11-12  
**Status:** Support guidance confirmed; production credential transition NOT started  
**Repository:** `zaidhqdev-sys/GHM`  
**Target:** Render PostgreSQL `ghm-db` / database `ghm_db` / GHM Internal Runtime

## Purpose

This handover records the full 2026-11-12 Render support conversation and the resulting technical decision. It preserves why the `ghm_actor_gateway` role was created, why we have been trying to revoke/resolve its membership relationship, what Render support confirmed, what production evidence was collected, and the safe next steps.

This is a continuation of the GHM security qualification. It is not a new audit and does not authorize a production change.

## Executive outcome

Render support representative Amanda confirmed that the supported approach is to keep Render Dashboard-managed default credentials for database administration and move normal application execution to SQL-created login role(s), outside the Dashboard-managed credential list.

Amanda explicitly endorsed:

> Yes in this use case I would recommend moving normal app execution to SQL-created login (or logins) outside the Dashboard managed credential list.

This provides a supported way to remove the Dashboard-managed default user's automatic role-setting behaviour from normal application execution. It avoids trying to override PostgreSQL's managed role-creation semantics.

**No production credentials, role memberships, role settings, environment variables, deployments, or database objects were changed during this support conversation.** All production SQL inspection recorded below was read-only.

## Original trigger and history

The original issue began when we deliberately created and assigned the `ghm_actor_gateway` role as part of GHM's database security architecture. Since then, we have been trying to resolve/revoke the resulting role membership relationship so that the Actor Gateway remains a protected security boundary and cannot be administered through ordinary application execution.

The distinction matters:

- `ghm_actor_gateway` was intentionally created for a dedicated Actor Gateway identity/security boundary.
- The role creator/default administrator relationship resulted in `ghm_db_user` having membership in `ghm_actor_gateway` with `ADMIN OPTION`.
- A prior attempt to run `REVOKE ghm_actor_gateway FROM ghm_db_user` from the application/admin session did not remove the membership.
- The concern is not simply that a membership row exists. The concern is whether a role used by the normal application path can administer or change the protected gateway role's membership and thereby undermine the intended separation.
- We must preserve the original objective: normal application execution must not be able to administer, redefine, or undermine the Actor Gateway security boundary.

## Render support conversation — complete record

### 1. Initial Render explanation (Amanda, 2026-11-12)

Amanda explained that Render Postgres is managed and does not provide superuser permissions to the default role. For PostgreSQL 16+, when a non-superuser creates a role, PostgreSQL automatically grants membership back to the creating user, similar to a grant performed by the bootstrap superuser. Render cannot change that default behaviour or revoke the grant because the default role is not a superuser and should retain management rights over users it creates.

Amanda asked for more explanation of why the grant was a blocker so Render could suggest an alternative.

### 2. Our first clarification to Amanda

We acknowledged the PostgreSQL 16+ behaviour and explained the intended role separation:

- `ghm_db_user`: database administration.
- `ghm_runtime`: restricted application runtime.
- `ghm_migrator`: migration execution.
- `ghm_actor_gateway`: dedicated Actor Gateway security boundary.

We explained that the application connection used `ghm_app_user`, but the connection was configured to assume `ghm_db_user` as its effective role. This made the application execute with the administrative role's privileges and memberships.

We asked whether the role setting could be removed, whether the application could use `ghm_runtime`, and what Render-supported configuration would keep the administrator role out of ordinary application execution. We explicitly did not ask for superuser access or a managed-service override.

### 3. Our additional clarification about the Actor Gateway trigger

We clarified that this began when we deliberately created and assigned `ghm_actor_gateway` as part of GHM's security architecture. Since then, we had been trying to remove the unintended administrative relationship.

We identified the observed membership of `ghm_db_user` in `ghm_actor_gateway` with `ADMIN OPTION`, and explained that we wanted the Actor Gateway to remain a protected boundary.

We also explained the role setting `role=ghm_db_user` on `ghm_app_user`, which explained why the application connection showed `session_user=ghm_app_user` but `current_user=ghm_db_user`.

### 4. Amanda's detailed guidance (2026-11-12)

Amanda explained that the concern was related to role-setting behaviour in Render's credential rotation process, not merely PostgreSQL's default role membership behaviour.

She recommended leaving the default user listed in the Render Dashboard as the database administrator and creating other necessary users directly in PostgreSQL using SQL, as had already been done for `ghm_runtime`, `ghm_migrator`, and `ghm_actor_gateway`.

Amanda addressed the numbered concerns:

1. Because `ghm_app_user` was created through the Dashboard, Render cannot remove its automatic role connection setting. If that is required, rotate the user again and remove it from the default-user list in the Dashboard; then create `ghm_app_user` directly through SQL. She also clarified that the PostgreSQL 16+ ADMIN grant alone does not mean the default user can assume the created user's role or vice versa. An explicit `GRANT <new_user> TO <default_user>` is required for the default user to `SET ROLE <new_user>`.
2. Because `ghm_app_user` was created through the Dashboard, it is now the default user and cannot simply be removed or rolled back to the previous default user. A new default user can be created that inherits the original owner's permissions, after which the old Dashboard-managed `ghm_app_user` can be deleted. The application login can then be recreated directly through SQL, for example:
   ```sql
   CREATE ROLE ghm_app_user LOGIN PASSWORD '<strong password>' IN ROLE ghm_runtime;
   ```
   This was an illustrative example from support, not an approved production command. The exact role design and grants still require qualification.
3. Normal application execution can avoid Dashboard-created default users by using SQL-created login roles, while Dashboard-managed credentials remain for database administration.
4. Render does not manage SQL-created roles. They will not appear in the Dashboard or API. Dashboard connection strings always use the Render-managed user. Services that need SQL-created credentials must receive and manage those credentials themselves through service environment variables. The host, port and database remain the same; use the SQL-created username and password.

### 5. Our final clarification to Amanda

We asked Amanda to confirm that moving normal application execution to SQL-created login roles outside the Dashboard-managed credential list was the recommended solution, and described the intended separation:

- separate Render-managed administrator credential;
- SQL-created restricted application/service logins;
- normal runtime not using Dashboard-managed administrator credentials.

We also raised the PostgreSQL 18 role-attribute nuance: a CREATEROLE role with ADMIN OPTION over another role may be able to change/re-grant membership options. We asked whether the proposed move would eliminate this exposure from the normal application path.

### 6. Amanda's final confirmation (2026-11-12 18:46:53Z)

Amanda replied:

> I'm always happy to assist. Yes in this use case I would recommend moving normal app execution to SQL-created login (or logins) outside the Dashboard managed credential list.

This is explicit Render support confirmation of the recommended direction.

## Production read-only evidence collected during this investigation

The following queries were run read-only against the production Render database. No changes were made.

### Database identity

```
current_database = ghm_db
current_user     = ghm_db_user
session_user     = ghm_app_user
```

This demonstrates that the connection authenticated as `ghm_app_user` but executed with `ghm_db_user` as its effective current role.

### Role attributes observed

```
ghm_actor_gateway: LOGIN, NOSUPERUSER, NOINHERIT, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS
ghm_app_user:      LOGIN, NOSUPERUSER, INHERIT, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS
ghm_db_user:       LOGIN, NOSUPERUSER, INHERIT, CREATEDB, CREATEROLE, NOREPLICATION, NOBYPASSRLS
ghm_migrator:      LOGIN, NOSUPERUSER, NOINHERIT, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS
ghm_payment_provider: LOGIN, NOSUPERUSER, NOINHERIT, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS
ghm_runtime:       LOGIN, NOSUPERUSER, NOINHERIT, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS
ghm_schema_owner:  NOLOGIN, NOSUPERUSER, NOINHERIT, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS
```

### Relevant memberships observed

The read-only membership inspection showed:

- `ghm_db_user` is a member of `ghm_actor_gateway` with `ADMIN OPTION=true`, `INHERIT=false`, `SET=false`, grantor `postgres`.
- `ghm_db_user` has ADMIN OPTION memberships over other protected roles, including `ghm_migrator`, `ghm_payment_provider`, `ghm_runtime`, and `ghm_schema_owner`.
- `ghm_app_user` has a role-level setting that forces `role=ghm_db_user`.
- `ghm_app_user` also had membership and SET access to `ghm_runtime`; however, the role setting makes the effective identity `ghm_db_user`.

A membership check for `ghm_actor_gateway` reported `MEMBER=true`, `USAGE=false`, and `SET=false` for `ghm_db_user` at the time of inspection. This is important: **we did not prove that the current connection could already SET ROLE ghm_actor_gateway.** The concern is that the administrative membership/CREATEROLE relationship can potentially alter the boundary; the current false SET/INHERIT flags should not be misreported as proof of a successful escalation.

The relevant role setting observed was:

```
role_name=ghm_app_user
database_name=ALL DATABASES
setting=role=ghm_db_user
```

The membership inspection also showed default PostgreSQL system memberships such as `pg_read_all_stats` and `pg_signal_backend` for managed roles.

## Agreed target role separation

This is the target architecture to qualify. It is not a statement that the transition has already happened.

| Role | Intended purpose | Constraint |
|---|---|---|
| Render Dashboard-managed default administrator | Controlled database administration and recovery | Must not be used by normal application execution |
| `ghm_app_user` (SQL-created replacement) | Application login | Created directly in SQL; only intended runtime permissions |
| `ghm_runtime` | Restricted runtime privilege role | No role administration or migration ownership |
| `ghm_migrator` | Controlled migration execution | Separate from application runtime |
| `ghm_actor_gateway` | Protected actor identity/security boundary | Not administrable through normal runtime |
| `ghm_schema_owner` | Schema/object ownership boundary | No login; controlled owner role |
| `ghm_payment_provider` | Payment-provider-specific role | PayFast work remains paused; do not activate or change payment paths as part of this task |

Do not assume the SQL-created login must use exactly the name `ghm_app_user` until we have confirmed all connection consumers and the old Dashboard-managed role's removal/rotation sequence. Amanda gave that name as an example, not a mandatory name.

## Safe implementation plan — qualification gates

### Gate 1 — inventory all consumers (read-only)

Inspect GHM repository configuration and service environment-variable names (never expose or copy secret values) to identify every connection path using:

- Render Dashboard internal/external connection strings;
- `DATABASE_URL` and any split PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD settings;
- authentication issuer;
- resource API;
- Actor Gateway;
- migrator and deployment/migration scripts;
- qualification/test utilities;
- any other Render service connecting to `ghm_db`.

Identify which consumers need runtime, migrator, provider or administrative access. Do not assume one login can safely serve all consumers.

### Gate 2 — exact privilege and ownership audit (read-only)

Record:
- role memberships with `ADMIN`, `SET`, and `INHERIT` options;
- role attributes and role/database settings;
- schema, table, sequence, function and procedure privileges;
- object ownership and default privileges;
- SECURITY DEFINER function ownership and execution grants;
- connection-pool behaviour and any explicit `SET ROLE` calls;
- migration execution assumptions.

Do not make production changes during this gate.

### Gate 3 — design SQL-created login(s)

Prepare exact SQL for a new restricted application login created directly in PostgreSQL. Validate:
- no CREATEROLE, CREATEDB, REPLICATION, BYPASSRLS, or superuser;
- no ADMIN OPTION over protected roles;
- no ability to SET ROLE into administrator, migrator, schema-owner, or Actor Gateway identities;
- only intended `ghm_runtime` permissions;
- exact LOGIN/INHERIT/NOINHERIT choice justified by the actual runtime grant model;
- password generation and secure environment-variable handling;
- no secret values in Git, handover docs, shell history, logs or chat.

Do not copy Amanda's example SQL verbatim into production. It is an illustration and must be adjusted to the verified role graph.

### Gate 4 — qualify administrator rotation/replacement

Follow the current Render credential-rotation procedure and Amanda's guidance. Before removing the current Dashboard-managed `ghm_app_user`:
- confirm a replacement Render-managed default administrator exists;
- verify its connection independently;
- verify required administration/recovery capabilities;
- record the exact rollback/recovery route;
- understand the effect of deleting the old Dashboard-managed default user;
- verify that SQL-created users are not displayed/managed by Render and that the connecting service must own the credentials.

Do not assume the previous default administrator can be restored by simply changing a Dashboard selector. Amanda explicitly said the current default cannot be rolled back to the previous default user.

### Gate 5 — staged application cutover

Only after Gates 1–4 pass:
- create the SQL login(s);
- store credentials as environment variables on the appropriate service(s);
- change one controlled connection path at a time;
- verify `session_user`, `current_user`, `pg_has_role`, effective privileges and application behaviour;
- verify health, auth, resource API, Actor Gateway, and migrations independently;
- retain the separate administrator connection for controlled operations;
- do not combine this with unrelated security, payment, or product changes.

### Gate 6 — Actor Gateway boundary requalification

After runtime cutover, prove that the SQL-created runtime identity cannot:
- create, alter, drop or grant roles;
- grant itself membership in `ghm_actor_gateway`;
- assume `ghm_actor_gateway` or `ghm_schema_owner`;
- bypass signed actor assertions or replay protections;
- call privileged functions outside their intended grant boundary.

Also verify that only the intended controlled principal(s) can manage the gateway role and that gateway identity assertions remain cryptographically verified and replay-protected.

## Operational constraints and exclusions

- Production target remains Render `ghm-db` / `ghm_db` / GHM Internal Runtime.
- PostgreSQL version observed: 18.
- Render region observed: Frankfurt.
- `DATABASE_SSL=true` is part of the current production runtime configuration context.
- Do not revive the expired/suspended sandbox database.
- Do not create another paid database, pgAdmin service, Render service, or sandbox runtime.
- PayFast sandbox remains unavailable and PayFast work/payment activation remains paused. Do not bring PayFast into this credential transition except to inventory whether any service consumes the database and ensure no unintended breakage.
- No deployment or automatic deploy setting changes are authorized by this handover.
- The user requires handover updates as work progresses.
- No independent security reviewer framing; this is the user and assistant's qualification workflow.

## Current status

| Item | Status |
|---|---|
| Original reason for `ghm_actor_gateway` membership investigation recorded | COMPLETE |
| Render explanation of PostgreSQL 16+ automatic membership recorded | COMPLETE |
| Render confirmation of SQL-created application login approach | CONFIRMED |
| Production role/membership/role-setting inspection | READ-ONLY EVIDENCE RECORDED |
| Current Dashboard-managed `ghm_app_user` still present | NOT CHANGED |
| Replacement Render-managed administrator created | NOT STARTED |
| SQL-created replacement application login created | NOT STARTED |
| Service environment variables changed | NOT STARTED |
| Production credential rotation/deletion | NOT STARTED |
| Actor Gateway boundary requalification after cutover | NOT STARTED |
| Production migration/deploy | NOT STARTED |

## Continuation instructions

On the next session:

1. Read this handover before doing anything else.
2. Inspect the latest repository mainline and relevant open security work; do not assume the historical branch/HEAD from an earlier chat is current.
3. Inspect the actual current security handover(s) in the repository and reconcile this new support record with them. This document supplements, and does not replace, the main security qualification handover.
4. Start with Gate 1, a read-only inventory of all connection consumers and their required identities.
5. Do not rotate credentials, delete Dashboard users, execute privilege-changing SQL, alter Render environment variables, deploy, or change production until the design and rollback gates are documented and verified.
6. Keep the original Actor Gateway objective visible throughout: the normal runtime must not be able to administer or undermine the Actor Gateway security boundary.

**Handover note:** The support conversation is closed with a confirmed recommendation. The engineering implementation is still open and must be qualified before production changes.

## Implementation decision refinement — retain the current Dashboard administrator

After reconciling Amanda's guidance with the active GHM runtime principal contract, the preferred transition is simpler than the conditional credential-rotation option described in her numbered response.

**Keep the existing Render Dashboard-managed default credential as the controlled database administrator.** Amanda explicitly recommended leaving the default user listed in the Dashboard for administration and creating other service logins directly in PostgreSQL.

GHM already has the SQL-created `ghm_runtime` LOGIN principal. The active Resource API production configuration requires `GHM_RUNTIME_DATABASE_URL`, and its startup verifier requires `session_user=current_user=ghm_runtime` with no role memberships. The Resource API should use that existing SQL-created `ghm_runtime` login directly, not the Dashboard-managed default credential.

Therefore, do not rotate/delete the current Dashboard-managed `ghm_app_user` merely to complete this separation. Do not create a replacement Dashboard administrator or a new `ghm_app_user IN ROLE ghm_runtime` login as a prerequisite. Amanda's numbered point 2 describes the optional path if we choose to remove the current Dashboard-managed default user; it is not required when that user is retained for administration.

Using `ghm_runtime` directly also matches the existing strict startup identity verifier. A separate login such as `ghm_app_user` that is a member of `ghm_runtime` would not match `session_user=current_user=ghm_runtime` and zero-membership requirements without a deliberate architecture change.

### Revised credential transition

1. Keep the current Dashboard-managed default user and its administrative role-setting behaviour for controlled administration only.
2. Verify the existing SQL-created `ghm_runtime` role's live role attributes, memberships, schema/object/function privileges and ownership dependencies using read-only production catalog queries.
3. Establish or rotate the `ghm_runtime` password only through an approved controlled administrator session, without exposing it in chat, Git, logs or handover documents.
4. Supply the `ghm_runtime` connection string as `GHM_RUNTIME_DATABASE_URL` to the Resource API service only, preserving host/port/database and verified SSL/network settings.
5. Verify the actual service connection reports `session_user=current_user=ghm_runtime` and passes startup least-privilege checks before any production traffic cutover.
6. Keep separate credentials for Auth Issuer, Actor Gateway, Migrator and Payment Provider. Do not put their URLs/secrets into the Resource API environment.

This refinement supersedes the earlier suggestion to create a replacement Dashboard administrator and delete the existing Dashboard-managed user as a prerequisite. The optional rotation path remains available only if a future requirement specifically calls for removing the current Dashboard-managed user.

No production credential, role, environment variable, service, migration or deployment was changed by this design refinement.
## Production catalog reconciliation — what the administrator membership means

A fresh read-only production query reconfirmed that the Render-managed connection authenticates as `ghm_app_user` but executes as `ghm_db_user`. The latter has CREATEROLE/CREATEDB and ADMIN OPTION memberships in `ghm_actor_gateway`, `ghm_runtime`, `ghm_migrator`, `ghm_payment_provider` and `ghm_schema_owner`. The current `ghm_actor_gateway` membership has SET=false and INHERIT=false. `ghm_runtime` cannot SET ROLE `ghm_actor_gateway`; `ghm_db_user` can SET ROLE `ghm_runtime`.

The correct trust model is therefore not to pretend the administrator membership can be removed from every SQL-created service role. Keep the Render administrator as a trusted administrator, keep service logins themselves out of other roles, and reject any service-role member other than the trusted administrator. The service identity verifier must not reject the expected administrator-as-member relationship.

The active GHM construction branch now applies this `no_untrusted_role_memberships` rule to Resource API runtime, Actor Gateway and Authentication Issuer. The service login cannot be a member of any other role; only `ghm_db_user` may be a member of the service login role. The Authentication Issuer manual cutover uses the same guard. Migrator/schema-owner membership is separately constrained to the expected `ghm_migrator` SET-only owner path and trusted administrator membership.

The production role catalog currently does not contain `ghm_auth_issuer`; the separate issuer service is not yet deployed. The current Render service inventory has `ghm-internal-runtime` as the only production GHM web service; no separate production Actor Gateway or Authentication Issuer service exists yet.

This confirms the original security objective: normal Resource API execution must use the existing SQL-created `ghm_runtime` login, not the Dashboard-managed `ghm_app_user`/effective `ghm_db_user` connection. The administrator's membership is an administrative trust relationship, not a reason to expose that administrator connection to application code.

## 2026-11-15 continuation — migrator connection timeout and support guidance reaffirmed

The Resource API runtime credential has been independently verified from the operator's machine: `ghm_db`, authenticated as `ghm_runtime`. A separate hidden-input local test of `GHM_MIGRATOR_DATABASE_URL` timed out before PostgreSQL authentication or SQL execution (`timeout expired`, error code unavailable). It did not reach the identity assertion, `SET LOCAL ROLE ghm_schema_owner`, or ledger SELECT. This is not evidence of a bad password or broken role membership. The local URL/endpoint/network path still needs non-secret diagnostics.

The existing design refinement remains authoritative and consistent with Amanda's final Render support confirmation:
- Retain the Render Dashboard-managed default user for controlled administration.
- Use SQL-created `ghm_runtime` directly for Resource API execution; this is now credential-verified.
- Keep `ghm_migrator` as a separate SQL-created identity, used only by controlled migration tooling.
- Do not re-add the migrator URL to the Resource API environment.
- Preserve `ghm_migrator`'s SET-only path to `ghm_schema_owner`; the intended ledger read is read-only transaction + `SET LOCAL ROLE ghm_schema_owner` + SELECT.
- Do not rotate/delete the Dashboard administrator, create a new app login, or copy Amanda's illustrative SQL as a shortcut.

A production archive ledger extract inspected on 2026-11-14 contains 105 migration rows through `20261109210000` (`deactivate_unrecognized_public_directory_records`, applied 2026-11-09 20:50:23.763528+00). Treat this as a backup snapshot/reconciliation baseline, not as a live ledger query.

No production database or Render changes were made during the timeout test. Continue with local non-secret URL metadata and DNS/TCP diagnostics before retrying the controlled migrator connection.


## 2026-11-14 continuation — SQL-created service login connectivity confirmed

The production migrator endpoint has now passed both non-secret route diagnostics and a hidden-input PostgreSQL identity-only connection test.

- Runtime and migrator URLs resolve to the same intended production Render PostgreSQL host, port 5432 and database `ghm_db`; DNS and TCP checks passed for both.
- The migrator authenticated successfully with `session_user = current_user = ghm_migrator`.
- The query returned only `current_database()`, `session_user` and `current_user`.

This confirms the local migrator credential can authenticate to the intended production database. It does not yet qualify the SET-only membership to `ghm_schema_owner` or the ledger read path. The next step is a read-only transaction with `SET LOCAL ROLE ghm_schema_owner`, identity confirmation, and a bounded SELECT from `ghm.ghm_schema_migrations`, followed by ROLLBACK.

The earlier connection-timeout observation is superseded by this successful identity test. No role membership, grants, data, Render environment variables, deployment settings or services were changed.


## 2026-11-14 continuation — live migrator schema-owner path verified

The hidden-input production test has now verified the complete intended read-only migration-ledger access path:

- Initial connection: `ghm_db`, `session_user = current_user = ghm_migrator`.
- Transaction mode: `READ ONLY`.
- `SET LOCAL ROLE ghm_schema_owner`: SUCCESS.
- Post-switch identity: `session_user = ghm_migrator`, `current_user = ghm_schema_owner`.
- Ledger relation `ghm.ghm_schema_migrations`: SELECT SUCCESS.
- Explicit transaction `ROLLBACK`: SUCCESS.

The live ledger contains 105 rows, from `00000000000000` through `20261109210000`; latest applied timestamp is `2026-11-09 20:50:23.763Z`. This matches the previously inspected archive snapshot's key ledger boundaries.

This verifies the migrator's intended SET-only membership and read path without granting direct ledger SELECT to the Render query principal or widening any privileges. No production role, membership, grant, data, environment variable, service or deployment was changed.

Next work belongs to migration reconciliation: compare the live 105-row ledger against the current repository migration inventory and approved retained/manual-cutover register. Keep the live-ledger evidence distinct from the archive snapshot.


## 2026-11-14 continuation — production migration audit and pending allowlist

The live production forensic audit completed using `ghm_migrator` on `ghm_db` within a read-only transaction. It successfully switched to `ghm_schema_owner` for the ledger read while retaining `session_user=ghm_migrator`, then rolled back. Authority checks passed; no production permissions, roles, data, Render configuration or deployments were changed.

The repository had 102 migration files and production had 105 ledger rows. Reconciliation found 24 canonical matches, 62 supported CRLF matches and 9 approved historical matches. Ten extra ledger entries all matched the retained-history register. There were zero unexplained checksum mismatches, zero name mismatches, zero unrecognized extras, zero orphaned exceptions and zero invalid retained-history entries. Seven historical exceptions were redundant because their hashes match current repository bytes; they remain preserved as provenance for now.

The seven repository migrations absent from the live production ledger are:
- `20261110100000_create_account_onboarding_progress.sql`
- `20261110120000_create_business_relationship_outcome_read_models.sql`
- `20261110140000_allow_pending_storage_object_cleanup.sql`
- `20261110210000_add_actor_gateway_principal_guard.sql`
- `20261110220000_add_actor_gateway_self_identity_read.sql`
- `20261110230000_add_gateway_business_registration_identity_read.sql`
- `20261110233000_add_gateway_business_registration_identity_write.sql`

The initial audit verdict was `INVESTIGATE` only because the production pending allowlist still named `20261109210000 deactivate_unrecognized_public_directory_records`, already present in the live ledger, rather than these seven absent migrations. The allowlist was corrected on main in commit `0c65eb1fcce287d82f895a234193691ef114943a` to list exactly the seven observed absent version/name pairs. This is an audit-config correction only: none of the seven migrations was applied, and the correction is not authorization to apply them.

The audit must be rerun read-only against the updated mainline before a final verdict is recorded. Until then, migration audit status is **pending final rerun**. Preserve the established separation: Resource API uses `ghm_runtime`; migrator remains a separate controlled identity; no deployment or production privilege change is part of this step. Following a clean rerun, continue with production-only Project↔Opportunity reconciliation. PayFast remains paused.


## 2026-11-14 — final live production migration reconciliation: PASS_WITH_PENDING

The corrected production pending allowlist was fetched into `C:\\GHM-main` by fast-forward. The local recovery backup `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak` remains present and untouched.

The live production forensic audit was rerun against `ghm_db` with `ghm_migrator`. Authority checks passed; the read-only transaction switched to `ghm_schema_owner` for the ledger read while retaining `session_user=ghm_migrator`, and the audit rolled back. Result: **`PASS_WITH_PENDING`**, exit code **0**.

Production inventory: 102 repository migration files, 105 live ledger rows, 24 canonical matches, 62 supported CRLF matches, 9 approved historical matches, and exactly 7 pending migrations. The corrected allowlist matched exactly (0 mismatch). There were 0 unexplained checksum mismatches, 0 name mismatches, 10 approved retained-history extras, 0 unrecognized extras, 0 orphaned exceptions and 0 invalid retained-history entries. Seven redundant historical exception hashes remain preserved as provenance; no cleanup was performed.

The seven pending versions are `20261110100000`, `20261110120000`, `20261110140000`, `20261110210000`, `20261110220000`, `20261110230000`, and `20261110233000`. Their migration names and exact filenames are recorded in the full migration/security handover. None was applied by this audit or authorized for execution.

No production schema/data, ledger, grants, roles, memberships, Render configuration or deployments were changed. Keep the Resource API on `ghm_runtime`, retain separate controlled migrator identity, keep Render auto-deploy OFF, and keep PayFast paused. The next gate is production-only Project↔Opportunity reconciliation, performed read-only before any migration execution or deployment decision.

Status: **PRODUCTION MIGRATION RECONCILIATION PASS_WITH_PENDING; SEVEN EXPLICIT PENDING MIGRATIONS; NO PRODUCTION CHANGES.**


## 2026-11-14 — production Project↔Opportunity reconciliation (read-only)

The production-only reconciliation ran against Render `ghm-db` / `ghm_db` with a read-only query connection identified as `session_user=ghm_app_user`, `current_user=ghm_db_user`, `row_security=on`. The relevant Project and Opportunity tables have RLS disabled and no row policies. Counts were: `ghm.project=0`, `ghm.opportunity=0`, `ghm.project_quote=0`, while `ghm.account_identity=22`. Thus the database is not empty and the zero Project/Opportunity counts are not attributable to RLS filtering.

The active canonical Opportunity type is `code='project'`, `id=11`. The `project.opportunity_id` column exists. The `project_opportunity_fk` constraint is validated and references `ghm.opportunity(id)` with `ON DELETE RESTRICT`; the partial unique index `project_opportunity_unique` is unique, valid and ready. No live rows exist to test creator/account, opportunity-type, title, description, budget or atomic creation correspondence. All row-level mismatch diagnostics returned zero because there are no Project rows; do not represent those as sample-level validation.

The Render query principal was denied SELECT on `ghm.ghm_schema_migrations`, preserving the separate migration-ledger authority boundary. No grants were changed; the live ledger audit was already performed through `ghm_migrator` and `ghm_schema_owner` in a read-only transaction.

Conclusion: **NO PRODUCTION PROJECT OR OPPORTUNITY ROWS TO RECONCILE; STRUCTURAL LINK IS PRESENT AND VALID; LIVE-ROW ATOMICITY REMAINS UNEXERCISED.** No production data, schema, ledger, roles, grants, memberships, Render settings or deployments were changed. The seven allowlisted migrations remain pending and unapplied; Render auto-deploy stays OFF; PayFast stays paused.

Next gate is a read-only, migration-by-migration review of dependencies, current production object state, privilege requirements, lock/transaction behavior, idempotency and rollback/forward recovery. This data reconciliation is not authorization to apply migrations or deploy.


## 2026-11-15 — seven pending migration production preflight

A read-only catalog review was completed against Render `ghm-db` / `ghm_db`. No production writes or DDL were performed.

- Onboarding migration `20261110100000`: account FK target exists; destination table absent. Account-scoped repository and runtime DML grants are present in source. Schema-ready, unapplied.
- Relationship/outcome migration `20261110120000`: business, opportunity and account FK targets exist; all four destination tables absent. Seed rows are deterministic and runtime grants are SELECT-only. Schema-ready, unapplied.
- Storage cleanup migration `20261110140000`: **blocked**. Production CHECK constraint requires `available_at IS NOT NULL` for `deletion_pending`, while pending rows have NULL. Proposed function transitions pending rows without setting `available_at`; that path would fail the CHECK. Do not apply as written. Correct lifecycle semantics and tests first.
- Actor gateway guard `20261110210000`: gateway role and trusted Render administrator membership match the migration's required guard at audit time. Assertion function absent. Recheck role state immediately before any future execution.
- Gateway self-identity read `20261110220000`: depends on guard; function absent.
- Gateway registration read `20261110230000`: underlying schema-owner-owned SECURITY DEFINER read function exists and is runtime-executable; gateway wrapper absent.
- Gateway registration write `20261110233000`: underlying schema-owner-owned SECURITY DEFINER write function exists and is runtime-executable; gateway wrapper absent. Migration replaces ambiguous `ON CONFLICT (business_id)` with the named PK constraint and preserves the legacy runtime grant pending cutover.

The production runtime has no direct table privileges on `storage_object` or `business_registration_identity`; current lifecycle/registration access is through SECURITY DEFINER functions. The four service roles retain NOINHERIT/non-elevated attributes, schema owner is NOLOGIN, and trusted administrator membership was not altered.

Render service inventory shows `ghm-internal-runtime` tracks main with auto-deploy OFF. No dedicated production Actor Gateway service was present in the inventory. Actor Gateway code requires a separate `GHM_ACTOR_GATEWAY_DATABASE_URL`, ES256 public verification keys, TLS, and checks its actual session/current_user. Resource API gateway routing is optional and only activates with `GHM_ACTOR_GATEWAY_URL`; do not set it or revoke legacy runtime function grants before gateway deployment and cutover qualification.

The seven-entry production pending allowlist remains intact. Recommended sequencing: fix and test the storage transition; exact-head CI and disposable PostgreSQL full-chain qualification; repeat live read-only preflight; establish and verify gateway service before any gateway cutover; then separately review a controlled migration execution plan. No migration or deployment authorization is implied.

Status: **READ-ONLY REVIEW COMPLETE; STORAGE MIGRATION BLOCKED; REMAINING MIGRATIONS HAVE IDENTIFIED PREREQUISITES; NONE APPLIED.**


## 2026-11-15 — storage lifecycle blocker corrected in PR #279

The pending storage cleanup migration had a confirmed CHECK-constraint defect: `pending` uploads have NULL `available_at`, while the previous `deletion_pending` lifecycle branch required it to be non-NULL. PR #279 updates the lifecycle constraint to permit either existing timestamp state while requiring `deleted_at IS NULL`; the transition function updates only `status`, preserving timestamps. Its contract test checks both the constraint and timestamp-preserving UPDATE.

PR: https://github.com/zaidhqdev-sys/GHM/pull/279
Branch: `fix/storage-pending-deletion-lifecycle`
CI run `43650628452` was in progress when recorded; no passing result is claimed.

No production migration, role, grant, data, environment, or deployment was changed. The gateway deployment boundary and the other pending-migration gates remain as previously documented. The storage correction must pass exact-head CI and disposable full-chain migration qualification before production use.


## 2026-11-15 — PR #279 CI failure isolated to stale pending-migration policy assertions

Exact-head CI run `43650672189` completed with failure in the `Migration audit policy tests` step. The build, full disposable PostgreSQL migration chain, isolated actor-gateway qualification, Business registration forward-migration qualification, storage getter qualification, Opportunity marketplace SQL, storage lifecycle/tenant authorization qualification, full application test suite, Business Capability lifecycle qualification, commercial payment settlement identity qualification, and web-quality job all passed.

The failure was not in the storage lifecycle correction. Two duplicated tests in `scripts/migration-audit-checksum.test.mjs` still asserted that the production pending manifest had exactly one entry (`20261109210000`). That assertion predated the reviewed production audit, which confirmed seven exact pending repository migrations and zero unexplained mismatches. The current seven-entry allowlist is deliberate and matches the live production ledger; it must not be collapsed back to the stale one-entry expectation.

Corrected both duplicate test assertions to deep-compare the exact seven reviewed pending versions/names:
- `20261110100000 create_account_onboarding_progress`
- `20261110120000 create_business_relationship_outcome_read_models`
- `20261110140000 allow_pending_storage_object_cleanup`
- `20261110210000 add_actor_gateway_principal_guard`
- `20261110220000 add_actor_gateway_self_identity_read`
- `20261110230000 add_gateway_business_registration_identity_read`
- `20261110233000 add_gateway_business_registration_identity_write`

Fix committed on the PR branch as `7bf6afddf803a78f2e90e50a532d028dd657253e`. This is test-policy alignment only; no migration SQL, production allowlist, production data, role, grant, Render environment, or deployment was changed. A fresh exact-head CI run is required before merge or production action.


## 2026-11-15 — PR #279 storage pending-deletion lifecycle fix merged after exact-head CI

PR #279, `fix(storage): preserve pending upload lifecycle during deletion cleanup`, passed the complete exact-head CI run and was squash-merged.

- Reviewed PR head: `72f7ba7d3561614590d8f9a9a0bc29583fd27fea`.
- Exact-head CI run: `43650900241` — conclusion `success`.
- `quality`: passed, including build, disposable PostgreSQL full migration chain, isolated actor-gateway principal, Business registration forward migration, storage getter, Opportunity marketplace SQL, storage lifecycle/tenant authorization, full test suite, Business Capability lifecycle/two-session assertion replacement, commercial payment settlement identities, migration audit policy tests, and runtime boundary verification.
- `web-quality`: passed, including web build/tests, dependency audit, and toolchain verification.
- Earlier stale pending-migration policy assertions were corrected to pin the seven reviewed production pending migrations; the correction is included in the final tested head.
- Squash merge commit: `20a873af736ea19554021414f65d37cb68a02b64`.

This merge changes repository code only. No production migration was applied, no production data/roles/grants were changed, and no Render deployment was initiated. Render `ghm-internal-runtime` auto-deploy remains OFF. The seven production-pending migrations remain an explicit deployment gate and are not represented as applied. Preserve the existing local recovery backup `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak`; it was not modified or removed.

Next gates remain: production-only Project↔Opportunity reconciliation, review/qualification of the seven pending migrations against the live production schema and dependencies, and the remaining production role/security and runtime readiness checks before any deliberate migration or deployment.


## 2026-11-15 — requalification of pending storage deletion migration after PR #279

After PR #279 merged, re-read `database/migrations/20261110140000_allow_pending_storage_object_cleanup.sql` from main and compared it with the live production definition using Render's read-only Postgres query path.

### Repository correction verified
The merged migration now:
- adjusts `storage_object_lifecycle_check` so `deletion_pending` permits either NULL or non-NULL `available_at`, while still requiring `deleted_at IS NULL`;
- preserves `available_at` during the transition;
- changes `storage_mark_deletion_pending(bigint)` to accept both `pending` and `available` source states;
- retains SECURITY DEFINER, pinned `pg_catalog, ghm` search_path, owner `ghm_schema_owner`, and EXECUTE grant only to `ghm_runtime` (PUBLIC and `ghm_migrator` revoked).

The exact-head PR #279 disposable PostgreSQL storage lifecycle/tenant authorization qualification passed, along with the full migration chain and full test suite.

### Live production comparison
The live `ghm.storage_object_lifecycle_check` is still the older definition: `deletion_pending` requires `available_at IS NOT NULL`. The live `ghm.storage_mark_deletion_pending(bigint)` still updates only rows with `status='available'` and raises the old “not available” error. Therefore migration `20261110140000` is still unapplied in production and the live behavior has not changed.

The read-only Render query principal was denied SELECT on `ghm.storage_object` when attempting a status/count distribution. This is an expected privilege boundary; no grant was widened and no alternate elevated query path was used. No production object rows were read or changed by that failed query.

### Disposition
The original pending-upload CHECK-constraint defect is corrected in repository SQL and passed disposable qualification. Reclassify migration `20261110140000` from **BLOCKED AS WRITTEN** to **REMEDIATED IN SOURCE; PRODUCTION APPLICATION STILL PENDING**. This is not production approval or authorization to apply it. Recheck its preconditions and execution order at the controlled migration gate. No production migration, schema, data, role, grant, Render environment or deployment was changed in this review.


## 2026-11-15 — production actor-gateway prerequisite recheck and Render service inventory

A fresh read-only catalog query against Render `ghm-db` / `ghm_db` confirmed:
- `ghm.assert_actor_gateway(bigint)` is absent.
- `ghm.gateway_get_actor_identity(bigint)` is absent.
- `ghm.gateway_read_business_registration_identity(bigint,bigint)` is absent.
- `ghm.gateway_update_business_registration_identity(bigint,bigint,text,text,text)` is absent.
- Existing underlying `ghm.read_business_registration_identity(bigint,bigint)` and `ghm.update_business_registration_identity(bigint,bigint,text,text,text)` are present.

This is consistent with all four gateway migrations remaining unapplied; it is not a partial application. The migration dependency order remains #4 principal guard, then #5 self-identity read, then #6 registration read and #7 registration write wrappers. No production function, grant, or role was changed.

A fresh Render workspace service inventory returned five web services. The only production GHM API is `ghm-internal-runtime` (main, auto-deploy OFF). Other GHM services are the legacy PayFast sandbox runtime/callback and the identity qualification service on the historical integration branch; these are not production Actor Gateway targets. No dedicated production Actor Gateway service exists in the current inventory. The separate `zaid-ai-workforce` service belongs to another repository and is not a GHM gateway target.

No service was created, repurposed, or deployed. Given the standing no-new-paid-service constraint, do not create a dedicated Render service or repurpose sandbox services as a workaround. The gateway service/credential isolation and HTTP cutover therefore remain an explicit architecture/resource blocker; do not apply the gateway-dependent migrations or configure `GHM_ACTOR_GATEWAY_URL` until a no-cost, security-equivalent hosting arrangement is established and separately qualified. Keep the legacy Resource API path unchanged in the meantime.


## 2026-11-15 — read-only production preflight of onboarding and relationship/outcome migrations

Reviewed the exact main-branch SQL for pending migrations `20261110100000` and `20261110120000`, then checked their prerequisites against the live `ghm_db` catalog through Render's read-only query path.

### `20261110100000_create_account_onboarding_progress.sql`
- Target table `ghm.account_onboarding_progress` is absent, so the migration will not collide with an existing table.
- Referenced `ghm.account_identity(id)` exists with its primary key.
- `ghm_schema_owner` exists as the non-login schema owner; `ghm_runtime` and `ghm_migrator` are distinct NOINHERIT logins.
- The reviewed SQL assigns table ownership to `ghm_schema_owner`, grants runtime SELECT/INSERT/UPDATE and sequence USAGE/SELECT, and withholds DELETE/TRUNCATE/REFERENCES/TRIGGER from runtime.
- The table's unique identity, journey/step/status/lifecycle/time checks and account/journey index are present in the reviewed source.
- No conflicting table, sequence, or existing onboarding rows were found because the target table is absent.

### `20261110120000_create_business_relationship_outcome_read_models.sql`
- All four target tables (`relationship_type`, `business_relationship`, `outcome_type`, `outcome`) are absent.
- Referenced production tables `business`, `opportunity`, and `account_identity` exist; their referenced IDs are primary keys. Existing Opportunity foreign keys also confirm the production schema's established Business/account identity references.
- The SQL creates the relationship/outcome type catalogs, business relationship and outcome records, indexes and restrictive foreign-key relationships. Its two seed inserts are bounded by unique `(code, version)` constraints and `ON CONFLICT DO NOTHING`.
- Ownership is assigned to `ghm_schema_owner`; runtime receives SELECT only and no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER.
- No target table or seed data exists yet; this is a first application, not a repair or backfill.

### Result and gate
Both migrations have **catalog-level preconditions satisfied** and no name collision detected. This is a read-only structural preflight, not a full migration execution simulation against production data, and not authorization to apply either migration. The migrations remain in the seven-entry production pending allowlist. Apply only at the later controlled migration window after full dependency ordering and the remaining pending-migration review are complete. No production data, schema, roles, grants, or deployment changed in this check.


## 2026-11-15 — production Project↔Opportunity reconciliation completed (read-only)

Completed the required production-only reconciliation against Render `ghm-db` / `ghm_db`. The query used aggregate counts and joins only; no Project or Opportunity row contents were returned or modified.

### Live production results
- Total `ghm.project` rows: **0**.
- Projects without an Opportunity link: **0**.
- Invalid links (missing Opportunity or non-`project` Opportunity type): **0**.
- Project/Opportunity creator-account mismatches: **0**.
- Total Opportunities with active `project` type: **0**.
- Project-type Opportunities without a Project: **0**.
- Projects with active creator participant: **0**.
- Projects missing the expected active creator participant: **0**.
- Active `project` Opportunity type definitions: **1** (one total, active).
- Existing `project_opportunity_fk` restrictive foreign key: **present**.
- Existing partial unique `project_opportunity_unique` index: **present**.

This is a clean zero-row production baseline: there are no historical Project or project-type Opportunity records requiring a backfill, repair, deduplication, or ownership reconciliation. The canonical creation path in current main creates the project-type Opportunity, creator participant, and Project with its `opportunity_id` inside one authorized transaction; if any insert fails, the transaction rolls back. The current Project repository source and the migration contract test both enforce this relation.

### Actor Gateway principal migration prerequisite recheck
A separate read-only catalog check confirmed `ghm_actor_gateway` exists as LOGIN NOINHERIT, with SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS all false. It has no role memberships. Its only incoming membership is from trusted `ghm_db_user` with ADMIN OPTION true, INHERIT false, SET false. The `ghm_schema_owner` non-login role exists; `ghm_migrator` has SET-only membership in it. This satisfies the principal/membership predicate in pending migration `20261110210000`. Existing legacy registration read/write and storage deletion functions remain SECURITY DEFINER, owned by `ghm_schema_owner`, pinned to `pg_catalog, ghm`, executable by `ghm_runtime`, and not executable by PUBLIC. The gateway role has no execute privilege on those legacy functions.

### Disposition
Production Project↔Opportunity reconciliation is **PASS — zero-row baseline; no backfill required**. The link constraint and unique index are already live. This closes the previously outstanding production-only data reconciliation gate.

This does not authorize applying the seven pending migrations or switching runtime traffic to Actor Gateway. The gateway service/HTTP cutover hosting blocker remains. No production data, schema, role, grant, environment variable, or deployment was changed by these checks.


## 2026-11-15 — Actor Gateway deployment and issuer readiness inventory

### Render inventory (live account query)
- The only GHM service tracking `main` is `ghm-internal-runtime` (`srv-damupsek1f9s73eq8kkg`), Frankfurt, Node web service, health check `/healthz`, auto-deploy OFF. Its last recorded successful deploy remains 2026-11-10.
- No dedicated Actor Gateway service exists in the live Render service inventory.
- `ghm-identity-qualification` (`srv-dbahvenbtjjs73f83rlg`) is a free web service tracking `integration/ghm-identity-merge-candidate-20261018`, with auto-deploy enabled on passing checks. It is not a production gateway service and was not repurposed or modified.
- The remaining listed GHM services are legacy PayFast sandbox services; they remain out of scope while PayFast sandbox access is unavailable.
- No new Render service, plan, database, or paid resource was created. No service setting, environment variable, deploy, or restart was changed.

### Gateway code and integration status (main)
- Dedicated entry point exists: `src/actor-gateway/server.ts`; package script is `start:actor-gateway`.
- Gateway starts a separate HTTP listener, verifies its DB connection is exactly `session_user=current_user=ghm_actor_gateway`, and exposes `/healthz`, `/v1/actor/me`, and typed Business registration identity GET/PUT routes.
- Required runtime configuration: `GHM_ACTOR_GATEWAY_DATABASE_URL`, `DATABASE_SSL=true` in production, `GHM_JWT_ES256_PUBLIC_KEY_PEM`, `GHM_JWT_ES256_KID`; previous public key and KID must be supplied together when a rotation overlap is required. The gateway uses public verification keys only; it must not receive the issuer private key.
- Resource API integration currently supports `GHM_ACTOR_GATEWAY_URL` for Business registration identity GET/PUT only. The existing HTTP adapter forwards the original bearer access token. The gateway identity endpoint exists, but a resource-API client/route integration for it was not found in the current wiring.
- The gateway-specific database functions are among the seven pending production migrations. Production has not applied them; therefore a production gateway process cannot yet pass its required typed database operations.
- The ordinary resource API still contains the existing auth/session implementation and normal runtime pool. Repository search did not find a separate auth-issuer service entry point or `GHM_AUTH_ISSUER_DATABASE_URL` contract. The approved ADR's isolated issuer is therefore not yet implemented as a deployable component.

### Readiness decision
The code is a qualified isolated gateway component, but **not production deployable yet**. Two distinct service boundaries remain to be implemented/qualified: (1) the isolated authentication issuer and (2) the typed database gateway. The production migration chain, resource route coverage, service-to-service controls, public-key distribution/rotation, deployment health checks, and rollback plan must be completed before cutover.

No-cost constraint: do not create another paid Render service. Do not repurpose the legacy qualification service or combine gateway credentials/processes into the ordinary Resource API as a shortcut; either would weaken the approved isolation boundary or consume a service that is still explicitly classified as qualification/sandbox. First complete a code-only deployment/operations plan and establish whether an already-authorized no-cost isolated hosting slot exists. If none exists, retain the production cutover as blocked rather than silently adding cost.

### Actions taken
Read-only inspection of Render service inventory, current service settings/events, current main source entry points, key loader, gateway adapter/router wiring, gateway SQL migrations, and ADR. No production DB changes, grants, secrets, service settings, deployments, or restarts.


## 2026-11-15 — Authentication issuer caller and persistence boundary inventory

### Existing public authentication routes (current main)
The current `src/http/auth-router.ts` registers these routes directly on the ordinary Resource API:
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/password-recovery/request`
- `POST /api/v1/auth/password-recovery/reset`
- `POST /api/v1/auth/quoteflow-migration-reset/request`
- `POST /api/v1/auth/quoteflow-migration-reset/complete`
- Browser BFF routes: `/api/v1/auth/web/register`, `/login`, `/refresh`, and `/logout`.

These routes are registered by `src/http/app.ts` and use `PostgresAuthPersistence` on the Resource API process unless dependencies are injected. This is not an isolated issuer or reverse proxy.

### Issuer responsibilities currently mixed into Resource API
- `GhmAuthService` verifies password credentials, rehashes credentials, creates sessions, rotates opaque refresh credentials, revokes sessions, and signs ES256 access JWTs.
- `PostgresAuthPersistence` loads the refresh-token pepper and directly calls SECURITY DEFINER auth functions.
- `loadEs256Keys()` requires `GHM_JWT_ES256_PRIVATE_KEY_PEM`, public key and KID in the same process that constructs the auth service.
- Browser refresh-cookie policy, origin allow-list, rate limits, anti-enumeration response behavior and logout cookie clearing are implemented in the current auth router and must be preserved exactly during extraction.
- QuoteFlow migration-reset request/completion is coupled to the existing auth route; completion performs the atomic reset and then logs in to issue a fresh token pair. It must not be omitted from issuer compatibility planning.
- Connect's `ConnectIdentityAdapterImpl` directly uses `AuthPersistence` for external identity lookup/bootstrap. This is a non-HTTP caller that must be moved behind a narrowly authenticated issuer integration contract or retired after a caller audit; simply moving the HTTP router would leave credential/identity authority in Resource API.

### Persistence operations inventoried
The persistence adapter calls the following database functions (exact function names are in `src/auth/foundation/persistence.ts`):
- Account/credential: `auth_create_account`, `auth_set_password`, `auth_lookup_password_by_normalized_email`.
- Session/refresh: `auth_create_session_with_refresh`, `auth_validate_session`, `auth_rotate_refresh`, `auth_revoke_session`, `auth_revoke_all_sessions_for_account`, `auth_revoke_by_refresh_hash`.
- Recovery: `auth_issue_recovery`, `auth_redeem_recovery`, `auth_complete_quoteflow_migration_reset`.
- External identity: `auth_lookup_external_identity`, `auth_bootstrap_external_identity`, `auth_link_external_identity`, `auth_link_business_external_mapping`.

The adapter also performs a multi-call transaction for normal password recovery/reset: redeem recovery token, set password, and revoke all sessions. These steps must remain atomic when moved. It hashes Argon2 passwords in the service and protects opaque refresh/recovery tokens with a pepper; both password and pepper custody must move with issuer persistence.

### Critical SQL authority finding
The existing auth foundation migrations grant multiple auth SECURITY DEFINER functions to `ghm_runtime`. Examples verified in current migration source include `auth_set_password`, `auth_lookup_password_by_normalized_email`, and `auth_create_account`. Other session/recovery functions are likewise designed around caller-supplied account/session IDs. Therefore, separating the Node process alone would NOT complete the ADR boundary: ordinary Resource API's database identity currently retains auth mutation/credential function EXECUTE authority. A later additive migration must establish issuer-only grants and prove that `ghm_runtime` cannot invoke issuer-only operations, but only after all direct callers have moved and exact behavior is qualified.

### Readiness and next implementation slice
- Do not extract the router blindly: first define an issuer-owned application interface that preserves the existing native and browser contracts, recovery delivery, QuoteFlow reset and Connect external identity integration.
- Introduce an issuer-specific pool/persistence dependency that cannot fall back to the Resource API's default `DATABASE_URL`/pool. Require exact `session_user=current_user` issuer identity and least-privilege startup checks, analogous to the runtime/gateway identity guards.
- Split signing-key loading so issuer alone can load the private key; resource and gateway processes must load public verification material only. The current general `createAccessJwtService` defaults to the private-key loader and must not be imported by Resource API after extraction.
- Build disposable-PostgreSQL adversarial tests proving `ghm_runtime` cannot call issuer-only functions or mutate sessions/credentials, while issuer positive paths preserve token/session compatibility.
- No code, production database, grants, environment, deployment, or Render service changed in this inventory step.


## 2026-11-15 — Existing Authentication Issuer implementation and stacked PR reconciliation

### Correction to the preceding mainline-only inventory
The previous 2026-11-15 note correctly described what is absent from `main`, but its wording that an issuer implementation still needed to be built was incomplete. A substantial isolated Authentication Issuer implementation already exists in the unmerged construction stack. **Do not create another issuer implementation branch or repeat this work.** The distinction is:
- `main` does not yet contain the isolated issuer implementation.
- Draft PR #276 contains the issuer candidate, database principal/ACL enforcement, manual-only privilege cutover and rollback scripts, token-bound recovery reset, conditional password rehash, qualification scripts, and broad integration changes.
- PR #276 is stacked on the unified Actor Gateway integration PR #272; PR #277 adds Worker-only body-parser/startup hardening on top of #276.

### Existing branch/PR inventory verified against GitHub
| PR | Branch | Current head | State | Exact-head checks |
|---|---|---|---|---|
| #272 unified Actor Gateway integration | `integration/capability-gateway-qualification-20261110` | `c81e2bf2534febef9c5e49b39f60f85415f04ff1` | Open, draft | Quality + web-quality passed |
| #276 isolated Authentication Issuer stack | `construction/auth-issuer-stacked-on-pr272-20261113` | `aa86fa1346daf922d3c80c27f2bf5beb697bafbb` | Open, draft | Run `43611550656`: quality + web-quality passed |
| #277 Worker hardening | `security/actor-gateway-worker-body-limit-20261114` | `0ae3f3bf68e85535e0a90fcc0d2666405571ccb7` | Open, draft | Run `43630510673`: quality + web-quality passed |

PR #276's recorded qualification includes 994 passing tests, 0 failures, 8 comparator tests passing, disposable PostgreSQL 18.7 issuer lifecycle/cutover/rollback qualification, and a SECURITY DEFINER pre/post comparison of 106 routines with 14 reviewed issuer ACL changes and zero unexplained non-issuer changes. Its current head also has successful exact-head quality and web-quality checks. PR #277's exact current head has successful quality, web-quality and Cloudflare Pages checks. PR #272's current head has successful quality and web-quality checks.

The earlier dedicated branch `construction/auth-issuer-isolation-20261112` also exists; it is an earlier issuer construction line. The current stacked PR #276 is the coordinated integration candidate. Do not revive or duplicate the older branch without a specific file-level reason.

### What is already implemented in the PR #276 candidate
- Separate `src/auth-issuer/server.ts` and `src/auth-issuer/app.ts` process/application entry points.
- Dedicated `GHM_AUTH_ISSUER_DATABASE_URL` and exact `ghm_auth_issuer` login identity contract.
- Startup identity, database SSL and strict function/relation/default-ACL allow-list checks.
- Existing auth HTTP contract hosted by the issuer app, including browser auth and QuoteFlow migration-reset flows.
- Resource API auth persistence changes and Connect identity adapter changes intended to remove direct issuer persistence dependencies.
- Issuer-only manual SQL privilege cutover and rollback artifacts under `database/cutovers/` (not auto-applied migrations).
- Token-bound password recovery reset and conditional password rehash migrations.
- Disposable PostgreSQL principal, ACL, lifecycle, cutover/rollback and SECURITY DEFINER authority comparison scripts.
- Cloudflare Actor Gateway Worker adapter and its local qualification; PR #277 hardens immediate oversized-body rejection and startup retry behavior.

### Important exact-head / branch ancestry findings
Current `main` at this check is `8cbc806326d5c9180af2e7c48c7f3332743f56a3`. It has advanced materially beyond the stacked PR base:
- #272 compared with current main: diverged; 5 commits ahead, 47 behind; merge base `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b`.
- #276 compared with current main: diverged; 178 commits ahead, 47 behind; merge base is the same `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b`.
- #276 remains based on #272, and #277 remains based on #276.

The exact-head CI successes are real evidence for those candidate commits, but they do not remove the 47-commit mainline divergence. **Do not merge, rebase, retarget or cherry-pick this broad 178-commit stack blindly.** The next repository task is a controlled integration reconciliation: compare current main against #272/#276, identify which mainline commits/files have been superseded or changed, and prepare a minimal conflict-aware integration plan that preserves the qualified stack's exact tested source. Retest the resulting exact head; old CI cannot qualify a changed merge/rebase result.

### Current $0 deployment blocker — issuer hosting and Argon2id
The candidate implementation and disposable qualification do not mean the issuer can be deployed under the present cost constraint:
- The current Render inventory has no dedicated production issuer service. The existing qualification service is not to be repurposed.
- The candidate issuer is a Node process with native Argon2 dependency and a dedicated PostgreSQL login. The Cloudflare Worker prototype is for the Actor Gateway, not a ready issuer host.
- The recorded Workers-compatible `hash-wasm` implementation passed bidirectional PHC compatibility but failed the Free CPU budget at the exact existing GHM Argon2id profile (m=65,536 KiB, t=3, p=1); generation and verification measurements materially exceed 10 ms. Do not weaken the password profile or deploy that benchmark implementation.
- Therefore the isolated issuer remains **not deployable at $0** with the currently qualified hosting options. No paid Render service or Workers Paid plan is authorized.

### Production gates remain separate and open
- Production has no `ghm_auth_issuer` role/service provisioned.
- Production gateway/issuer SQL functions and the seven pending migrations are not yet applied; the production migration ledger has been read through the authorized migrator path and the separate audit result is PASS_WITH_PENDING, not permission to apply migrations.
- Production whole-database ACL/role authority, backup/restore evidence and network exposure still require the documented controlled remediation plan.
- Production service secrets, issuer private key/pepper custody, Cloudflare Hyperdrive, TLS identity, domains/routes and client routing have not been provisioned or switched.
- No production cutover SQL, migration, grants, secrets, Render settings, Cloudflare resources, DNS or traffic were changed during this reconciliation.

### Next action
Keep #272/#276/#277 as the sole existing implementation stack. Perform a source-level, file-by-file mainline reconciliation against current `main` and update the stack's handover with a minimal integration delta and remaining exact-head tests. Separately retain the issuer hosting/Argon2id no-cost NO-GO and production ACL/ledger gates. No duplicate implementation work and no production action.


## 2026-11-15 — issuer stack continuation: refreshed GitHub reconciliation

This entry supersedes the earlier divergence counts in the preceding 2026-11-15 issuer-stack note. It is based on a fresh read of the current PR records, branch search, commit comparisons, workflow runs, and this handover on 2026-11-15. No source branch, PR, production database, Render setting, credential, deployment, Cloudflare resource, DNS record, or traffic route was changed during this check.

### Current branch ancestry and divergence

The stack's common base is still `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b`. Current `main` is exactly 50 commits ahead of that base. GitHub commit comparison currently reports:

| Comparison | Ahead | Behind | Merge base |
|---|---:|---:|---|
| #272 head `c81e2bf2534febef9c5e49b39f60f85415f04ff1` vs current main | 5 | 50 | `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b` |
| #276 head `aa86fa1346daf922d3c80c27f2bf5beb697bafbb` vs current main | 178 | 50 | `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b` |
| #277 head `0ae3f3bf68e85535e0a90fcc0d2666405571ccb7` vs current main | 279 | 50 | `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b` |
| #272 to #276 | 173 | 0 | #272 head |
| #276 to #277 | 101 | 0 | #276 head |

The earlier 47-commit behind count is stale; the current comparison is 50. #272's PR description says it was rebased to the common base, not to the latest main tip. Do not describe it as current-main-aligned. #276 remains strictly stacked on #272, and #277 remains strictly stacked on #276.

### PR and related branch inventory

| PR | Current state | Current head / branch | Decision |
|---|---|---|---|
| #272 Actor Gateway integration | Open, draft | `c81e2bf2534febef9c5e49b39f60f85415f04ff1` / `integration/capability-gateway-qualification-20261110` | Preserve as stack base; reconcile 50 mainline commits |
| #276 Authentication Issuer | Open, draft | `aa86fa1346daf922d3c80c27f2bf5beb697bafbb` / `construction/auth-issuer-stacked-on-pr272-20261113` | Preserve as issuer candidate; do not merge independently |
| #277 Worker hardening | Open, draft | `0ae3f3bf68e85535e0a90fcc0d2666405571ccb7` / `security/actor-gateway-worker-body-limit-20261114` | Preserve at top of stack; do not merge independently |
| #274 Amanda / Render support handover | Merged | `docs/render-actor-gateway-role-separation-handover-20261112` | Completed evidence; reference, do not recreate |
| #275 Resource API runtime login | Merged | `security/resource-api-runtime-principal-20261112` | Completed dependency; preserve its `GHM_RUNTIME_DATABASE_URL` / `ghm_runtime` contract |
| #278 trusted Render administrator membership guard | Merged | `fix/actor-gateway-trusted-admin-membership` | Completed source/fixture correction; retain sole `ghm_db_user` ADMIN-only, NOINHERIT, NOSET membership rule |
| #279 storage pending-deletion lifecycle | Merged | `fix/storage-pending-deletion-lifecycle` | Completed source/test correction; production migration remains unapplied |

The earlier issuer construction branches still exist: `construction/auth-issuer-isolation-20261112` and `security/isolated-issuer-db-gateway-adr-20261110`. They are historical alternatives, not a reason to create or revive another issuer implementation. The active stack remains #272 → #276 → #277.

### Fresh CI evidence

- #272 head `c81e2bf...`: PR workflow run `43323461117` completed successfully.
- #277 head `0ae3f3b...`: PR workflow run `43630510673` completed successfully.
- #276 head `aa86fa1...`: the recorded handover evidence identifies exact-head run `43611550656` as quality + web-quality passed. The commit-triggered workflow lookup returned no PR-triggered runs for this SHA, so retain the recorded run reference but do not claim the separate lookup independently reconfirmed it.
- #276's previously recorded issuer qualification remains 994 passing tests, 8 comparator tests, disposable PostgreSQL 18.7 lifecycle/cutover/rollback, and SECURITY DEFINER comparison of 106 routines with 14 reviewed issuer ACL changes and zero unexplained non-issuer changes.

A green check on any of these historical heads does not qualify a reconciled or rebased head.

### Mainline reconciliation scope now known

GitHub's aggregate file comparisons report 162 changed paths for #272 vs current main, 285 for #276 vs current main, and 285 for #277 vs current main. The #272→#276 incremental delta is 148 paths; #276→#277 is 7 paths. These are comparison deltas, not a claim that every path should be copied wholesale.

Current main has specifically advanced in the areas that intersect the stack:
- `.github/workflows/ci.yml` and its qualification workflow;
- production pending-migration allowlist and migration audit/checksum contract;
- storage pending-cleanup migration and lifecycle contract tests (including merged #279);
- Actor Gateway principal guard and qualification fixture (including merged #278);
- the full migration/security handover, ADR implementation plan, and this Render role-separation handover;
- Worker body parser and contract tests on #277.

The stack must be reconciled by file and behavior, not by blindly merging the 178/279-commit snapshots or copying entire files. In particular, do not overwrite current-main migration allowlists, production audit logic, storage lifecycle fixes, trusted administrator membership guard, or Amanda/Render evidence with older versions from the stack. For each overlapping path, compare the current-main version with #272, then #276, then #277 and retain the newer mainline behavior unless the stack contains a necessary issuer/gateway change that can be ported without regression.

### Amanda conversation — authoritative reference

PR #274 is merged and records the full 2026-11-12 Render support conversation. Amanda's final confirmation at **2026-11-12 18:46:53Z** was:

> I'm always happy to assist. Yes in this use case I would recommend moving normal app execution to SQL-created login (or logins) outside the Dashboard managed credential list.

The same handover records the refined decision: retain the Render Dashboard-managed default credential for controlled administration; use the existing SQL-created `ghm_runtime` directly for Resource API execution; keep `ghm_migrator` separate for controlled migration tooling. Do not rotate/delete the Dashboard administrator, create a replacement login, or copy Amanda's illustrative SQL as a shortcut. PR #275 implements the Resource API runtime identity contract and is already merged. Keep linking PR #274 and this section from future issuer/security handovers rather than paraphrasing the support guidance without its source.

### Next safe action

Continue read-only, file-by-file reconciliation from current `main` against #272, then the #276 incremental delta, then the #277 seven-path delta. Produce a path-level classification (already present on main / mainline fix must be preserved / stack-only required change / genuine conflict / obsolete or superseded) before editing source. Update this handover with that inventory and exact-head qualification plan. Do not create a branch, rebase, retarget, merge, deploy, change production grants, run migrations, provision hosting, or incur paid cost as part of this reconciliation step.


## 2026-11-15 — active integration work and current blockers

The follow-up release review confirmed that the 2026-11-15 comparison counts must be refreshed after the handover commit: current main is now at `bd67665dc72d9a5b0dc8d852013db1cfa2f7e681`, 51 commits beyond common base `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b`. #272 head `c81e2bf...` is 5 ahead / 51 behind; #276 head `aa86fa1...` is 178 ahead / 51 behind; #277 head `0ae3f3b...` is 279 ahead / 51 behind. All three remain open draft PRs. #272 is now reported mergeable=false. Do not merge any stale head.

### Mainline overlap is narrower than aggregate tree-diff counts

A merge-base comparison of current main against the issuer stack found only four paths modified on both sides:
- `.github/workflows/ci.yml`
- `database/migrations/20261110210000_add_actor_gateway_principal_guard.sql`
- `docs/HANDOVER_2026-11-11_FULL_MIGRATION_SECURITY_AUDIT.md`
- `scripts/qualify-actor-gateway-principal.mjs`

The remaining mainline-only paths that must be retained when integrating #276/#277 are:
- `config/pending-migrations.production.json`
- `database/migrations/20261110140000_allow_pending_storage_object_cleanup.sql`
- `docs/architecture/ADR-001_IMPLEMENTATION_AND_QUALIFICATION_PLAN.md`
- `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md`
- `scripts/migration-audit-checksum.test.mjs`
- `src/db/storage-pending-cleanup-migration-contract.test.ts`
- `workers/actor-gateway/body-parser-worker-stub.cjs`

The shared storage migration path is a real semantic conflict: main contains the lifecycle constraint required for pending-object cleanup; the stack version contains only a function replacement and is stale. Preserve main's exact migration and test. Likewise preserve the mainline production pending-migration allowlist and checksum policy tests. The full security audit handover on main contains newer production findings and must replace the older stack copy, not be overwritten by it.

### Actor Gateway trusted administrator guard reconciliation

The mainline migration `20261110210000_add_actor_gateway_principal_guard.sql` explicitly requires `ghm_db_user` to exist and enforces exactly the observed bounded membership (`ADMIN=true, INHERIT=false, SET=false`). The stack migration omitted the explicit existence check but did enforce the bounded options via a catalog join. The mainline migration is now the selected canonical version.

The #272 branch was updated with three sequential commits:
- `9ffebd1ce52bd680c5810d0fdefede899f9bb662` — copied canonical mainline gateway principal guard migration.
- `8a754ad846934b5f7300fa5ec2f097950b3fc253` — updated the existing gateway principal qualification to explicitly assert the trusted administrator membership options.
- `b39b679bb2dec1d863f077b39ea3022a0c7525a8` — copied the current-main full migration/security audit handover.

These changes were made only on the existing #272 branch. No new branch was created. No production database, role, credential, Render service/environment, deployment, Cloudflare resource, or traffic was changed.

Important: #276 and #277 still point to their prior base/head history and do not yet contain these three #272 follow-up commits. The stack ancestry must be repaired in order before qualification. The connector's workflow lookup only returns pull_request-triggered runs; it returned no runs for the new #272 commit, so exact-head CI is not yet evidenced. Do not claim these updates passed.

### CI reconciliation and release gates

The stack CI workflow contains important issuer, worker, Argon2id compatibility, storage attestation and disposable cutover qualifications. Do not replace it wholesale with main's shorter CI workflow. Its PostgreSQL role fixture and principal qualification must be reconciled to the latest mainline #278/#272 contract. Current main's CI explicitly creates the bounded Render administrator membership and uses the latest role fixture; retain that behavior while keeping issuer/worker qualification steps.

The issuer candidate remains a no-go for production deployment under the current $0 constraint: its recorded Workers Free Argon2id benchmark failed the existing GHM password profile budget. Do not weaken Argon2id, create paid Render services, or switch hosting. The Worker PR's local Workerd/Hyperdrive smoke is not evidence of live production connectivity. The production Actor Gateway role/function ACL and production migration ledger findings remain separate release blockers.

### Immediate next sequence

1. Bring the three #272 reconciliation commits into the #276 branch without dropping the #276 issuer work; then bring the reconciled #276 state into #277. Preserve the existing PR stack and do not merge #276/#277 independently.
2. Port the seven mainline-only paths above into #276 and #277 (including the exact storage lifecycle migration/test and production pending allowlist).
3. Reconcile the four overlapping paths semantically, especially CI workflow role setup and the trusted-admin fixture.
4. Obtain full exact-head CI on the resulting #272, #276 and #277 heads. A historic green run is not enough.
5. Only after all three are qualified, assess merge order and deployment separately. A successful GitHub merge does not authorize production migration, role grants, secrets, hosting or traffic changes.

No PR has been merged and no deployment has been initiated.


## 2026-11-15 — second reconciliation pass: current PR heads and trusted-admin CI fixture

A fresh read of PR metadata after the previous handover update shows:
- #272 current head `b39b679bb2dec1d863f077b39ea3022a0c7525a8`, still draft/open, mergeable=false, base `main`.
- #276 still draft/open, mergeable=false, based on #272.
- #277 still draft/open, mergeable=true at its metadata snapshot, based on #276.
- No PR was merged and no production deployment was attempted.

### Mainline-only file reconciliation

The seven mainline-only paths previously identified have now been copied into the existing #276 branch, and then into the existing #277 branch. This preserves:
- production pending-migration allowlist;
- pending-storage-cleanup lifecycle migration and contract test;
- current ADR-001 implementation/qualification plan;
- current Render/Actor Gateway role-separation handover;
- migration audit checksum policy tests;
- Worker body-parser test stub.

The #276 branch also received the #272 trusted-admin migration, qualification script and full migration/security audit handover as follow-up content updates. The #277 branch received the same three #272 files. These are content reconciliations; the branches have not been rebased or had their commit ancestry rewritten.

### CI role fixture correction

The existing #276/#277 CI fixtures created `ghm_db_user` as a member with ADMIN OPTION over four roles: `ghm_runtime`, `ghm_actor_gateway`, `ghm_auth_issuer`, and `ghm_payment_provider`. That does not match the current mainline trusted Render administrator boundary.

Both #276 and #277 CI workflows have been changed to preserve the existing LOGIN test principal but grant it membership in **only** `ghm_actor_gateway`, with the exact PostgreSQL 18 options:
- ADMIN = true
- INHERIT = false
- SET = false

The fixture retains separate issuer, runtime, migrator and payment-provider principals without granting those roles to the Dashboard administrator. This aligns disposable qualification with the merged #278 correction and the current mainline fixture. The issuer/Worker qualification steps remain in the workflow; the workflow was not replaced with main's shorter workflow.

### Current branch graph — important limitation

After the content updates, GitHub's commit graph still reports:
- #272 vs main: 8 ahead / 52 behind (common base `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b`).
- #276 vs #272: 184 ahead / 3 behind (merge base #272's earlier head `c81e2bf2534febef9c5e49b39f60f85415f04ff1`).
- #277 vs #276: 112 ahead / 11 behind (merge base #276's earlier head `aa86fa1346daf922d3c80c27f2bf5beb697bafbb`).

The file-level content has been copied, but the branch commit ancestry is still behind. The #276 and #277 branch heads must not be represented as ancestry-synchronized or merge-ready merely because selected files match. The remaining behind paths include handover/authority inventory files as well as the selected worker source/test delta. Preserve #277's intentional Worker implementation in `workers/actor-gateway/index.ts` and `workers/actor-gateway/worker-contract.test.mjs`; do not overwrite those with #276 versions.

### CI status and next actions

- #272/#276 exact-head workflow lookup returned no PR-triggered run for the latest file-update commits; exact-head CI remains unproven.
- #277's previous CI run `43654564276` was queued against a prior head; it cannot qualify later commits. New exact-head runs are required after all branch synchronization is complete.
- Do not merge #272 while the issuer stack is not qualified: #272's PR body explicitly makes isolated issuer separation a hard authentication security gate.
- Next, finish syncing the remaining #276-only handover/authority-inventory files into #277 while preserving the two Worker-specific source/test files. Then reconcile the four overlapping mainline/stack paths and review all changed migrations/role assertions.
- The #272-to-main integration still requires a proper ancestry update / mergeability resolution. Do not force-move a PR branch to main or overwrite the 8 gateway implementation commits to make the behind count disappear.
- Once the complete stack is synchronized, run full exact-head CI on all three PR heads. Only then proceed to merge in dependency order and plan deployment separately.

No production migration, role/grant, secret, credential, Render service/environment, Cloudflare resource, DNS, route or traffic was changed. No paid infrastructure was created.


## 2026-11-15 — correction to file-level issuer reconciliation (preserve all security evidence)

A deeper diff review found that the first attempt to copy the #272 gateway principal migration, qualification script and full audit handover directly into #276 would have removed #276-specific evidence. This was caught before merge or deployment and has been corrected.

### Preserved and reconciled source
- Restored #276's original gateway migration as the base. Added the explicit existence check for trusted administrator `ghm_db_user` and an explicit requirement for its `ADMIN=true, INHERIT=false, SET=false` membership. Retained #276's bounded membership guard and the gateway function definition/grants.
- Restored #276's original `qualify-actor-gateway-principal.mjs` as the base. Preserved Resource API runtime function EXECUTE allow-list checks, Business external-mapping lookup ACL/fixture checks, gateway ACL diagnostics, and existing principal/fixture denials. Added a separate `trusted_admin_membership` assertion for the exact three PostgreSQL 18 membership options.
- Restored #276's issuer-specific full migration/security audit handover from the original validated candidate and appended a correction record. The shorter #272 copy is not used as a replacement for issuer-specific evidence.
- Propagated the corrected migration, qualification script and full audit handover into #277.

Corrective #276 commits:
- `b4b558da5869e4217369e0acd15c7527b31b02ec` — additive gateway migration guard.
- `0598fcc006f7dab5f90bb306d3b4090810096edf` — additive principal qualification assertion preserving existing runtime/mapping checks.
- `dd4a509afb9231a38950dc1b78765b83c36598e6` — restored issuer-specific audit handover and appended correction.

Corrective #277 commits:
- `3e6fc5453e6169d2b7362b89567b37341a8c7eed` — corrected gateway migration.
- `529f545b855019909757b2b48160f1bfef099a38` — corrected principal qualification.
- `0213b3b8d8d83621d20c5920eb305dc78cede3c9` — restored issuer-specific audit handover.
- `4fe42a1f373d292a02b70b3d20d570852f637a77` — refreshed Render/Actor Gateway handover.

### Latest PR heads and merge state
- #272: `b39b679bb2dec1d863f077b39ea3022a0c7525a8`, open/draft, mergeable=false.
- #276: `dd4a509afb9231a38950dc1b78765b83c36598e6`, open/draft, mergeable=false.
- #277: `4fe42a1f373d292a02b70b3d20d570852f637a77`, open/draft, mergeable=true at GitHub's latest metadata snapshot.

The #277 mergeable flag is not equivalent to qualification or readiness. The PR branch remains 15 commits behind #276 in Git ancestry; #276 remains 3 commits behind the current #272 branch in ancestry. Selected file contents have been reconciled, but the ancestry has not. The existing GitHub connector exposes no safe branch-update/rebase operation, and no force-ref movement or replacement branch has been attempted.

No exact-head CI currently qualifies the latest #272/#276/#277 heads. Historical green runs and the earlier queued #277 run do not qualify these changed commits. The CI workflow fixture has been corrected to grant the Render administrator membership only in `ghm_actor_gateway`, with ADMIN true, INHERIT false, SET false, while retaining issuer/runtime/migrator/provider identities and issuer/Worker qualification steps.

### Release decision
Do not merge any of the three PRs yet. The immediate blockers are:
1. #272 and #276 report mergeable=false.
2. Branch ancestry is not synchronized, despite selected file reconciliation.
3. Exact-head CI and disposable PostgreSQL qualification are still required.
4. The issuer still has no qualified $0 production hosting solution; do not weaken Argon2id or provision paid compute.
5. Production migration, role/ACL, backup/restore, TLS identity, secret custody and cutover gates remain separate.

No production database, role, grant, secret, credential, Render setting/service, deployment, Cloudflare resource, DNS, route or traffic was changed.


## 2026-11-15 — merge ancestry and first exact-head CI feedback

### Mainline ancestry reconciliation completed for #272

A synthetic Git merge commit was created with the reconciled #272 tree and two parents: the existing #272 head and current main. This preserves all gateway implementation while making current main an ancestor:
- Merge commit: \`427236f092ddc4d51ddcfd6db0d94ddd84b37f7c\`
- Parents: prior #272 \`9411a37adf445c6e32832d91f7238d78e62ba75e\` and main \`857fc78202389c920d95a1e9e72fd23abb38aada\`.
- GitHub compare now reports main → #272 as **18 ahead / 0 behind**.

The #272 tree includes all 11 paths changed on main since the common base. The 7 mainline-only paths were copied in; the overlapping CI, migration, qualification, and handover paths were reconciled deliberately. The #272 CI workflow retains its broader gateway qualification and uses the explicit PostgreSQL 18 trusted-admin membership grants.

### Stacked ancestry reconciliation

Two merge commits were also created:
- #276 merge commit \`89afff8da78fcedd24fb40d5dc98fdf587497ff8\` joins the issuer branch with the then-current #272 head.
- #276 follow-up merge commit \`cd505efc6f34760a375d1cf2cbd0d52fe26cf698\` joins it with the refreshed mainline-integrated #272 head.
- #277 merge commits \`7ab1a2304e78de456338894db24fc631c413d113\` and \`23f6942e00ca3df0000cf89e5d64ae4d73d7b0ac\` carry the issuer ancestry into the Worker stack.

After those commits, GitHub compared #272→#276 as 192 ahead / 0 behind and #276→#277 as 126 ahead / 0 behind. These comparisons were recorded before the latest qualification-test correction. A further #276 ancestry merge commit was created (\`5b7532fe51d84cfb36532b20f3a416f0b7d2c9cc\`) but its branch-ref update was rejected by the GitHub connector with a transient GraphQL error. It is **not** on the #276 branch; do not treat it as applied. Current #276 and #277 branches therefore need a final ancestry refresh after the new qualification-test commits.

### Exact-head CI failure found and isolated

The first CI run on mainline-integrated #272 commit \`427236f...\` failed the quality job, while web-quality passed. The test suite reported 887 passed / 1 failed (888 total). The sole failure was the contract test “Actor Gateway principal guard permits only the bounded Render administrator membership”: it expected the older SQL aliases \`m.member\` / \`m.roleid\`, but the reconciled migration uses unqualified catalog columns in its stricter trusted-administrator check.

This is a stale test expectation, not evidence of a runtime database failure. The migration's trusted-admin existence and exact membership-option checks are retained. The test has been updated to assert the actual semantics:
- trusted administrator role must exist;
- the gateway membership guard is bound to \`gateway_oid\`;
- \`trusted_admin_oid\` is used;
- ADMIN true, INHERIT false, SET false are enforced;
- elevated gateway login attributes remain denied.

The corrected contract test was committed to all three branches:
- #272: \`bbc5693e4992a1553262d6d06edd0a96299cbc39\`
- #276: \`07ebdba04c3c02e6b2c07f3a44dbb72b430d194a\`
- #277: \`085ccc4a99162c666aff5e4a6c5593e1ac5cadb6\`

### Current exact-head CI runs

All three PRs now have new exact-head push and pull-request CI runs in progress:
- #272 \`bbc5693...\`: PR run \`43655209277\`, push run \`43655204588\`.
- #276 \`07ebdba...\`: PR run \`43655212264\`, push run \`43655207679\`.
- #277 \`085ccc4...\`: PR run \`43655216462\`, push run \`43655211280\`.

These are in progress, not passed. The earlier failure remains recorded and must not be hidden.

The #276 workflow was also corrected to include \`integration/capability-gateway-qualification-20261110\` as a pull-request base branch; #277 retains both the #276 and #272 base branches. This ensures stacked PRs receive their own CI instead of silently missing PR-triggered checks.

### Next release gate

Wait for all six current runs to complete, inspect any failures at job/log level, fix the underlying cause, and rerun exact heads. Then complete the final #272→#276→#277 ancestry refresh using the latest branch refs. GitHub currently reports the three PRs as mergeable, but that is not a substitute for green exact-head CI.

Do not merge or deploy until all exact-head checks pass. The issuer remains blocked from production deployment under the current $0 hosting/Argon2id constraint. No production migration, role/grant, secret, credential, Render, Cloudflare, DNS or traffic change was made.


## 2026-11-15 — final ancestry refresh after contract-test correction

The migration contract test was corrected a second time after exact-head CI showed the canonical migration uses boolean predicates (\`AND admin_option\`, \`AND NOT inherit_option\`, \`AND NOT set_option\`) rather than the earlier explicit \`IS TRUE/IS FALSE\` spellings. The updated test now accepts both semantically equivalent forms used by the mainline migration and the additive issuer-stack migration. The migration itself was not weakened or changed to satisfy a brittle regex.

Corrected test commits:
- #272 code/test head: \`bdd844ca9f7be04a3804064cf16dacddae0a09a4\`
- #276 code/test head: \`773ffa2f6c363bdef8933f58b0dc01b0df992f3a\`
- #277 code/test head: \`552fd50d715623b656692ff98dc4705fbe7cb8d1\`

The branch ancestry has now been refreshed again with merge commits that preserve the respective branch trees:
- #272 latest branch tip: \`f0d558c0a1718cb429b1ff83ffa36f0c4f277ba0\` (merge parent includes latest main \`bd987c52d3d63015e26fee6ba03777b8b9576ca5\`).
- #276 latest branch tip: \`b7a91ce6806832ac39cd517ba7d67773c07edcc7\` (merge parent includes latest #272 \`f0d558c...\`).
- #277 latest branch tip: \`45f34db87a604239fea75143de0715928c6ca85c\` (merge parent includes latest #276 \`b7a91ce...\`).

GitHub ancestry comparisons now report:
- main → #272: 23 ahead / 0 behind;
- #272 → #276: 198 ahead / 0 behind;
- #276 → #277: 132 ahead / 0 behind.

Each latest branch tip is a tree-preserving merge commit after its corresponding code/test head. The current exact source trees under CI are the code/test heads listed above; the later merge commits add ancestry only and do not change those trees.

### Latest CI runs

- #272: PR run \`43655387979\` and push run \`43655384453\`, both in progress at last check; web-quality has passed on both, quality is still running.
- #276: push run \`43655387365\` in progress; web-quality has passed and quality is still running. The matching PR run was cancelled when the stacked base advanced; push run is retained as the exact code/test tree check.
- #277: push run \`43655390463\` in progress; web-quality has passed and quality is still running. The matching PR run was cancelled when the stacked base advanced; push run is retained as the exact code/test tree check.

The preceding #272 runs failed only on the outdated SQL regex expectation; the corrected test is now on the current code/test trees. Do not mark the current runs passed until the quality jobs finish successfully and all qualification steps complete.

All three PRs currently report mergeable=true and all three branch comparisons are zero-behind. This resolves the prior ancestry/mergeability blocker, but not the CI, issuer hosting, or production cutover gates. Keep PRs draft and unmerged until exact-tree CI is green. No production migration, role/grant, secret, credential, Render, Cloudflare, DNS, route or traffic change was made.


## 2026-11-15 — Actor Gateway, Authentication Issuer and Worker stack merged

The existing three-PR stack has now been merged into main in dependency order after exact-source CI passed:

| PR | Component | Merge commit | Exact PR CI |
|---|---|---|---|
| #272 | Unified Actor Gateway | \`4463bbb989f9d1173596f5371663b3e9e7afc0a9\` | Run \`43655697931\` passed |
| #276 | Isolated Authentication Issuer | \`1d78d2b992acf92f1359b396f3ccc759c1ff6bd6\` | Run \`43655714468\` passed |
| #277 | Actor Gateway Worker hardening | \`fd629ea4148a69a0600d8424ed37580b83a59058\` | Run \`43655730945\` passed |

Current main head is \`fd629ea4148a69a0600d8424ed37580b83a59058\`.

### Qualification evidence

- #272 quality and web-quality passed on exact source tree \`81b0a90f762772ca745fbca122f9848968d4f234\`; the main suite reported 888 passed, 0 failed, plus 15/15 additional contract tests.
- #276 quality and web-quality passed on exact source tree \`c3c39f2e73260dc221d58f58d7bed606dc02b223\`; all 72 quality steps passed, including disposable PostgreSQL migration/role/ACL checks, issuer pre-cutover grants, guarded disposable issuer cutover, issuer lifecycle/runtime denial qualification, and pre/post SECURITY DEFINER inventory comparison.
- #277 quality and web-quality passed on exact source tree \`628ae4518fe626b2790c6c24c07446c466da62db\`; quality 73/73 and web-quality 11/11 passed. Worker local-runtime oversized-body rejection and startup behavior passed, as did the combined Actor Gateway/Issuer disposable PostgreSQL qualification.
- The latest merge commits after the tested source trees were ancestry-only/tree-preserving merges. The final PR merge commits are recorded above.

The earlier two failed #272 CI attempts were caused by stale SQL regular-expression expectations in the migration contract test. The test was corrected to accept both equivalent PostgreSQL boolean predicate forms. The final exact-source PR run passed; the migration security checks were not weakened.

### Merge is not deployment

No Render or Cloudflare deployment was performed. The existing production GHM internal runtime remains the only approved production API target; auto-deploy remains OFF. Do not deploy this merged stack as-is.

Production remains blocked by:
1. No qualified $0 hosting path for the isolated issuer/Actor Gateway services. Cloudflare Workers Free Argon2id feasibility failed the current GHM password-hashing CPU budget; do not weaken Argon2id or create paid compute.
2. No production Actor Gateway or Authentication Issuer service/network/secret configuration. Disposable CI qualification does not prove live Cloudflare-to-Render Hyperdrive connectivity.
3. Production \`ghm_actor_gateway\` role/function ACL and migration ledger remain unverified/incomplete through the existing production query identity; no manual grants or migrations have been applied.
4. Existing production Render database allowlist \`0.0.0.0/0\` requires a separate validated network/TLS plan. The current \`rejectUnauthorized:false\` database TLS setting does not authenticate the server certificate.
5. Fresh verified production backup/restore evidence, full ownership/grant/default-privilege/SECURITY DEFINER/runtime dependency map, approved migration authority, secret custody and reversible cutover plan remain required.
6. Production API environment variables still require review against the current non-sandbox-only runtime contract before any manual deployment. Do not repoint or rotate credentials by guesswork.

### Immediate next phase

Begin production deployment-readiness work only: re-inventory current Render services, production environment variable names/targets, current live deployment SHA, database role/ACL state, migration ledger authority, and $0 service options. Keep all checks read-only. Produce a deployment matrix and cutover/rollback runbook before any Render setting, production database, secret, deployment or traffic change.

PayFast remains paused pending sandbox access. Legal-document publication remains paused. No production data, role/grant, secret, credential, Render environment/service, Cloudflare resource, DNS, route or traffic was changed during the PR merges.


## 2026-11-15 — post-merge production deployment readiness: Render read-only inventory

After merging #272, #276 and #277, a fresh read-only Render inventory was performed against the ZAID Technologies workspace. No Render setting, environment variable, database role/grant, secret, deployment, DNS or traffic was changed.

### Confirmed Render resources

**Production API service**
- Service: \`GHM-Internal-Runtime\` / slug \`ghm-internal-runtime\`
- Service ID: \`srv-damupsek1f9s73eq8kkg\`
- Repo: \`zaidhqdev-sys/GHM\`
- Branch: \`main\`
- Auto deploy: OFF (\`autoDeploy=no\`, trigger \`off\`)
- Region: Frankfurt
- Plan: Free
- Health check: \`/healthz\`
- URL: \`https://ghm-internal-runtime.onrender.com\`
- Current live deploy: \`dep-dbpmv8jrjlhs73abkli0\`, commit \`c7cf1ebaf4db5912983bfa45bd42747c0854cfaf\`, status live, manually deployed 2026-11-10.

**Production database**
- Service: \`ghm-db\`
- Database ID: \`dpg-dag0sdtbedkc7389vi2g-a\`
- Database: \`ghm_db\`
- PostgreSQL: 18.6
- Region: Frankfurt
- Plan: \`0.1c-256mb\`
- Status: available
- Database user shown by Render metadata: \`ghm_app_user\`
- Current database allowlist: \`0.0.0.0/0\` (broad internet exposure; no change made).

**Legacy/sandbox inventory still present**
- \`ghm-payfast-callback-sandbox\` (free web service, auto deploy OFF)
- \`ghm-payfast-sandbox-runtime\` (free web service, auto deploy ON to main)
- \`ghm-payfast-sandbox-db\` (suspended for billing, expired 2026-11-08)
- \`ghm-identity-qualification\` (free web service, auto deploy ON to its old qualification branch)
- \`ghm-identity-qualification-20261018\` database (basic_256mb, available)
These are not production issuer/gateway targets. Do not repurpose them or trigger deployments. PayFast remains paused.

### Production database read-only snapshot

Render's read-only SQL action successfully queried production \`ghm_db\`. Current connection identity:
- \`session_user = ghm_app_user\`
- \`current_user = ghm_db_user\`
- PostgreSQL 18.6.

The live role inventory currently includes:
- \`ghm_db_user\`: LOGIN, INHERIT, CREATEDB, CREATEROLE.
- \`ghm_app_user\`: LOGIN, INHERIT; member of \`ghm_db_user\` with INHERIT and SET enabled.
- \`ghm_runtime\`: LOGIN, NOINHERIT.
- \`ghm_migrator\`: LOGIN, NOINHERIT.
- \`ghm_actor_gateway\`: LOGIN, NOINHERIT, no superuser/createdb/createrole/replication/bypassrls.
- \`ghm_schema_owner\`: NOLOGIN.
- \`ghm_payment_provider\`: LOGIN, NOINHERIT.
- **\`ghm_auth_issuer\` does not exist in production.**

The live role memberships still show \`ghm_db_user\` with ADMIN OPTION over \`ghm_actor_gateway\`, \`ghm_migrator\`, \`ghm_payment_provider\`, \`ghm_runtime\`, and \`ghm_schema_owner\`; it also has a separate non-admin inherited/SET-enabled membership in \`ghm_runtime\`. \`ghm_app_user\` inherits \`ghm_db_user\`. This is not yet the intended least-privilege production role boundary. Do not attempt ad hoc revokes or role changes.

The migration ledger relation \`ghm.ghm_schema_migrations\` exists, but the production query identity has not been established as authorized to read it. Its exact live migration head and checksums remain unverified.

Read-only catalog checks further confirm:
- \`ghm_actor_gateway\` role exists.
- \`ghm_auth_issuer\` role is absent.
- There are zero \`gateway_%\` functions in schema \`ghm\`.
- There are zero \`auth_issuer_%\` functions in schema \`ghm\`.
- \`ghm_actor_gateway\` currently has no USAGE on schema \`ghm\`, no CREATE on schema \`ghm\`, and no direct SELECT on \`ghm.account_identity\` (the last two denials are desired).
Therefore the merged gateway/issuer code is **not production-ready to deploy or route traffic** against the current production database state. Startup must remain fail-closed; do not weaken checks or apply manual grants.

### Mainline status after merges

The three stack PRs are closed/merged:
- #272 Actor Gateway — merge commit \`4463bbb989f9d1173596f5371663b3e9e7afc0a9\`.
- #276 Authentication Issuer — merge commit \`1d78d2b992acf92f1359b396f3ccc759c1ff6bd6\`.
- #277 Worker hardening — merge commit \`fd629ea4148a69a0600d8424ed37580b83a59058\`.

Main currently points to \`fd629ea4148a69a0600d8424ed37580b83a59058\`. Main push CI run \`43656116645\` was in progress at the time of this note. The exact PR CI runs already passed:
- #272 PR run \`43655697931\` (quality and web-quality passed).
- #276 PR run \`43655714468\` (quality and web-quality passed; full disposable issuer cutover and authority comparison passed).
- #277 PR run \`43655730945\` (quality 73/73, web-quality 11/11 passed).

### Environment-variable inventory limitation and next step

The Render connector exposes service metadata, deploy metadata, and read-only database SQL, but no action to list the service's configured environment-variable names/values. Therefore this check does **not** claim the current \`GHM-Internal-Runtime\` environment values have been inspected. The existing handover inventory of sandbox references remains a checklist, not fresh confirmation.

Before any manual deployment:
1. Inspect the current \`GHM-Internal-Runtime\` environment-variable page in Render, compare every key/value with the handover and the merged code's current \`.env.example\` / config schema, and remove/replace sandbox targets only after exact target confirmation.
2. Establish the authorized \`ghm_migrator\` path for the read-only migration audit and get the live ledger/checksum report. Do not place migrator credentials on the API service.
3. Obtain current verified backup and restore evidence.
4. Reconcile complete role memberships, ownership, default privileges, SECURITY DEFINER ACLs, service runtime dependencies, and network/TLS identity.
5. Determine whether the gateway and issuer can be hosted under the $0 constraint. Existing Workers Free Argon2id feasibility failed the GHM password profile CPU budget; do not weaken password security or create paid services.
6. Prepare a staged reversible production cutover and rollback runbook. Only then consider Render changes and a manual deploy.

No production migrations, manual cutover SQL, role/grant changes, credentials, secrets, Render settings, deployment, Cloudflare resources, DNS, routes or traffic were changed in this read-only readiness pass.


## 2026-11-15 — production migration-authority and service configuration deep dive

Follow-up read-only checks were completed after the first Render inventory. No SQL mutations or Render changes were made.

### Migration ledger authority: exact finding

A direct read of \`ghm.ghm_schema_migrations\` through Render's read-only SQL connector fails with PostgreSQL \`42501 permission denied\`. This is expected for the connector's application identity and is not evidence that the ledger is missing.

Additional catalog checks establish:
- \`ghm.ghm_schema_migrations\` exists as a view (\`relkind = 'v'\`) owned by \`ghm_schema_owner\`.
- \`ghm_migrator\` exists, is LOGIN / NOINHERIT, and has no superuser, createdb, createrole, replication or bypass-RLS privileges.
- \`ghm_migrator\` has exactly the intended direct membership in \`ghm_schema_owner\`: \`admin_option=false\`, \`inherit_option=false\`, \`set_option=true\`.
- \`ghm_schema_owner\` is NOLOGIN, owns schema \`ghm\`, has database CREATE, and has no direct role memberships. The migrator is its only member.
- \`ghm_migrator\` has no inherited schema USAGE/CREATE or direct relation privileges before explicitly setting the schema-owner role. Membership is SET-only.
- The current Render SQL connector session is \`session_user=ghm_app_user\`, \`current_user=ghm_db_user\`; it cannot assume migrator authority. The connector cannot inspect ledger rows.
- \`ghm_db_user\` still has ADMIN OPTION over \`ghm_migrator\` with \`set_option=false\`; do not infer that the application session can assume migrator authority.

The repository's \`src/db/migrate.ts\` explicitly requires \`GHM_MIGRATOR_DATABASE_URL\`, validates that the session is exactly \`ghm_migrator\`, validates the SET-only membership and isolated schema-owner shape, then executes \`SET ROLE ghm_schema_owner\` before reading/updating the ledger. This is the correct supported route. Do not grant ledger SELECT to the app role or weaken migration-principal checks.

### Production migration state remains unverified

Production config \`config/pending-migrations.production.json\` lists seven migrations designated as pending:
- \`20261110100000_create_account_onboarding_progress\`
- \`20261110120000_create_business_relationship_outcome_read_models\`
- \`20261110140000_allow_pending_storage_object_cleanup\`
- \`20261110210000_add_actor_gateway_principal_guard\`
- \`20261110220000_add_actor_gateway_self_identity_read\`
- \`20261110230000_add_gateway_business_registration_identity_read\`
- \`20261110233000_add_gateway_business_registration_identity_write\`

This manifest is repository policy/input, not proof of the live production ledger. Do not assume these seven are all unapplied or apply them without live checksum reconciliation. The actual rows/checksums must be queried through the existing migrator connection after \`SET ROLE ghm_schema_owner\`, or via the approved local migration audit workflow. Do not copy credentials into chat or add them to the Resource API environment.

### Merged code: service-specific configuration contract

This is a source-derived variable-name checklist, not confirmation that values are configured in Render.

**Existing GHM-Internal-Runtime / Resource API**
- Required: \`NODE_ENV=production\`, \`PORT\`, \`GHM_RUNTIME_DATABASE_URL\` (direct login \`ghm_runtime\`), \`DATABASE_SSL=true\`, \`INVITE_CODE\`, \`CORS_ORIGINS\`.
- Proxy: \`TRUST_PROXY_HOPS\` only after verifying Render's proxy topology; legacy \`TRUST_PROXY=true\` maps to one hop and must not be guessed.
- Storage when configured: \`STORAGE_PROVIDER\`, \`STORAGE_ENDPOINT\`, \`STORAGE_REGION\`, \`STORAGE_BUCKET\`, \`STORAGE_ACCESS_KEY_ID\`, \`STORAGE_SECRET_ACCESS_KEY\`, \`STORAGE_FORCE_PATH_STYLE\`, upload/download TTL settings.
- ES256 verification: \`GHM_JWT_ES256_PUBLIC_KEY_PEM\`, \`GHM_JWT_ES256_KID\`, optional previous public key/KID during controlled rotation.
- \`GHM_ACTOR_GATEWAY_URL\` must remain unset until the gateway is deployed and verified. Never place gateway DB URL or issuer private secrets here.
- \`GHM_MIGRATOR_DATABASE_URL\` is migration-only and must not be added to the long-running API service.

**Dedicated Actor Gateway (not currently provisioned as production service)**
- Required by source: \`GHM_ACTOR_GATEWAY_DATABASE_URL\` (direct login \`ghm_actor_gateway\`), \`GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET\`, ES256 public verification key/KID, and \`DATABASE_SSL_MODE\` aligned with verified production TLS.
- It must use its own dedicated DB identity. Startup checks exact identity, role flags, membership boundaries and strict executable-function allow-list.

**Dedicated Authentication Issuer (not currently provisioned as production service)**
- Required by source: \`GHM_AUTH_ISSUER_DATABASE_URL\` (direct login \`ghm_auth_issuer\`), \`GHM_AUTH_ISSUER_DATABASE_SSL_MODE\`, explicit \`GHM_AUTH_ISSUER_TRUST_PROXY_HOPS\`, \`GHM_AUTH_ISSUER_CORS_ORIGINS\`, ES256 public verification key/KID, issuer-only \`GHM_JWT_ES256_PRIVATE_KEY_PEM\` and \`GHM_AUTH_TOKEN_PEPPER\`.
- Private signing key and token pepper must exist only in the issuer service, never on Resource API or Actor Gateway.
- Issuer startup checks exact identity and function allow-list; it fails closed if role, SQL functions, ACLs or keys are absent.

### Immediate operator step — read-only ledger audit

Use the already-configured local \`C:\\GHM\\.env\` value for \`GHM_MIGRATOR_DATABASE_URL\` without displaying or copying it. Connect to the explicit production database with \`DATABASE_SSL=true\`, validate \`session_user=current_user=ghm_migrator\`, then \`SET ROLE ghm_schema_owner\` and read ledger version/name/checksum rows. Run forensic migration reconciliation in audit-only mode first; do not run \`npm run migrate\`. If the local \`.env\` lacks the migrator URL, stop—do not substitute the app URL or paste secrets into chat.

### Backup and deployment gate

Existing handover evidence still identifies only the 2026-11-04 database archive; no newer verified production backup/restore evidence has been established. The live API deploy remains \`c7cf1eb\`; mainline implementation is merged and CI passed, but production API auto-deploy remains OFF. No service variables, roles, migrations, backups, deployments, DNS, routes or traffic were changed during this pass.


## 2026-11-15 — production migration audit TLS verification hardening

The local preflight was completed using the existing `C:\GHM\.env` configuration without displaying credentials. It confirmed:
- `GHM_MIGRATOR_DATABASE_URL` is present.
- Target database is `ghm_db`.
- Host is `dpg-dag0sdtbedkc7389vi2g-a.frankfurt-postgres.render.com`.
- `DATABASE_SSL=true`.
- No database connection was attempted by this preflight.

Review of `scripts/forensic-migration-reconciliation.mjs` found the audit client previously configured TLS with `rejectUnauthorized:false`, and allowed TLS to be omitted when `DATABASE_SSL` was not exactly true. This did not authenticate the server certificate and was not acceptable for a production migrator connection.

A focused fix is now on branch `fix/production-migration-audit-tls-verification-20261115`:
- The audit now fails before connecting unless `DATABASE_SSL=true`.
- The PostgreSQL client explicitly uses `ssl: { rejectUnauthorized: true }`.
- The regression test checks that strict TLS is required and that `rejectUnauthorized:false` is absent.
- No migration SQL, role grants, production data, secrets, Render settings, or deployment behavior was changed.

Commits:
- TLS enforcement: `1ee75bc9abc6790116a0829d8bdc84f6112b3db9`.
- Regression test: `e84f200ba4c95805c43adf317711892e4153515b`.

This change is not yet merged and has not yet been run through CI. The production migration audit has **not** been executed. Next: run the targeted audit-policy test and syntax check locally, verify that the Node runtime trusts Render PostgreSQL's presented certificate chain, then run exact-head CI. Only after those checks should the read-only production audit be attempted. A TLS certificate failure must stop the audit; do not fall back to disabled certificate verification.

Amanda's support-resolution conversation remains preserved in PR #274 and the existing role-separation handover history; this TLS work does not alter that record.


## 2026-11-15 — node-postgres SSL URL override prevention

PR #280 was merged after exact-head CI passed (run `43657345428`, quality 73/73 and web-quality passed), merge commit `64b4a18301a72f6549f819c4fc7cde96dad36dd9`.

Review of the node-postgres SSL documentation identified a second issue: when `sslmode`, `sslrootcert`, `sslcert` or `sslkey` appears in a connection URL, node-postgres replaces the supplied `ssl` object. Render's external Postgres URL convention includes `sslmode=require`; leaving that parameter in place could therefore discard `rejectUnauthorized: true`. Render's official Postgres docs confirm external connections require TLS and use Render-managed certificates. The node-postgres docs explicitly warn that these URL options replace the `ssl` object.

A follow-up hardening change is in progress on branch `fix/migration-audit-ssl-url-override-20261115`:
- Added a URL sanitizer that removes all `ssl*` connection-string parameters and `uselibpqcompat` while preserving host, database, credentials and unrelated parameters.
- The audit passes the sanitized URL to node-postgres while retaining explicit `ssl: { rejectUnauthorized: true }`.
- Added a unit test covering `sslmode`, root/client cert/key parameters, `ssl=true`, libpq compatibility, and preservation of unrelated connection options.
- This does not disable TLS. It makes the explicit Node TLS policy authoritative.

Render documentation confirms external DB endpoints are TLS-encrypted using Render-managed certificates and require TLS 1.2+. It documents `sslmode=require` as the baseline, not server-certificate identity verification. Node's default CA trust and hostname verification still need to succeed in the actual existing local environment. No live connection has yet been made, no CA verification has been waived, and no production SQL or Render setting has changed.

Next gate: exact-head CI for the URL-sanitization change, then a credential-safe local connection preflight with the existing `GHM_MIGRATOR_DATABASE_URL`. If strict Node certificate verification fails, stop and establish a valid CA/hostname verification path; never fall back to `rejectUnauthorized:false`.


## 2026-11-15 — follow-up TLS hardening merged and mainline CI passed

Correction to the preceding progress note: PR #281 is now merged. Exact-head pull-request CI run `43658138745` completed successfully (quality 73/73, web-quality 11/11). Merge commit: `c6b2f663b45174716a67ff999242ed2ca3220d80`. Mainline push CI run `43658584367` also completed successfully (quality 73/73, web-quality 11/11).

The merged helper `stripPostgresSslConnectionStringOptions` removes SSL-related URL query parameters and `uselibpqcompat` before node-postgres receives the connection string. The client retains explicit `ssl: { rejectUnauthorized: true }`. Regression coverage confirms URL sanitization and preservation of the host, database, credentials and unrelated query options. No deployment was triggered.

Authoritative documentation checked:
- Render's current PostgreSQL connection docs state that external connections are encrypted using Render-managed TLS certificates and require TLS 1.2+; `sslmode=require` enforces encryption, but is not equivalent to certificate identity verification.
- node-postgres's SSL docs explicitly state that `sslmode`, `sslrootcert`, `sslcert` and `sslkey` in a connection string replace the separately supplied `ssl` object.

The existing local `.env` has not yet been re-inspected for SSL query parameters, and no local strict-TLS connection has been attempted. Render's public docs do not establish that the default Node trust store validates this particular database certificate chain. The next gate remains a local credential-safe inspection of the existing `GHM_MIGRATOR_DATABASE_URL`, followed by a strict TLS connection preflight only after checking any CA/client-certificate URL options. Do not infer certificate verification from Render's statement that TLS is enabled. Do not use `rejectUnauthorized:false` or run the migration audit until server certificate and hostname verification have succeeded.

No production SQL, migrations, roles, grants, secrets, Render environment variables, deployment, or traffic was changed. The production migration ledger remains unaudited.


## 2026-11-15 — production migration reconciliation completed (read-only)

The strict production migrator connection preflight succeeded using the existing local `C:\\GHM\\.env` configuration. The inspected connection URL contained no SSL-related query parameters (`sslmode`, `sslrootcert`, `sslcert`, or `sslkey`). A real connection using the audit's explicit `ssl: { rejectUnauthorized: true }` policy then succeeded and returned:
- `current_user=ghm_migrator`
- `session_user=ghm_migrator`
- `current_database=ghm_db`
- `pg_stat_ssl.ssl=true`
- TLS 1.3, cipher `TLS_AES_256_GCM_SHA384`

The production command `npm run audit:migrations:predeploy` was then run with `--allow-pending`. It completed with verdict **PASS_WITH_PENDING**. The authority check passed and confirmed:
- Expected database: `ghm_db`.
- Transaction is read-only.
- Connection begins as `ghm_migrator` for both current and session user.
- The migrator can SET ROLE to `ghm_schema_owner`.
- After the role switch, `current_user=ghm_schema_owner` while `session_user=ghm_migrator`.

Migration reconciliation results:
- Repository migrations: **102**.
- Live production ledger rows: **105**.
- Canonical checksum matches: **24**.
- Supported legacy CRLF checksum matches: **62**.
- Approved historical checksum matches: **9**.
- Expected missing migrations: **7**.
- Unexplained checksum mismatches: **0**.
- Migration-name mismatches: **0**.
- Extra ledger rows: **10**, all classified as approved retained historical migrations.
- Unrecognized extras: **0**.
- Orphaned historical exceptions: **0**.
- Redundant historical exceptions: **7** (their registered hashes now match current repository bytes; cleanup is a separate metadata-only follow-up and is not required to explain the production ledger).
- Invalid retained-history records: **0**.
- Pending allowlist mismatches: **0**.

The seven pending migrations exactly match the production pending allowlist:
1. `20261110100000_create_account_onboarding_progress`
2. `20261110120000_create_business_relationship_outcome_read_models`
3. `20261110140000_allow_pending_storage_object_cleanup`
4. `20261110210000_add_actor_gateway_principal_guard`
5. `20261110220000_add_actor_gateway_self_identity_read`
6. `20261110230000_add_gateway_business_registration_identity_read`
7. `20261110233000_add_gateway_business_registration_identity_write`

The ten retained historical ledger rows were all verified against registered provenance. The nine approved historical checksum matches are provenance exceptions, not unexplained checksum drift. The ten extra ledger rows are not unrecognized orphans.

**Interpretation and safety boundary:** production migration history is now reconciled without unexplained drift. The seven listed migrations are genuinely absent from the live ledger according to this read-only audit; the allowlist match only authorizes the audit to report them as pending. It does not apply or approve their SQL for execution. No migration was applied, no ledger row was written, and no role, grant, production data, secret, Render setting, deployment, or traffic was changed. The audit's `BEGIN READ ONLY` authority check passed.

**Next work:** inspect the seven pending SQL files in dependency order, assess their effects and compatibility against the live production schema and runtime, and prepare a separately gated migration execution plan. Do not run migrations or deploy until that review is complete. The seven redundant historical exception entries can be reviewed for later cleanup independently; do not conflate that cleanup with production ledger correctness.

This result supersedes the earlier notes in this handover that said the production audit had not yet been run. Amanda's support-resolution history remains preserved and unchanged.


## 2026-11-15 — pending SQL review: production schema and signed-gateway blockers

The seven allowlisted migration files were fetched from `database/migrations/` on main and reviewed against current source and a read-only Render production catalog query. No production changes were made.

### Live catalog checks completed

- The existing production `ghm_actor_gateway` role has LOGIN=true, NOINHERIT, and all elevated flags false.
- Its only membership edge is `ghm_db_user` as a member of `ghm_actor_gateway`, with ADMIN OPTION=true, INHERIT=false, SET=false. This exactly satisfies the role-membership predicate in `20261110210000_add_actor_gateway_principal_guard.sql`.
- Production has `ghm.account_identity`, `ghm.business`, `ghm.opportunity`, `ghm.storage_object`, and `ghm.business_registration_identity`, all observed under `ghm_schema_owner`.
- Production's current `ghm.storage_object_lifecycle_check` still requires `available_at IS NOT NULL` for `deletion_pending`. The pending storage migration relaxes that requirement so a deletion request can be recorded while an upload is still pending. Row-level compatibility under the new check still needs a read-only count using the migrator/schema-owner session because the Render query connection cannot SELECT the protected table.
- Production's current `ghm.update_business_registration_identity(bigint,bigint,text,text,text)` is SECURITY DEFINER, owned by `ghm_schema_owner`, pinned to `pg_catalog, ghm`, and executable by `ghm_runtime`. Its live definition still uses `ON CONFLICT (business_id)`, matching the defect described by pending migration `20261110233000`; the migration changes this to the named primary-key constraint.

### Critical source/migration interface mismatch

Current main source `src/actor-gateway/request-assertion.ts` signs the v2 payload containing account ID, operation, issued-at, nonce, and the exact JSON request context. Current readers call these signed SQL signatures:
- Actor identity: `ghm.gateway_get_actor_identity(bigint,bigint,uuid,text,text)`.
- Registration read: `ghm.gateway_read_business_registration_identity(bigint,bigint,uuid,text,text,bigint)`.
- Registration write: `ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,text,bigint,text,text,text)`.

But the three pending SQL files `20261110220000`, `20261110230000`, and `20261110233000` create legacy unsigned overloads accepting only the account/business IDs and business fields. The pending `20261110210000` also creates the older `ghm.assert_actor_gateway(bigint)` helper, which only checks that the supplied account is active and does not verify the signed assertion.

Later repository migrations `20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor.sql` and `20261111060000_bind_gateway_assertions_to_request_context.sql` replace the old wrappers with signed v1/v2 functions. The later `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql` revokes execution on the old one-argument assertion helper. Since those later migration versions may already be recorded as applied while the seven earlier versions are missing, the normal migration runner could replay the earlier migrations and skip the later conversions. That could reintroduce executable unsigned gateway overloads. **Do not run the seven migrations or the migration runner until this ordering/replay hazard is resolved.**

The live catalog query currently returned no `gateway_*` or `assert_actor_gateway*` functions, while the base registration update function remains at the old definition. The read-only Render query connection cannot read `ghm.ghm_schema_migrations` or protected storage rows, so the exact production applied-version list and storage row compatibility remain to be verified using the already-proven `ghm_migrator` session with `SET ROLE ghm_schema_owner` inside `BEGIN READ ONLY`.

### Additional execution security issue

The forensic audit now enforces certificate verification, but `src/db/migrate.ts` (the actual migration executor) still configures node-postgres with `ssl: { rejectUnauthorized: false }` when `DATABASE_SSL=true`. Do not use it for production execution until the migration runner's TLS policy is brought up to the same strict, URL-sanitized configuration and covered by regression tests. This is separate from the already-passed audit-only TLS hardening.

### Current disposition

- Migration 1 (onboarding): structurally account-scoped; runtime SELECT/INSERT/UPDATE only, no DELETE. Needs live sequence/table absence and dependency checks.
- Migration 2 (relationship/outcome models): creates four new tables with provenance, authority, lifecycle, temporal and visibility constraints; runtime is SELECT-only. Needs full object/sequence absence and constraint dependency checks.
- Migration 3 (storage pending cleanup): addresses a confirmed live constraint mismatch; validate existing rows against the proposed replacement check before execution.
- Migration 4 (actor gateway principal guard): live role membership matches, but the migration also creates the obsolete unsigned `assert_actor_gateway(bigint)` primitive.
- Migrations 5–7 (self identity and registration gateway): their unsigned function signatures are incompatible with current source and unsafe to replay ahead of already-applied signed-wrapper migrations.

**No production migration was applied.** No ledger row, role, grant, data, secret, Render setting, deployment or traffic was changed. Next gate: retrieve the exact applied ledger rows for `20261110210000` through `20261112070000`, inspect the actual signed/unsigned function catalog and storage row compatibility under the migrator/schema-owner read-only session, then prepare a corrective forward-only migration plan. The normal migration command remains blocked.


## 2026-11-15 — production storage compatibility verified read-only

Using the already-verified `ghm_migrator` connection with strict TLS, `BEGIN READ ONLY`, and `SET ROLE ghm_schema_owner`, the live storage lifecycle inventory returned:
- `deleted`: 2 rows; 0 rows incompatible with the proposed pending-cleanup check.
- `pending`: 2 rows; both correctly have `available_at IS NULL` and `deleted_at IS NULL`; 0 incompatible rows.
- No `available` or `deletion_pending` rows were present.

The current `storage_object_lifecycle_check` requires `available_at IS NOT NULL` for `deletion_pending`. The pending migration removes only that requirement while preserving the pending/available/deleted state invariants. Existing rows are compatible with the proposed replacement check. This validates data compatibility, not the migration's complete execution/rollback safety.

The same read-only query returned no rows for the attempted ledger filter `version >= '20261110210000'`, despite the preceding full forensic reconciliation having read 105 ledger rows. This filtered result is not interpreted as an empty ledger or as proof that later versions are absent. Repeat the ledger read without a version predicate, using the exact query used by `scripts/forensic-migration-reconciliation.mjs` (`SELECT version, name, checksum, applied_at FROM ghm.ghm_schema_migrations ORDER BY version`) and inspect the tail locally. No change to production was made.


## 2026-11-15 — full production ledger compared with current main migration inventory

The complete read-only production ledger query returned 105 rows. Its final recorded row is:
- version `20261109210000`
- name `deactivate_unrecognized_public_directory_records`
- applied_at `2026-11-09T20:50:23.763Z`

The current `main` Git tree was then enumerated directly (not inferred from the earlier audit output):
- Current repository migration files: **137**
- Repository migration versions later than the latest production ledger version: **42**
- Current `config/pending-migrations.production.json` entries: **7**
- Later repository migrations not covered by that pending allowlist: **35**

This establishes that the prior 2026-11-15 forensic audit result (`repository_count=102`, `missing_count=7`, `PASS_WITH_PENDING`) is stale relative to the current main migration inventory. It must not be used as authorization to apply migrations from current main.

The 35 unallowlisted later migrations are:
- `20261110010000_add_business_supplier_classification`
- `20261110160000_add_admin_capability_catalogue_governance`
- `20261110240000_enforce_capability_catalogue_cross_row_invariants`
- `20261110250000_add_gateway_capability_governance`
- `20261110260000_gateway_supplier_classification_cutover`
- `20261110265000_reconcile_business_profile_legacy_contract`
- `20261110270000_gateway_business_profile_update`
- `20261111020000_bind_capability_gateway_actor_to_signed_assertion`
- `20261111030000_bind_supplier_gateway_actor_to_signed_assertion`
- `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion`
- `20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor`
- `20261111060000_bind_gateway_assertions_to_request_context`
- `20261111070000_add_signed_business_capability_mutations`
- `20261111100000_add_signed_saved_business_gateway`
- `20261111130000_add_signed_business_hours_gateway`
- `20261111140000_add_business_hours_read_projections`
- `20261111150000_add_signed_trust_score_gateway`
- `20261111160000_add_signed_business_logo_gateway`
- `20261111170000_add_trust_score_read_projections`
- `20261111210000_revoke_runtime_account_external_identity_table_access`
- `20261111220000_revoke_unused_auth_runtime_entry_points`
- `20261111230000_add_token_bound_recovery_revocation_result`
- `20261111240000_revoke_runtime_quoteflow_migration_provisioning`
- `20261111250000_revoke_runtime_external_identity_link`
- `20261111260000_revoke_runtime_external_identity_bootstrap`
- `20261112020000_add_token_bound_password_recovery_reset`
- `20261112030000_add_conditional_password_rehash`
- `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration`
- `20261112050000_revoke_public_default_function_execution`
- `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads`
- `20261112080000_signed_connect_business_provisioning_gateway`
- `20261112090000_pin_security_definer_search_path`
- `20261112140000_add_signed_storage_metadata_actor_gateway`
- `20261112150000_add_storage_provider_workflow_attestation`
- `20261112170000_revoke_redundant_migrator_business_mapping_lookup`

The 7 allowlisted entries remain the previously recorded onboarding/read-model/storage-cleanup/initial actor-gateway migrations from 20261110100000 through 20261110233000. The 35 additional migrations are not authorized by that allowlist. No production migration was executed. Do not run the migration runner or deploy the runtime until a fresh read-only forensic audit is run against this exact current main tree, the complete 42-migration suffix is reviewed, and the production pending allowlist/provenance is reconciled deliberately. In particular, the signed actor-gateway migration chain is absent from the live ledger; the earlier concern about a later signed migration already being applied is not supported by this ledger snapshot, but the unsigned predecessor chain and subsequent signed replacements still require ordered review before execution.

PR #282 (`bd22404e9dcbc3a63b30a2f2edb091fd8b41e095`) CI run `43660195197` completed successfully: `quality` and `web-quality` both passed. PR remains open and unmerged pending review against the now-established migration inventory. No production writes, migration execution, or deployment occurred.


## 2026-11-15 — migration runner PR #282 follow-up review

Reviewed the latest open PR inventory, #282 diff, current migration runner, and the exact 137-file current-main migration inventory before further changes. PR #282 is the only open PR in the recent GHM PR list; its exact-source CI run `43660195197` passed both `quality` and `web-quality`. It remains open and unmerged.

Review found the PR had a redundant production TLS condition and scoped enforcement to `NODE_ENV=production`, even though the explicit target guard identifies the protected database by approved database name. Updated PR branch `fix/migration-runner-strict-tls-20261115` at commit `5e13c479c79e7e9518a0b78445eae927812682b5`: production database `ghm_db` now requires `DATABASE_SSL=true` regardless of NODE_ENV; URL-level SSL overrides are stripped and node-postgres receives `rejectUnauthorized: true`. The migration-order guard is confirmed to run after the full applied-ledger read and before the first migration SQL execution. Its contiguous pending suffix behavior is unit-tested.

A targeted SQL review of the first ten post-ledger migrations found the sequence is intentionally transitional: supplier classification and capability governance functions are introduced, legacy gateway wrappers are created, then later migrations replace those wrappers with signed assertions. The initial signed assertion chain is one-use HMAC v1; subsequent migrations extend allowed operations and then bind assertions to request context. This chain must be executed in exact timestamp order as one reviewed suffix; do not cherry-pick or reorder individual SQL files. The signed-assertion secret tables are created empty by migrations and require a separate secure provisioning process before the gateway can function. No secret value is stored in migrations or handover.

The full 42-migration suffix remains unqualified. The forensic audit must now be run against current `main` (after synchronizing the local checkout) using `npm run audit:migrations:predeploy`. Expected safe behavior is a read-only `INVESTIGATE` result because the production pending allowlist still contains only seven records while current main has 42 missing migrations. Do not modify the allowlist merely to make the audit pass. Capture the complete fresh output, then review all object preconditions, existing function overloads, extension/secret dependencies, role grants, and data transformations before considering any production change. No production writes, migration execution, role/grant/secret change, or deployment occurred during this review.


## 2026-11-15 01:07Z — exact-main production reconciliation

The local checkout was fast-forwarded from `03aadb6fd84b0bff665b9ea34c8cdfde3895df69` to the then-current `origin/main` commit `cb4c8d27934a8f73c43194e791e7e3b01ed37262`. The tracked working tree was clean. The untracked recovery artifact `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak` was confirmed present before and after the fast-forward; it was not staged, moved, deleted, or overwritten.

A fresh read-only production reconciliation was run from that exact main revision using `C:\\GHM\\.env` and the verified strict-TLS migrator connection. The audit confirmed:
- authority pass; `session_user=ghm_migrator`, `current_user=ghm_migrator`, database `ghm_db`;
- after `SET ROLE`, `current_user=ghm_schema_owner`, `session_user=ghm_migrator`;
- `read_only_transaction=true`;
- repository migrations 137; live ledger rows 105;
- canonical matches 24; supported legacy-CRLF matches 62; approved historical matches 9;
- missing repository migrations 42;
- unexplained checksum mismatches 0; name mismatches 0;
- extra ledger rows 10, all 10 approved retained historical; unrecognized extras 0;
- orphaned historical exceptions 0; invalid retained-history records 0;
- redundant historical exceptions 7;
- pending allowlist currently contains 7 entries and does not exactly match the 42 missing migrations.

Final verdict: `INVESTIGATE`, exit code 2. The forensic script's verdict expression does not treat redundant historical exceptions as a failure. In this run, the failed condition is the exact pending-allowlist comparison. This is not evidence of checksum corruption: all 42 missing versions are after the latest production ledger row (`20261109210000`), and all other listed mismatch/extra/history checks are clean. Do not expand or rewrite the allowlist merely to force a passing verdict.

The 42 missing migrations are the seven already recorded in the existing allowlist plus the 35 additional migrations listed in the preceding 2026-11-15 inventory section. All 42 remain unqualified for production execution. Review must establish each migration's object preconditions, overload dependencies, grants/owners, data transformations, secret provisioning prerequisites, and exact order. The signed Actor Gateway migration chain must be treated as one timestamp-ordered suffix; do not cherry-pick or reorder it.

Separate files under `database/cutovers/` are explicitly marked manual cutover only and are not part of the 137 automatic migration inventory. Initial inspection reconfirmed their gates are operationally significant:
- the authentication-issuer privilege cutover explicitly warns that applying it before all auth routes have moved to the isolated issuer will break registration/login/refresh/logout/password reset;
- the campaign/directory-review cutover requires coordinated Resource API / Actor Gateway release and old Resource API instances out of traffic;
- legacy runtime privilege revocations require gateway deployment and end-to-end qualification first.
These cutovers must not be run as a shortcut to resolve the migration audit. Each needs its own deployment, principal, backup, rollback and end-to-end gates.

PR #282 remains open and unmerged. Its latest head is `5e13c479c79e7e9518a0b78445eae927812682b5`; exact-head CI run `43660933075` completed successfully with both `quality` and `web-quality` jobs passing. This validates the runner code/tests only; it does not qualify or authorize production migrations. The migration-order guard is intended to stop before migration SQL if an older missing migration precedes a later applied version. The current ledger shows a contiguous missing suffix, but all 42 migration bodies still require review.

No production migrations, cutovers, role/grant changes, secret provisioning, environment-variable changes, or deployments were performed. The production database transaction was read-only. Render support history and Amanda's explicit recommendation to keep the Dashboard-managed credential for administration while moving normal app execution to SQL-created logins remain preserved earlier in this handover.


## 2026-11-15 — continuation recovery: current PR/branch inventory and migration suffix review

This addendum reconciles the earlier migration handover statements against current GitHub state at main `35cf1d3a7462daee26bce78bd9f8a1aecbc8302d`. It records source review only. No production database, Render, secret, deployment, traffic, migration or cutover state was changed.

### Current repository and PR inventory

- Current main: `35cf1d3a7462daee26bce78bd9f8a1aecbc8302d`.
- Current automatic migration files: 137.
- Separate manual cutover files: 11.
- Remote branches enumerated: 173.
- Current open PR inventory: six (#282, #264, #243, #244, #233, #201). Earlier statements that #282 was the only open PR are superseded.
- PR #282 remains open/unmerged at `5e13c479c79e7e9518a0b78445eae927812682b5`; exact-head run `43660933075` passed `quality` and `web-quality`.
- PR #282 is 9 commits ahead and 4 behind current main (merge base `4b144e3d44568141ab44d2f3131f55b14a0db40b`). Reconcile/rebase and rerun exact-head CI before any merge decision. Green CI on its current head is not CI on a mainline-reconciled head.
- #264 is an open documentation checkpoint. #243/#244 are a stacked draft feature pair. #233 and #201 remain unrelated draft work; neither is a prerequisite for production migration reconciliation.

### Migration-related branch disposition

The following branch comparisons were made against current main to avoid reviving superseded work:

- `fix/exact-production-pending-migration-allowlist`: 2 commits ahead / 478 behind; changes the production pending allowlist. Do not merge, rebase or reuse its allowlist edits. The current seven-entry allowlist remains unchanged.
- `fix/migration-provenance-reconciliation-20261109`: 71 ahead / 480 behind and contains historical provenance/retained-history/pending-allowlist changes. Treat as a stale historical candidate, not a current base.
- `fix/migration-audit-ssl-url-override-20261115`: fully contained in main (0 ahead / 8 behind); no work to repeat.
- `fix/production-migration-audit-tls-verification-20261115`: fully contained in main (0 ahead / 13 behind); no work to repeat.
- `fix/migration-runner-strict-tls-20261115`: current PR #282 branch; 9 ahead / 4 behind and requires mainline reconciliation before merge.

### Next ten migrations — source review findings

The next timestamp-ordered batch after the first ten already reviewed in the prior checkpoint is:

1. `20261110250000_add_gateway_capability_governance.sql`
2. `20261110260000_gateway_supplier_classification_cutover.sql`
3. `20261110265000_reconcile_business_profile_legacy_contract.sql`
4. `20261110270000_gateway_business_profile_update.sql`
5. `20261111020000_bind_capability_gateway_actor_to_signed_assertion.sql`
6. `20261111030000_bind_supplier_gateway_actor_to_signed_assertion.sql`
7. `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion.sql`
8. `20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor.sql`
9. `20261111060000_bind_gateway_assertions_to_request_context.sql`
10. `20261111070000_add_signed_business_capability_mutations.sql`

Source-level observations:

- `20261110250000` creates four SECURITY DEFINER capability governance wrappers, owned by `ghm_schema_owner`, revokes PUBLIC/runtime/migrator execution and grants the gateway login execution.
- `20261110260000` creates the supplier-classification gateway wrapper and revokes `ghm_runtime` execution on both the wrapper and legacy write function. This is a runtime API cutover-sensitive privilege change, despite being in the automatic migration directory.
- `20261110265000` adds nullable latitude/longitude columns and paired/range constraints, then replaces the Business profile SECURITY DEFINER update function. Its dynamic SQL fragment is assembled from fixed internal strings; patch values are passed as parameters. No data backfill is present in this file.
- `20261110270000` creates the Business profile gateway wrapper and revokes direct `ghm_runtime` execution on the legacy update function. This is also runtime API cutover-sensitive.
- `20261111020000` installs/checks `pgcrypto` in schema `public`, creates owner-only assertion-secret and nonce tables, adds an expiry index, and introduces the initial HMAC v1 assertion verifier and gateway overloads. It drops the earlier unsigned capability gateway overloads and replaces them with signed overloads.
- `20261111030000` and `20261111040000` extend the v1 operation allow-list and replace supplier/profile gateway overloads. `20261111050000` extends signed identity and registration read/write entry points.
- `20261111060000` replaces the v1 assertion and gateway signatures with context-bound forms; every gateway operation binds the signature to the operation arguments. The migration drops the prior overload set before creating the new signatures.
- `20261111070000` advances the verifier to the context-bound v2 payload and adds signed Business Capability/evidence operations. Evidence submission inserts a pending evidence row only after active-business membership and owner/administrator checks.

### Explicit gates arising from this review

1. Do not execute `20261110260000` or `20261110270000` until the production Resource API call path, Actor Gateway route availability, deployed service revision and traffic cutover sequence prove that no live request still depends on the revoked runtime function grants. The current production readiness record still says the Actor Gateway is not deployed and the live Resource API remains on the older `c7cf1eb` deployment with auto-deploy OFF.
2. The signed gateway sequence is intentionally transitional. Do not cherry-pick, reorder, or apply only selected versions. Qualify the complete contiguous sequence and its intermediate-state compatibility.
3. The assertion secret table is created empty. The migrations do not provision the HMAC secret. A separately controlled secret provisioning and verification procedure is required before signed gateway calls can work.
4. Verify that `pgcrypto` is installed and that `public.hmac(bytea, bytea, text)` resolves in the target database. `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA public` does not by itself prove an already-installed extension resides in the expected schema.
5. Verify all dropped function signatures, dependencies, owners and effective grants against the production catalog and migration chain before any execution. The source review is not a substitute for disposable PostgreSQL qualification.
6. These ten files are source-reviewed only in this continuation. They are not production-qualified, and the complete 42-migration suffix remains blocked.

### Current stop condition

Keep the production pending allowlist at seven entries and unchanged. Keep the migration runner fail-closed. Do not run the production migration executor, apply manual cutovers, change roles/grants/secrets, modify Render, deploy, or switch traffic until the complete migration suffix and its separate service cutovers have been qualified and documented.


### Next ten migrations — source review checkpoint (continued)

Reviewed the next ten timestamp-ordered files on current main `c5a54db9084fc4c55a440c8ce4fa0bd91287db05`:

1. `20261111100000_add_signed_saved_business_gateway.sql`
2. `20261111130000_add_signed_business_hours_gateway.sql`
3. `20261111140000_add_business_hours_read_projections.sql`
4. `20261111150000_add_signed_trust_score_gateway.sql`
5. `20261111160000_add_signed_business_logo_gateway.sql`
6. `20261111170000_add_trust_score_read_projections.sql`
7. `20261111210000_revoke_runtime_account_external_identity_table_access.sql`
8. `20261111220000_revoke_unused_auth_runtime_entry_points.sql`
9. `20261111230000_add_token_bound_recovery_revocation_result.sql`
10. `20261111240000_revoke_runtime_quoteflow_migration_provisioning.sql`

Source-level observations:

- The saved-business, business-hours, trust-score and Business Logo migrations add SECURITY DEFINER Actor Gateway wrappers using the context-bound assertion helper. Their wrappers are assigned to `ghm_schema_owner`, revoked from PUBLIC/runtime/migrator, and granted to `ghm_actor_gateway`.
- The public business-hours and trust-score projections deliberately remain callable by `ghm_runtime` while PUBLIC and migrator execution are revoked. This is a separate read-only public projection path; it must be preserved in any effective function-ACL inventory.
- The saved-business and business-hours gateway wrappers perform lifecycle writes/reads through the existing domain functions; no standalone data backfill was identified in the migration bodies.
- The account external-identity cutover revokes direct runtime access to the identity table and sequence while explicitly granting runtime execution to the four auth lifecycle functions for lookup, link, bootstrap and migration-account provisioning. The effective function dependencies and route call paths must be checked before this cutover.
- The unused-auth-entry-point migration revokes runtime execution from session revocation, password change and account disable functions. This is operationally sensitive: confirm every production route has moved to the intended trusted issuer/actor boundary before application.
- The token-bound recovery migration changes recovery redemption to return a revoked-session count and revokes a legacy all-sessions helper from runtime. It updates the recovery credential state inside the function; verify callers consume the changed result contract and that all existing overloads/clients are reconciled.
- The QuoteFlow migration provisioning migration revokes runtime execution from `auth_provision_migration_account(text,text,text,text)`. This must be checked against the existing migration/recovery workflows and the documented user-migration decision; do not infer that revoking it is harmless solely because user migration is not a current blocker.

### Additional stop conditions

1. Do not apply auth entry-point or identity-table revocations until source-to-production route mapping proves which service principal executes each route and the replacement route is deployed and verified.
2. The production API deployment remains recorded as the older `c7cf1eb` snapshot, auto-deploy OFF. Mainline wrappers and tests do not prove that the deployed API calls them.
3. Preserve runtime EXECUTE on the explicitly intended public read projections and auth lifecycle functions; verify exact overload signatures, owner and ACL rather than relying on function names alone.
4. Verify the recovery redemption return-shape against all TypeScript callers, tests, and any SQL wrappers before treating the change as compatible.
5. The source review remains non-executing. No disposable PostgreSQL qualification of these ten migrations was performed in this continuation, and no production SQL or cutover was run.

The overall 42-migration suffix remains unqualified. The allowlist is unchanged at seven entries. Production remains read-only and no Render/deployment/secret/role/grant changes were made.


### Final twelve migrations — source review checkpoint

Reviewed the remaining twelve files in the 42-migration production suffix:

1. `20261111250000_revoke_runtime_external_identity_link.sql`
2. `20261111260000_revoke_runtime_external_identity_bootstrap.sql`
3. `20261112020000_add_token_bound_password_recovery_reset.sql`
4. `20261112030000_add_conditional_password_rehash.sql`
5. `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration.sql`
6. `20261112050000_revoke_public_default_function_execution.sql`
7. `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql`
8. `20261112080000_signed_connect_business_provisioning_gateway.sql`
9. `20261112090000_pin_security_definer_search_path.sql`
10. `20261112140000_add_signed_storage_metadata_actor_gateway.sql`
11. `20261112150000_add_storage_provider_workflow_attestation.sql`
12. `20261112170000_revoke_redundant_migrator_business_mapping_lookup.sql`

Source-level findings:

- The two external identity migrations revoke runtime EXECUTE on the legacy identity-link and bootstrap functions. They are auth cutover-sensitive; verify the replacement issuer/Actor Gateway call graph and service principal before applying.
- The token-bound password recovery reset requires the recovery token and normalized login email to belong to the same active account, consumes the token, updates the existing password credential and revokes sessions atomically. It returns both account ID and revoked-session count. Caller/result-contract compatibility must be verified.
- Conditional password rehash updates the password hash only if it still equals the hash verified by the login request, protecting a concurrent password reset/change from stale overwrite.
- QuoteFlow reset-enrollment registration runtime EXECUTE is revoked; reconcile with the documented migration/recovery state before applying.
- The default-privilege migration revokes future PUBLIC function EXECUTE for objects created by `ghm_schema_owner`. This is a broad forward-looking privilege policy change; verify every intended public/runtime/gateway function grant is explicit and test new-function defaults.
- The legacy unsigned Actor Gateway assertion overload is revoked from PUBLIC/runtime/migrator. Verify all old overload call sites and grants are accounted for.
- The signed Connect Business provisioning function performs Business creation, owner membership creation and external mapping in one SECURITY DEFINER transaction, binds the full request context to a v2 actor assertion, and grants only the Actor Gateway wrapper. The wrapper retains the historical `provider='supabase'` mapping namespace as an external identity label; this is not by itself evidence of a live Supabase service dependency, but confirm the retained mapping namespace is intentional and required for idempotent historical mapping resolution.
- The SECURITY DEFINER search-path migration first fails if any GHM SECURITY DEFINER function is not owned by `ghm_schema_owner`, then pins every such function to `pg_catalog, ghm, pg_temp`. This is a database-wide assertion and dynamic ALTER loop; qualify it against the complete disposable schema/function inventory.
- The signed storage metadata gateway migration adds actor-bound pending-create/read/deletion-request operations, enforces Business owner/administrator membership, restricts public reads to available Business Logos, and pins wrappers to `pg_catalog, ghm, pg_temp`.
- The provider-workflow attestation migration creates a separate owner-only secret/nonce store and requires both user actor proof and Resource API provider attestation for availability/deletion completion. The secret table is empty after migration and needs a separate secure provisioning step. It deliberately keeps the provider proof distinct from the Actor Gateway actor assertion.
- The final migrator mapping migration revokes a redundant migrator lookup function grant. Confirm the exact production call graph and the earlier grant/owner rationale before applying.

### Full suffix review status and remaining qualification boundary

The 42 missing migration SQL files have now been enumerated and source-screened in timestamp order across the preceding checkpoint and this continuation. This is a source review, not a successful execution qualification. It does not prove all SQL succeeds against the actual production schema or that deployed callers are ready for privilege changes.

The main blockers remain:

1. Complete disposable PostgreSQL 18 application of the exact 42-migration suffix against a schema/ledger baseline matching production, with object/overload/grant/owner preconditions checked before and after each migration.
2. Confirm the production API and auth route-to-principal map against the currently deployed code, not merely current mainline. Production is still recorded on `c7cf1eb`, auto-deploy OFF.
3. Provision and verify the Actor Gateway assertion HMAC secret and separate storage provider attestation secret only through controlled secret handling; never place values in Git or handover.
4. Confirm `pgcrypto` extension schema/function resolution and all SECURITY DEFINER ownership/search-path preconditions.
5. Keep the eleven manual cutovers separate, especially issuer, campaign/directory review and legacy runtime privilege revocations.
6. Reconcile PR #282 with current main (its recorded head is 9 ahead / 4 behind) and rerun exact-head CI after reconciliation. Its earlier green run does not qualify the 42 SQL files.
7. Preserve the seven-entry production pending allowlist unchanged until the disposable execution and production dependency evidence supports an exact reviewed update.

No production SQL, migration, cutover, role/grant, secret, Render setting, deployment or traffic change was performed during this source review. The production database remains read-only for this work.


## 2026-11-15 — PostgreSQL 18 clean-install qualification evidence and production-baseline gate

### Repository recheck before qualification

- Main at start of this continuation: `646b0581a8155ea4bad7f5e2b6b01c6fb26ffae1`.
- The open PR inventory still contains #282, #264, #243, #244, #233 and #201.
- PR #282 remains open/unmerged at `5e13c479c79e7e9518a0b78445eae927812682b5`.
- Current comparison of PR #282 branch against main: 9 commits ahead / 7 behind; merge base `4b144e3d44568141ab44d2f3131f55b14a0db40b`. GitHub reports mergeable=true, but no merge or branch update was performed.
- The 10 commits after the latest successful full main CI commit `c6b2f663b45174716a67ff999242ed2ca3220d80` change only this handover file. The comparison reports no migration, runner, config, or test source changes after that CI-tested tree.
- Historical branches `integration/capability-gateway-qualification-20261110` (370 commits behind main), `ci/qualify-integration-candidate-20261018` (5 ahead / 749 behind), and `construction/ci-postgres-auth-qualification-20261016` (5 ahead / 750 behind) are stale. Do not use them as a current qualification base.

### Existing PostgreSQL 18 CI evidence recovered

Mainline CI run `43658584367` on commit `c6b2f663b45174716a67ff999242ed2ca3220d80` completed successfully on 2026-11-15. Both jobs passed: `quality` and `web-quality`.

The quality job used a disposable PostgreSQL 18 service and completed all 69 substantive steps. Specifically:

- Created isolated least-privilege database roles.
- Ran `npm run migrate` against the disposable PostgreSQL 18 database; the step **Apply all migrations to disposable PostgreSQL** passed.
- Ran the complete test suite.
- Ran targeted signed Actor Gateway, Business Capability, supplier classification, Business profile, Saved Business, Business Hours, Trust Score, Business Logo, storage metadata and provider-attestation qualification scripts.
- Ran the guarded Authentication Issuer manual cutover against disposable PostgreSQL only, then qualified issuer lifecycle/runtime denials and compared pre/post SECURITY DEFINER authority inventories.
- The workflow also qualified the separate storage provider dual-proof and legacy storage metadata revocation/rollback paths.

The current mainline migration SQL and runtime/test source tree are identical to the CI-tested `c6b2f663` tree; the only intervening changes are documentation. Therefore this CI run is valid evidence that the complete current repository migration chain (including the 42-file suffix) applies successfully to a fresh PostgreSQL 18 database and that the listed targeted disposable-DB qualification steps pass.

### What this evidence does not establish

This is a **clean-install qualification**, not the requested production-baseline replay. It does not prove that the 42 missing migrations apply safely over the exact live `ghm_db` schema, its legacy retained objects, its existing 105-row ledger, or any production-only drift/manual cutovers.

The current handover's backup inventory identifies only the 2026-11-04 database archive; no newer verified production backup/restore artifact has been established. That archive predates the 2026-11-09 production ledger endpoint and cannot be treated as an exact snapshot of the current 105-row production baseline without a documented forward reconstruction and validation. No backup restore was attempted.

### Next qualification input required

Before any production-baseline replay, identify an already-existing local backup/archive that is demonstrably current enough to reconstruct the production schema at the 2026-11-09 ledger endpoint, or establish that no such artifact exists. Inventory only: do not restore over an existing database, start/stop services, create a new database, or expose credentials.

If no suitable backup exists, stop the production-equivalent replay and record the blocker. Do not spend money, relaunch the expired sandbox, create a hosted database, or substitute the 2026-11-04 archive as if it were current.

### Current status

- Clean PostgreSQL 18 install: **PASS** on CI-tested current source tree.
- Targeted gateway/auth/storage disposable qualifications: **PASS** on that CI run.
- Exact production-baseline replay: **NOT RUN — current verified backup baseline unavailable**.
- Production database: unchanged; no migration/cutover/role/grant/secret change.
- Pending migration allowlist: unchanged at seven entries.
- PR #282: open/unmerged; no branch update or merge.
- Render and deployments: unchanged.


## 2026-11-15 — November 14 production archive ledger reconciliation

### Repository / work-inventory check before recording this result

- Current mainline immediately before this handover update: `7dcd74387d1a467d2d9a905bce7c3d8045c3e6b3`.
- Open PR inventory checked: #282, #243, #264, #201, #233 and #244. No PR was merged or changed during this investigation.
- PR #282 remains open/unmerged. Its current branch comparison against main is divergent: 9 commits ahead / 8 behind. Its proposal includes strict TLS and a fail-closed migration-order guard; it is not a production migration authorization.
- The repository contains many historical/construction branches, including migration checksum/provenance branches. Do not create another branch or repeat a generic migration audit before inspecting those existing branches and commit history for the exact historical SQL.
- Existing canonical handover retained; this entry supplements the PostgreSQL 18 clean-install and production-baseline gate above. Amanda's Render support conversation and recommendation remain recorded earlier in this document.

### Archive identified and inspected — inventory only

Candidate archive supplied and inspected locally:

- Outer archive: `C:\Users\zaidh\Downloads\2026-11-14T14_26Z.dir.tar.gz`.
- Extracted directory-format dump: `C:\Users\zaidh\AppData\Local\Temp\GHM-backup-inspect-20261114\2026-11-14T14_26Z\ghm_db`.
- Extracted ledger SQL: `C:\Users\zaidh\AppData\Local\Temp\GHM-backup-inspect-20261114-migration-ledger.sql`.
- Archive TOC says database `ghm_db`, dump created 2026-11-14 14:28:34, source PostgreSQL 18.6, directory format, 760 TOC entries.
- Extracted archive inventory: 65 files, 537,097 bytes total; TOC 493,562 bytes; migration-ledger data 16,256 bytes.
- The archive contains both `ghm` and legacy `public` schemas and table data. The presence of legacy `public` objects is an inventory observation only; it does not establish that production still depends on Supabase.
- `ghm.ghm_schema_migrations` ledger data extracted successfully without restoring the archive or connecting to a database. It contains 105 rows, from `00000000000000` through `20261109210000`; the final recorded `applied_at` is 2026-11-09 20:50:23.763528+00.

### Exact repository checksum reconciliation result

The extracted 105-row snapshot ledger was compared with the current mainline migration directory using the repository's supported normalized-LF and legacy-CRLF SHA-256 checksum rules.

| Result | Count |
|---|---:|
| Snapshot ledger rows | 105 |
| Repository migration files | 137 |
| Exact filename + checksum matches | 86 |
| Same filename, checksum mismatch | 9 |
| Ledger rows with no matching repository migration file | 10 |
| Repository migrations not present in snapshot ledger | 42 |

The 9 same-name checksum mismatches are:

| Version | Migration |
|---|---|
| 20260911030000 | create_project_public_projection |
| 20260911210000 | reconcile_business_verification_state |
| 20260911211500 | reconcile_business_verification_default |
| 20260912030000 | grant_review_runtime_access |
| 20260914120000 | create_project_quote |
| 20260914130000 | reconcile_project_quote_transition_privilege |
| 20260914220000 | create_opportunity_capability_requirements |
| 20260915193000 | reconcile_commercial_payment_transaction |
| 20261005211000 | correct_founder_system_admin_bootstrap_existing_account |

The 10 ledger entries whose migration files are absent from the current repository are:

| Version | Migration |
|---|---|
| 20261016100000 | add_connect_identity_authority_contract |
| 20261016120000 | create_account_external_mapping |
| 20261016170000 | add_connect_directory_contract |
| 20261016180000 | extend_owner_managed_directory_profile |
| 20261016190000 | expose_authenticated_account_email |
| 20261018210000 | grant_runtime_account_profile_column_updates |
| 20261019190000 | create_business_engagement_events |
| 20261019210000 | create_business_registration_identity |
| 20261020130000 | create_quoteflow_migration_business_provisioning |
| 20261020140000 | reconcile_quoteflow_provisioning_verification_status |

The 42 repository migrations after the snapshot ledger are the 2026-11-10 through 2026-11-12 suffix already enumerated and source-reviewed in the earlier section of this handover. Their absence from a 2026-11-14 14:28 dump ledger is expected; it is not itself a mismatch.

### Interpretation and decision

- The archive is a strong candidate for reconstructing the production schema/ledger state represented by the 105-row snapshot, and is materially better evidence than the 2026-11-04 archive.
- It is **not yet a verified production-replay baseline**. Only 86/105 ledger entries match current migration source exactly. The nine modified-source checksums and ten missing source files prevent us from establishing the exact SQL history from current mainline alone.
- Do not overwrite or regenerate migration files to force checksum matches. Do not edit the ledger. Do not infer historical SQL from current migration contents.
- Next work is a targeted provenance recovery, not another broad audit: inspect existing Git branches, commit history, PR diffs and repository objects for the nine historical versions and ten missing migration files; recover candidate historical contents and verify each against the exact ledger checksum using the repository's normalization policy.
- For any migration whose exact historical source cannot be recovered and checksum-verified, retain it as unresolved. Do not claim an exact baseline or run the production-equivalent replay.
- Once all 105 entries are exact, separately qualify the archive's schema/object inventory and the 42-migration suffix on a disposable local PostgreSQL 18 instance only if an already-existing local instance is available and safe to use. Do not create a new paid or hosted database, revive the expired sandbox, or restore over an existing database.

### Safety / current status

- Archive TOC and ledger data were inspected/extracted only; no restore was run.
- No production database connection or SQL was used for this reconciliation.
- No production migration, data mutation, role/grant change, credential/secret change, Render environment change, deployment, allowlist change, PR merge or branch update was performed.
- November 14 archive baseline: **CANDIDATE — NOT YET VERIFIED**.
- Exact source reconciliation: **86 PASS / 9 checksum mismatches / 10 missing files**.
- Production-equivalent replay: **NOT RUN — historical migration provenance unresolved**.


## 2026-11-15 — targeted historical migration provenance recovery (in progress)

After recording the November 14 archive reconciliation, the next step was narrowed to the existing migration-provenance branches rather than rerunning the general migration audit.

### Existing branch inspection

- Inspected `construction/ghm-migration-checksum-line-ending-compatibility`, `fix/migration-provenance-reconciliation-20261109`, `fix/migration-bom-crlf-checksum-20261018`, and `fix/migration-audit-checksum-policy`.
- The nine checksum-mismatch migration files were present on the first two branches, but GitHub blob SHA and file contents were identical to current main for the five files directly compared. These branches therefore do not, by themselves, recover the ledger-recorded historical contents for those versions.
- `fix/migration-bom-crlf-checksum-20261018` contains five of the ten ledger-referenced files that are absent from current main:
  - `20261016100000_add_connect_identity_authority_contract.sql`
  - `20261016120000_create_account_external_mapping.sql`
  - `20261016170000_add_connect_directory_contract.sql`
  - `20261016180000_extend_owner_managed_directory_profile.sql`
  - `20261016190000_expose_authenticated_account_email.sql`
- The same branch did not contain the remaining five missing versions:
  - `20261018210000_grant_runtime_account_profile_column_updates.sql`
  - `20261019190000_create_business_engagement_events.sql`
  - `20261019210000_create_business_registration_identity.sql`
  - `20261020130000_create_quoteflow_migration_business_provisioning.sql`
  - `20261020140000_reconcile_quoteflow_provisioning_verification_status.sql`
- The five recovered candidate files have been located by path and blob SHA, but their normalized SHA-256 values have **not yet been verified against the corresponding 105-row snapshot ledger checksums**. Presence on a historical branch is not sufficient proof of provenance.
- No candidate historical file has been restored to main, copied into the working tree, or used to change any migration checksum.

### Next exact task

1. Compute each candidate file's normalized-LF and legacy-CRLF SHA-256 and compare with the exact ledger value.
2. Search the remaining historical branches, PR heads and commit history for the other five missing migration files.
3. For the nine same-name mismatches, search historical Git blobs/commits for the exact source whose normalized checksum matches the snapshot ledger. Current main copies are not accepted as substitutes.
4. Record per-version evidence (branch/ref, commit/blob, filename, normalized checksum, match result) before deciding whether the archive can qualify as an exact baseline.

This is a targeted provenance recovery task. Do not repeat the archive extraction, TOC inventory, 105-row count or 137-file count unless the archive or repository baseline changes.


## 2026-11-15 — exact checksum recovery of all ten missing historical migration files

The five files first located on `fix/migration-bom-crlf-checksum-20261018` and five files located on their respective historical feature/migration branches have now been checked using the repository's normalized-LF SHA-256 and legacy-CRLF SHA-256 rules against the exact 105-row archive ledger.

**All ten of ten missing migration files are now recovered and their normalized-LF SHA-256 exactly matches the archive ledger.** This closes the earlier “ledger row without repository file” category for this archive snapshot, but does not yet close the nine same-name checksum mismatches.

| Version | Historical source ref | Git blob | Ledger checksum |
|---|---|---|---|
| 20261016100000 | `fix/migration-bom-crlf-checksum-20261018` | `515f44712381d086294440a7d2fe84222daba0b3` | Exact LF match |
| 20261016120000 | `fix/migration-bom-crlf-checksum-20261018` | `57d5f499a57f72cfb7a9cd049aa4c55a923f694a` | Exact LF match |
| 20261016170000 | `fix/migration-bom-crlf-checksum-20261018` | `bd0af0b906a10d37a2566f28299d3e44201a5b92` | Exact LF match |
| 20261016180000 | `fix/migration-bom-crlf-checksum-20261018` | `5700437baab8860dd1ac913eebc9a4e0adc68708` | Exact LF match |
| 20261016190000 | `fix/migration-bom-crlf-checksum-20261018` | `520afa18eee7a53a7912e1156f565d59ae0178ae` | Exact LF match |
| 20261018210000 | `fix/runtime-account-profile-column-grants-20261018` | `6b276318d2bba5ef0a8174ee71972a7cbfc0735e` | Exact LF match |
| 20261019190000 | `migration/business-engagement-events-20261019` | `c83965ce74347cc7ca3799e9b0f3f4f9460dcd2d` | Exact LF match |
| 20261019210000 | `migration/ghm-business-registration-identity-20261019` | `c1c3e4d9b4148376109177cf3106aa3519e15df6` | Exact LF match |
| 20261020130000 | `feat/quoteflow-business-provisioning-20261020` | `620efa57ac35d494f1aa506f26a7ad810c821d9a` | Exact LF match |
| 20261020140000 | `fix/quoteflow-business-provisioning-canonical-status-20261020` | `ca266d14810c487affb5456bcaf151f731b245a4` | Exact LF match |

The historical source refs and blob SHAs above are provenance evidence only. The recovered contents have not been copied into main or rewritten into migration files.

### Nine same-name checksum mismatches — initial Git history search

The GitHub path history for all nine mismatched migration filenames was inspected. The commits returned by the path-history endpoint for the following files did not produce the ledger checksum when their file contents were hashed using the supported normalized-LF or legacy-CRLF rules. The current mainline files also remain non-matching, as already recorded. Therefore the first reachable path-history candidates are not accepted as the applied source:

- `20260911030000_create_project_public_projection.sql` — initial path commit `d35a49d456752bea4b9bc5f7a2132b4b1671d8f8`.
- `20260911210000_reconcile_business_verification_state.sql` — path commits `49b73b5e7867f2daeaefd20f365c58a35261bd95` and `15b756004032efa68a285a317abbf4714463dd83`; neither matched.
- `20260911211500_reconcile_business_verification_default.sql` — path commits `52792fa03f17ce137f088e0ff6ff9488cb7c6bbf`, `2c2fa6c735d1c7aebf6e99698e1b4647ca36a409`, and `2cc79eb5215161ab8083e12b09d2b0761e60b14a`; none matched.
- `20260912030000_grant_review_runtime_access.sql` — initial path commit `1f423f89bcc032425a3890bc0ffb04b97e094845); did not match.
- `20260914120000_create_project_quote.sql` and `20260914130000_reconcile_project_quote_transition_privilege.sql` — path commit `f2b041e27af6b2666d023794c296b2bd085a9c3e`; neither matched.
- `20260914220000_create_opportunity_capability_requirements.sql` — initial path commit `b03cd8ef82e38fe7b874ad6f443a78e9407ac5d4`; did not match.
- `20260915193000_reconcile_commercial_payment_transaction.sql` — initial path commit `bd0d13d0ec53b163b180d274fd2a56f37cf69a49`; did not match.
- `20261005211000_correct_founder_system_admin_bootstrap_existing_account.sql` — initial path commit `e9ed3a056ccc101b44babfe07be7b85e0933a540`; did not match.

This indicates the exact ledger-recorded source for these nine migrations is not present in the first commit snapshots returned by ordinary path history. Continue searching historical PR refs, earlier trees, alternate historical refs, and any preserved migration artifacts. Do not treat these initial commits as provenance matches.

### Updated reconciliation status

| Category | Previous | Current |
|---|---:|---:|
| Exact current repository filename + checksum matches | 86 | 86 |
| Same-name checksum mismatches | 9 | 9 |
| Ledger rows with no matching source file | 10 | 0 (all ten recovered and checksum-verified from historical refs) |
| Repository migrations after the snapshot | 42 | 42 |

The archive is closer to a reconstructable baseline: 96 of 105 ledger rows now have exact source provenance (86 current-main matches + 10 recovered historical matches). Nine remain unresolved. Do not yet certify the archive as a fully verified production-replay baseline or begin the replay.

No migration files were changed, no branches were updated, and no production database/Render operation was performed.


## 2026-11-15 — archive ledger fully classified against merged production provenance manifests

### Recheck of repository state before continuing

- Mainline at start of this continuation: `f5031ce70d269b067851f406176feb575d063ae4`.
- Open PRs rechecked: #282, #264, #244, #243, #233 and #201. No PR was merged or modified in this continuation.
- PR #239 (`fix/migration-provenance-reconciliation-20261109`) is **merged** into main (merged 2026-11-09 19:15:25Z). Its provenance manifests and policy are therefore canonical mainline records, not merely draft-branch proposals.
- Historical branch inventory was rechecked (173 branches across four API pages); existing migration, identity, project, QuoteFlow and founder branches were inspected before proceeding. No branch was created, pushed, or updated.
- Amanda's Render support conversation remains referenced in the preceding handover entries; this work did not change the support escalation or claim the role-membership issue is resolved.

### Exact 105-row snapshot classification

The November 14 archive's 105 ledger rows are now fully accounted for by the canonical mainline migration provenance policy:

| Classification | Count | Verification |
|---|---:|---|
| Current repository source matches exact ledger checksum | 86 | Direct normalized-LF / legacy-CRLF comparison |
| Historical applied checksum preserved as explicit exception | 9 | Every one of the nine exact ledger hashes appears under the same version in `config/historical-migration-provenance-exceptions.production.json` |
| Retained historical migration absent from active migration directory | 10 | Every version/name/checksum appears in `config/retained-historical-migrations.production.json` |
| Total snapshot ledger rows classified | **105** | 86 + 9 + 10 |

The nine historical exception versions are:

- `20260911030000`
- `20260911210000`
- `20260911211500`
- `20260912030000`
- `20260914120000`
- `20260914130000`
- `20260914220000`
- `20260915193000`
- `20261005211000`

The ten retained-history versions are the ten listed in the immediately preceding historical-source recovery section. All ten names and checksums in the production retained-history manifest exactly match the November 14 archive ledger.

**Important distinction:** the nine exception records preserve the exact historical applied checksums, but do not provide the original SQL bodies. Their status is `HISTORICAL_PROVENANCE_RETAINED`, not “historical SQL source recovered”. The ten retained-history entries preserve ledger provenance; five of their original SQL files were also independently located and checksum-verified on historical refs, while the production manifest is the canonical record used by the current migration audit. Do not copy retired historical files back into the active migration directory.

### Critical next gate — 42 repository files after snapshot vs production pending allowlist

The November 14 snapshot ledger ends at `20261109210000`. Current main has 42 migration files whose versions are absent from that snapshot ledger.

The current `config/pending-migrations.production.json` contains only seven entries:

- `20261110100000_create_account_onboarding_progress`
- `20261110120000_create_business_relationship_outcome_read_models`
- `20261110140000_allow_pending_storage_object_cleanup`
- `20261110210000_add_actor_gateway_principal_guard`
- `20261110220000_add_actor_gateway_self_identity_read`
- `20261110230000_add_gateway_business_registration_identity_read`
- `20261110233000_add_gateway_business_registration_identity_write`

Therefore 35 of the 42 post-snapshot repository migrations are **not named in the current production pending allowlist**. This is a release/readiness boundary, not a checksum discrepancy. The current production audit's `--allow-pending` logic requires the actual missing repository migrations to equal the allowlist exactly; it does not silently approve an arbitrary subset or automatically apply only those seven.

Before any replay or migration execution:
1. Reconcile the complete 42-file suffix against the already-recorded migration source review and existing PR/branch status; do not repeat the 42-file SQL review from scratch.
2. For each of the 35 not allowlisted, retain its existing status/reason (e.g. construction-only, not production-cutover-approved, or separately gated) from the prior source review. Do not add them to the allowlist merely to make counts match.
3. Verify that the seven allowlisted entries are still the intended production pre-deploy set for this archive baseline and that no intervening mainline/manifest change invalidates that selection.
4. Only then can a production-baseline replay plan be defined. The archive remains an inspected candidate dump; it has not been restored to a disposable database.

### Revised archive decision

- Ledger provenance classification: **PASS — all 105 rows accounted for by exact source match, explicit historical exception, or retained-history record**.
- Archive physical/schema equivalence to production: **NOT YET VERIFIED**; TOC/ledger inventory is not a restore test.
- Post-snapshot migration suffix: **42 files; only 7 in the production pending allowlist; 35 require existing readiness classification before any replay plan**.
- Production-equivalent PostgreSQL 18 replay: **NOT RUN**.
- No production SQL, restore, migration execution, Render change, deployment, role/grant/secret change, allowlist change, PR merge, or branch update was performed.

Do not repeat the November 14 archive extraction, TOC inventory, 105-row ledger extraction, 137-file count, nine-exception comparison, or ten-retained-history comparison unless the archive or mainline manifests change.


## 2026-11-15 — correction: November 14 archive is not the live production ledger baseline

This correction supersedes the earlier wording that described the November 14 archive as a strong candidate for the live production replay baseline. The row-count coincidence was insufficient and the two ledgers have different version histories.

### Authoritative live production audit evidence (read-only)

The user's earlier read-only audit against production `ghm_db` (2026-11-14 22:42:09Z) reported:

- Repository migration count at that audit's mainline: **102**.
- Live production ledger count: **105**.
- Missing/pending repository migrations: **7**, exactly matching the then-current production pending allowlist:
  - `20261110100000`
  - `20261110120000`
  - `20261110140000`
  - `20261110210000`
  - `20261110220000`
  - `20261110230000`
  - `20261110233000`
- Latest live production ledger version: **`20261020140000`**, applied at `2026-10-28T00:29:52.877Z`.
- Canonical checksum matches: 24; supported legacy-CRLF matches: 62; approved historical exception matches: 9.
- Approved retained historical rows: 10; total extra ledger rows: 10; all ten were approved retained history.
- Unrecognized extras: 0; unexplained checksum mismatches: 0; name mismatches: 0; invalid retained-history records: 0.
- Audit verdict: `PASS_WITH_PENDING`; the transaction was read-only and rolled back.

### November 14 archive ledger is different

The separately inspected archive `C:\Users\zaidh\Downloads\2026-11-14T14_26Z.dir.tar.gz` also has 105 ledger rows, but its last row is `20261109210000_deactivate_unrecognized_public_directory_records`, applied at `2026-11-09 20:50:23.763528+00`.

That differs from the live production audit's latest version `20261020140000` applied 2026-10-28. Therefore:

- The matching count of 105 rows **does not mean the archive ledger is the live production ledger**.
- The archive's 105-row ledger is not accepted as a production baseline or production-equivalent replay source.
- Its actual source/instance provenance is unresolved. Do not guess whether it came from sandbox, another environment, or another database instance based only on the database name `ghm_db`.
- Keep the archive and extracted files as forensic evidence only. Do not restore it over production or treat its ledger as the authoritative live ledger.
- The previous archive-specific 86 + 9 + 10 classification remains valid only for that archive's own ledger, not as a substitute for the live production ledger audit.

### Mainline has since expanded — pending allowlist is now stale relative to current source tree

After the 2026-11-14 22:42Z live audit, PR #272 and PR #276 were merged into main. They introduced the unified Actor Gateway / Authentication Issuer migration stack. PR #277 and #279 also merged. Current main at the time of this checkpoint has **137** migration files, versus 102 at the earlier production audit.

The 35 additional migration files introduced by the merged #272/#276 integration are not represented in the seven-entry production pending allowlist. The earlier seven pending entries remain part of the 42-file post-snapshot suffix. Thus the earlier `PASS_WITH_PENDING` result must not be reused as a current-main audit result.

- Current main migration files: 137.
- Earlier live audit's mainline migration files: 102.
- Current production pending allowlist: 7 entries.
- New migration source added by #272/#276 since that audit: 35 files.
- The current mainline/live-ledger comparison therefore needs a **fresh read-only audit on current main** before any release or replay decision. The actual pending set and allowlist match must be read from that fresh output; do not assume the older seven-item pass still applies.

### Migration executor safety finding — do not run migrations

The current #282 branch's proposed `src/db/migrate.ts`:
- loads all numbered SQL files from `database/migrations`;
- checks the historical checksum exception manifest;
- rejects an out-of-order missing migration only when a later migration version is already applied;
- then executes every remaining unapplied repository migration in ascending version order.

It does **not** read or enforce `config/pending-migrations.production.json`. Its ordering helper explicitly allows a contiguous append-only pending suffix. Therefore the seven-entry forensic audit allowlist is not an execution allowlist for `npm run migrate`.

With current main expanded to 137 migration files, running the migration executor before reconciling the current production pending set could execute migrations that have not been included in the seven-entry production allowlist. **Do not run `npm run migrate`, a Render deploy that invokes it, or any production SQL until the current-main read-only audit and the full migration release gate are reconciled.**

PR #282 remains open/unmerged. Its strict verified TLS and out-of-order guard are useful protections, but they do not solve production allowlist enforcement or authorize migration execution. No change to #282 was made in this checkpoint.

### Exact next step

1. Update the user's existing `C:\GHM-main` checkout to the latest `main` with a clean working tree and fast-forward only.
2. Run `npm run audit:migrations:predeploy` against the existing production `ghm_db` connection. This command uses the forensic audit's read-only transaction and rollback; it does not execute migrations.
3. Capture the complete JSON result, including repository count, live ledger count, missing list, pending allowlist match, approved retained history, historical matches, and verdict.
4. Compare that fresh current-main result with the 7-entry production pending allowlist and the already-reviewed #272/#276 migration set. Do not add the 35 files to the allowlist merely to force a pass.
5. Only after the exact pending set and release approvals are established should the migration executor be changed/reviewed to enforce the production allowlist at execution time.

### Current safety status

- November 14 archive as production baseline: **REJECTED / NOT VERIFIED**.
- Earlier live production audit: **PASS_WITH_PENDING at 102 repository files / 105 ledger rows / 7 pending**, valid only for that earlier mainline.
- Current mainline audit after #272/#276: **REQUIRED — NOT YET RUN**.
- Migration execution: **BLOCKED**.
- No archive restore, production migration, production write, Render environment change, deployment, role/grant/secret change, allowlist edit, PR merge, or branch update was performed.


## 2026-11-15 03:33Z — fresh current-main production migration audit

### Current checkout and audit execution

- Local `C:\GHM-main` was fast-forwarded from `cb4c8d27934a8f73c43194e791e7e3b01ed37262` to current main `bb1307e35270eda35b6c3d2301f4d09926bda326`.
- The untracked forensic backup `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak` was preserved. SHA-256 before and after fast-forward: `6D05EA92B1F3376C92C23526716B8D46866B72174382F2B7F806636083B668B9`.
- Audit was run from current main using the existing `C:\GHM\.env` via `DOTENV_CONFIG_PATH`; no credential value was printed.
- Command: `npm run audit:migrations:predeploy`.
- This is the forensic audit path, which opens a read-only transaction and rolls it back. No migration executor, SQL migration, restore, or production write was run.

### Fresh audit result and interpretation

- Verdict: **`INVESTIGATE`** (exit code 2).
- The current-main inventory remains **137 repository migration files**; the live ledger remains **105 rows**; the pending set is **42 migrations**.
- The pending list consists of the seven versions already present in `config/pending-migrations.production.json` plus the 35 migrations previously classified as not in the production pending allowlist.
- The first unallowlisted pending version is `20261110010000_add_business_supplier_classification`. This is not a newly discovered or unclassified migration: it is already listed as the first of the 35 unallowlisted migrations in the preceding inventory section.
- The allowlist currently contains exactly seven entries. The audit compares the complete sorted list of actual pending `{version,name}` pairs against the complete allowlist. `pending_allowlist_mismatch_count: 1` is a boolean mismatch indicator (one failed equality check), **not** a statement that only one migration is missing or unapproved.
- `pending_allowlist_match` is false, so the expected verdict is `INVESTIGATE`; do not add the 35 withheld migrations to the allowlist merely to force a pass.
- Audit output reports no unexplained checksum mismatches and no name mismatches. All ten retained historical ledger entries are `VERIFIED_RETAINED_HISTORY`; no unrecognized extra ledger rows are reported. Historical exception entries are classified as retained provenance or redundant, not unexplained checksum failures.
- The detailed pending list and the existing 35-item readiness review remain the authoritative inventory. Do not repeat the full SQL review without a specific evidence gap.

### PR and branch reconciliation for the newly visible first pending migration

- PR **#243** (`feat(directory): add governed supplier classification for Connect Marketplace`) is still **open/unmerged** on branch `feat/connect-marketplace-supplier-contract-ghm-20261110`.
- Its diff contains `20261110010000_add_business_supplier_classification.sql` and the associated supplier-classification implementation and qualification. The migration is therefore pending production work associated with an unmerged feature PR; it is not approved for production cutover by virtue of appearing on main.
- PR **#244** (Business engagement/Analytics) remains open and stacked on PR #243; it is not independently merge-ready until its dependency is resolved.
- PR **#282** remains open/unmerged. Its TLS and out-of-order protections do not enforce the production pending allowlist and do not authorize execution.
- Other open PRs rechecked: #264 (gateway registration identity documentation), #201 (QuoteFlow legal acceptance), and #233 (PayFast timezone handling). PayFast remains paused pending restored sandbox access; no PayFast action was taken.
- No branches were created or changed in this audit/reconciliation.

### Corrected current gate

- Current-main production ledger reconciliation: **completed read-only; `INVESTIGATE` because the exact pending set (42) does not equal the seven-entry production pending allowlist**.
- Migration checksum/history classification: no unexplained mismatches; retained historical ledger rows verified.
- Production migration execution, Render deployment invoking migrations, production SQL, archive restore, and allowlist changes: **BLOCKED**.
- Next work is to preserve the existing 35-migration readiness classifications and reconcile the seven-entry allowlist's intended scope against the 42 actual pending migrations. The executor must enforce an explicit production release gate before any migration execution; the forensic allowlist alone is not an execution gate.
- Existing Render support escalation and Amanda's guidance on production role-membership authority remain unchanged. The `ghm_db_user` sensitive-role ADMIN OPTION issue remains unresolved; this audit did not alter or re-test role memberships.


---

## Backup inventory and archive-candidate triage — 2026-11-15 03:39 UTC

A user-run, non-destructive local inventory was completed. No backup was restored, no database was opened for mutation, and no production connection or deployment was used.

### Verified local file metadata

| Artifact | Size | Last modified | Signature / classification | Disposition |
|---|---:|---|---|---|
| `C:\Users\zaidh\Downloads\2026-11-04T20_42Zghm-db.dir.tar.gz` | 71,488 bytes | 2026-11-04 22:46:02 | gzip signature `1F-8B-08` | GHM archive candidate; inspect archive structure and embedded ledger metadata only. Not yet established as a production-equivalent baseline. |
| `C:\Users\zaidh\Downloads\2026-11-14T14_26Z.dir.tar.gz` | 81,507 bytes | 2026-11-14 16:35:39 | gzip signature `1F-8B-08` | Previously inspected; ledger endpoint differs from live production audit; forensic evidence only, not production baseline. |
| `C:\Users\zaidh\Downloads\db_cluster-23-09-2026@08-37-12-quoteflow.backup.gz` | 60,536 bytes | 2026-10-18 23:59:46 | gzip signature `1F-8B-08` | Filename identifies QuoteFlow; not evidence of GHM production baseline. |
| `C:\Users\zaidh\Downloads\db_cluster-23-09-2026@08-37-26.backup.gz` | 228,100 bytes | 2026-10-12 02:30:15 | gzip signature `1F-8B-08` | Database identity and contents unknown; inspect archive metadata before assigning relevance. |
| `C:\GHM\ghm.db` | 20,480 bytes | 2026-09-08 05:44:58 | SQLite header `SQLite format 3` | Not a PostgreSQL backup. |
| `C:\GHM-main\ghm.db` | 20,480 bytes | 2026-10-24 16:13:52 | SQLite header `SQLite format 3` | Not a PostgreSQL backup. |
| `C:\Users\zaidh\Desktop\QuoteFlow-RKStorage-backup` | 20,480 bytes | 2026-10-30 02:06:09 | SQLite header `SQLite format 3` | File, not directory; not a PostgreSQL backup. |

The earlier recursive inventory also found configuration backup files under `C:\GHM`. These are sensitive environment/configuration artifacts, not database backups. Do not print their contents, commit them, or use them as a database recovery source.

### Backup search result

- The November 4 GHM archive is the next candidate for read-only archive-structure and ledger inspection.
- The October 12 compressed archive is a secondary unknown candidate; first identify its archive format/database metadata before treating it as relevant.
- The September QuoteFlow archive is outside the GHM production-baseline question.
- The November 14 archive remains excluded as a production baseline because its 105-row ledger ended at `20261109210000`, while the live production read-only audit reported 105 rows ending at `20261020140000`. Equal row counts do not establish equivalent database state.
- The user-reported `QuoteFlow-RKStorage-backup` path resolves to a 20 KB SQLite file, not a directory. No directory contents were inspected.

### Repository / PR / branch recheck before handover update

The canonical handover was fetched from current `main` before this append (blob SHA `e3db71ef2dfdfe5399a82e40c14084021de4fcea`). Current PR metadata rechecked:

- #243 remains open, unmerged; supplier-classification work. Its branch is `feat/connect-marketplace-supplier-contract-ghm-20261110`.
- #244 remains open, unmerged, stacked on #243; Business engagement / Analytics.
- #282 remains open, unmerged; migration runner TLS/out-of-order guard. It is not a substitute for the production pending-migration allowlist gate.
- #264 remains open, unmerged; gateway registration identity documentation.
- #201 remains open, unmerged; QuoteFlow legal acceptance. Legal documents remain paused.
- #233 remains open, unmerged; PayFast timezone handling. PayFast remains paused pending restored sandbox access.
- #270 is closed without merge; unified Actor Gateway integration PR #272 is merged.
- #272, #276, #277 and #279 are merged.
- Existing construction, docs, feature and fix branches were inventoried from GitHub; no branch was created, deleted, rebased or modified during this check.

Current open-PR search snapshot (GitHub search, repository-scoped) is recorded in the session evidence. Relevant PRs above were individually checked for state, head/base branch and SHA. Do not treat a branch's existence as authorization to merge or deploy it.

### Next safe action

Inspect the November 4 archive without restoring it: list its gzip/tar contents, identify PostgreSQL directory-archive metadata and TOC, and if present extract only the migration-ledger data to a temporary inspection file. Compare its database identity, snapshot timestamp, ledger count, final version and checksums against the live production audit. No restore, `pg_restore` into a database, production write, migration, deployment, role change, or allowlist change is authorized.



## November 4 archive structure inspection — 2026-11-15 03:41 UTC

User synchronized local `C:\GHM-main` to handover commit `1ac606ef848d223bb056d733a55ceb51f116b9c1`; worktree remained `main...origin/main` with only the previously preserved untracked file `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak`. Its contents were not changed.

The attempted `gzip -t` check did not execute because `gzip` is not installed/on PATH in the user's PowerShell environment. This is a tooling absence, not an archive integrity failure. Windows `tar -tzvf` successfully listed the gzip-wrapped archive contents.

Archive inspected by listing only:
`C:\Users\zaidh\Downloads\2026-11-04T20_42Zghm-db.dir.tar.gz`

Observed structure:
- Root `./2026-11-04T20:42Z/`
- Database directory `./2026-11-04T20:42Z/ghm_db/`
- PostgreSQL directory-archive TOC at `./2026-11-04T20:42Z/ghm_db/toc.dat`, size 432,907 bytes
- Numerous numbered `.dat` members alongside `toc.dat`
- Tar listing timestamps shown as Nov 04 22:44

This is strong evidence that the November 4 artifact is a gzip-wrapped tar containing a PostgreSQL directory-format archive for database `ghm_db`. It remains only a candidate: the TOC must be read with PostgreSQL's `pg_restore --list` (no database connection) to establish archive metadata, dump version, database name, and whether the migration ledger table/data are present. The ledger data itself must then be inspected from a temporary local extraction/stream, without restoring to any database. Compare its row count, latest version, timestamps and checksums against the live read-only production audit before deciding whether it can represent a useful historical baseline.

No archive extraction to a database, `pg_restore` execution against a database, production SQL, migration, deployment, role change, or pending-allowlist change occurred. No backup file was modified.


## November 4 archive ledger comparison — 2026-11-15 03:48 UTC

### Targeted extraction result

The November 4 wrapped archive was inspected locally only. The outer tar contains a nested PostgreSQL directory-format archive at:

`C:\Users\zaidh\AppData\Local\Temp\GHM-Nov04-Archive-Inspection\2026-11-04T20:42Z\ghm_db`

The archive TOC includes table-data entry `4678; 0 16789 TABLE DATA ghm ghm_schema_migrations ghm_schema_owner`.

The first targeted extraction used a combined `--table=ghm.ghm_schema_migrations` selector and produced a 720-byte header-only SQL file. That file was retained as forensic evidence; it was not interpreted as ledger data. A corrected extraction using separate `--schema=ghm` and `--table=ghm_schema_migrations` selectors succeeded. The resulting local SQL file is:

`C:\Users\zaidh\AppData\Local\Temp\GHM-Nov04-Archive-Inspection\ghm-schema-migrations-data-v2.sql`

It is 13,977 bytes and contains a PostgreSQL COPY block for columns `version`, `name`, `checksum`, and `applied_at`. No SQL was executed and no database was restored.

### Parsed archive ledger

The COPY data was parsed locally after correcting the PowerShell parser to remove quoted identifiers from the COPY header. Result:

- Rows: **89**.
- Blank version values: **0**.
- Duplicate version groups: **0**.
- Earliest version: `00000000000000` (`create_migration_ledger`).
- Latest version: **`20261026120000`** (`scope_storage_metadata_lookup`).
- Latest `applied_at`: `2026-10-28 00:29:53.60121+00`.

### Comparison with live production read-only audit

The 2026-11-15 03:33Z live production audit recorded **105 rows**, latest version **`20261020140000`**, applied at `2026-10-28T00:29:52.877Z`.

The November 4 archive therefore has **16 fewer rows** than the live production ledger but contains a version later than the live production endpoint. Its latest applied timestamp is also approximately 0.724 seconds later than the live endpoint's latest timestamp. These are material differences.

**Disposition: November 4 archive is NOT VERIFIED as a production baseline or production-equivalent replay source.** Do not infer that it represents live production from the database name `ghm_db`, the archive date, or shared ledger entries. Its provenance remains unresolved. Preserve it as forensic evidence only. Do not restore it to production or any other database as part of this investigation.

A full row-by-row comparison of all 89 archive entries against the live 105-row ledger has not yet been completed. The endpoint comparison is sufficient to reject the archive as an exact production-ledger match; it is not sufficient to classify every row-level difference.

### Repository / PR / branch recheck before this handover update

The canonical handover was fetched from current `main` at blob SHA `3ca0b606746b4484b803d2aa30361a9a61de7433` before this append. The repository-scoped open-PR search and individual PR metadata checks confirmed:

- #282 open, non-draft; head `fix/migration-runner-strict-tls-20261115`, head SHA `5e13c479c79e7e9518a0b78445eae927812682b5`.
- #243 open, draft; head `feat/connect-marketplace-supplier-contract-ghm-20261110`, head SHA `1246ed74a81b3fc607e6f65f3cd8036bc081ab1b`.
- #244 open, draft and stacked on #243; head `feat/ghm-business-analytics-engagement-20261110`, head SHA `f418407bface1146e4cf0147424fb91bff81328a`.
- #264 open, non-draft; head `docs/gateway-registration-identity-checkpoint-20261110`, head SHA `b2f7f1d514dd380db1579c907cf06efa9ff48fa1`.
- #201 open, draft; head `feature/quoteflow-legal-acceptance-20261030`, head SHA `dd0cfb5bb5564b0d7fb560530533fd77a4573d5a`.
- #233 open, draft; head `fix/payfast-payment-date-timezone-20261108`, head SHA `ea028a20967b686e90ea0fbe451a8e4b9dee57ef`.

Branch searches also confirmed the existence of relevant migration-audit/allowlist branches (`fix/exact-production-pending-migration-allowlist`, `fix/migration-audit-ssl-url-override-20261115`, `fix/production-migration-audit-tls-verification-20261115`, and `fix/migration-runner-strict-tls-20261115`), plus the existing Actor Gateway, supplier-classification and Analytics branches. No branch was created, deleted, rebased, or modified during this inspection. Branch existence alone is not approval to merge or deploy.

### Render support / role-separation continuity

The existing Amanda support record and her confirmation remain the governing support context: retain the Dashboard-managed default credential for controlled administration and use SQL-created restricted login identities for normal application execution. This archive inspection did not alter or re-test any production role, membership, credential, service environment variable, or deployment. The sensitive-role ADMIN OPTION concern remains unresolved and the role-separation cutover remains unstarted.

### Current gates after this inspection

- November 4 archive as exact production baseline: **REJECTED / NOT VERIFIED**.
- November 14 archive as exact production baseline: **REJECTED / NOT VERIFIED** (prior evidence unchanged).
- Live production ledger: **105 rows / latest `20261020140000`**, based on the 2026-11-15 03:33Z read-only audit.
- November 4 archive ledger: **89 rows / latest `20261026120000`**.
- Production migration execution, archive restore, production SQL writes, role/grant/secret changes, Render environment changes, deployments and allowlist edits: **BLOCKED**.
- Next safe work: find and verify the provenance of a backup that actually matches the live production state, or produce a complete read-only row-level comparison using a fresh live ledger export. Do not repeat the archive extraction or source review already completed.


## 2026-11-15 03:55Z — user-confirmed legacy Supabase archive classification

### Provenance clarification from the owner

The user explicitly confirmed that the PostgreSQL cluster archives in this local backup group were created by the user as backups from the legacy Supabase environment, because access to the old Supabase account was no longer available. This is direct owner-provided provenance and supersedes the earlier uncertainty that treated these cluster dumps as possible Render `ghm-db` recovery candidates.

In particular, the inspected file:

`C:\\Users\\zaidh\\Downloads\\db_cluster-23-09-2026@08-37-26.backup.gz`

is classified as a **legacy Supabase cluster backup**, not a Render `ghm-db` production backup candidate. The user also identifies the related September 23 cluster archive(s) from this recovery batch as legacy Supabase backups. The separate filename containing `quoteflow` remains labelled as a QuoteFlow-related legacy archive by filename; its internal database identity was not independently inspected in this step.

### October 12 archive — technical observations retained

The metadata-only scan of `db_cluster-23-09-2026@08-37-26.backup.gz` established:

- File size: 228,100 bytes.
- Last modified: 2026-10-12 02:30:15.
- Gzip signature: `1F 8B 08`.
- Decompressed header: PostgreSQL database cluster dump.
- Source PostgreSQL version: 17.6.
- Database markers found: `postgres` and `template1`.
- No `ghm.ghm_schema_migrations` COPY block was found.
- No files were extracted, no SQL was executed, and no database was restored.

The two database markers do not establish the full set of databases represented in the source Supabase project; they are simply the only database markers observed by this bounded scan. The user's direct provenance confirmation is the basis for classifying this file as legacy Supabase material.

### Corrected backup-investigation scope

- Legacy Supabase cluster archives are preserved as recovery/reference material for the former Supabase-backed Connect and QuoteFlow environment.
- They are **not** to be treated as Render `ghm-db` production-baseline candidates and should not be repeatedly inspected for a GHM production migration ledger.
- The November 4 and November 14 GHM-named archives remain separately classified with their existing evidence and unresolved provenance. The user's confirmation about the legacy Supabase cluster backup batch does not automatically reclassify those separately named GHM archives.
- The Render production backup investigation must focus only on artifacts demonstrably created from the Render `ghm-db` service / `ghm_db` database, using source metadata, backup provenance, and a matching production ledger/schema state.
- Do not restore any archive, start or stop a service, create a database, or spend money to recover the expired sandbox.

### Repository / PR / branch recheck before this addendum

The canonical handover was fetched from the repository default branch before appending this entry. The current open work rechecked in this continuation includes #282 (migration runner strict TLS/order guard), #243 (supplier classification), #244 (stacked Business Analytics), #264 (gateway registration identity documentation), #201 (QuoteFlow legal acceptance), and #233 (PayFast timezone handling). These remain open; none was merged or modified by this backup-provenance clarification. Existing migration, Supabase, Render and backup branch searches were performed; no branch was created, deleted, rebased, or updated.

Amanda's Render support conversation remains preserved earlier in this handover. Her recommendation remains to retain the Dashboard-managed default credential for controlled administration and use SQL-created restricted login identities for normal application execution. The production role-membership concern remains unresolved; this archive classification did not change or re-test it.

### Status

- October 12 cluster dump provenance: **USER-CONFIRMED LEGACY SUPABASE BACKUP**.
- September 23 cluster archive batch provenance: **USER-CONFIRMED LEGACY SUPABASE BACKUPS**; the QuoteFlow-labelled file's internal DB identity remains uninspected.
- Render `ghm-db` production backup discovery: **STILL OPEN**.
- No restore, SQL execution, production connection, database mutation, Render change, migration, deployment, branch update, or allowlist change occurred.


## 2026-11-15 03:58Z — Render production database inventory and backup-discovery route

### Local synchronization confirmation

The user fast-forwarded `C:\\GHM-main` to `fa57881f` (`fa57881fb8a37c09c51f6ea8872cdf0575ded998`), matching `origin/main`. The preserved untracked forensic file remains present; the user-reported SHA-256 prefix matches the previously recorded full hash `6D05EA92B1F3376C92C23526716B8D46866B72174382F2B7F806636083B668B9`. Do not alter or commit it.

### Live Render workspace/database inventory (read-only connector inspection)

Workspace: `ZAID Technologies` (`tea-d9svua6417fc73bhcutg`).

The Render account's current Postgres inventory returned:

| Render resource | Database | Status | Created | Plan / version | Finding |
|---|---|---|---|---|---|
| `ghm-db` | `ghm_db` | Available, not suspended | 2026-09-08 | `0.1c-256mb`, PostgreSQL 18, Frankfurt | Current production target |
| `ghm-payfast-sandbox-db` | `ghm_payfast_sandbox_db` | Suspended (billing) | 2026-10-09 | Free, PostgreSQL 18 | Expired sandbox; do not revive |
| `ghm-identity-qualification-20261018` | `ghm_identity_qualification_20261018` | Available | 2026-10-18 | `basic_256mb`, PostgreSQL 18 | Separate qualification database, not production |

The production resource ID is `dpg-dag0sdtbedkc7389vi2g-a`; dashboard:
`https://dashboard.render.com/d/dpg-dag0sdtbedkc7389vi2g-a`.

The production database metadata confirms the target is available, PostgreSQL 18, Frankfurt, 1 GB disk, plan `0.1c-256mb`, and was created 2026-09-08. This is resource metadata, not proof of any particular backup's source or contents. The connector's Postgres detail endpoint returned no export list, recovery-window metadata, or backup filenames. No restore/export/recovery action was triggered.

### Important Render backup-format/provenance clarification

Render's current official documentation describes logical exports as compressed directory archives named with a UTC timestamp, typically `YYYY-MM-DDTHH_MMZ.dir.tar.gz`, created from the database's **Recovery** page using **Create export**. Render retains these logical exports for seven days after creation. Paid Postgres also has point-in-time recovery, with a short rolling recovery window; PITR creates a separate recovery database and is not a way to recover arbitrary September/October states today. See:
- Render Postgres recovery and backups: https://render.com/docs/postgresql-backups
- Render Postgres backup/recovery tutorial: https://render.com/tutorials/postgres-on-render/backups-and-pitr

The filename shape of the November 14 artifact `2026-11-14T14_26Z.dir.tar.gz` is consistent with Render's documented logical-export naming convention, but this alone does **not** prove it came from `ghm-db`. Its ledger mismatch against the earlier read-only live production audit remains unresolved. The November 4 GHM-named archive also remains unverified as to source database. Do not label either archive a Render production backup until its export listing/provenance and ledger/schema are reconciled.

The current account inventory plus the documented retention policy imply that older logical exports may no longer appear in Render's Recovery export list after seven days; any previously downloaded local files remain available for forensic inspection. PITR retention is only a few days (workspace-plan dependent), so it cannot recreate the September/October historical backup state now. No plan upgrade or paid resource creation is proposed.

### Next precise user-side inspection — no restore and no export creation

The only missing source-of-truth evidence is the existing Recovery-page export listing for `ghm-db`. User should open the production database dashboard link above, select **Recovery**, and inspect the existing logical export table only. Do **not** click **Create export**, **Restore Database**, or any recovery action.

Record/paste only:
- Existing export filename(s) and UTC timestamp(s), if any.
- Any displayed status or creation timestamp.
- Whether the page shows a PITR recovery window and its earliest/latest available timestamps (metadata only).

Do not share connection strings, passwords, database URLs, or secret values. If no exports appear, report that; do not create one as part of this forensic search. Once the listing is known, compare exact filenames/timestamps to the already inspected local November 4 and November 14 files. If a match is identified, verify its archive TOC and ledger against the authoritative production read-only audit before considering any replay. No restore is authorized.

### PR and branch recheck before this handover append

Open PRs individually rechecked: #282, #243, #244, #264, #201, and #233 remain open. Relevant existing migration/Render branches were searched again; no branch was created, deleted, rebased, pushed, or updated. No PR was merged or changed.

Amanda's Render support conversation and her guidance remain preserved above. The sensitive-role ADMIN OPTION issue remains unresolved and was not modified or re-tested during this inventory.

### Safety/status

- Render production resource identity: **CONFIRMED** (`ghm-db` / `ghm_db`, PostgreSQL 18, Frankfurt).
- Render logical export provenance for November 4 / November 14 artifacts: **NOT CONFIRMED**.
- Legacy Supabase cluster archives: **USER-CONFIRMED LEGACY SUPABASE**, excluded from Render production-backup search.
- Existing Render Recovery export listing: **NOT YET INSPECTED**.
- No export created, no PITR initiated, no restore, no SQL query, no database mutation, no service/environment change, no migration, no deployment, no credential change, and no branch/PR change occurred.


## 2026-11-15 04:01Z — owner recollection and Recovery-page confirmation for November 4 export

### Current Render Recovery page — user-provided evidence

The user inspected the Recovery page for production `ghm-db` and supplied:
- Point-in-Time Recovery permits restore from any timestamp in the past **3 days**.
- A Pro workspace would increase the recovery window to 7 days. No upgrade is authorized or proposed.
- Logical exports are retained for **at least 7 days**.
- The current export listing contains one item: created **November 14, 2026 at 4:26 PM**, suffix `.dir.tar.gz`.
- No restore, export creation, upgrade, or other Recovery action was performed.

### November 4 export — owner recollection and local artifact correlation

The user is confident that a logical export was also created from this Render `ghm-db` Recovery page on **November 4, 2026**. This owner recollection is recorded as evidence of the export event. The current page's seven-day minimum retention explains why a November 4 item would no longer necessarily appear in the November 15 listing; its absence is not evidence that it was never created.

A local file already inspected earlier has the matching Render logical-export filename shape and timestamp:
`C:\\Users\\zaidh\\Downloads\\2026-11-04T20_42Zghm-db.dir.tar.gz`
Its embedded timestamp is 20:42Z on November 4. This is a **strong candidate for the November 4 Render ghm-db export**. The Recovery page no longer exposes its original row, so the exact association cannot be independently re-opened from Render.

The archive's TOC was readable, but its extracted migration ledger had 89 rows and latest version `20261026120000`, whereas the subsequent read-only live production audit reported 105 rows and latest version `20261020140000`. This mismatch means the archive is **not accepted as an exact replay baseline for the current live production database**. The discrepancy must be reconciled; do not restore it.

### Updated classification

- November 4 local GHM archive: **STRONG CANDIDATE — USER-RECALLED RENDER EXPORT; CONTENT/BASELINE MISMATCH UNRESOLVED**.
- November 14 local GHM archive: **LIKELY MATCH TO THE CURRENTLY LISTED NOVEMBER 14 EXPORT BY FILENAME/TIMESTAMP SHAPE; LIVE LEDGER MISMATCH STILL REQUIRES RECONCILIATION**.
- October 12 / September 23 cluster archives: **USER-CONFIRMED LEGACY SUPABASE**, not Render production candidates.
- PITR availability shown November 15: **3 days**, not 7; do not upgrade.

### Next investigation

Do not create another export or restore either candidate. The next useful work is a read-only forensic comparison of the November 4 archive's full migration-ledger rows against the live production audit output already obtained, then check its TOC for database/schema/object inventory and export metadata. Keep the archive immutable. If equivalence cannot be established, it remains historical evidence only, not a production replay source.

### Repository / PR / branch check before this addendum

The canonical handover was fetched from the default branch immediately before this append. Open PRs and existing migration/backup branches were rechecked; no backup branch was found. No PR/branch was created, deleted, rebased, or changed. Amanda's Render support context and the unresolved database-role ADMIN OPTION issue remain preserved and unchanged.

### Safety

No Render upgrade, new resource, export creation, PITR, restore, SQL execution, database mutation, migration, deployment, environment/credential change, or branch/PR mutation occurred.


## 2026-11-15 15:48Z — November 4 Render archive vs live production ledger comparison

### Exact comparison result

A complete read-only row-by-row comparison was run using the extracted ledger from:

`C:\\Users\\zaidh\\AppData\\Local\\Temp\\GHM-Nov04-Archive-Inspection\\ghm-schema-migrations-data-v2.sql`

The live side connected to Render production `ghm_db` using `GHM_MIGRATOR_DATABASE_URL`, with TLS certificate verification enabled. The transaction began with `BEGIN READ ONLY`, verified `session_user=ghm_migrator`, `current_user=ghm_migrator`, database `ghm_db`, and ability to set role `ghm_schema_owner`; after `SET ROLE ghm_schema_owner`, it verified `current_user=ghm_schema_owner`, `session_user=ghm_migrator`, and `transaction_read_only=on`. It selected only the migration ledger and rolled back. After rollback, the connection identity returned to `ghm_migrator` / `ghm_migrator` on `ghm_db`. The reported `transaction_read_only=off` after rollback is expected because it is outside the read-only transaction; it does not indicate that the comparison transaction was writable.

No production writes, migrations, restores, role/grant changes, credential changes, environment changes, or deployments occurred.

| Measure | November 4 archive | Live production |
|---|---:|---:|
| Ledger rows | 89 | 105 |
| First version | `00000000000000` | `00000000000000` |
| First name | `create_migration_ledger` | `create_migration_ledger` |
| Last version | `20261026120000` | `20261109210000` |
| Last name | `scope_storage_metadata_lookup` | `deactivate_unrecognized_public_directory_records` |

Comparison:
- Shared versions: **89**
- Archive-only versions: **0**
- Live-only versions: **16**
- Shared-version name differences: **0**
- Shared-version checksum differences: **0**
- Shared-version applied_at differences: **0**

All 89 archive rows exist in live production with exact name, checksum and timestamp equality. The 16 additional live rows are:

| Version | Migration | Live applied_at |
|---|---|---|
| `20261104120000` | `bind_commercial_payment_attempt_provider` | `2026-11-09 20:04:06.429899+00` |
| `20261104130000` | `isolate_payfast_settlement_identity` | `2026-11-09 20:04:06.429899+00` |
| `20261105190000` | `extend_business_directory_location_contact` | `2026-11-09 20:04:06.429899+00` |
| `20261105213000` | `create_business_capability_evidence` | `2026-11-09 20:04:06.429899+00` |
| `20261105220000` | `replace_business_capability_assertions` | `2026-11-09 20:04:06.429899+00` |
| `20261105230000` | `create_founder_directory_review` | `2026-11-09 20:04:06.429899+00` |
| `20261106090000` | `business_logo_storage_binding` | `2026-11-09 20:04:06.429899+00` |
| `20261106200000` | `link_project_to_opportunity` | `2026-11-09 20:04:06.429899+00` |
| `20261107211500` | `reconcile_business_profile_and_founder_authority` | `2026-11-09 20:04:06.429899+00` |
| `20261108150000` | `reconcile_business_registration_identity_authorization` | `2026-11-09 20:04:06.429899+00` |
| `20261109100000` | `persist_business_profile_presentation_fields` | `2026-11-09 20:04:06.429899+00` |
| `20261109110000` | `reconcile_capability_evidence_pending_state` | `2026-11-09 20:04:06.429899+00` |
| `20261109120000` | `serialize_business_capability_assertion_replacement` | `2026-11-09 20:04:06.429899+00` |
| `20261109130000` | `harden_evidence_and_founder_review_authority` | `2026-11-09 20:04:06.429899+00` |
| `20261109140000` | `close_evidence_and_founder_review_authority` | `2026-11-09 20:04:06.429899+00` |
| `20261109210000` | `deactivate_unrecognized_public_directory_records` | `2026-11-09 20:50:23.763528+00` |

### Provenance and recovery-baseline disposition

This comparison materially strengthens the earlier provenance evidence: the user recalled creating the November 4 logical export from the Render `ghm-db` Recovery page, and all 89 ledger rows in the local archive match the live production ledger exactly, while the live ledger has 16 later additions. The archive is therefore consistent with an earlier state of the same production migration history, not a divergent migration history.

Classification is updated to:

**November 4 archive — STRONG, OWNER-RECALLED RENDER `ghm-db` EXPORT CANDIDATE; MIGRATION-LEDGER HISTORY MATCHES LIVE PRODUCTION FOR ALL 89 SHARED VERSIONS; ARCHIVE IS AN OLDER 89-ROW STATE, NOT THE CURRENT 105-ROW STATE.**

This is not yet proof that the archive's complete schema/data contents are a safe current restore baseline. Do not restore it, use it to overwrite production, or treat it as a current-state backup. It is a useful historical recovery artifact whose migration ledger is consistent with production through its captured point. A full archive object/data comparison is a separate task and is not authorized by this result.

### Correction to earlier handover audit summary

An earlier 2026-11-15 audit note recorded 105 live rows with latest version `20261020140000`. The direct production ledger query in this comparison returned 105 rows with latest version `20261109210000`. The row count agrees, but the latest-version field conflicts. The direct query's complete ledger endpoint is the newer evidence for this comparison; the prior audit summary must be treated as stale or internally inconsistent until the forensic audit script is rerun and its output reconciled. Do not rely on the earlier latest-version value or its derived pending count without that reconciliation. This comparison does not itself rerun the repository-wide migration audit and does not authorize any pending migration.

### PR and branch inspection before this handover update

The canonical handover was fetched from the default branch immediately before this update (blob SHA `e64298d5e9d04a64e0d96a8c3bbbd60ddb97e22f`). Open PR search returned six open items: #282 (verified TLS/fail-closed migration ordering), #243 (supplier classification, with its own recorded Actor Gateway integration dependency), #264 (gateway registration identity documentation), #201 (QuoteFlow legal acceptance), #233 (PayFast timezone handling), and #244 (stacked Business engagement/Analytics). Their recorded merge/release/security gates remain in force; this archive comparison does not close or override any of them.

Existing migration, Actor Gateway and mainline branch searches were rechecked. Results included the existing strict-TLS / migration-audit branches, existing Actor Gateway/security branches, and `main`; a backup-named branch search returned none. Search pagination was exhausted for the returned migration/actor/main result sets. No branch or PR was created, deleted, rebased, pushed, merged, or modified as part of this comparison.

### Amanda support / role-separation continuity

Amanda's Render support conversation remains preserved in this handover. Her confirmed recommendation remains: retain the Dashboard-managed default credential for controlled administration and use SQL-created restricted login identities for normal application execution. The sensitive-role ADMIN OPTION concern remains unresolved and was not tested or changed in this archive comparison.

### Status after this comparison

- November 4 archive ledger integrity: **PASS — 89 rows, complete COPY block, no duplicate versions**.
- Shared archive/live migration identity: **PASS — 89/89 exact version/name/checksum/applied_at matches**.
- Archive-only versions: **0**.
- Live-only versions: **16**, all listed above.
- November 4 archive as exact current production state: **NO — it predates the 16 later ledger entries**.
- November 4 archive as historical production recovery evidence: **STRONGLY SUPPORTED; full schema/data restore suitability not established**.
- Earlier live audit latest-version summary: **REQUIRES RECONCILIATION** against direct live ledger query.
- Production migration execution, restore, role/grant changes, credential/environment changes, deployments and allowlist edits: **NOT AUTHORIZED / NOT PERFORMED**.

### Next safe step

Re-run the repository's read-only production migration audit against the same verified `ghm_db` target and compare its complete ledger endpoint with the direct 105-row query. Resolve why its earlier summary reported latest version `20261020140000` before using any pending-migration count or deciding on the migration-runner gate. Keep the November 4 archive immutable and do not restore it.


## 2026-11-15 15:55Z — Reconciliation of forensic audit endpoint and archive comparison

### Correct interpretation of the earlier audit output

The earlier handover wording that described `20261020140000` as the latest live production ledger version was incorrect. The value was taken from the final entry in the audit's `extra` / retained-history classification, not from the full ordered production ledger.

The forensic audit script `scripts/forensic-migration-reconciliation.mjs` does not emit a `latest_row` or ledger endpoint field. It reports repository migrations, pending migrations, and live ledger entries that are not present in the current repository. Its `extra` array is therefore not a complete ordered ledger and its final element must not be described as the latest production migration.

The independent direct read-only query is the authoritative endpoint evidence:
- Live production ledger rows: **105**.
- First version: `00000000000000` / `create_migration_ledger`.
- Latest version: **`20261109210000`** / `deactivate_unrecognized_public_directory_records`.
- Latest applied_at: `2026-11-09 20:50:23.763528+00`.
- All 105 versions are strictly increasing.
- Connection identity before role switch: `ghm_migrator` / `ghm_migrator`, database `ghm_db`.
- Comparison identity after role switch: `ghm_schema_owner` / `ghm_migrator`.
- `transaction_read_only=on` before and after `SET ROLE`; rollback completed and connection returned to `ghm_migrator`.

### Reconciliation of counts

The repository audit result and direct ledger endpoint are not contradictory:
- The audit reports **105 live ledger rows**, **10 retained historical extras** not represented as current repository migration files, and **42 current repository migrations missing from the live ledger**.
- The 10 retained historical extras include `20261020140000`; this is the final row in that *filtered extras list*, not the latest live ledger version.
- The arithmetic is consistent: 105 live rows minus 10 retained historical extras = 95 repository migration versions already represented in the ledger; 137 repository migration files minus 95 represented versions = 42 pending repository migrations.
- The 42 pending migrations comprise the 7 already listed in `config/pending-migrations.production.json` plus 35 additional migrations not covered by that allowlist.
- The audit's `pending_allowlist_mismatch_count: 1` is a boolean mismatch indicator (one mismatch condition), not a count of missing migrations.
- No checksum mismatches, name mismatches, unexplained extra ledger rows, or invalid retained-history entries were reported in the supplied audit output.

This resolves the apparent latest-version discrepancy as a **handover interpretation error**, not a production ledger inconsistency. The production migration audit verdict remains **INVESTIGATE** because the pending set does not match the seven-entry allowlist. Do not add the 35 additional migrations to the allowlist merely to obtain a passing result, and do not run `npm run migrate` or deploy migrations.

### November 4 archive comparison remains valid

The November 4 archive comparison independently established:
- Archive ledger: 89 rows.
- Live production ledger: 105 rows.
- All 89 shared versions match production exactly on version, name, checksum and applied_at.
- Archive-only rows: 0.
- Live-only rows: 16, ending at `20261109210000`.

The archive is therefore strongly supported as an earlier snapshot of the same production migration history, but it is not a current 105-row backup and has not been qualified for full schema/data restoration. It remains immutable; do not restore it.

### Mainline / PR / branch recheck before this addendum

The canonical handover was fetched from the default branch immediately before this update (current handover blob SHA before append: `539891d926d99ac29eb5077fc80de7d8fff6df60`). Current `main` HEAD was `1fb674b3d3566b1caf5684784e300ca0cdd2d3f3` (2026-11-15 15:50:08Z), whose subject records the exact November 4 archive/production comparison.

The six open PRs were rechecked and remain open:
- #282 — `fix(db): enforce verified TLS and fail-closed migration ordering` (head `5e13c479c79e7e9518a0b78445eae927812682b5`).
- #264 — gateway registration identity checkpoint documentation.
- #244 — GHM Business engagement and Analytics API (stacked on #243).
- #243 — governed supplier classification for Connect Marketplace.
- #233 — PayFast ITN timezone handling (PayFast work remains paused; do not activate payment paths).
- #201 — QuoteFlow legal document acceptance (legal wording/publication remains paused).

Existing migration branches were rechecked, including the current #282 branch, production audit TLS branch, audit SSL URL override branch, migration checksum/provenance branches and historical migration branches. Existing Actor Gateway branches were rechecked, including trusted-admin-membership, principal-guard, registration identity, self-read, worker-body-limit, business-profile, capability-governance and supplier-classification branches. These are existing branches; no new branch was created and no branch or PR was modified, merged, rebased, deleted or pushed as part of this audit interpretation correction.

### Amanda / Render role-separation continuity

Amanda's Render support conversation remains preserved in the earlier sections of this handover. Her confirmed recommendation remains to retain the Dashboard-managed default credential for controlled administration and use SQL-created restricted login identities for normal application execution. The production sensitive-role ADMIN OPTION concern remains unresolved; this audit/archive comparison did not change or re-test it.

### Current disposition

- Live production ledger endpoint: **105 rows, latest `20261109210000` — CONFIRMED READ-ONLY**.
- Earlier claim that `20261020140000` was the latest live version: **CORRECTED — it was the last retained-extra entry, not the ledger endpoint**.
- Repository migration audit: **INVESTIGATE — 42 pending, only 7 allowlisted; 35 remain unallowlisted**.
- November 4 archive ledger history: **89/89 exact matches with the live production ledger for shared versions; 16 later live rows**.
- Production migration execution, restore, allowlist edits, role/grant changes, credential/environment changes and deployment: **NOT PERFORMED**.


## 2026-11-15 16:03Z — Production pending-migration execution gate added to existing PR #282

### Recheck before implementation

- Canonical handover fetched from default branch immediately before this update; blob SHA: `92019828356a9de094d822f4b1c6ffb0d19d01ac`.
- PR #282 remains open on `fix/migration-runner-strict-tls-20261115`; existing head before this follow-up was `5e13c479c79e7e9518a0b78445eae927812682b5`.
- Existing #282 already implemented strict verified TLS and out-of-order pending-migration rejection. Its tests and quality workflow passed on the original #282 head, but the later allowlist change requires fresh exact-head CI.
- Existing branch `fix/exact-production-pending-migration-allowlist` was inspected. It is 496 commits behind main and only changes the allowlist JSON plus checksum audit test; it does **not** change the migration executor. Its config contains a single old entry `20261109210000`, so it is not reusable as a current execution safeguard. It was not modified or merged.
- Current production allowlist on main remains the seven-entry file documented above. No existing branch was found that wires this allowlist into `src/db/migrate.ts`.

### Newly implemented fail-closed execution check (on existing #282 branch)

Added to the existing PR #282 branch; no new branch or PR:
- `src/db/production-pending-migration-allowlist.ts`: validates allowlist entries (14-digit version, non-empty name, no duplicate versions, exact version/name match to repository migration files) and rejects any repository migration that is still pending but is not explicitly allowlisted.
- `src/db/migrate.ts`: for the explicitly identified production target `ghm_db`, invokes the allowlist check immediately after reading the live ledger and before the migration-order guard and before the migration execution loop. Non-production qualification databases do not use this production-only allowlist.
- `src/db/migration-checksum.test.ts`: adds tests for rejecting unapproved pending migrations, allowing a pending subset when earlier allowlisted migrations are already applied, rejecting stale/name-mismatched entries, and rejecting duplicate versions.
- A generated regex escaping issue in the helper was detected during source verification and corrected before this handover update. The helper now validates versions with `/^\d{14}$/`.

Commits added to the existing #282 branch:
- `bd8d92fb64e2e11cab121e687ad6f1e09bb2d151` — add helper.
- `9637d18b47db38d0faaecbed4d4d26663b94dc6d` — wire production runner.
- `9d441a4db80250dacc0123db0860d8c9294ab9c0` — add tests.
- `ba8cffc6933e8bf1e780a678af554ee7148c6147` — correct helper regex validation.

### Expected behavior against the known production ledger

Given the last independently observed production ledger (105 rows, latest `20261109210000`) and the current mainline repository migration set (137 files), the production allowlist check should reject execution because 35 pending migrations are not included in the seven-entry allowlist. It must fail before the first migration SQL statement. This is a source-derived expected result; **the updated branch has not been executed against production**.

The helper also refuses stale allowlist entries that do not exactly match a current repository migration filename/version name. Already-applied migrations do not need to be in the pending allowlist, but every allowlist entry must still correspond to an exact current repository migration.

### CI / merge disposition

- Original #282 head `5e13c479c79e7e9518a0b78445eae927812682b5` had successful `quality`, `web-quality`, and Cloudflare Pages checks.
- The allowlist additions moved the branch head to `ba8cffc6933e8bf1e780a678af554ee7148c6147`. At the time of this handover update, only the Cloudflare Pages check was visible and was still in progress; fresh exact-head quality validation is **not yet confirmed**.
- The branch is 22 commits behind main, and the current compare reports 12 commits ahead / 22 behind. The mainline-only changes are handover updates; the PR is not ready to merge until it is reconciled with current main and exact-head CI passes.
- Do not merge #282 yet. Do not run `npm run migrate`, deploy migration code to Render, or change the allowlist to include the 35 blocked migrations as a shortcut.
- No production connection, migration SQL, restore, role/grant change, Render setting, secret, credential, or deployment was performed during this implementation.

### Amanda / Render support continuity

Amanda's support conversation remains the documented basis for retaining the Dashboard-managed default credential for controlled administration while using SQL-created restricted login identities for normal application execution. The sensitive-role ADMIN OPTION issue remains unresolved and is not addressed by this migration-runner change.


## 2026-11-15 16:08Z — PR #282 exact-head CI failure diagnosed and regression assertion corrected

### Recheck and CI diagnosis
- Re-fetched the canonical handover from the default branch before this update (blob SHA: `4965dc23826d12308d5d5fb4ad1aa85ed577a9d5`).
- Rechecked the six open PRs. #282 remains the migration-runner hardening PR; #264, #244, #243, #233 and #201 remain open. PayFast and legal-document work remain paused as already documented.
- Compared `main` to the #282 branch merge base. The 23 commits on main since the merge base modify only this canonical handover file; the PR branch is 13 commits ahead and 23 behind. The branch has not yet been synchronized; do not mistake the handover-only divergence for source-code drift.
- Inspected exact-head CI run `43733125686` for `ba8cffc6933e8bf1e780a678af554ee7148c6147`. Build, disposable PostgreSQL migration application, Worker smoke checks, and web-quality passed. The main `quality` job failed in the test suite: 1,012 passed, 1 failed out of 1,013.
- Downloaded and inspected the test-suite diagnostic artifact. The sole failure was the newly added test `production migration allowlist permits only its configured pending suffix`. The helper correctly rejected exactly one unapproved pending migration, but the test incorrectly expected two. This was a test expectation defect, not a production migration execution or application regression.
- No live production connection, migration, restore, deployment, role/grant change, or Render setting change occurred during CI investigation.

### Correction on existing PR #282 branch
- Corrected the expected rejection count from 2 to 1 in `src/db/migration-checksum.test.ts`.
- Commit: `9622807fd1a9168b843186aad86b397fda56997c` — `test(db): correct pending allowlist rejection count`.
- No new branch or PR created.
- Fresh exact-head CI run `43733524314` started for this commit. At handover time, both `quality` and `web-quality` were still running; results are not yet confirmed.
- PR #282 is not ready to merge. Keep the production migration runner blocked until exact-head CI passes and the branch is reconciled with main. The seven-entry production allowlist remains unchanged; do not add the 35 unapproved pending migrations.

### Amanda / Render continuity
Amanda's Render support recommendation remains unchanged: retain the Dashboard-managed default credential for controlled administration and use SQL-created restricted login identities for normal application execution. The sensitive-role ADMIN OPTION membership concern remains unresolved and is not changed by this PR.

### Current state
- PR #282 head: `9622807fd1a9168b843186aad86b397fda56997c`.
- Exact-head CI: running; awaiting final results.
- #282 branch vs main: 13 commits ahead / 23 behind, with main-side commits since merge base limited to this handover document.
- Production migration execution / deployment: not performed.


## 2026-11-15 18:09Z — PR #282 corrected exact-head CI passed; synchronization still required

### Recheck before continuation
- Canonical handover re-fetched from `main` immediately before this update; current blob SHA: `dbf1a894cbbd5e26c5c3a09d34d2a05371a52b62`.
- PR #282 remains open and unmerged: `fix(db): enforce verified TLS and fail-closed migration ordering`.
- Existing PR branch rechecked: `fix/migration-runner-strict-tls-20261115`; no new branch or PR was created.
- Corrected test commit independently fetched and confirmed: `9622807fd1a9168b843186aad86b397fda56997c` (`test(db): correct pending allowlist rejection count`).
- Exact-head CI run `43733524314` completed with conclusion **SUCCESS**. Both jobs passed:
  - `quality` — passed. The job completed all 69 substantive steps, including build, Worker bundle, disposable PostgreSQL migration application, Actor Gateway/auth issuer/storage qualification, the full test suite, production migration audit policy tests, runtime boundary verification, and disposable issuer cutover/authority comparison.
  - `web-quality` — passed (web build/tests/dependency and toolchain checks).
- This resolves the prior one-test failure. No retry was needed; this is a fresh exact-head run on the corrected commit.

### Branch reconciliation evidence
- Current comparison at this checkpoint: PR branch is **14 commits ahead / 24 commits behind** `main`.
- Reverse comparison confirms the 24 main-only commits since the merge base modify only this canonical handover file; the branch-side source diff remains limited to six migration-runner source/test files:
  - `src/db/migrate.ts`
  - `src/db/migration-checksum.test.ts`
  - `src/db/migration-checksum.ts`
  - `src/db/migration-order.ts`
  - `src/db/migrator-principal-contract.test.ts`
  - `src/db/production-pending-migration-allowlist.ts`
- The current main HEAD at comparison time is `67173f368c2bb44e029bd16b4d5d5915b8674d1e`; the PR branch merge base is `4b144e3d44568141ab44d2f3131f55b14a0db40b`.
- The divergence is therefore handover-only on the main side, not evidence of additional mainline source changes. Nevertheless, the PR must be synchronized with current main and exact-head CI rerun after synchronization before merge consideration.
- Do not merge #282 yet. Do not use a force update or discard either side's handover history. Reconcile by preserving the canonical handover and all six PR source files, then verify the resulting tree and exact-head CI.

### Production and service safety
- The passing CI used disposable PostgreSQL and isolated qualification environments only.
- No production database connection or migration was run by this CI pass; no production ledger, schema, data, role, grant, secret, Render variable, deployment, or traffic was changed.
- Production migration execution remains blocked. The allowlist must not be expanded merely to make the audit pass; the known 35 unapproved pending migrations remain outside the seven-entry production allowlist.
- PayFast remains paused. Amanda's Render support recommendation and the unresolved sensitive-role ADMIN OPTION concern remain as documented above.

### Current disposition
- Corrected exact-head CI: **PASS** (run `43733524314`, commit `9622807fd1a9168b843186aad86b397fda56997c`).
- PR #282: **OPEN / UNMERGED**.
- Branch synchronization: **NOT YET PERFORMED**.
- Post-synchronization exact-head CI: **PENDING**.
- Production migrations / deployment / role or credential changes: **NOT PERFORMED**.


## 2026-11-15 18:14Z — PR #282 synchronized with main; post-sync CI awaiting confirmation

### Synchronization method and evidence
- Rechecked current canonical handover, PR #282, branch head and commit ancestry before synchronization.
- Corrected exact-head CI on `9622807fd1a9168b843186aad86b397fda56997c` passed in run `43733524314` (quality and web-quality both successful).
- Main at synchronization: `101e05bf18c6c639ea6008e81bb2ad704e7bc126`.
- PR branch before synchronization: `9622807fd1a9168b843186aad86b397fda56997c`.
- Verified the divergence: main-only changes since merge base touched only this canonical handover file; PR-only changes touched the six migration-runner source/test files listed below. No overlapping changed paths were present.
- Created a two-parent merge commit preserving the latest main tree and overlaying the six exact PR-branch file blobs:
  - `f1d06bcf6f4603f38c779c9dc45ed5689151c648` — `merge: synchronize migration runner hardening with main`.
  - First parent: `101e05bf18c6c639ea6008e81bb2ad704e7bc126` (main).
  - Second parent: `9622807fd1a9168b843186aad86b397fda56997c` (previous PR head).
- Updated the existing PR branch with a non-force, expected-head-checked ref update. The operation succeeded.
- Post-sync comparison: branch is **15 commits ahead / 0 behind** main. The PR's six source/test files remain the only branch diff paths; the mainline handover history is now included.
- PR #282 remains open and unmerged. GitHub's mergeability field had not yet recalculated at the time of this check; do not treat its stale `mergeable=false` value as a source conflict.

### Post-synchronization CI
- Queried commit-associated PR workflow runs immediately after updating the branch; no new run was visible in that first response.
- Post-sync exact-head CI is therefore **PENDING / NOT YET CONFIRMED** for `f1d06bcf6f4603f38c779c9dc45ed5689151c648`. Recheck Actions and PR checks; do not rely on the pre-sync run as a substitute.
- No merge was performed.

### Scope and production safety
- No production database connection or migration was run.
- No Render service, environment variable, secret, role, grant, production data, deployment, traffic, or migration allowlist was changed.
- The production migration execution gate remains closed. Do not expand the seven-entry allowlist to include the 35 unapproved pending migrations.
- Amanda's Render support recommendation and the unresolved sensitive-role ADMIN OPTION issue remain documented and unchanged.


### 2026-11-15 18:16Z — post-sync CI progress correction
The initial commit-associated workflow lookup returned an empty list, but a direct Actions-run lookup subsequently found the expected exact-head PR run:
- Run `43734074745`, head `f1d06bcf6f4603f38c779c9dc45ed5689151c648`, event `pull_request`.
- `web-quality`: **PASS**.
- `quality`: **IN PROGRESS**, 36 of 72 reported job steps completed at the latest poll; Actor Gateway local Worker smoke test and Argon2id evidence stages have progressed without a reported failure.
- Overall workflow: **IN PROGRESS**; no failure reported.
- GitHub recalculated PR #282 as `mergeable=true`. This is not merge authorization; wait for all required checks to finish and inspect their final conclusions.
- This replaces the immediately preceding note that no new run was visible: the run exists and is progressing normally.


### 2026-11-15 18:18Z — latest post-sync CI poll and branch-base note
- Exact-head run `43734074745` remains **IN PROGRESS** on `f1d06bcf6f4603f38c779c9dc45ed5689151c648`.
- `web-quality`: **PASS**.
- `quality`: **IN PROGRESS**, 45/72 job steps completed; disposable PostgreSQL storage lifecycle and tenant authorization qualification is the active step. No failed step is reported.
- PR #282 remains **OPEN / UNMERGED**.
- The canonical handover has received two mainline-only updates since the synchronization commit. The current compare therefore shows 15 commits ahead / 2 behind; both behind commits modify only this handover document. The six PR source/test files remain the complete source diff. Do not rebase or force-update merely to absorb these documentation-only notes while the exact-head quality job is running; incorporate them at the next controlled synchronization if needed.
- No merge, production migration, production database write, Render configuration change, or deployment occurred.


### 2026-11-15 18:20Z — PR #282 continuation poll
- Canonical handover refreshed from current `main` before append; current blob SHA: `d02bc5b7fb58eced37ddbd935da044fdf156e32a`.
- Exact-head workflow `43734074745` for `f1d06bcf6f4603f38c779c9dc45ed5689151c648` remains **IN PROGRESS**.
- `web-quality`: **PASS**; `Cloudflare Pages`: **PASS**; `quality`: **IN PROGRESS**, 56/72 reported steps completed, no failed steps reported. The active step is disposable PostgreSQL Business Logo signed Gateway cutover qualification.
- PR #282 remains open and unmerged; latest API poll reported `mergeable=true`. The PR is not being merged until every required check passes.
- Current branch comparison: 15 commits ahead / 3 behind `main`; the three behind commits are handover-only updates. The six migration-runner source/test files remain the entire PR source diff. Keep this documentation-only divergence separate from the CI-tested source head; perform a final controlled sync and exact-head CI if the PR head is changed.
- One attempt to fetch the in-progress job log returned GitHub's transient `BlobNotFound` response; job status and step progression remain available through the Actions API. No test failure was indicated by that response.
- Earlier historical status lines in this handover that say synchronization was not performed or post-sync CI was pending are superseded by the later dated entries documenting merge commit `f1d06bcf6f4603f38c779c9dc45ed5689151c648` and run `43734074745`.
- No production database, migrations, data, roles, grants, secrets, Render settings, deployment or traffic were changed.


### 2026-11-15 18:22Z — post-sync CI passed; handover-only updates synchronized
- Exact-head post-sync run `43734074745` completed with overall conclusion **SUCCESS** on `f1d06bcf6f4603f38c779c9dc45ed5689151c648`.
- Both required workflow jobs passed: `quality` and `web-quality`. The quality job completed all reported qualification stages, including disposable PostgreSQL migration application, Worker smoke tests, Argon2id interoperability, storage lifecycle/tenant authorization, signed Gateway cutovers, full test suite, migration audit policy, runtime boundary checks, and disposable issuer cutover/authority comparison. No failed steps were reported.
- Cloudflare Pages check also completed successfully.
- After that successful run, the only mainline commits not in the PR branch were handover-only updates. To avoid leaving documentation drift, a second controlled two-parent synchronization was made:
  - Latest main parent: `096003a751948966a146a9d23541eec7b2eb4eca`.
  - Previous PR head parent: `f1d06bcf6f4603f38c779c9dc45ed5689151c648`.
  - New branch head: `a90a7873407b3f1f3fe942ed1b572c3c85f15740`.
  - Ref update was non-force and expected-head checked; it succeeded.
- Post-sync comparison now reports **16 ahead / 0 behind** main. The six migration-runner source/test files remain the only PR diff paths.
- A new Actions run for the new head was not yet visible at the first poll; exact-head CI for `a90a7873407b3f1f3fe942ed1b572c3c85f15740` is **PENDING** and must be confirmed before merge. Do not treat the successful prior run as validating this new merge commit.
- PR #282 remains open and unmerged. Do not merge until the new head's required checks pass and GitHub's mergeability/check state is refreshed.
- Production remains untouched: no production DB access, migration, data or ledger change; no Render setting, role, grant, credential, deployment or traffic change. PayFast remains paused and the 35 unapproved pending migrations remain outside the seven-entry allowlist.


### 2026-11-15 18:24Z — PR #282 merged after exact-head qualification
- Rechecked PR #282, latest exact-head commit, check-runs, diff and branch comparison before merge.
- Exact PR-head workflow `43734441282` on `a90a7873407b3f1f3fe942ed1b572c3c85f15740` completed **SUCCESS**:
  - `quality`: PASS (73/73 steps).
  - `web-quality`: PASS (11/11 steps).
  - `Cloudflare Pages`: PASS for the PR head; Cloudflare's preview deployment reported successful.
- The reviewed PR source diff contained exactly the six migration-runner source/test files:
  - `src/db/migrate.ts`
  - `src/db/migration-checksum.test.ts`
  - `src/db/migration-checksum.ts`
  - `src/db/migration-order.ts`
  - `src/db/migrator-principal-contract.test.ts`
  - `src/db/production-pending-migration-allowlist.ts`
  The only main-side divergence since the tested PR head was a 15-line append to this canonical handover document; it was incorporated by the controlled synchronization commit `a90a7873407b3f1f3fe942ed1b572c3c85f15740` before the successful exact-head run.
- No PR reviews were returned by the GitHub reviews endpoint. Branch protection lookup was unavailable to this integration (403); therefore required-review/branch-protection settings could not be independently enumerated. The visible required CI checks all passed and GitHub reported the PR mergeable.
- PR #282 was squash-merged with expected-head protection against `a90a7873407b3f1f3fe942ed1b572c3c85f15740`.
  - Merge commit: `29e7b4b5246d7119561b4878b54475a621da1c47`.
  - PR state verified **CLOSED / MERGED**.
  - Main's latest commit verified as the merge commit.
- Post-merge commit checks were queried immediately after merge and are **QUEUED / IN PROGRESS** (`quality`, `web-quality`, Cloudflare Pages). These are separate from the already-passing exact PR-head checks; poll them before claiming main's post-merge pipeline is green.
- No production database connection, migration execution, data/ledger change, role/grant/credential change, Render environment update, service deployment or traffic change was performed by this merge. Cloudflare's PR preview deployment is not the Render production runtime.
- Production migration execution remains blocked pending the separate production-only migration and Project↔Opportunity reconciliation gates. Do not expand the seven-entry allowlist to include the 35 unapproved pending migrations. PayFast remains paused. Amanda's Render support context and unresolved sensitive-role ADMIN OPTION concern remain open as documented above.


### 2026-11-15 18:27Z — post-merge main CI progress
- PR #282 is verified **CLOSED / MERGED** at `29e7b4b5246d7119561b4878b54475a621da1c47`.
- The merged commit's push-triggered main workflow is run `43734868071`.
  - `web-quality`: **PASS** (11/11).
  - `quality`: **IN PROGRESS**, 46/72 steps completed at the latest poll; the active stage is the full test suite; no failed steps reported.
  - Cloudflare Pages check for the merge commit: **PASS**.
- This is the post-merge main pipeline; the PR-head run `43734441282` had already passed both required jobs before merge. Do not report the main push-triggered quality job as green until it completes.
- Canonical handover update commit `307f628e41013ee970e1349910919e1227866883` was added after merge and triggers a separate documentation-only Cloudflare Pages check; that check was in progress at the latest poll. It does not alter application source.
- No production DB connection, migration, data change, Render runtime configuration, credential, role, grant, deployment or traffic change occurred. Production migration and Project↔Opportunity reconciliation gates remain outstanding; PayFast remains paused.


### 2026-11-15 18:30Z — post-merge main CI completed; next gate prepared
- Post-merge main workflow `43734868071` for merge commit `29e7b4b5246d7119561b4878b54475a621da1c47` completed **SUCCESS**:
  - `quality`: PASS, 73/73 steps.
  - `web-quality`: PASS, 11/11 steps.
  - `Cloudflare Pages`: PASS.
- PR #282 remains verified closed/merged. Recent PR inventory and branch inventory were reviewed before choosing next work:
  - Open PRs currently include #264, #244, #243, #233 and #201. None is the production migration audit or Project↔Opportunity reconciliation task; do not duplicate or stack onto these unrelated PRs.
  - Existing Project↔Opportunity feature branch `feature/atomic-project-opportunity-create-20261106` was identified as prior work, not a new implementation target. The atomic Project+Opportunity creation and project.opportunity_id relation are already in main via the previously merged work; do not recreate them.
  - Existing migration-audit branches and PRs #280/#281/#282 were reviewed; strict verified TLS, URL-option stripping, read-only forensic audit and fail-closed production allowlist enforcement are now on main.
- Current main production migration controls:
  - `scripts/forensic-migration-reconciliation.mjs` uses `GHM_MIGRATOR_DATABASE_URL`, requires `DATABASE_SSL=true`, strips connection-string SSL overrides, connects with `rejectUnauthorized: true`, opens `BEGIN READ ONLY`, verifies `ghm_migrator` → `ghm_schema_owner`, and rolls back.
  - `npm run audit:migrations:predeploy` runs this forensic audit with the exact pending set permitted for comparison; it does not execute migrations.
  - `npm run migrate` is not authorized. The production migration runner now requires verified TLS, exact seven-entry pending allowlist, and fail-closed migration ordering; the known historical production checkpoint had 35 unapproved pending migrations outside the seven-entry allowlist. Do not widen that allowlist to force a pass.
  - Latest source allowlist is exactly seven migrations: 20261110100000, 20261110120000, 20261110140000, 20261110210000, 20261110220000, 20261110230000, 20261110233000. This is source configuration, not proof of the live pending set.
- Next action is a fresh read-only production forensic audit against `ghm-db / ghm_db` using the approved `GHM_MIGRATOR_DATABASE_URL` identity. Capture complete output and compare current ledger/repository counts, missing migrations, retained historical rows, checksum/name mismatches and authority evidence against the prior checkpoint (105 ledger rows, 137 repository files, 35 pending was a dated prior observation, not a current assertion).
- Only after the live audit is captured should we run a separate read-only Project↔Opportunity reconciliation against production. The schema relation was introduced by `20261106200000_link_project_to_opportunity.sql`; Project creation must remain atomic with its canonical project-type Opportunity. The audit must quantify null/missing/mismatched/duplicate relationships and verify FK/unique-index presence without changing data. Do not invent or apply backfill SQL before inspecting actual production rows and constraints.
- Amanda / Render support continuity: the support recommendation remains to retain the Dashboard-managed default credential for controlled administration and use SQL-created restricted login identities for normal application execution. The sensitive-role ADMIN OPTION membership issue remains unresolved; do not attempt role/grant changes or expose credentials.
- No production query or write was performed in this continuation. No migration, data/ledger change, role/grant/secret change, Render configuration change, deployment or traffic change occurred. PayFast remains paused.


### 2026-11-15 — Production migration audit: post-allowlist mainline inventory reconciliation

**Checkpoint:** current main at `ae0017eac2c80c9975859eda9b38dbea08156848`; working tree in the user's `C:\\GHM-main` has no tracked modifications. The pre-existing untracked recovery file `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak` remains present and must not be modified, moved, staged, deleted, or overwritten.

#### Read-only production audit result

- `npm run audit:migrations:predeploy` was run against production `ghm_db` using the read-only forensic audit path. The connection was verified as `ghm_migrator`, the transaction was read-only, and it rolled back; no migration was executed.
- Verdict: **INVESTIGATE**.
- The failing condition is the exact pending-migration allowlist comparison (`pending_allowlist_mismatch_count: 1`). The audit reported no unexplained checksum mismatches, no migration name mismatches, no unrecognized ledger extras, no orphaned provenance exceptions, and no invalid retained-history entries.
- The audit's actual pending list is materially larger than the seven-entry allowlist. The earlier seven-entry inventory is not a complete current pending inventory. The full live pending list from the 2026-11-15 audit output must be retained with the session transcript; do not infer approval from presence in the repository.
- No production migration, data change, ledger write, role/grant change, Render configuration change, deployment, or traffic change occurred.

#### Exact allowlist and enforcement contract

The production allowlist at `config/pending-migrations.production.json` contains exactly these seven records:

1. `20261110100000_create_account_onboarding_progress`
2. `20261110120000_create_business_relationship_outcome_read_models`
3. `20261110140000_allow_pending_storage_object_cleanup`
4. `20261110210000_add_actor_gateway_principal_guard`
5. `20261110220000_add_actor_gateway_self_identity_read`
6. `20261110230000_add_gateway_business_registration_identity_read`
7. `20261110233000_add_gateway_business_registration_identity_write`

- `src/db/migrate.ts` imports this JSON and calls `assertProductionPendingMigrationAllowlist` for `ghm_db` before applying any migration.
- The TypeScript guard rejects every unapplied repository migration not present by exact version/name in the allowlist. This is a production execution safety gate, not a mechanism to classify all repository migrations as approved.
- The forensic audit resolves the production target in `scripts/migration-audit-checksum.mjs`. For `ghm_db`, its `pendingPath` is also `config/pending-migrations.production.json`. Thus the audit and runner use the same seven-entry source file, but the audit reports the mismatch while the runner would refuse execution.
- The target resolver is in `scripts/migration-audit-checksum.mjs`, not a file under `src/db`; previous searches limited to `src/db` therefore did not locate it.

#### Provenance and mainline chronology

- Allowlist alignment commit: `0c65eb1fcce287d82f895a234193691ef114943a` (`fix(migrations): align production pending audit allowlist`). This commit is an ancestor of current main (`git merge-base --is-ancestor` returned exit code 0).
- All seven allowlisted migration files were already present in the tree at `0c65eb1f`. The commit replaced the former single pending entry `20261109210000_deactivate_unrecognized_public_directory_records` with the seven entries above.
- The first-parent-only history after that commit identified later migration-affecting mainline commits:
  - `4463bbb9` — `chore(security): qualify unified Actor Gateway integration stack`.
  - `1d78d2b9` — `feat(security): isolate GHM Authentication Issuer`.
  - `20a873af` — `fix(storage): preserve pending upload lifecycle during deletion cleanup (#279)`, which changed the already-allowlisted storage cleanup migration.
- The later Actor Gateway / Authentication Issuer integrations expanded the migration inventory after the seven-entry allowlist had been pinned. The earlier `git log --all` output included side-branch histories and must not be used as mainline attribution; use first-parent mainline history for this comparison.
- The exact current mainline migration inventory observed after the allowlist point includes, among others, supplier classification, capability catalogue governance and invariants, gateway supplier/profile cutovers, signed assertion bindings and signed gateway operations, business hours/trust/logo projections, authentication runtime revocations and token-bound recovery, signed Connect business provisioning, security-definer search-path hardening, and signed storage gateway/attestation work. These are not automatically production-approved merely because they are in main.

#### Decision and next qualification steps

- **Do not expand or rewrite the seven-entry allowlist to make the audit pass.**
- Do not run `npm run migrate` or deploy migration changes.
- Classify each currently pending migration against its originating PR/branch, mainline merge/reconciliation, runtime consumer, and dependency. Distinguish at least: the seven previously approved pending migrations; Actor Gateway / Authentication Issuer dependent migrations; and other later mainline migrations whose production intent and preconditions remain to be established.
- Recheck the existing handover and PR/branch state before investigating each group. Preserve the existing Actor Gateway → Authentication Issuer → Worker stack and do not create duplicate implementations or new branches/PRs without first checking current state.
- No-cost hosting remains a hard constraint. No gateway-dependent migration is eligible for production while the required secure gateway/issuer hosting and runtime cutover are unavailable.
- Continue to retain Amanda's complete Render support conversation and the confirmed recommendation already recorded above: keep the Dashboard-managed credential for controlled administration and use SQL-created restricted logins for normal runtime. This audit does not alter that decision or authorize role/credential changes.
- PayFast remains paused; no PayFast activation work is part of this audit.

**Handover rule:** before every further implementation or production step, read this document and the relevant PR/branch history first; append new findings here before moving to a different workstream. This entry records the 2026-11-15 audit investigation so the same allowlist provenance and mainline chronology are not repeated.


#### PR / branch reconciliation added after the audit checkpoint

The live GitHub PR inventory was refreshed before further investigation:

- PR #272 — Actor Gateway integration stack: **CLOSED / MERGED** at 2026-11-14 23:59:20Z. Its merged head is the second parent of mainline commit `4463bbb9`.
- PR #276 — isolated Authentication Issuer stacked on #272: **CLOSED / MERGED** at 2026-11-15 00:00:31Z. Its merged head is the second parent of mainline commit `1d78d2b9`.
- PR #277 — Actor Gateway Worker body-limit hardening: **CLOSED / MERGED** at 2026-11-15 00:01:32Z.
- PR #243 — governed supplier classification for Connect Marketplace: **OPEN / DRAFT**, branch `feat/connect-marketplace-supplier-contract-ghm-20261110`, head `1246ed74a81b3fc607e6f65f3cd8036bc081ab1b`. Do not recreate this work. Its related supplier-classification migration already exists on main via #272's merged reconciliation, so inspect the PR diff and its intended follow-up before any action.
- PR #264 — gateway registration identity milestone documentation: **OPEN**, branch `docs/gateway-registration-identity-checkpoint-20261110`, head `b2f7f1d514dd380db1579c907cf06efa9ff48fa1`. Review its scope before changing or duplicating documentation.
- Other open PRs at this refresh: #244 (Business engagement/Analytics, draft), #233 (PayFast timezone, draft; leave paused), #201 (QuoteFlow legal acceptance, draft; legal docs remain paused). These are not substitutes for migration provenance review.

The merged mainline migration additions attributed to #272 / commit `4463bbb9` are:

- `20261110010000_add_business_supplier_classification`
- `20261110160000_add_admin_capability_catalogue_governance`
- `20261110240000_enforce_capability_catalogue_cross_row_invariants`
- `20261110250000_add_gateway_capability_governance`
- `20261110260000_gateway_supplier_classification_cutover`
- `20261110265000_reconcile_business_profile_legacy_contract`
- `20261110270000_gateway_business_profile_update`
- `20261111020000_bind_capability_gateway_actor_to_signed_assertion`
- `20261111030000_bind_supplier_gateway_actor_to_signed_assertion`
- `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion`
- `20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor`
- `20261111060000_bind_gateway_assertions_to_request_context`
- `20261111070000_add_signed_business_capability_mutations`
- `20261111100000_add_signed_saved_business_gateway`
- `20261111130000_add_signed_business_hours_gateway`
- `20261111140000_add_business_hours_read_projections`
- `20261111150000_add_signed_trust_score_gateway`
- `20261111160000_add_signed_business_logo_gateway`
- `20261111170000_add_trust_score_read_projections`
- `20261111210000_revoke_runtime_account_external_identity_table_access`
- `20261111220000_revoke_unused_auth_runtime_entry_points`
- `20261111230000_add_token_bound_recovery_revocation_result`
- `20261111240000_revoke_runtime_quoteflow_migration_provisioning`
- `20261111250000_revoke_runtime_external_identity_link`
- `20261111260000_revoke_runtime_external_identity_bootstrap`

The merged Authentication Issuer stack / commit `1d78d2b9` added or changed:

- Modified `20261110210000_add_actor_gateway_principal_guard` (already in the seven-entry allowlist; its migration bytes changed after the allowlist commit).
- `20261112020000_add_token_bound_password_recovery_reset`
- `20261112030000_add_conditional_password_rehash`
- `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration`
- `20261112050000_revoke_public_default_function_execution`
- `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads`
- `20261112080000_signed_connect_business_provisioning_gateway`
- `20261112090000_pin_security_definer_search_path`
- `20261112140000_add_signed_storage_metadata_actor_gateway`
- `20261112150000_add_storage_provider_workflow_attestation`
- `20261112170000_revoke_redundant_migrator_business_mapping_lookup`

Important distinction: these are **commit-level file additions/modifications**, not a declaration that every one is currently pending in production. The production audit's `missing` array is the authoritative pending list. The #272/#276 stack is already merged; do not treat its former PRs as open implementation work or create duplicates. Its required isolated gateway/issuer hosting and runtime cutover constraints remain unresolved, so the merge and CI qualification do not authorize production migration execution.


### 2026-11-15 — Exact production pending inventory captured

**Source:** user's read-only `npm run audit:migrations:predeploy` output from production `ghm_db`, captured 2026-11-15 16:43 UTC. This is the authoritative complete pending list for this audit checkpoint.

#### Exact counts and reconciliation

- Verdict: `INVESTIGATE`.
- Repository migration files: **137**.
- Live `ghm.ghm_schema_migrations` ledger rows: **105**.
- Pending repository migrations: **42**.
- Approved retained historical ledger extras: **10** (from the preceding audit summary; no unrecognized extras).
- Reconciliation: 105 ledger rows less 10 retained historical extras = 95 repository migrations represented in the ledger; 137 - 95 = 42 pending.
- Pending allowlist exact match: **false**; mismatch count **1**. The configured allowlist still has seven records, so 35 pending migrations are outside it.
- Checksum mismatches: **0**; name mismatches: **0**; unrecognized ledger extras: **0**; orphaned historical exceptions: **0**; invalid retained-history entries: **0**.
- Authority/read-only checks passed; no production writes or migration execution occurred.

#### Complete pending migration inventory (42)

- `20261110010000_add_business_supplier_classification.sql`
- `20261110100000_create_account_onboarding_progress.sql`
- `20261110120000_create_business_relationship_outcome_read_models.sql`
- `20261110140000_allow_pending_storage_object_cleanup.sql`
- `20261110160000_add_admin_capability_catalogue_governance.sql`
- `20261110210000_add_actor_gateway_principal_guard.sql`
- `20261110220000_add_actor_gateway_self_identity_read.sql`
- `20261110230000_add_gateway_business_registration_identity_read.sql`
- `20261110233000_add_gateway_business_registration_identity_write.sql`
- `20261110240000_enforce_capability_catalogue_cross_row_invariants.sql`
- `20261110250000_add_gateway_capability_governance.sql`
- `20261110260000_gateway_supplier_classification_cutover.sql`
- `20261110265000_reconcile_business_profile_legacy_contract.sql`
- `20261110270000_gateway_business_profile_update.sql`
- `20261111020000_bind_capability_gateway_actor_to_signed_assertion.sql`
- `20261111030000_bind_supplier_gateway_actor_to_signed_assertion.sql`
- `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion.sql`
- `20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor.sql`
- `20261111060000_bind_gateway_assertions_to_request_context.sql`
- `20261111070000_add_signed_business_capability_mutations.sql`
- `20261111100000_add_signed_saved_business_gateway.sql`
- `20261111130000_add_signed_business_hours_gateway.sql`
- `20261111140000_add_business_hours_read_projections.sql`
- `20261111150000_add_signed_trust_score_gateway.sql`
- `20261111160000_add_signed_business_logo_gateway.sql`
- `20261111170000_add_trust_score_read_projections.sql`
- `20261111210000_revoke_runtime_account_external_identity_table_access.sql`
- `20261111220000_revoke_unused_auth_runtime_entry_points.sql`
- `20261111230000_add_token_bound_recovery_revocation_result.sql`
- `20261111240000_revoke_runtime_quoteflow_migration_provisioning.sql`
- `20261111250000_revoke_runtime_external_identity_link.sql`
- `20261111260000_revoke_runtime_external_identity_bootstrap.sql`
- `20261112020000_add_token_bound_password_recovery_reset.sql`
- `20261112030000_add_conditional_password_rehash.sql`
- `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration.sql`
- `20261112050000_revoke_public_default_function_execution.sql`
- `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql`
- `20261112080000_signed_connect_business_provisioning_gateway.sql`
- `20261112090000_pin_security_definer_search_path.sql`
- `20261112140000_add_signed_storage_metadata_actor_gateway.sql`
- `20261112150000_add_storage_provider_workflow_attestation.sql`
- `20261112170000_revoke_redundant_migrator_business_mapping_lookup.sql`

#### Classification status and guardrails

This list is now preserved in the handover so it does not need to be re-captured just to recover the inventory. Classification below is by provenance/theme only; it is **not** production approval.

1. **Previously allowlisted (7):** `20261110100000`, `20261110120000`, `20261110140000`, `20261110210000`, `20261110220000`, `20261110230000`, `20261110233000`. Note that `20261110210000_add_actor_gateway_principal_guard.sql` was modified by the later merged Authentication Issuer stack, so the current file content is not byte-identical to the version at the allowlist commit. Its production checksum is not currently mismatched because it is pending, but its qualification must be revisited.
2. **Supplier classification / marketplace:** `20261110010000_add_business_supplier_classification` and `20261110260000_gateway_supplier_classification_cutover`. Related PR #243 remains open/draft; the initial classification migration reached main through merged #272 reconciliation. Inspect the current PR diff and Connect consumer before deciding whether any further implementation is needed.
3. **Capability catalogue and governance:** `20261110160000_add_admin_capability_catalogue_governance`, `20261110240000_enforce_capability_catalogue_cross_row_invariants`, `20261110250000_add_gateway_capability_governance`. These arrived in merged #272's Actor Gateway integration stack.
4. **Business profile contract/cutover:** `20261110265000_reconcile_business_profile_legacy_contract`, `20261110270000_gateway_business_profile_update`. These arrived in merged #272; their runtime caller and gateway cutover requirements must be confirmed.
5. **Signed Actor Gateway operations and read projections:** `20261111020000` through `20261111170000` as listed above, covering signed actor assertion bindings, capability/supplier/profile/registration operations, saved businesses, hours, trust score, logo and read projections. These arrived in merged #272 and require the actual isolated gateway contract/runtime deployment to be checked before production use.
6. **Authentication and runtime privilege hardening:** `20261111210000` through `20261111260000`, plus `20261112040000`, `20261112050000`, `20261112070000`, `20261112090000`, and `20261112170000`. These include runtime privilege revocations, removal of legacy entry points/overloads, search-path pinning, and restricted migrator access. They are security-sensitive: inspect exact SQL, dependency order, and all production callers before any approval.
7. **Token-bound authentication/recovery:** `20261111230000`, `20261112020000`, `20261112030000`. These relate to recovery revocation, password reset and conditional rehash; qualify against the merged isolated Authentication Issuer implementation and existing auth data/contracts.
8. **Connect provisioning and storage gateway:** `20261112080000`, `20261112140000`, `20261112150000`. These require signed Connect provisioning and storage-provider workflow/attestation dependencies to be established; do not infer that current production services already provide these callers.
9. **Previously allowlisted onboarding/read models/storage cleanup:** `20261110100000`, `20261110120000`, `20261110140000`. Keep their prior precondition/qualification findings; the storage cleanup file was subsequently corrected by merged PR #279 and needs the already-recorded disposable PostgreSQL qualification carried forward.

#### Next work sequence (no production mutation)

- Preserve this 42-entry inventory as the audit baseline; do not rerun the production audit merely to recover the list.
- Inspect each migration's current SQL and its merged commit/PR provenance. First establish the exact content of all 42 and the dependency order, then map to runtime consumers and current service availability.
- Read current handover and PR/branch state before each workstream. #272/#276/#277 are merged; do not recreate their implementation. #243 and #264 remain open and must be reviewed before touching supplier classification or gateway registration documentation.
- Do not expand the production pending allowlist, run `npm run migrate`, or deploy migrations as a response to this mismatch.
- The unresolved no-cost isolated Actor Gateway / Authentication Issuer hosting and cutover remains a blocker for gateway-dependent migrations. PayFast remains paused and is not a reason to include payment migrations or resume activation.
- Keep the pre-existing untracked recovery `.bak` file untouched.


### 2026-11-15 — SQL-level review of all 42 pending migrations

**Review source:** current `main` SQL files, read against the exact 42-row production pending inventory captured above. This is static source review only; it does not prove production preconditions or runtime caller compatibility.

#### Group A — foundational business metadata and read models

- `20261110010000_add_business_supplier_classification.sql`: adds `ghm.business.is_supplier` and a SECURITY DEFINER owner/admin write function. The initial RPC grants `ghm_runtime`; later `20261110260000` adds a signed gateway wrapper and revokes direct runtime execution. Apply only as part of the complete ordered supplier cutover, not as a standalone migration.
- `20261110100000_create_account_onboarding_progress.sql`: creates account/journey/step progress with lifecycle checks, runtime SELECT/INSERT/UPDATE, no runtime DELETE. Prior catalog preconditions were reported as passing; still confirm exact current production dependencies and application consumer before approval.
- `20261110120000_create_business_relationship_outcome_read_models.sql`: creates relationship/outcome type and fact tables, indexes and deterministic reference seeds. Runtime is SELECT-only. This is new schema/read-model capability; do not infer it is required for current Connect/QuoteFlow runtime without identifying the consumer and product readiness.
- `20261110140000_allow_pending_storage_object_cleanup.sql`: adjusts storage lifecycle CHECK to allow deletion of a still-pending upload and replaces the deletion-request function. This is the corrected PR #279 version. Carry forward the already-recorded disposable PostgreSQL lifecycle qualification; production rows/constraints must still be checked under a separately authorized read-only preflight before applying.
- `20261110160000_add_admin_capability_catalogue_governance.sql`: adds system-admin capability draft/lifecycle SECURITY DEFINER operations, initially executable by `ghm_runtime`; later gateway migration wraps these operations. It must be applied in sequence with catalogue invariants and signed gateway replacement, not by itself.

#### Group B — original gateway primitives and later signed cutover chain

- `20261110210000_add_actor_gateway_principal_guard.sql`: validates the dedicated login role and bounded Render administrator membership, then introduces the original `assert_actor_gateway(bigint)` helper. This original helper trusts a caller-supplied account ID after checking only the database login and active account; it is **not sufficient actor proof on its own**. Later signed-assertion migrations supersede it and `20261112070000` revokes the surviving unsigned helper.
- `20261110220000_add_actor_gateway_self_identity_read.sql`, `20261110230000_add_gateway_business_registration_identity_read.sql`, and `20261110233000_add_gateway_business_registration_identity_write.sql` introduce initial gateway wrappers. Their original forms rely on the initial actor helper. Later `20261111050000` rebinds registration and self-identity operations to the signed assertion. The registration write migration also corrects the existing upsert's ambiguous conflict target.
- `20261110240000_enforce_capability_catalogue_cross_row_invariants.sql`: adds serialized hierarchy validation, parent/replacement constraints and immutable published slugs. This is database-wide trigger behavior and must be reviewed for existing capability rows before applying.
- `20261110250000_add_gateway_capability_governance.sql`: creates gateway wrappers and revokes runtime/migrator access to the new wrappers; later `20261111020000` replaces the original actor-ID-only gateway signatures with signed, one-use assertions.
- `20261110260000_gateway_supplier_classification_cutover.sql` and `20261110270000_gateway_business_profile_update.sql`: move sensitive writes behind gateway wrappers and revoke direct `ghm_runtime` access to the old SECURITY DEFINER functions. They are cutover migrations; applying before the corresponding gateway routes are deployed would break existing resource API callers.
- `20261110265000_reconcile_business_profile_legacy_contract.sql`: restores a compatibility-aware Business profile update contract and adds paired latitude/longitude fields. Its own comment explicitly says not to apply without the separately approved migration gate. Verify the live function definition, schema columns and all legacy callers before any approval.
- `20261111020000` through `20261111060000`: establish the HMAC-backed, one-use, short-lived actor assertion and progressively bind capability, supplier, Business profile, registration, self-identity and request-context operations. These depend on an out-of-band 32-byte database verifier secret, dedicated `ghm_actor_gateway` login and isolated gateway process. The gateway role cannot read the secret; invalid signatures and nonce replays are rejected.
- `20261111070000_add_signed_business_capability_mutations.sql`: extends the signed assertion to Business Capability replacement, verification and evidence submit/review operations, including context binding.
- `20261111100000_add_signed_saved_business_gateway.sql`: signed saved-business reads and create/delete operations. Its comments explicitly retain old runtime grants pending a separate manual cutover.
- `20261111130000_add_signed_business_hours_gateway.sql` and `20261111140000_add_business_hours_read_projections.sql`: signed member reads/replacement plus public projections for approved active businesses. Existing runtime replacement grants are not automatically cut over by the wrapper creation.
- `20261111150000_add_signed_trust_score_gateway.sql` and `20261111170000_add_trust_score_read_projections.sql`: signed trust-score calculation/member reads and public projections. Verify source calculation dependencies and current API consumers.
- `20261111160000_add_signed_business_logo_gateway.sql`: signed binding of a canonical storage object to a Business logo. Depends on the storage metadata and provider lifecycle being available.

**Security/availability gate:** the approved ADR-001 records the issuer and gateway as approved for isolated design and qualification, but explicitly says no production provisioning or credential changes are authorized. The current Actor Gateway Worker config still has placeholder Hyperdrive ID/local test connection values, `workers_dev=false`, and preview URLs disabled. No production gateway service or credentials have been established. The existing worker code and passing CI do not satisfy this production dependency. Do not apply gateway cutover migrations until the gateway is securely hosted, configured, secret-provisioned and end-to-end verified with no-cost constraints met.

#### Group C — auth/session and privilege tightening

- `20261111210000_revoke_runtime_account_external_identity_table_access.sql`: removes direct table/sequence access while retaining narrow SECURITY DEFINER functions. It initially re-grants four runtime functions, some of which are revoked by the following migrations. Treat the chain as ordered, not independent.
- `20261111220000_revoke_unused_auth_runtime_entry_points.sql`: revokes runtime access to session revocation, password change and account disable functions based on the claim that no active HTTP/application callers exist. That claim must be checked against current mainline call sites and Connect/QuoteFlow flows before application.
- `20261111230000_add_token_bound_recovery_revocation_result.sql`: introduces a token-bound recovery redemption result with session revocation count and revokes broad caller-supplied account session revocation from runtime.
- `20261111240000_revoke_runtime_quoteflow_migration_provisioning.sql`, `20261111250000_revoke_runtime_external_identity_link.sql`, and `20261111260000_revoke_runtime_external_identity_bootstrap.sql`: remove runtime access to operator/migration-only account provisioning and external identity mutation functions. Confirm no live onboarding/login path still relies on these operations before applying.
- `20261112020000_add_token_bound_password_recovery_reset.sql`: adds atomic token + normalized-email password reset and session revocation. **Important unresolved boundary:** it explicitly grants EXECUTE to `ghm_runtime`, despite ADR-001 defining the isolated Authentication Issuer as owner of password/recovery operations. Do not assume issuer cutover is complete; inspect the actual issuer and resource API callers and decide whether the runtime grant is intentional transitional compatibility or a security-contract mismatch.
- `20261112030000_add_conditional_password_rehash.sql`: adds compare-and-swap password rehash and grants it to `ghm_runtime`. This also needs reconciliation with issuer-only credential verification/rehash responsibility; inspect actual callers before applying.
- `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration.sql`: makes QuoteFlow reset enrollment registration operator/migration-only while the issuer is described as only reading/completing approved enrollments. This remains a compatibility and migration authority check; QuoteFlow legal work is paused, but account migration/reset paths must not be casually broken.
- `20261112050000_revoke_public_default_function_execution.sql`: changes global default privileges for functions created by `ghm_schema_owner`, removing default PUBLIC EXECUTE. This is a persistent, broad future-object privilege policy change; inspect existing default privileges and ensure every intended future application function receives explicit grants. It is not merely a one-function revocation.
- `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql`: revokes the original unsigned `assert_actor_gateway(bigint)` helper from PUBLIC, runtime, migrator and gateway. This is the required final removal after signed typed operations replace its callers.
- `20261112090000_pin_security_definer_search_path.sql`: preflights ownership of all GHM SECURITY DEFINER functions and pins them to `pg_catalog, ghm, pg_temp`. This is a schema-wide security change; ensure every function owner precondition is satisfied and qualification covers temporary-object shadowing.

#### Group D — Connect provisioning and storage provider attestations

- `20261112080000_signed_connect_business_provisioning_gateway.sql`: adds a signed, atomic Connect Business provision-or-resolve gateway operation, revokes direct runtime use of the old mapping helper and grants the typed operation only to `ghm_actor_gateway`. It uses provider key `supabase` in the external mapping and advisory lock. This is **not by itself a live Supabase Auth/database dependency**: the existing Connect mapping contract explicitly defines `supabase` as external Business UUID provenance and states that GHM-native auth is separate. However, because the owner target is to eliminate active Supabase dependencies, preserve this as a legacy identifier namespace only; confirm no active Supabase connector/runtime is required, and review the retained provider value before any migration/cutover.
- `20261112140000_add_signed_storage_metadata_actor_gateway.sql`: adds signed actor-gateway create/read/deletion-request operations for Business Logo metadata. It deliberately excludes provider-confirmed lifecycle transitions.
- `20261112150000_add_storage_provider_workflow_attestation.sql`: adds a second, independent HMAC attestation for provider-confirmed availability/deletion, in addition to the actor proof. The Resource API is expected to mint this provider attestation; the gateway DB login cannot read the provider secret. The existing provisioning script `scripts/provision-storage-provider-attestation-secret.mjs` **explicitly refuses non-local databases** and only provisions disposable localhost qualification DBs. Therefore there is no currently qualified production secret-provisioning path in the repository. Do not apply/activate provider transition operations until a secure, owner-approved production secret provisioning and custody method exists.

#### Static review conclusions

1. The 42 migrations are not one atomic generic backlog. They comprise additive business data models, a corrected storage lifecycle, Actor Gateway schema/operation chain, authentication/runtime privilege tightening, issuer recovery primitives, and storage provider attestations.
2. Several migrations intentionally create wrappers while retaining old runtime grants until a separately approved manual cutover; others explicitly revoke old runtime access. The exact order and deployment window are therefore security- and availability-critical.
3. Some migrations depend on secrets that are not inserted by SQL migrations. The code's storage provider secret provisioner is deliberately local-only. No production secret or service should be provisioned as part of this audit.
4. ADR-001 remains the governing approval boundary: isolated design/qualification only, not production provisioning, secrets, grants, migrations, deployments or cutover. Amanda's Render support conversation and restricted-role recommendations remain preserved in the earlier handover sections; nothing in this review changes the role-management decision.
5. Static SQL review cannot establish live production preconditions, active HTTP callers, live object/row compatibility, or service readiness. Those require separate bounded read-only inspections and exact PR/branch/caller mapping.

#### Next review order

- First reconcile the issuer mismatch: find all current code callers of `auth_reset_password_with_recovery`, `auth_rehash_password_if_unchanged`, and the issuer-only credential procedures; compare the actual resource API and issuer routing.
- Then inspect the exact mainline Actor Gateway / issuer runtime consumers and environment requirements; do not create new services or paid resources.
- Then review the ordered runtime privilege revocations against all current Connect/QuoteFlow callers.
- Finally establish the storage secret provisioning/custody blocker and storage lifecycle preconditions.
- Do not run migrations, widen the allowlist, alter production secrets/grants, deploy, or change Render settings in these review steps.


#### Follow-up clarification — Authentication Issuer pre-cutover grants are intentional, not yet a production cutover

The static review's observation that migrations `20261112020000` and `20261112030000` grant selected recovery/rehash functions to `ghm_runtime` must be read together with the separate manual cutover contract:

- `database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql` is explicitly **MANUAL CUTOVER ONLY** and is not part of the automatic migration directory.
- It explicitly warns that applying it before all auth routes move will break registration/login/refresh/logout/password reset.
- It requires `session_user=ghm_migrator`, `current_user=ghm_schema_owner`, a provisioned restricted `ghm_auth_issuer` login, and completed service/client/backup/approval gates.
- It revokes the reviewed auth lifecycle functions from `ghm_runtime`, then grants the issuer its exact reviewed function allowlist, including password reset and conditional password rehash.
- `src/auth-issuer/database-privileges.ts` and `scripts/qualify-auth-issuer-cutover.mjs` implement startup ACL verification and disposable-only cutover qualification. The qualification script explicitly requires local `ghm_disposable_test` connections for issuer, runtime, gateway and migrator identities.
- The paired rollback file is also manual-only and does not restore old binaries, secrets or routing by itself.

Therefore the runtime grants in the two pending migrations are part of the **pre-cutover compatibility state**, not proof that the design intends permanent Resource API ownership. The outstanding issue is operational readiness: the isolated issuer service, dedicated credentials/secrets, client routing, backup/rollback plan and end-to-end qualification are not established in production. Do not execute the manual cutover or its rollback during this migration inventory exercise.

#### Implementation status wording reconciliation

ADR-001's original status line ("Implementation status: Not implemented") predates the later merged implementation. The Actor Gateway and Authentication Issuer code now exists on main because PRs #272 and #276 merged, with #277 worker hardening merged as well. This is **code implementation/qualification**, not production service provisioning or operational cutover. The ADR's no-production-provisioning/credential-change gate remains in force. The current Worker config still contains placeholder Hyperdrive configuration; no production service credentials or secrets were provisioned by these merges.


#### Mainline auth-route and issuer caller inspection

Read-only source inspection of current `main` establishes the intended split:

- `src/server.ts` constructs the Resource API with `createApp({ authRoutesEnabled: false })`.
- `src/http/app.ts` retains optional auth route registration for tests/embedded fixtures, but comments explicitly state auth lifecycle routes belong to the isolated Authentication Issuer.
- `src/auth-issuer/server.ts` creates its own pool from required `GHM_AUTH_ISSUER_DATABASE_URL`, loads issuer signing keys, constructs the auth/password-reset services, and enforces the dedicated issuer database identity and exact function ACL allowlist at startup/readiness.
- `src/auth-issuer/app.ts` registers auth routes on the isolated issuer app.
- Shared persistence code calls the token-bound recovery/reset and conditional password rehash functions. The separate manual cutover transfers the reviewed function EXECUTE allowlist from `ghm_runtime` to `ghm_auth_issuer`; this resolves the apparent SQL-grant contradiction described above.

**Deployment qualification:** this is source-code intent on current `main`, not evidence that production is already running this source. The GHM Internal Runtime auto-deploy remains OFF and no deployment/configuration change was made in this review. Do not assume the production binary has `authRoutesEnabled:false` or that Connect/web/QuoteFlow clients are routed to a live issuer until the deployed commit and client configuration are separately verified. The manual issuer privilege cutover remains blocked until the issuer service and client routing are live and end-to-end qualified.

The issuer cutover qualification script is restricted to local disposable PostgreSQL (`ghm_disposable_test`) with issuer, runtime, gateway and migrator URLs all required. It is not a production execution tool and must not be pointed at `ghm_db`.


#### Resource API / Authentication Issuer caller inventory — source-level checkpoint

Current `main` caller inspection confirms:

- `src/server.ts` explicitly starts the ordinary Resource API with `authRoutesEnabled: false`.
- `src/auth-issuer/server.ts` constructs the auth service and shared `PostgresAuthPersistence` using the dedicated `GHM_AUTH_ISSUER_DATABASE_URL`; issuer startup verifies role identity and exact database function ACLs.
- `src/auth/foundation/persistence.ts` calls account creation, password lookup, conditional rehash, session creation/refresh rotation, recovery issuance, token-bound password reset, QuoteFlow reset enrollment lookup/completion, external identity lookup, and refresh-token revocation. These methods are used by the issuer-side auth service. The exact runtime/issuer grant split is enforced only after the separate manual issuer cutover.
- The current issuer privilege verifier expects the Resource API runtime to retain only `ghm.auth_lookup_external_identity(text,text)` and `ghm.auth_lookup_business_external_mapping(text,text)` from the auth function family after cutover; issuer-only functions are separately allow-listed.
- The ordinary Resource API app still contains optional auth route wiring for tests/embedded fixtures, but the production entry point disables it. Do not interpret optional test wiring as an active production route.
- The current auth persistence adapter does not call `auth_link_external_identity`, `auth_bootstrap_external_identity`, or `auth_provision_migration_account`. QuoteFlow migration reconciliation/provisioning modules define narrow interfaces and explicitly use provider `supabase`, but no concrete active runtime store caller was established in this source inspection. Before revoking or migrating those operations, identify any separately invoked migration/operator tooling and retain the documented no-user-migration-blocker decision.
- The current auth persistence adapter does not call the old account-ID administration functions `auth_revoke_session`, `auth_change_password`, `auth_disable_account`, or `auth_revoke_all_sessions_for_account` directly. Internal SECURITY DEFINER routines may still call the owner-executed session revocation helper; that is distinct from granting the runtime direct execution.
- QuoteFlow migration reset enrollment registration is a migration/operator action. The issuer-side flow reads an approved enrollment and completes it; the manual issuer cutover also explicitly denies the registration function to runtime and issuer.

**Scope of this checkpoint:** source-level references and intended privilege architecture only. It is not proof that all external consumers, deployed clients, scripts, or production binaries have been exhaustively inventoried. The production deployment still has not been updated to current main during this audit. Preserve the requirement for a complete route/client and operational caller inventory before the manual issuer cutover or auth privilege revocations.

### 2026-11-15 — Client, service topology and storage provisioning reconciliation

This checkpoint follows the 42-migration SQL review. It inspects current GHM main source, current ZAID Connect PR metadata and existing handovers. No production configuration or deployment was changed.

#### Actor Gateway deployment reality

- Current implementation is a Cloudflare Worker (workers/actor-gateway), not a configured Render service. It requires a real Hyperdrive binding, ACTOR_GATEWAY_RATE_LIMITER, GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET, current ES256 public key/KID (and optional previous key pair).
- workers/actor-gateway/wrangler.jsonc has workers_dev=false, preview_urls=false, and a placeholder all-zero Hyperdrive ID. Its local connection string is explicitly a disposable PostgreSQL test value. The Worker cannot be deployed usefully until a real binding, DB principal/credentials, secrets, rate-limit binding, and reviewed HTTPS routing are configured.
- The Worker startup verifies session_user, role flags/membership, and the full gateway ACL before listening. It does not accept arbitrary SQL. The Resource API validates the gateway URL as an HTTPS origin (localhost HTTP only in development).
- The prior Render review found no dedicated Actor Gateway Render service; do not repurpose GHM Internal Runtime or any expired sandbox service. The current architecture ADR permits isolated implementation/qualification only and does not authorize production provisioning.
- There is no established $0 production topology in the reviewed evidence. Cloudflare Worker hosting/bindings and database connectivity must not be presumed free or provisioned without checking actual account plan/cost and explicit approval. Do not create a new paid service.

#### Authentication Issuer topology and client requirements

- Current mainline issuer code requires GHM_AUTH_ISSUER_DATABASE_URL, an issuer-only DB login, ES256 signing key material, refresh-token pepper continuity, explicit GHM_AUTH_ISSUER_TRUST_PROXY_HOPS and exact HTTPS GHM_AUTH_ISSUER_CORS_ORIGINS.
- QuoteFlow native mobile calls the issuer directly from outside Render. Connect native bearer flows also need the issuer HTTPS origin and CORS; Connect's optional browser-cookie path uses the same-origin Vercel BFF and remains separately gated. A private-only issuer endpoint cannot serve all clients.
- Current issuer app has no password-recovery delivery adapter; generic recovery and QuoteFlow migration-reset recovery intentionally return 503. Do not claim complete issuer readiness until delivery is separately solved without introducing an unapproved paid provider.
- The manual issuer DB privilege cutover remains manual-only and production-prohibited. It must follow issuer deployment, client routing, exact-head disposable qualification, verified backup/restore and separate approval. The current Render production binary/deployment was not inspected in this source-only pass and must not be assumed to match current main.

#### Storage-provider dual-proof readiness

- Resource API production storage configuration requires STORAGE_PROVIDER=s3, region, bucket, access key ID and secret access key; custom endpoints must use HTTPS. If storage is enabled in production, GHM_ACTOR_GATEWAY_URL and GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET are also required.
- The provider attestation is HMAC-SHA256 over operation, issue time, nonce and request context using a canonical base64 32-byte key. PostgreSQL stores the verifier secret in a protected table; neither runtime nor gateway should be able to read it.
- scripts/provision-storage-provider-attestation-secret.mjs explicitly rejects any non-localhost/non-disposable database and requires the explicit mutation opt-in. This is qualification-only, not a production secret provisioning procedure.
- Existing storage evidence says provider-level Cloudflare R2 PUT/HEAD/GET/DELETE passed, and the November signed actor/provider proof path passed disposable PostgreSQL qualification. It does not establish deployed Resource API → Worker → production DB → provider workflow, recovery/orphan reconciliation, production secrets, or production enablement.
- The existing bucket named zaid-ghm-production is not proven to be non-production. Do not use it for new mutation tests.

#### ZAID Connect current PR and no-Supabase reconciliation

Live GitHub PR inventory for zaid-connect was checked:

- PR #68 feat: migrate core Connect workflows to GHM remains OPEN / DRAFT, head 2eadf761400bb5a644b5907e670aacb68526c81f. It contains a broad caller migration batch for Opportunity, Projects/Quotes, Trust Score, notifications, Analytics/engagement, onboarding, relationships/outcomes, commercial, Business Logo, Marketplace and administration. Its body explicitly says remaining Supabase callers and dependencies remain and lists more gates; it is not a completed no-Supabase cutover.
- PR #69 docs: hand over GHM auth trust-boundary findings remains OPEN / DRAFT, head 1aaf64cf8ca01e500df33d2a95b4b130747c1885. Documentation-only, must be reviewed before duplicating or superseding its handover content.
- PR #33 is an open/draft PayFast sandbox bridge and remains out of scope while PayFast sandbox access is unavailable.
- PR #68 explicitly depends on GHM #243 supplier classification and #244 Analytics/engagement. #243 and #244 remain open/draft. Do not declare these consumers complete or merge PR #68 as though dependencies have closed.
- PR #68's changed-file list includes the central src/lib/lib_supabase.js, auth contracts, Marketplace, Analytics, onboarding, relationships, commercial, notifications, Business Logo and multiple other clients. The PR is not proof that all callers are migrated or that the app has no active Supabase runtime dependency.
- The current Connect main baseline still has an active @supabase/supabase-js facade in src/lib/lib_supabase.js, including Supabase Auth, Postgres/RPC, Storage and Realtime call sites. Its own migration handover says zero active Supabase runtime dependency is the target, and explicitly retains historical migrations/source only as provenance.
- The GHM Connect provisioning migration's provider='supabase' is only a legacy external-identity namespace in the mapping contract; it is not evidence that GHM's target runtime should connect to Supabase. This distinction must not be used to excuse the still-active Supabase callers in Connect main.
- The current Connect identity adapter and service trust contract still describe legacy Supabase identity bridging. GHM-native identity/session and removal of active Supabase Auth/database/Storage/Realtime/Edge Function use remain separate product migration gates. User's instruction remains no Supabase dependency in the target website/runtime; user migration is not a blocker and accounts can re-sign-up.

#### Corrections to stale documentation and prior assumptions

- Some older GHM issuer handover/runbook text says PR #272/#276 are unmerged construction branches and quotes the old PR #25 as an open Supabase Auth removal proposal. These statements are stale after the 2026-11-15 merge of #272/#276/#277 and the later ZAID Connect PR inventory. Do not use old PR #25 as a live work item; its current API state is closed and its scope was a commercial milestone, not a current auth-removal plan.
- Current mainline source has issuer and gateway implementations, but implementation/CI is not deployment. The governing no-production-provisioning and no-cutover constraints remain unchanged.
- A previous summary phrase that the provider namespace is not an active Supabase dependency applies only to the GHM external-identity mapping key. It does not describe Connect's current runtime, where active Supabase facade calls remain on main.

#### Next sequence

1. Review PR #68 exact diff and latest CI, especially auth, storage/logo, notifications, onboarding, relationships, commercial, supplier classification and central facade; compare with GHM current main contracts and all remaining GHM dependencies before any Connect changes.
2. Review PR #69 and update/close documentation duplication only after its content is reconciled with this handover.
3. Check GHM #243 and #244 exact heads, status and dependency compatibility; do not recreate supplier/analytics work.
4. Determine a genuinely no-cost, secure and supported deployment topology for issuer and gateway before proposing any service/Worker configuration. No service creation, paid plan, secrets, environment changes or deployment now.
5. Keep storage production secret provisioning, issuer manual cutover, gateway cutover, all 42 production migrations, PayFast, and Connect production cutover blocked.

### 2026-11-15 — ZAID Connect PR #68 exact-diff and dependency reconciliation

Reviewed the live GitHub metadata, complete PR #68 changed-file inventory, its exact-head check runs, the PR's own migration status/handover, current GHM main source and dependency PR heads. This is a source/branch review only; no PR, branch, code, production setting or deployment was changed.

#### Connect PR #68 exact state

- PR #68 remains OPEN / DRAFT, branch feat/ghm-opportunity-runtime-migration-20261110, exact head 2eadf761400bb5a644b5907e670aacb68526c81f; PR base SHA 1e92f85cdd99dea2070ede58a875cec45d5f2047; last GitHub update 2026-11-10T06:10:59Z.
- Exact-head GitHub Actions quality run 42766795369 completed SUCCESS on 2026-11-10T06:12:11Z. The separate combined commit status is FAILURE only because Vercel reported deployment rate limit / retry in 24 hours. Do not describe that external status as a failed test or treat the old quality pass as qualification for any later head.
- Current Connect main is 84d7edb64346f1b698f9b76bcb54d2e653df1292. Comparing current main to PR branch reports diverged, PR branch 153 commits ahead and 1 behind. The PR's recorded base is old. Reconcile the one mainline commit and re-run exact-head Connect quality, typecheck, lint and production build before merge consideration.
- PR #68 changes 43 files, including Opportunity, Project/Quote, Marketplace, Trust Score, Analytics/engagement, Notifications, Onboarding, Relationships/Outcomes, Business Logo, Capability Catalogue and the central facade. Its own body explicitly says it is a partial migration and lists remaining Supabase callers; it must not be described as full Supabase removal.

#### PR #68 capabilities and backend dependency status

- **Supplier/contractor Directory filtering:** current GHM main already contains the exact supplier migration blob used by GHM PR #243 and the public Directory service/repository filtering. The main Business identity repository includes is_supplier in the projection. This is not a reason to merge stale PR #243. However the supplier classification migration 20261110010000 and later signed supplier gateway cutover 20261110260000/20261111030000 are still among the 42 production-pending migrations. Source support on main is not production schema readiness.
- **GHM PR #243:** still OPEN / DRAFT at 1246ed74a81b3fc607e6f65f3cd8036bc081ab1b; its exact-head quality and web-quality checks passed (run 42754360447). Its branch compares to current GHM main as 38 commits ahead / 508 behind. The original migration blob and selected Directory files are identical to current main, while the current Business identity repository differs. The old branch contains the pre-signed direct-runtime mutation contract; current main has later signed gateway supplier cutover migrations and should remain authoritative. Do not merge/cherry-pick PR #243 or use it as a current integration base.
- **Analytics/engagement backend is absent from current GHM main:** the current main tree has no 20261110020000_create_business_engagement_analytics.sql, no business-analytics or business-engagement routers/services. These files exist on PR #244 branch only. Therefore PR #68's Analytics/engagement clients do not yet have matching current-main GHM endpoints. GHM PR #244 remains OPEN / DRAFT at f418407bface1146e4cf0147424fb91bff81328a; exact-head quality checks passed on runs 42743679457 and 42743672211. Its branch is 75 ahead / 514 behind current main. Do not merge/cherry-pick this stale branch. If Analytics remains required, re-derive the backend feature from current main on a fresh branch, preserving entitlement fail-closed, account-wide rate limiting, authenticated actor binding and approved metric semantics; then requalify Connect client against that exact API.
- **Onboarding and Relationships/Outcomes:** GHM current main contains their resources/routes/migrations, and PR #68 adds corresponding clients. Their migrations 20261110100000 and 20261110120000 are among the 42 unapplied production migrations. Relationships legacy data has not been exported/imported/reconciled; Connect handover explicitly prohibits promoting the read switch until a provenance-preserving migration is approved.
- **Business Logo:** PR #68 client uses GHM storage grant/upload/verify/bind flow. Existing legacy Supabase logo objects have not been copied/re-uploaded/rebound. Production storage is additionally blocked by missing configured Actor Gateway and provider workflow attestation custody; do not infer historical logo continuity from the new upload client.
- **Commercial panel:** PR #68 moves the Business Pro panel to the GHM read-only offer/access projection and removes trial/payment/checkout mutation controls. It does not complete the commercial user journey. AdminCommercialLaunchPanel still imports the legacy Supabase commercial launch service. PayFast/Paystack provider ownership remains unresolved and payment activation remains frozen.
- **Project delete:** PR #68 deliberately fails closed because GHM has no governed Project delete endpoint. Do not restore delete UI or add a Supabase fallback without a GHM-owned operation with ownership, open-status, quote-history and Opportunity lifecycle guarantees.

#### Remaining Supabase surface in PR #68 branch

- package.json still includes @supabase/supabase-js; VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY remain required by the legacy facade/AI client. src/lib/lib_supabase.js remains a large live facade (626 changed lines, not removed) with Auth, Postgres/RPC, Storage and other legacy calls.
- The branch's own status register lists unresolved identity-provider Supabase assumptions in the Connect integration identity/authorization binding; AI proxy endpoint; Admin Commercial Launch; push subscription storage/delivery; referrals/rewards if any active caller is confirmed; avatar/media lifecycle; central facade, SDK, Vite configuration and lockfile cleanup.
- The exported useLeads hook in src/hooks/hooks_index.js still opens a Supabase Realtime channel, while the migrated notification inbox uses GHM polling. A repository code search found no other useLeads call site, so treat this as a legacy/dormant exported hook until route usage is proven; do not count it as active solely from the export. The same hook module also retains legacy Supabase auth/business/lead/saved service imports; verify actual imports before deciding whether to migrate or retire the module.
- aiProxyClient.js still constructs VITE_SUPABASE_URL/functions/v1/ai-proxy and uses the Supabase anon key, but it checks isAIProviderAuthorized(releaseMode) before reading configuration/network access and the current authorization remains false. Keep AI disabled; do not replace with a paid provider or activate it during this migration.
- The Connect PR's own acceptance gates correctly require repository-wide active-source scan, removal of SDK/config only after every caller is migrated or retired, authorization tests, full CI/build, and separate data/config/deployment/cutover approval. Preserve these gates.

#### Connect PR #69 — auth trust-boundary handover

- PR #69 remains OPEN / DRAFT, documentation-only, exact head 1aaf64cf8ca01e500df33d2a95b4b130747c1885, one changed file (the Connect migration status register). Exact-head quality and Vercel Preview status both passed.
- Its 920-line status addition contains useful 2026-11-10 historical production role/function/ACL observations, including broad runtime direct DML/SELECT risks and the original rationale for isolated issuer/gateway. These observations must be reconciled with the later Amanda Render support conversation, merged role separation work, current Actor Gateway/Issuer code and 2026-11-15 production audit before reuse.
- The PR #69 document still includes historical statements that the production migration audit had not run due connector limitations; those statements are superseded by the local read-only audit now completed (137 repo migrations, 105 live ledger rows, 42 pending, INVESTIGATE, zero checksum/name mismatches and zero other audit exceptions). Do not copy those stale statements forward.
- Keep PR #69 as a reference until its historical evidence has been reconciled. Do not merge it as a substitute for updating the current GHM handover.

#### Current decision / next sequence

1. Do not merge PR #68, #69, #243 or #244 at their current heads. No PR mutation was made in this review.
2. Current-main supplier source is present but production migrations remain pending; do not reintroduce the old unsigned/direct-runtime supplier mutation from PR #243.
3. Analytics/engagement is a genuine current-main backend gap for the Connect PR #68 client; PR #244 is stale. Reconcile/port it from current main only after reviewing current main commercial entitlement model and migration ledger constraints.
4. Reconcile PR #68's one-behind Connect main commit and re-run exact-head quality/typecheck/lint/build only after backend dependencies and feature contracts are aligned. No branch rewrite/rebase has been performed.
5. Complete active-vs-dormant Supabase caller audit, especially admin commercial, AI (remain disabled), push, avatar/media, legacy hooks and central SDK/config. Remove facade/SDK only after all active callers are migrated or explicitly retired.
6. Keep all 42 production migrations, issuer/gateway cutovers, storage secret provisioning, data imports, deployments, payment activation, and Supabase removal from production blocked pending their separate readiness and approval gates.


#### Additional security review of stale GHM PR #244 — do not transplant as-is

Inspected the exact PR #244 migration, routers and repositories against current main transaction/authorization patterns.

- The proposed migration grants ghm_runtime direct INSERT on business_engagement_event, direct SELECT on the table and USAGE/SELECT on its sequence. No RLS or actor-bound database function is defined in that migration.
- The proposed repository calls withAuthorizedTransaction(context,...), then writes context.userId into account_id. Current src/db/authorized-transaction.ts only calls requireAuthenticatedContext in application code and runs the callback in a normal transaction; it does not establish a DB-verifiable actor identity or signed assertion.
- Therefore the event's account_id is trustworthy only while the application process and its supplied AuthContext remain trusted. Any direct SQL caller holding the ghm_runtime credential can insert events attributed to arbitrary account IDs and read all event rows. This conflicts with the documented Actor Gateway objective of preventing direct DB callers from impersonating actors. Do not transplant PR #244's engagement write path or grant as-is.
- The proposed rate limit is a transaction advisory lock keyed by account ID plus a count of that account's events in the previous minute. It protects normal application requests but is not a database actor-authentication boundary; direct SQL can select another account ID or write around the intended caller path.
- The analytics read repository duplicates entitlement evaluation with a direct join to subscription/plan entitlement. Unlike current src/resources/commercial/repository.ts readCommercialAccess, it does not check current_period_start <= database now; it checks only that current_period_end is null or in the future. A future-dated subscription could therefore pass the Analytics-specific check. Any replacement must reuse or align with the canonical entitlement evaluator and test period boundaries, lifecycle status, membership roles and business scope.
- The PR #244 migration and source are not on current main; no 20261110020000 migration exists in the 42-entry current production pending inventory. Do not add it to production allowlist or apply it.

#### Product/data semantics that require a backend contract decision

- PR #244 only records authenticated account engagement; it intentionally excludes anonymous profile views and active members' own engagement. This is a material product/metric definition, not equivalent to the old Supabase dashboard's profile views/calls/WhatsApp metrics.
- Its dashboard maps leads to enquiry rows, quotes to project_quote rows, projects_won to accepted quotes, and conversion_rate to accepted quotes divided by enquiry count. The old UI metric semantics require explicit confirmation; the PR itself records this as a product gate.
- recent_activity in the proposal contains only engagement events, not enquiry or quote activity. The UI's recent-activity contract therefore needs explicit mapping or a narrower label.
- The current canonical commercial access evaluator uses subscription lifecycle plus both period start/end bounds before returning entitlements. Analytics must not independently weaken or diverge from that evaluator.

#### Decision

Do not create a new Analytics/Engagement branch or port PR #244 yet. First settle the event actor-proof design (prefer the existing signed Actor Gateway contract if a supported no-cost runtime topology can be established), canonical entitlement reuse, and product metric semantics. If the gateway cannot be hosted securely at $0, keep engagement capture unavailable rather than reintroducing direct runtime actor assertions. A read-only analytics endpoint may be considered separately after entitlement and metric semantics are approved, but it must not claim event metrics that have no trusted source.


#### Connect active-versus-dormant Supabase caller audit — 2026-11-15

Reviewed current PR #68 branch source and app/route wiring. Code search was used to distinguish mounted screens from orphaned exports.

**Confirmed active remaining Supabase paths:**

- AdminCommercialLaunchPanel is imported and rendered by AdministrationScreen when commercialAdminVisibility is enabled (currently true). It calls commercialLaunchAdminService.getState(), which still calls Supabase RPC get_admin_commercial_launch_state. Current GHM main has only user-scoped commercial offer/access/subscription read routes and an internal service-asserted router; there is no equivalent browser-safe, GHM-admin-authorized launch-state read endpoint. This is a real remaining active Supabase dependency. Do not expose the internal service route to browsers or loosen its assertion boundary. A GHM-native admin read contract needs explicit admin/founder authority, bounded pagination, safe projection and audit coverage.
- AIQuoteAnalyzerScreen is lazy-loaded and routed by ZaidConnectApp. It still imports quoteAnalyzerService from the Supabase facade, whose implementation reads a quote through the legacy projectQuoteService path and writes/reads quote_analyses in Supabase. This is a separate persistence dependency from external AI provider invocation. Do not activate paid AI; determine whether quote analysis should be retired for the free-directory phase or replaced with a GHM-owned deterministic analysis/read contract before removing its facade methods.
- The active AnalyticsScreen uses ghmBusinessAnalyticsService, but its required GHM analytics/engagement routers and migration exist only on stale PR #244, not current GHM main. Treat this as a broken/incomplete backend dependency on PR #68, not a completed migration.
- OnboardingPanel uses ghmOnboardingService and has guidedOnboarding=true. Its API exists in current GHM main, but migration 20261110100000 is pending in production. Do not call it production-ready until the schema migration and deployed API are aligned.
- BusinessWorkspaceScreen mounts useBusinessWorkspace, which now imports leadService from the GHM directory service; this is migrated on PR #68 and does not require the dormant hooks_index useLeads path.

**Confirmed dormant or unmounted legacy modules (do not prioritize as active callers without new route evidence):**

- src/hooks/hooks_index.js has no active source import found in the Connect PR branch; its old useAuth/useBusinesses/useOwnedBusiness/useLeads implementations still import the Supabase facade, and useLeads opens Supabase Realtime, but no caller of those exports was found. BusinessWorkspaceScreen uses the separate migrated GHM hook. Treat hooks_index as legacy/dead-code cleanup candidate after a complete import graph/build scan, not as proof of mounted Supabase Realtime use.
- src/lib/lib_notifications.js exports subscribeToPush and persists to Supabase push_subscriptions, but no active source caller was found. Push subscription/delivery is not a current active migration blocker based on the inspected app tree.
- ReferralSystem in src/components/components_index.jsx still accepts a Supabase client and queries referrals, but no import or mounted usage was found. The referral programme is dormant legacy UI; no GHM referral backend should be built unless product scope reactivates it.
- AdminVerificationScreen is exported from the Administration feature index but is not imported/rendered by current AdministrationScreen or app route wiring. Its old Supabase calls are dormant in the inspected runtime.
- VerificationWorkflow in components_index.jsx is a simulated placeholder (local state and timeout) and is not an active GHM/Supabase integration path. Do not build a backend migration around this mock.
- AISupportScreen is routed, but the external provider call is guarded by isAIProviderAuthorized and milestone38Approved is false in the current release configuration. Local static responses remain available; do not mistake the gated client code/config reference for an authorized live provider call.

#### Prioritized Connect next work

1. Resolve the active AdminCommercialLaunchPanel Supabase RPC with a dedicated GHM admin-read endpoint and client contract; preserve server-side administrator authority and do not reuse internal service assertions in browser code.
2. Decide whether AIQuoteAnalyzerScreen is retired for the current free-directory launch or receives a GHM-owned non-provider analysis persistence contract; keep provider invocation disabled.
3. Keep Analytics/engagement client blocked until a secure actor-proof event write design, canonical entitlement evaluation and approved metric semantics are implemented on current GHM main. Do not port stale PR #244 direct-runtime event grants.
4. Keep onboarding client behind production schema/deployment qualification until pending migration 20261110100000 is reconciled.
5. After the active callers are resolved, run a complete import/route/build scan and remove dead hooks, dormant referral/push/verification modules only with evidence and separate review. Then remove Supabase SDK/config/facade and lockfile entries.


### 2026-11-15 — GHM admin commercial launch read API (PR #283)

Started a focused, no-migration GHM implementation to replace Connect's active `get_admin_commercial_launch_state` Supabase RPC. Existing Connect PR #68's `AdminCommercialLaunchPanel` is mounted when `commercialAdminVisibility` is true and expects an array of snake_case rows. The legacy RPC authorizes only `auth.uid()` whose profile role is admin, and returns business name, plan code, trial status, subscription status, founding sequence, cancellation-at-period-end and current period end. This is the contract being preserved; no aggregate metrics are inferred.

#### Implementation branch and PR

- Draft PR #283: `feat(commercial): add admin commercial launch state read` — https://github.com/zaidhqdev-sys/GHM/pull/283
- Branch: `feat/admin-commercial-launch-read-20261115`.
- Implementation code head qualified by CI: `4c2ad2f82c9d1a4efc77af910376be18da7ff0d9` (the final handover-only commit may advance the PR head).
- Changes: extend Commercial service/repository contracts; add admin-only service method; add `GET /api/v1/admin/commercial/launch-state?limit=100`; query GHM business/commercial tables with bounded `LIMIT` and lateral latest trial/subscription projections; map response to the existing Connect snake_case array contract.
- Authorization: GHM ES256 bearer authentication resolves active account state from `ghm.account_identity`; the route requires `AuthContext.role === 'admin'`, registered commercial read operation and commercial resource access; the service independently requires admin role. No caller-supplied actor/account ID is accepted.
- Input: default limit 100; accepted integer range 1–250; unsupported query keys and malformed/out-of-range limits return 400. Non-admin receives 403; missing/invalid bearer is rejected by the existing resource auth middleware.
- Database: SELECT-only query over `ghm.business`, `ghm.commercial_subscription`, `ghm.commercial_plan_version`, `ghm.commercial_plan`, `ghm.commercial_trial`. Existing commercial-schema migration grants `ghm_runtime` SELECT on the required business and commercial tables. No migration, ACL change, new table, role, secret, service or deployment is required.
- Tests added/extended: Commercial service admin-only and limit validation; repository projection, bounded query and row mapping; HTTP non-admin denial, malformed limit rejection, admin success and Connect-compatible snake_case response.
- This endpoint is intentionally read-only and does not expose the internal service-asserted commercial payment routes. PayFast remains paused.

#### Qualification and integration status

- PR #283 remains DRAFT. Exact implementation-head CI run 43740578909 on `4c2ad2f82c9d1a4efc77af910376be18da7ff0d9` completed SUCCESS: `quality` SUCCESS and `web-quality` SUCCESS; Cloudflare Pages also SUCCESS. The test diagnostic artifact confirms 1,016 tests, 1,016 passed, 0 failed. An earlier run exposed a test-only mistake (using `assert.rejects` for synchronous service guards); this was corrected to `assert.throws` and the subsequent full suite passed. The final handover-only commit may advance the PR head; verify its own CI before merge.
- No production GHM DB query, migration, Render variable, service setting, deployment, Connect branch or PR #68 change was performed for this implementation.
- After PR #283 passes exact-head CI and is reviewed, the Connect client change must replace `commercialLaunchAdminService.getState()` with this endpoint, preserve the existing panel's snake_case row contract, and remove only that specific RPC dependency. Do not remove the Supabase SDK/facade until the separately documented active callers are resolved.
- Amanda's Render support guidance remains the source-of-truth operational constraint: retain Dashboard-managed admin, separate `ghm_runtime` and `ghm_migrator`, preserve the SET-only schema-owner path, and do not improvise grants or new paid infrastructure. This read endpoint uses existing grants and does not alter that role separation.


## Connect admin commercial launch read integration — 2026-11-15

- Connect PR #68 (`zaidhqdev-sys/zaid-connect`, branch `feat/ghm-opportunity-runtime-migration-20261110`) has now been updated to consume the read-only admin commercial launch endpoint introduced by GHM PR #283.
- Connect uses the authenticated browser GHM client and calls `GET /api/v1/admin/commercial/launch-state?limit=...`; the previous Supabase RPC `get_admin_commercial_launch_state` facade has been removed from the Connect panel path.
- Connect added response/limit/authorization contract coverage and wired it into its quality workflow. Its exact-head CI remains a qualification gate.
- PR #283 remains draft/unmerged at this checkpoint. Do not merge or release Connect PR #68 until the GHM endpoint is merged, deployed through the existing approved GHM runtime process, and the Connect exact-head checks pass. No production deployment, database change, migration, payment activation, or provider change is authorized by this integration.
- This does not unblock commercial trial activation or checkout. PayFast remains paused; no payment write path is included.

- Connect exact-head CI for the new admin commercial launch consumer passed on Connect PR #68 head `5f421abffa4133d94be746627f3b622f57f0adce` (run `43742147332`): GHM admin commercial launch client contract, existing analytics/engagement/commercial contracts, typecheck, lint and production build all passed. The Connect handover records this result.
- This is client-side qualification only. GHM PR #283 is still draft/unmerged; Connect PR #68 remains draft. No production deployment, database change, migration, or commercial payment activation was performed.


## Exact-head commercial launch read qualification — 2026-11-15

- GHM PR #283 head `623a853e0b9cc677615b95c7efb0402b69a7e8ca` completed GitHub Actions run `43743268093` successfully: both `quality` and `web-quality` jobs passed, with no failed steps.
- The full quality job completed the Business Logo, supplier classification, Business profile, commercial payment-settlement identity, migration audit policy, runtime-boundary and auth-issuer cutover/SECURITY DEFINER inventory qualifications. The disposable PostgreSQL migration/test environment was used; production `ghm_db` was not queried or changed.
- The web-quality job passed web build, tests, dependency audit and security-sensitive toolchain verification.
- PR #283 body was updated to record the exact-head result and accurately disclose that branch ancestry remains 5 commits behind current `main`; the intervening main commits changed only this handover document, whose content was synchronized onto the PR branch. This is content reconciliation, not a rebase. Keep the PR draft until branch history is reconciled and the release review is complete.
- Connect PR #68 currently remains draft at head `5839bad513db77e204bcb0ae37e53d2153a95cd9`; the recorded consumer-code head `5f421abffa4133d94be746627f3b622f57f0adce` passed Connect run `43742147332`, but the current documentation-only PR head's own exact-head qualification remains to be verified.
- No production database, Render configuration, deployment, Connect branch, payment activation or provider change was performed. PayFast remains paused.
- Amanda's Render support constraints remain unchanged: retain Dashboard-managed admin, separate `ghm_runtime` and `ghm_migrator`, preserve the SET-only schema-owner path, and do not improvise grants or add paid infrastructure.


## 2026-11-15 — PR #283 ancestry reconciled with current main

- Rechecked PR #283, branch `feat/admin-commercial-launch-read-20261115`, current `main`, changed-file inventory and prior exact-head CI before changing branch history.
- Current main at reconciliation: `6f9cf966fefd2c77f8a0ce95b0adcfa3ca7a3d7a`. PR branch before reconciliation: `22925711dce0e39df96725ae86bb82fb9ef7d426`.
- Verified the complete current-main handover document was an exact prefix of the PR branch document; the PR branch contained the additional commercial launch and qualification addenda. Thus the five mainline commits since the prior merge base were all represented in the branch tree, with no mainline content to discard.
- Created merge commit `49f88af47b40ba46f48609792892b7b44144cfab` with both current main and the PR branch as parents, retaining the PR tree. Advanced the existing PR branch using a non-force fast-forward update with expected previous head `2292571...`; no new branch or PR was created.
- Verified compare result after update: status `ahead`, ahead 18, behind 0, merge base current main `6f9cf966...`. Exactly eight intended changed files remain: this handover plus the seven commercial route/service/repository/contracts implementation and test files.
- PR #283 description corrected to reflect merge-parent ancestry reconciliation. Exact-head CI run `43743790813` is running on merge commit `49f88af...`; do not promote until it completes successfully.
- No production DB query/mutation, Render change/deployment, migration execution, Connect branch change or payment activation. PayFast remains paused.
- Amanda's Render support constraints remain authoritative: retain Dashboard-managed admin; keep `ghm_runtime` and `ghm_migrator` separate; preserve the SET-only schema-owner path; no improvised grants or paid infrastructure.


## 2026-11-15 — PR #283 reconciled exact-head qualification and implementation review

- Final branch head before this handover append: `9c50fd2f4346b577050bfd99414e66481ec698e6`; exact-head GitHub Actions run `43743842730` completed successfully. `quality` passed all 73 steps and `web-quality` passed all 11 steps. No failed steps.
- The full core job completed disposable PostgreSQL migration qualification and the existing security/tenant/auth/storage/commercial qualification chain, including signed Trust Score and Business Logo gateway cutovers, supplier classification and membership authorization, commercial payment-settlement identities, and guarded auth issuer manual cutover/lifecycle denial checks. No production database was used.
- Source-level review of the eight-file PR diff found the new endpoint restricted by the authenticated resource middleware plus database-loaded `admin` AuthContext role, with no caller-supplied account identity. Request limit is validated (1–250, default 100), unsupported query keys are rejected, the service repeats role/limit validation, and the repository uses a bounded, deterministic, read-only query in an authorized transaction. No additional migration, grants, tables, provider calls or write paths were introduced by this slice.
- Review metadata rechecked: no submitted PR reviews and no inline review threads. This records the assistant's source-level review; it does not claim an independent reviewer approval.
- Branch comparison against current main `6f9cf966fefd2c77f8a0ce95b0adcfa3ca7a3d7a`: `ahead` 19, `behind` 0, merge base current main; eight intended changed files only. PR #283 remains open/draft pending owner release progression.
- Connect PR #68 exact current head `5839bad513db77e204bcb0ae37e53d2153a95cd9` has successful exact-head run `43742292220`; it remains draft and depends on GHM integration/deployment before production consumer activation.
- No production `ghm_db` access or mutation, Render configuration/deployment, migration execution, Connect branch change, or payment activation. PayFast remains paused.
- Amanda's Render support constraints remain authoritative: retain Dashboard-managed admin; keep `ghm_runtime` and `ghm_migrator` separate; preserve the SET-only schema-owner path; do not improvise grants or add paid infrastructure.


## 2026-11-15 — PR #283 merged after exact-head qualification

- PR #283 `feat/admin-commercial-launch-read-20261115` merged successfully to `main`.
- Merged commit: `37989fcf310d8d7049dd38bfc2469e228fee6ee5`.
- Exact PR head: `5aca0e4be99fa339a37741513ebd3d409d97a9f3`; exact-head GitHub Actions run `43744168077` completed successfully: `quality` 73/73 steps passed and `web-quality` 11/11 steps passed, no failed steps.
- PR branch ancestry was reconciled with current main before merge (0 commits behind); mergeability was true. The eight-file diff remained the handover and commercial read endpoint/service/repository/contracts plus tests.
- Source review recorded: authenticated admin AuthContext enforcement, bounded 1–250 result limit, unsupported query-key rejection, service-level authorization/validation, deterministic bounded read-only repository query, no caller-provided account identity, no added migrations/grants/tables/provider calls/write paths. No submitted PR review or inline thread existed; this is the assistant's source-level review, not a claim of independent review approval.
- Merge changes source on GitHub only. Render `ghm-internal-runtime` auto-deploy remains OFF; no production deployment, production `ghm_db` access/mutation, migration execution, Render environment/configuration change or payment activation was performed.
- Next gate: verify merged main commit and production Render service configuration/deploy state; prepare a controlled manual deployment and endpoint smoke test only within the existing approved Render service and current environment. Keep Connect PR #68 draft until GHM endpoint is deployed and verified.
- Connect PR #68 current consumer head `5839bad513db77e204bcb0ae37e53d2153a95cd9` has exact-head CI run `43742292220` successful. It remains unmerged pending deployed endpoint verification.
- PayFast remains paused. Amanda's Render support constraints remain authoritative: retain Dashboard-managed admin; keep `ghm_runtime` and `ghm_migrator` separate; preserve the SET-only schema-owner path; no improvised grants or paid infrastructure.


## 2026-11-15 — Render manual deployment build failure and recovery requirement

- Manual deploy triggered for existing service `GHM-Internal-Runtime` (`srv-damupsek1f9s73eq8kkg`) after PR #283 merge; auto-deploy remained OFF and no environment variables, database settings, service plan or infrastructure were changed.
- Deploy `dep-dbsv8cuk1f9s73ada3ig` attempted commit `8f3ee5748679c736aaefc7bcf9f6716b5453314a` and failed during build with exit status 2. Previous live deploy remains `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`; no new application version became live.
- Render build log shows widespread TypeScript TS7016 missing declaration errors for development type packages including `@types/pg`, `@types/express`, and `@types/jsonwebtoken`, plus downstream implicit-any/unknown typing errors. This indicates Render's current build install command `npm ci && npm run build` is not including devDependencies in this build environment (likely production omit behavior); the same source passed exact-head GitHub Actions CI.
- Required service Dashboard correction: set only the existing service's Build Command to `npm ci --include=dev && npm run build`. Keep Start Command `npm start`, branch `main`, auto-deploy OFF, all environment variables and service plan unchanged. No new service or paid infrastructure.
- The Render connector available in this session supports read-only service inspection and manual deploy triggering but exposes no update-service/build-command action. Therefore the build-command correction must be made in the existing Render Dashboard by the owner; do not claim it has been applied.
- After the Build Command is saved, inspect the service config to confirm the exact command, then manually trigger one deploy and inspect build logs/result. Only after deploy is live, verify `/healthz` and authenticated `GET /api/v1/admin/commercial/launch-state?limit=...` using an authorized admin session. Do not call the endpoint anonymously as a functional success test; expect authorization denial.
- No production DB query/mutation, migration execution, Render environment-variable edit, database-role/grant change, Connect merge, or PayFast activation occurred. PayFast remains paused.
- Amanda's Render support constraints remain authoritative: retain Dashboard-managed admin; keep `ghm_runtime` and `ghm_migrator` separate; preserve the SET-only schema-owner path; no improvised grants or paid infrastructure.


## 2026-11-15 — Build command corrected; Actor Gateway topology blocks startup

- Owner confirmed the existing `GHM-Internal-Runtime` Build Command was changed. Read-only Render service inspection verified exact Build Command `npm ci --include=dev && npm run build`, Start Command `npm start`, branch `main`, and auto-deploy OFF. No environment variable, DB setting, plan or other service configuration was changed.
- Manual deploy `dep-dbsva6c9v7es73bordlg` built commit `fe5a82d856f8733d0094e7d4599733da93537719`. Build succeeded: 167 packages installed, dependency audit reported 0 vulnerabilities, and TypeScript compilation completed. Startup then failed at `src/http/app.ts` because production storage requires `GHM_ACTOR_GATEWAY_URL`. Render recorded `update_failed`.
- The previous deployment `dep-dbpmv8jrjlhs73abkli0` at commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf` remains Render's `live` deployment. Do not claim the new commercial launch endpoint is live; the new build never reached a healthy running state.
- Read-only workspace inventory confirms no dedicated Actor Gateway Render service exists. Existing services include the ordinary GHM internal runtime and historical sandbox/qualification/PayFast services; do not repurpose those sandbox services or point the production variable at them.
- Repository inspection confirms the Actor Gateway is a Cloudflare Worker source under `workers/actor-gateway`, but `wrangler.jsonc` has `workers_dev: false`, a placeholder all-zero Hyperdrive ID, and no configured route/custom domain. The repository has only the general CI workflow; no Actor Gateway production deployment workflow was found. The production HMAC assertion secret and protected database secret are not provisioned. A successful Cloudflare Pages PR preview is not evidence of a deployed Actor Gateway Worker.
- The missing URL is therefore not a value to guess or fill with the ordinary API URL. The Worker needs a separately reviewed production topology, real Hyperdrive binding to the approved database role/connection, independently held HMAC secret paired with the protected DB secret, HTTPS route/domain, and verified deployment. Existing ADR and 11-Nov readiness handover explicitly say not to create/repurpose/upgrade paid services, weaken security, or deploy before topology, role model and backup gates are resolved.
- Production Actor Gateway rollout remains blocked by the previously recorded Render role-model issue and lack of a fresh verified backup (the 4-Nov backup is stale for the 10-Nov role change). No production database query/mutation, migration, role/grant change, HMAC secret provisioning, new service, paid infrastructure, or Connect merge was performed in this attempt.
- Connect PR #68 remains draft. Its handover-only head `43ae50ebd7beaac814b17e81f6d13225f443cc18` passed exact-head CI run `43744798602`; this validates client code only, not production API availability. Keep it draft until the GHM endpoint is deployed and authenticated smoke-tested.
- Next permitted work: repository-only deployment/topology planning and handover updates. Do not set `GHM_ACTOR_GATEWAY_URL`, create a Worker route/binding, add production secrets, alter DB roles/grants, or trigger another production deploy until the owner-approved no-cost secure topology and outstanding backup/role gates are resolved.
- Amanda's Render support constraints remain authoritative: retain Dashboard-managed admin; keep `ghm_runtime` and `ghm_migrator` separate; preserve the SET-only schema-owner path; no improvised grants or paid infrastructure.


## 2026-11-15 — no-additional-cost Actor Gateway topology assessment

- Added `docs/architecture/ACTOR_GATEWAY_NO_COST_TOPOLOGY_ASSESSMENT_2026-11-15.md` (commit `3a74f10920d6e08bacd90bb1366426748d0548ef`). It evaluates Cloudflare Workers VPC + Hyperdrive + Cloudflare Tunnel to the existing Render PostgreSQL private network.
- Current Render inventory verified: production `ghm-db` is PostgreSQL 18, Frankfurt, plan `0.1c-256mb`, status available; its current IP allowlist is `0.0.0.0/0` ("everywhere"). Do not broaden it or use public database exposure as a shortcut.
- Existing `GHM-Internal-Runtime` is currently a **Free web service** in Frankfurt, auto-deploy OFF. It could technically initiate a Cloudflare Tunnel to the Render DB internal hostname, but Render Free services sleep after 15 minutes without inbound HTTP/WebSocket traffic and are explicitly not intended for production. A `cloudflared` sidecar in the same service also shares host/deployment lifecycle with the ordinary API and has not demonstrated ADR-001's equivalent process/credential/network/deployment isolation. This is lab-only, not production-qualified.
- No other eligible always-on existing host was identified. Creating a paid private/background service is prohibited by the current no-additional-spend constraint. Existing sandbox and qualification services are not production targets and must not be repurposed.
- Cloudflare Workers VPC + Hyperdrive + Tunnel is therefore a promising **no-new-Render-service** technical candidate, but no production-ready no-cost host is currently qualified. Keep gateway rollout blocked; do not create VPC/Tunnel/Hyperdrive resources, secrets, routes, or production bindings as part of this assessment.
- Source-of-truth role-rule clarification: migration `20261110210000_add_actor_gateway_principal_guard.sql` and Worker startup check in `workers/actor-gateway/index.ts` intentionally permit exactly one membership involving the gateway: `ghm_db_user` may be a member of `ghm_actor_gateway` only with ADMIN OPTION=true, INHERIT=false, SET=false. `ghm_actor_gateway` must not itself be a member of any role, and no other role may be a member of it. Older handover statements saying "no memberships in either direction" are over-broad and superseded by this exact guard. This does not resolve whether production currently matches the guard; that requires a fresh, read-only production role-catalog check after the backup/role support gates are addressed.
- Fresh verified production backup remains missing (only 4-Nov archive identified; stale for 10-Nov role work). Amanda's Render guidance remains: Dashboard-managed admin credential for administration; SQL-created restricted service logins for normal execution; preserve separate `ghm_runtime` and `ghm_migrator`, and the SET-only schema-owner path. Do not improvise grants.
- No production database query or mutation, role/grant change, migration, secret provisioning, Cloudflare resource, Render service/configuration change, deployment, paid infrastructure, or Connect cutover was performed by this assessment.


## 2026-11-15 — resolving the production GHM_ACTOR_GATEWAY_URL startup blocker

### Exact contract from current source

- `src/config.ts` reads `GHM_ACTOR_GATEWAY_URL` and validates it through `src/http/actor-gateway-url.ts`. It must be a credential-free HTTPS origin only: no path, query, fragment, username or password. HTTP is allowed only for localhost development.
- `src/http/app.ts` explicitly throws `GHM_ACTOR_GATEWAY_URL is required when production storage is enabled` when `NODE_ENV=production`, storage configuration is present, and the gateway URL is absent. Do not disable production storage, remove this guard, or set a dummy value to bypass the gate.
- Gateway clients append typed paths such as `/v1/storage/metadata`, `/v1/businesses/:businessId/registration-identity`, and other `/v1/...` operations to the configured origin. Therefore the Render value must be the Worker origin, not a route suffix.
- Worker source is `workers/actor-gateway/index.ts`; Wrangler name is `ghm-actor-gateway`. Its current `wrangler.jsonc` has `workers_dev: false`, `preview_urls: false`, a zero placeholder Hyperdrive ID, no VPC binding, and no custom route. Thus **there is no valid deployed public Worker origin to put into Render today**.
- Worker requests initialize the Hyperdrive pool and validate the database principal and ACL before serving any request. Startup/initialization failure returns HTTP 503. Its internal app has `GET /healthz` and typed authenticated `/v1/*` endpoints; protected routes require `Authorization: Bearer <GHM ES256 access token>`.
- The Worker needs Hyperdrive plus its own Cloudflare secrets: public ES256 verification key material/current key ID (and optional previous public key), and `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`. It must not receive the ES256 private key, token pepper, issuer DB URL, or ordinary API credentials.

### Intended URL shape

- Preferred first production address, if the Cloudflare account's `workers.dev` subdomain is available and approved: `https://ghm-actor-gateway.<account-workers-subdomain>.workers.dev`.
- This is a **format only**, not an existing or verified URL. The account subdomain is unknown, and `workers_dev` is currently disabled. Do not paste this example into Render.
- A verified custom HTTPS Worker route could be used instead if an owned domain and DNS zone are available, but no custom route/domain is currently configured or approved.
- Once the Worker has actually deployed and its hostname is visible in Cloudflare, set Render `GHM_ACTOR_GATEWAY_URL` to that exact origin (no trailing path required; a trailing slash is normalized by the clients). Then verify `GET <origin>/healthz` returns 200 and authenticated typed routes work against the intended DB before considering the GHM runtime deployment ready. A 200 health response alone is not sufficient; verify a representative authenticated operation and rejection cases.

### Deployment sequence — do not skip gates

1. Resolve the private DB network path first. Current Wrangler config's all-zero Hyperdrive ID is a placeholder and cannot be used. The selected design requires a Cloudflare Workers VPC TCP service and a continuously running Cloudflare Tunnel host able to reach Render PostgreSQL privately.
2. Current inventory found no eligible always-on, sufficiently isolated, no-additional-cost tunnel host. The existing GHM-Internal-Runtime is a Free Render web service and is not production-qualified; do not co-host the tunnel there as an assumed fix, use keepalive schedules, or repurpose sandbox services.
3. Do not use public Hyperdrive ingress as an unreviewed shortcut. Render's current DB allowlist is `0.0.0.0/0`; this is broad ingress, not a narrow Cloudflare egress restriction. Do not treat its current presence as approval to rely on it.
4. Before creating production Hyperdrive or setting Worker secrets, clear the production role/backup gates: Amanda/Render-supported role separation, verified `ghm_actor_gateway` ACL and effective privileges, and a fresh verified production backup/recovery point. No role/grant/secret change is implied by this handover.
5. Only after those gates are cleared, configure the real Hyperdrive ID/VPC binding, secrets and public Worker hostname; deploy the Worker; verify health and authenticated typed operations; then set Render `GHM_ACTOR_GATEWAY_URL` to the observed origin.
6. Deploy GHM manually (auto-deploy remains OFF), verify `/healthz` and `/readyz`, then test storage metadata plus representative gateway-backed operations end-to-end. Do not merge/release Connect PR #68 until production gateway-backed operations are confirmed.

### Current decision

The missing URL is not a typo or a Render variable that can be guessed. It is missing because the Actor Gateway has not been deployed and does not yet have a valid database connection binding. The correct resolution is to create and qualify the gateway's real Cloudflare deployment and only then configure the exact hostname in Render. Under the currently verified no-cost/host constraints, the network-host prerequisite remains unresolved, so keep the startup gate intact and the production deployment/cutover blocked.

No Cloudflare resource, route, tunnel, Hyperdrive config, secret, Render variable, database role/grant, deployment, or product cutover was created or changed while documenting this resolution.


## 18 November 2026 — fresh live Render role and ledger-access evidence

Before this inspection, the current Actor Gateway role-separation handover, production migration reconciliation handover, PR #298 migration-batch handover and PR #298 status were re-read. This section records a fresh read-only catalogue check against the existing Render PostgreSQL service `ghm-db` / database `ghm_db` (PostgreSQL 18, Frankfurt; Render service ID `dpg-dag0sdtbedkc7389vi2g-a`).

**Connection identity**
- Render's available query interface connected with `session_user=ghm_app_user`, `current_user=ghm_db_user`.
- This is the application/admin-derived connection, not a dedicated `ghm_migrator` audit login.

**Role catalogue**
- `ghm_db_user` is LOGIN, non-superuser, and retains `CREATEROLE=true`, `CREATEDB=true`, `INHERIT=true`.
- `ghm_app_user` is a member of `ghm_db_user` with INHERIT and SET enabled; the live query session operates as `ghm_db_user`.
- The live membership catalogue showed ADMIN OPTION memberships from `ghm_db_user` over `ghm_actor_gateway`, `ghm_auditor`, `ghm_migrator`, `ghm_payment_provider` and `ghm_schema_owner`. It also showed multiple `ghm_runtime` membership rows with different SET/INHERIT/ADMIN OPTION attributes.
- Effective membership checks showed `ghm_app_user` can SET ROLE `ghm_db_user` and `ghm_runtime`, but cannot directly SET ROLE `ghm_actor_gateway`, `ghm_migrator`, `ghm_schema_owner` or `ghm_payment_provider`.
- This confirms the role-administration boundary remains unresolved. It does not authorize an improvised REVOKE/GRANT or credential change.

**Ledger access**
- Direct SELECT from `ghm.ghm_schema_migrations` failed with PostgreSQL SQLSTATE 42501 (permission denied).
- The table is owned by `ghm_schema_owner`; the observed ACL grants SELECT to `ghm_auditor`, not the active `ghm_db_user` session.
- The active session cannot SET ROLE `ghm_schema_owner`; no bypass was attempted.
- `pg_stat_user_tables.n_live_tup=105` was visible, but its last auto-analyze was 2026-09-21. This is stale approximate table statistics, **not** a current exact ledger row count. Do not cite 105 as a verified live ledger count.
- Catalog search returned zero `ghm.gateway_%` and zero `ghm.assert_actor_gateway%` routines in schema `ghm`. This is a direct catalogue observation; it is not a substitute for exact ledger/checksum reconciliation.

**Disposition**
- Exact production migration versions, checksums, row count and pending prefix remain unknown because the ledger could not be read.
- The forensic audit must be run only with the intended dedicated `ghm_migrator` login over verified TLS, with its documented schema-owner SET path. Do not grant ledger SELECT to `ghm_app_user` as a workaround.
- Preserve the existing Render support escalation for administrator/application role separation and obtain a fresh verified backup/recovery point before any role or ACL remediation.
- No production data, role, membership, grant, ACL, migration, secret, Render setting, deployment or paid service was changed during this read-only inspection. No CI was run.
