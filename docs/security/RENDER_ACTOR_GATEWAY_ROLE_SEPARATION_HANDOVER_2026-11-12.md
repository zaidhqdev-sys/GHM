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
