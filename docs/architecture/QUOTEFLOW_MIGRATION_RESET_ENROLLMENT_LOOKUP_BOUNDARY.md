# QuoteFlow Migration Reset-Enrollment Lookup Boundary

**Status: CONSTRUCTION — ENROLLMENT STATE AND LOOKUP CAPABILITY IMPLEMENTED; DB QUALIFICATION PENDING**

## Decision

Credentialless QuoteFlow migration accounts classified RESET_REQUIRED must not enter the ordinary GHM password-recovery lookup path.

The migration path requires a distinct GHM-owned **migration reset-enrollment boundary**. Its purpose is to prove that the caller's supplied enrollment address corresponds to the exact migration-approved legacy identity already provisioned into the exact canonical GHM account.

The boundary is migration provenance, not a general identity-linking mechanism.

## Why the ordinary recovery lookup is insufficient

The existing password-recovery lookup intentionally resolves an active account with a password credential by normalized login email.

A newly provisioned QuoteFlow migration account is credentialless until re-enrollment completes. Therefore the ordinary lookup cannot safely discover the account without either:

- allowing credentialless accounts into generic recovery; or
- inventing an email-only identity match.

Both violate the existing migration boundary.

## Canonical ownership

The migration enrollment boundary owns the association between:

- the exact source provider: supabase;
- the exact opaque legacy subject;
- the exact canonical GHM account_identity.id;
- the migration-approved normalized enrollment email/contact address;
- the migration credential disposition: reset_required;
- the enrollment state.

The source subject remains provenance only. It is never a runtime authorization identifier.

The canonical GHM account remains the runtime identity owner.

The approved migration email is a migration enrollment attribute, not authority to merge or link accounts.

## Lookup contract

A migration reset-enrollment request must resolve only when all required migration facts agree:

1. the supplied email is normalized using the canonical GHM email-normalization rules;
2. exactly one migration enrollment record matches that normalized approved address;
3. that record is associated with exactly one canonical GHM account;
4. that account is still active;
5. its exact Supabase external-identity mapping exists and remains unchanged;
6. its migration disposition is reset_required;
7. its enrollment state permits a new recovery request.

No lookup may resolve a migration account from email alone.

A missing, duplicate, conflicting, disabled, already-enrolled, or provenance-mismatched record resolves to the same anti-enumeration outcome as an unknown enrollment.

## Persisted concept

A dedicated migration enrollment record is required because the existing external-identity mapping intentionally contains only provider, opaque subject, and canonical account identity. It is not the owner of migration contact/enrollment state.

The enrollment record must be uniquely anchored to the canonical account and exact migration provenance. Its approved normalized email must be immutable for the migration ceremony unless a separately qualified migration correction operation changes it.

The implementation must not duplicate ordinary account login-email ownership or alter the generic password-recovery lookup.

## Security boundary

The public/runtime role may invoke only a SECURITY DEFINER capability for the enrollment lookup/request operation. Direct runtime DML on migration enrollment state remains prohibited.

The capability must not return the account id, legacy subject, email, or enrollment state to an unauthenticated HTTP caller.

The HTTP request boundary must return an anti-enumeration success response regardless of whether an eligible migration enrollment exists.

Recovery credential issuance remains protected by the existing opaque-token mechanism. The raw credential is handed only to the separately approved delivery boundary.

## Lifecycle

The migration enrollment state is initially reset_required.

A successful reset/re-enrollment transitions the enrollment out of reset-required only as part of the same qualified migration ceremony.

Expired or consumed recovery material must not make an enrollment reusable without a fresh eligible recovery request.

An account that is disabled, has a changed/conflicting external identity mapping, or has completed re-enrollment must not receive migration reset recovery.

## Conflict handling

The boundary must fail closed for:

- duplicate approved enrollment email;
- enrollment linked to more than one account;
- enrollment/provider/subject mismatch;
- missing external identity mapping;
- external mapping pointing at another account;
- inactive account;
- credential disposition other than reset_required;
- malformed or unapproved migration source evidence.

No automatic merge, remap, email takeover, or fallback to generic password recovery is permitted.

## Scope

This slice is deliberately limited to one existing QuoteFlow user and synthetic non-production qualification.

It does not authorize:

- production migration;
- production recovery delivery;
- paid email/provider integration;
- Supabase runtime cutover;
- Supabase password/token import;
- QuoteFlow GHM session-client rollout;
- Business or membership mutation;
- bulk migration queues/workers;
- changes to already-qualified resources.


## Implemented construction

The first executable boundary is now present:

- dedicated `ghm.quoteflow_migration_reset_enrollment` state;
- migration-only registration capability bound to the exact canonical account and Supabase subject;
- immutable approved normalized enrollment email;
- source evidence reference;
- exact anti-enumeration lookup capability restricted to `reset_required` and active accounts;
- runtime direct INSERT/UPDATE/DELETE revoked;
- generic password recovery remains unchanged and credential-bearing-account scoped.

Database qualification is still required before this capability is considered qualified.

## Construction gate

Before implementation is qualified, the repository must establish the exact canonical source of the migration-approved email in the existing migration manifest/export contract. If that source is not authoritative or is not persisted with sufficient provenance, implementation must stop rather than invent a second source of truth.

The next implementation slice must therefore first reconcile the existing migration manifest schema/validator with this enrollment record and prove:

- one source user resolves to one approved enrollment;
- duplicate/conflicting enrollment evidence fails closed;
- exact external subject/account mapping is preserved;
- runtime cannot directly mutate enrollment state;
- generic password recovery remains credential-bearing-account only;
- no unauthenticated response discloses enrollment existence.

## Founder gate

Architecture and construction qualification only. No production migration, delivery provider, runtime cutover, payment change, or Supabase removal is authorized.