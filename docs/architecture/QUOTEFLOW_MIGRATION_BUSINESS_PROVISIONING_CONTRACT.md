# QuoteFlow Migration Business Provisioning Contract

> **Current-status reconciliation — 2026-10-20:** A migration-only PostgreSQL provisioning primitive and database-backed qualification script have been added on branch `feat/quoteflow-business-provisioning-20261020`. CI passed for the provisioning code and least-privilege correction. The qualification-script guard requires an explicitly approved non-production database hostname and verifies the effective migration role; CI passed on the current PR head after that guard was added. The provisioner is executable only by `ghm_schema_owner`, not `ghm_runtime`. Database-backed qualification remains pending, so the PR is **not yet fully qualified or merged**. The provisioner creates an inactive/pending Business, one active owner membership, and exact source mapping atomically; source data is not read or mutated by the primitive. Account/session migration, legacy membership reconciliation, reset/re-enrollment ceremony, and production cutover remain separate gates. No production mutation or QuoteFlow cutover is authorized.

**Status:** CONSTRUCTION CONTRACT — IMPLEMENTATION ADDED ON REVIEW BRANCH; DATABASE QUALIFICATION PENDING (reconciled 2026-10-20)

This slice defines the migration-only capability required when an approved QuoteFlow organization has outcome `CREATE_REQUIRED`. It creates a canonical GHM Business only from an explicitly reviewed migration target. It is not a public Business-registration mechanism.

## Canonical boundary

Input:

`provider=supabase + exact legacy organization id + approved canonical Business fields + approved owner GHM account`

Output:

`ghm.business.id + canonical owner membership + exact external provenance mapping`

The legacy organization identifier remains opaque provenance.

## Why owner membership is part of provisioning

GHM's existing Business creation invariant creates a Business and an active owner membership as one transaction. A Business without an owner is not a valid operational tenant.

Therefore this migration capability creates exactly one active owner membership for the explicitly approved owner account. It does **not** create or translate any additional legacy memberships. Additional membership reconciliation remains a separate slice.

## Required inputs

- provider fixed to `supabase`;
- exact nonblank legacy organization identifier;
- explicit nonblank canonical Business name;
- explicit canonical Business slug;
- explicit existing GHM owner account id;
- authoritative source evidence reference;
- approved migration actor/review evidence.

The owner account must already exist in GHM. This capability never creates an account and never resolves an owner by email.

## Atomic operation

For a new organization:

1. serialize on the exact source provider + organization identifier;
2. verify the approved owner GHM account exists;
3. create one GHM Business with migration-safe initial state;
4. create its active `owner` membership for the approved GHM account;
5. attach the exact external provenance mapping;
6. commit only if all steps succeed.

Any failure rolls back the Business, owner membership, and mapping together.

## Idempotency

If the exact external mapping already points to a Business, the operation returns `already_provisioned` only when the recorded review evidence and approved owner match and an active owner membership for that account exists. If the mapping lacks the expected audit record, the owner differs, or the evidence reference/reviewer/timestamp differs, return `CONFLICT` and make no mutation.

If the exact external mapping points elsewhere, return `CONFLICT` and make no mutation.

Concurrent requests for the same source organization must resolve deterministically to one Business.

## Initial Business state

Migration provisioning must not fabricate verification.

The new Business begins in GHM's canonical unverified/pending operational state as defined by the current Business resource contract. `is_active` and verification status are not migration shortcuts.

## Slug handling

The migration manifest must supply an explicitly reviewed canonical slug. The capability must not silently repair or disambiguate slug collisions. A collision is a hard conflict/block condition requiring review.

## Membership boundary

Only the canonical owner membership required by GHM Business creation is created here.

Legacy organization members, legacy roles, administrators, and secondary members are reconciled separately. No legacy role is silently translated.

## Security boundary

- migration-only SECURITY DEFINER capability;
- executable only by `ghm_schema_owner`; `ghm_runtime` execution is explicitly revoked;
- underlying Business/membership/mapping DML remains unavailable directly to `ghm_runtime`;
- no public HTTP exposure;
- no QuoteFlow runtime dependency;
- no production migration.

## Qualification requirements

The database qualification script is `scripts/qualify-quoteflow-migration-business-provisioning-db.mjs` (`npm run qualify:quoteflow-business-provisioning-db`). Before merge, non-production qualification must prove the following. The operator must set `GHM_NONPRODUCTION_DATABASE_HOST` to the approved isolated test database hostname; both runtime and migration connection hosts must match it, and the script asserts the effective runtime and schema-owner roles before mutations:

- fresh `CREATE_REQUIRED` → exactly one Business + exactly one active owner membership + exact external mapping;
- exact retry with the same owner and review evidence → `already_provisioned`, same Business and owner membership;
- existing mapping with missing audit evidence, different owner, or mismatched evidence → `CONFLICT` and no mutation;
- four concurrent calls → one creation, remaining calls idempotent;
- mapping/owner/evidence conflict → `CONFLICT` and no new Business;
- missing owner → blocked/failure with no Business;
- invalid provider → rejected with no Business;
- slug collision → rejected with no partial Business/membership;
- transaction rollback removes all created records;
- no password credentials/session/business-member translation beyond canonical owner;
- verification/status are not fabricated.

## Non-goals

No production migration, production source export, public Business API change, legacy membership migration, role translation, password migration, QuoteFlow runtime change, Supabase removal, payment change, DNS/routing/env change, or cutover.

## Founder gate

Construction and non-production qualification only. Do not apply this migration to a production database or route QuoteFlow traffic until account mapping, owner membership, full user/session migration, legacy member reconciliation, recovery/rollback, and cutover approval are separately evidenced.
