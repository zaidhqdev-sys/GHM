# GHM Founder / System-Admin Bootstrap Authority

**Status:** CONSTRUCTION — AUTHORITY CONTRACT + QUALIFIED IMPLEMENTATION BOUNDARY

## Decision

GHM already owns canonical account creation, authentication/session lifecycle, and system-admin authorization state.

The remaining first-installation capability is a governed way to designate the already-existing canonical GHM founder account as the initial system administrator.

The designated founder account is:

- login email: `zaidhqdev@gmail.com`
- canonical authority: existing GHM `ghm.account_identity.id`
- system-admin state after bootstrap: `is_system_admin = true`
- authentication: existing GHM-native password credential and normal GHM-issued session credentials
- external identity dependency: none
- Supabase dependency: none

The founder account may already exist before bootstrap. The bootstrap boundary **never creates a duplicate account and never changes the founder password credential**; it promotes the exact existing canonical account.

This is a bootstrap ceremony, not a public registration role.

## Why a separate bootstrap boundary is required

The qualified public registration primitive deliberately creates:

- one `ghm.account_identity`;
- one Argon2id password credential;
- no Business;
- no membership;
- `is_system_admin = false`.

The founder bootstrap therefore operates on an existing canonical account and does not repeat account or credential creation.

System-admin state is a privileged authority boundary and must not be reachable by public registration input, normal account profile updates, or direct runtime table DML.

The existing `is_system_admin` column is already protected as auth lifecycle state. The current resource-auth path derives the effective `admin` role from database-backed system-admin state, not JWT claims.

## Bootstrap invariants

A future implementation must enforce all of these invariants atomically:

1. **One-time forever:** bootstrap succeeds only when zero `ghm.account_identity` rows have ever been designated `is_system_admin = true`. A disabled/deleted admin must not reopen the founder gate.
2. **Concurrency-safe:** concurrent bootstrap attempts serialize at the authority boundary; at most one can establish the first system administrator.
3. **Fail closed:** if the initialization precondition cannot be established, no bootstrap mutation occurs.
4. **Exact founder identity:** the ceremony accepts only the designated founder email and resolves exactly one existing GHM password credential by its normalized login email; it does not infer identity from legacy records.
5. **Existing GHM credentials preserved:** bootstrap never creates, replaces, rehashes, or otherwise changes the existing password credential.
6. **No external identity:** no Supabase UUID, external subject, or migration crosswalk is required.
7. **No public exposure:** bootstrap is not added to `POST /api/v1/auth/register` and does not accept a caller-selected admin role.
8. **No Business side effect:** founder promotion does not implicitly create Business or membership state.
9. **No direct table DML for runtime:** runtime authority remains mediated by controlled database functions.
10. **No secret in source control:** founder password and any bootstrap secret are operator-provided at ceremony time and are never committed.
11. **Auditable result:** the ceremony records only non-secret outcome evidence sufficient to prove whether bootstrap occurred; plaintext passwords, password hashes, bearer tokens, and recovery credentials are never logged.
12. **Explicit repeat rejection:** a repeat attempt after successful bootstrap is rejected as already initialized; it must not create another administrator.
13. **Legacy isolation:** legacy `public.users` and Supabase data are not consulted to authorize the new founder account.

## Authority model

### Before first bootstrap

There is no GHM application-level system administrator.

Therefore an authenticated HTTP admin endpoint cannot be the bootstrap authority.

The bootstrap authority must instead be a controlled installation/operator boundary capable of invoking a narrowly scoped database primitive through the migration/installation authority. It must not depend on an existing GHM admin session.

### After first bootstrap

The resulting founder account authenticates through the normal GHM Auth path.

Its effective application role is derived from `ghm.account_identity.is_system_admin`.

Future administrative account-management capabilities may be authorized through normal GHM admin authorization, but that is a separate construction gate.

## Required database primitive

Implementation must use a dedicated, narrowly scoped `SECURITY DEFINER` function owned by `ghm_schema_owner`.

The primitive must:

- verify the one-time initialization precondition using historical system-admin state, not active-state filtering;
- serialize concurrent initialization attempts;
- require the exact designated founder email;
- require exactly one existing active GHM account backed by the designated normalized login email;
- promote that existing `ghm.account_identity` to `is_system_admin = true`;
- preserve the existing role and password credential unchanged;
- record permanent bootstrap state tied to the canonical account id;
- return the canonical account id and non-secret outcome;
- expose no password hash or credential secret;
- reject a second initialization attempt;
- have no broad table privileges granted to `ghm_runtime` merely to support bootstrap.

The qualified implementation uses `ghm.auth_bootstrap_founder_system_admin(text)` under the controlled installation/migration authority, owned by `ghm_schema_owner`, with runtime EXECUTE denied.

## Required application/operator boundary

The bootstrap ceremony must:

1. validate the exact founder email;
2. invoke the dedicated promotion primitive through the authorized installation path;
3. verify the resulting existing account can authenticate through the normal GHM Auth path;
4. verify the account is recognized as system admin by database-backed authorization;
5. verify the existing role and password credential were preserved;
6. emit non-secret qualification evidence;
7. never persist or print password material.

The ceremony must not:

- call the public registration endpoint and then mutate the account into admin;
- issue a SQL `UPDATE` against `is_system_admin` from an operator script;
- use the legacy `public.users` id;
- copy a Supabase Auth credential;
- create an external identity mapping;
- accept an invite code as proof of founder authority;
- seed a hardcoded password;
- create a second admin as a fallback.

## Qualification gates

Before any production founder bootstrap:

- [x] current `account_identity` schema and constraints reconciled;
- [x] current Auth password contract preserved without duplication;
- [x] historical system-admin precondition qualified;
- [ ] concurrent bootstrap attempts cannot create two admins;
- [ ] duplicate/second attempt fails closed;
- [ ] non-admin public registration cannot create an admin;
- [ ] runtime cannot directly mutate `is_system_admin`;
- [x] bootstrap function ownership and EXECUTE grants are least privilege;
- [x] no secret material appears in source, logs, fixtures, or qualification output;
- [ ] successful founder account authenticates through normal GHM Auth;
- [ ] successful founder account resolves to admin through DB-backed state;
- [x] no Business/membership is created implicitly;
- [x] Supabase and legacy `public.users` are not required;
- [ ] full suite and dedicated bootstrap qualification pass with zero unexpected skips.

## Explicit non-goals

This slice does not:

- execute the founder promotion ceremony;
- mutate the database;
- modify public registration;
- add a public admin-registration endpoint;
- migrate either legacy user;
- restore Supabase;
- create an identity-link table;
- retire legacy PostgreSQL roles;
- create a Business;
- change QuoteFlow runtime;
- change Connect runtime;
- change deployment, DNS, environment, or payment configuration.

## Founder gate

This document authorizes construction and qualification of the bootstrap authority only.

The implementation is promotion-only: it does not create the founder account or alter its password. It does **not** authorize execution of the founder bootstrap ceremony.

Execution requires a separately qualified implementation and explicit founder execution decision.
