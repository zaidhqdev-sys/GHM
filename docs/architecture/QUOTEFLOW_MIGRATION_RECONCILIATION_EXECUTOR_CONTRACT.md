# QuoteFlow Migration Reconciliation Executor Contract

**Status: CONSTRUCTION QUALIFIED — EXISTING-ACCOUNT RECONCILIATION ONLY**

## Purpose

This slice executes the smallest migration mutation that is already supported by a
qualified GHM capability: reconciling an approved legacy Supabase subject to an
**already-resolved GHM account** through the existing GHM external-identity link
function.

It deliberately does not provision accounts.

## Canonical boundary

The executor accepts a validated migration manifest plus explicit account
resolutions. For each resolved account it calls the existing external-identity
link capability with provider 'supabase', the exact opaque legacy Supabase Auth
UUID, and the explicitly reviewed GHM account_identity.id.

The external link capability remains the sole owner of the mapping mutation.

## Safety rules

The executor:

- never resolves an account by email;
- never converts or casts the Supabase UUID;
- never uses the legacy QuoteFlow numeric attestation as canonical identity;
- never creates an account;
- never creates a password credential;
- never imports a Supabase access/refresh token;
- never issues a GHM session;
- never creates a Business;
- never creates membership;
- never translates legacy organization roles;
- preserves conflict as a hard migration conflict;
- preserves account_not_found as blocked;
- treats repeated execution as safe because the canonical link primitive is
  idempotent.

## Why account provisioning is not included

The current public GHM registration primitive creates an account and an active
password credential, then issues a login session. That is correct for signup
but is not a safe migration primitive.

A migration account with RESET_REQUIRED cannot be represented by inventing a
password hash, importing an unqualified Supabase hash, or issuing a session.
Therefore a separate migration provisioning/re-enrollment capability is still
required.

That future capability must establish:

1. a GHM account without synthetic credentials;
2. an explicit reset-required/onboarding state;
3. a safe recovery/re-enrollment path;
4. deterministic retry/idempotency;
5. no user-facing registration side effects.

## Qualification boundary

The qualification uses synthetic non-production data only and proves:

- new external mapping returns created;
- an existing exact mapping returns already_linked;
- unresolved accounts remain BLOCKED and are not mutated;
- mapping conflicts become CONFLICT;
- repeated execution does not create duplicate mappings.

No Supabase access, production export, credential extraction, production GHM
mutation, Business mutation, QuoteFlow runtime cutover, or payment change is
included.

## Next gate

The next construction gate is GHM migration account provisioning plus
reset/re-enrollment semantics. It must be designed against the current Auth
credential model rather than reusing public registration.
