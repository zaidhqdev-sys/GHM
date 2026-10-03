# QuoteFlow → GHM Account Onboarding and Migration Boundary

**Status:** ARCHITECTURE CONTRACT — CONSTRUCTION QUALIFICATION IN PROGRESS

## Decision

GHM is the canonical authentication and account-identity owner for QuoteFlow.

The target runtime is:

`QuoteFlow authenticated session → GHM account_identity.id → GHM business_membership → GHM business.id`

Supabase Auth is a **legacy migration source only**. Supabase UUIDs are not GHM canonical identifiers and must never become `ghm.account_identity.id`, JWT `sub`, or a permanent runtime tenant key.

## Current GHM evidence

GHM already provides:

- `ghm.account_identity` as the canonical account identity.
- `ghm.account_password_credential` with Argon2id password material.
- GHM login, refresh, logout and password-recovery API.
- ES256 access JWTs with canonical numeric account `sub`.
- `auth_bootstrap_external_identity` for migration-era minimum identity bootstrap.
- `auth_link_external_identity` for explicit migration/link provenance.
- `POST /api/v1/businesses` which creates a Business and active owner membership for an authenticated GHM account.
- Business authorization through `business_membership`, not external organization identifiers.

## Required onboarding boundary

A new QuoteFlow account must be created as a GHM account, with:

1. normalized login email;
2. Argon2id password credential;
3. canonical `account_identity.id`;
4. GHM-issued session/access/refresh credentials.

Account creation must not grant Business membership implicitly unless the separately qualified Business onboarding flow is invoked.

## Existing-user migration boundary

For an existing QuoteFlow/Supabase user:

1. retain the Supabase Auth UUID only as migration provenance;
2. establish or resolve exactly one GHM `account_identity.id`;
3. use the existing external-identity mapping only as migration evidence;
4. never accept a Supabase JWT as a GHM bearer credential;
5. never match, merge, or link accounts solely by email;
6. do not import or weaken password material unless its format and verification semantics are explicitly supported;
7. where password hashes cannot be safely migrated, require verified password reset/re-enrollment through GHM.

The migration crosswalk is not a runtime authorization mechanism.

## Password migration gate

No assumption is made that a Supabase Auth password hash can be imported into GHM's Argon2id credential store.

Qualification must establish one of:

- a verified, supported password-hash migration path preserving GHM's password contract; or
- a verified password reset/re-enrollment path.

Plaintext password extraction, reversible storage, weakened hashing, or silent email-based credential takeover are prohibited.

## Business / organization reconciliation

QuoteFlow's legacy organization identifier must not become a GHM Business identifier.

For each legacy organization:

1. identify the authoritative organization owner/admin evidence;
2. resolve or create the corresponding GHM `business.id`;
3. establish GHM `business_membership` for the corresponding GHM accounts through an explicit migration/provisioning operation;
4. preserve legacy organization identifiers only as migration provenance where required;
5. after migration, QuoteFlow resolves tenant context through GHM membership and `business.id`.

The existing GHM Business creation endpoint is already capable of creating a Business and owner membership for an authenticated GHM business operator, but migration of existing organizations requires a separately authorized reconciliation path. It must not be improvised through the public create-business endpoint.

## Registration API decision

The existing GHM Auth API currently exposes login, refresh, logout and password recovery. It does **not** expose a canonical public account-registration operation.

Therefore the next implementation slice is **not** a QuoteFlow Supabase swap.

The next implementation slice is a narrowly scoped GHM account-onboarding capability covering:

- registration input validation;
- account identity creation;
- password credential creation;
- account/session issuance policy;
- duplicate-email semantics;
- rate limiting and abuse controls;
- migration/provenance interaction;
- tests and documentation.

No production cutover is included.

## Construction qualification decisions

The account-onboarding implementation now uses the existing GHM Auth foundation rather than introducing a second authentication protocol:

- Registration endpoint: `POST /api/v1/auth/register`.
- Success: HTTP `201` with the same GHM access/refresh token envelope used by login.
- Default registration role: `customer`; accepted explicit role values are `customer` and `business`.
- Registration creates exactly one `account_identity` plus one password credential atomically and creates **no** Business or membership.
- Duplicate normalized login email: HTTP `409` / `ACCOUNT_ALREADY_EXISTS`.
- Invalid registration shape: HTTP `400` / `invalid_request`.
- Password policy failure: HTTP `400` / `PASSWORD_POLICY_VIOLATION`.
- Registration is rate-limited by the existing 10 requests / 15 minutes per-IP Auth limiter. This is an implementation reuse, not a new security threshold.
- Account creation fails closed if the registration persistence capability is unavailable.
- Existing-user migration still requires explicit legacy provenance and verified password reset/re-enrollment where password-hash migration is unsupported.

The persistence primitive is SECURITY DEFINER and runtime-executable only. It does not grant direct runtime table DML and does not create membership.

## Non-goals

This slice does not:

- add permanent QuoteFlow UUID → GHM identity tables;
- accept Supabase JWTs;
- change QuoteFlow runtime yet;
- migrate production users yet;
- migrate legacy organizations yet;
- change production environment variables;
- change DNS or routing;
- change Payfast/payment behavior;
- remove Supabase packages from QuoteFlow;
- alter existing qualified GHM resource contracts.

## Qualification gates

Before implementation is considered closed:

- [ ] canonical registration contract selected;
- [ ] duplicate-email and account-status semantics selected;
- [ ] password migration/reset strategy selected;
- [ ] legacy account provenance semantics qualified;
- [ ] legacy organization → GHM Business reconciliation contract qualified;
- [ ] GHM onboarding API/service implementation qualified;
- [ ] full GHM test suite passes;
- [ ] documentation reconciled;
- [ ] QuoteFlow migration remains separately gated.

## Founder gate

This document authorizes architecture reconciliation only.

It does **not** authorize production migration, Supabase removal, or deployment/cutover.
