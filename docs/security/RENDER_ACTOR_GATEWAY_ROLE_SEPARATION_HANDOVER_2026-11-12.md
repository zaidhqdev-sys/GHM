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
