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
