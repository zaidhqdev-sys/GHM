# GHM Founder / System-Admin Bootstrap Authority

**Status:** CONSTRUCTION — AUTHORITY CONTRACT ONLY

## Decision

GHM already owns canonical account creation, authentication/session lifecycle, and system-admin authorization state.

The remaining first-installation capability is a governed way to create the initial GHM founder/system-admin account.

The first founder account is:

- login email: `zaidhqdev@gmail.com`
- canonical authority: GHM `ghm.account_identity.id`
- system-admin state: `is_system_admin = true`
- authentication: GHM-native password credential and GHM-issued session credentials
- external identity dependency: none
- Supabase dependency: none

This is a bootstrap ceremony, not a public registration role.

## Why a separate bootstrap boundary is required

The qualified public registration primitive deliberately creates:

- one `ghm.account_identity`;
- one Argon2id password credential;
- no Business;
- no membership;
- `is_system_admin = false`.

System-admin state is a privileged authority boundary and must not be reachable by public registration input, normal account profile updates, or direct runtime table DML.

The existing `is_system_admin` column is already protected as auth lifecycle state. The current resource-auth path derives the effective `admin` role from database-backed system-admin state, not JWT claims.

## Bootstrap invariants

A future implementation must enforce all of these invariants atomically:

1. **One-time:** bootstrap succeeds only when no active system-admin account exists.
2. **Fail closed:** if the precondition cannot be established, no bootstrap mutation occurs.
3. **Exact founder identity:** the ceremony accepts an explicitly supplied normalized founder email; it does not infer identity from legacy records.
4. **GHM-native credentials:** password material is created through the existing GHM Argon2id password contract.
5. **No external identity:** no Supabase UUID, external subject, or migration crosswalk is required.
6. **No public exposure:** bootstrap is not added to `POST /api/v1/auth/register` and does not accept a caller-selected admin role.
7. **No Business side effect:** founder account creation does not implicitly create Business or membership state.
8. **No direct table DML for runtime:** runtime authority remains mediated by controlled database functions.
9. **No secret in source control:** founder password and any bootstrap secret are operator-provided at ceremony time and are never committed.
10. **Auditable result:** the ceremony records only non-secret outcome evidence sufficient to prove whether bootstrap occurred; plaintext passwords, password hashes, bearer tokens, and recovery credentials are never logged.
11. **Idempotency is explicit:** a repeat attempt after successful bootstrap is rejected as already initialized; it must not create a second admin.
12. **Legacy isolation:** legacy `public.users` and Supabase data are not consulted to authorize the new founder account.

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

- verify the one-time initialization precondition;
- create the founder identity and password credential atomically;
- set `is_system_admin = true`;
- use the existing account/password data contract rather than duplicating credential storage;
- return the new canonical account id and non-secret outcome;
- expose no password hash or credential secret;
- reject a second initialization attempt;
- have no broad table privileges granted to `ghm_runtime` merely to support bootstrap.

The exact function signature and caller/grant boundary remain implementation work and must be qualified before use.

## Required application/operator boundary

The bootstrap ceremony must:

1. normalize and validate the founder email;
2. obtain the founder password interactively or from an operator-controlled secret input;
3. hash it using the existing GHM Argon2id implementation;
4. invoke the dedicated bootstrap primitive through the authorized installation path;
5. verify the resulting account can authenticate through the normal GHM Auth path;
6. verify the account is recognized as system admin by database-backed authorization;
7. emit non-secret qualification evidence;
8. never persist or print the plaintext password.

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

- [ ] current `account_identity` schema and constraints reconciled;
- [ ] current Auth password contract reused without duplication;
- [ ] one-time precondition qualified;
- [ ] concurrent bootstrap attempts cannot create two admins;
- [ ] duplicate/second attempt fails closed;
- [ ] non-admin public registration cannot create an admin;
- [ ] runtime cannot directly mutate `is_system_admin`;
- [ ] bootstrap function ownership and EXECUTE grants are least privilege;
- [ ] no secret material appears in source, logs, fixtures, or qualification output;
- [ ] successful founder account authenticates through normal GHM Auth;
- [ ] successful founder account resolves to admin through DB-backed state;
- [ ] no Business/membership is created implicitly;
- [ ] Supabase and legacy `public.users` are not required;
- [ ] full suite and dedicated bootstrap qualification pass with zero unexpected skips.

## Explicit non-goals

This slice does not:

- create the founder account;
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

It does **not** authorize execution of the founder bootstrap ceremony.

Execution requires a separately qualified implementation and explicit founder execution decision.
