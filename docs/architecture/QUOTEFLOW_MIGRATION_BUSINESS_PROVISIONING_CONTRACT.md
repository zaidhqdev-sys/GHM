# QuoteFlow Migration Business Provisioning Contract

> **Status — 2026-11-01:** Construction-only. The PostgreSQL capability and TypeScript migration adapter are now wired at source level, but no database-backed qualification has been run. No production migration, production mutation, or QuoteFlow cutover is authorized. Founder-owned source-account reconciliation and reset/re-enrollment remain independent gates.

**Status:** SOURCE IMPLEMENTATION PRESENT — DATABASE QUALIFICATION NOT RUN

This migration-only capability provisions a canonical GHM Business from an explicitly reviewed QuoteFlow organization. It is not a public registration mechanism or a runtime route.

## Canonical boundary

Input: exact `provider=supabase` organization identifier, reviewed canonical Business name and slug, existing GHM business-role owner account ID, evidence reference, reviewer, and review timestamp.

Output: canonical `ghm.business.id`, one active owner membership, and exact external provenance mapping.

The legacy organization identifier remains opaque provenance. Owner identity is never resolved by email.

## Atomic operation and idempotency

The SECURITY DEFINER function serializes the source organization and canonical slug, locks and validates the existing owner account, and atomically creates:
1. one inactive, `unverified` Business;
2. one active `owner` membership for the approved account;
3. the exact Supabase external mapping;
4. an audit row containing owner and review evidence.

A matching mapping, owner membership, and identical review evidence returns `already_provisioned`. Evidence mismatch, unaudited mapping, owner mismatch, or slug collision returns a conflict. Invalid provider, required fields, or ineligible owner is blocked. Unique-constraint races are returned as conflicts. No additional legacy memberships, credentials, sessions, verification, or activation are created.

## Execution and authority boundary

- The function is owned by `ghm_schema_owner`.
- PUBLIC and `ghm_runtime` execution are revoked.
- EXECUTE is granted only to `ghm_schema_owner`.
- Runtime direct DML on the external mapping remains revoked.
- The TypeScript PostgreSQL adapter accepts an explicitly supplied transaction client. It does not import or default to the application runtime pool.
- The caller must use a dedicated migration connection and set `ROLE ghm_schema_owner` inside its transaction. Do not expose this adapter through HTTP or ordinary application flows.

## Qualification boundary

The former synthetic-outcome script did not exercise PostgreSQL and is not database qualification. The DB qualification script is intended only for an explicitly provisioned, isolated database named `ghm_qualification`, with a pre-existing synthetic active GHM business-role owner fixture. It checks the actual function, outcomes, privileges, atomicity, and transaction rollback. Its source is not permission to run it: no database test has been executed as part of this change.

The script is deliberately rollback-only. It does not create or alter a founder-owned account and refuses to connect unless the explicit qualification acknowledgement and dedicated database-name guard are present. TLS certificate validation is strict. It does not prove concurrent-session behavior; that remains a separate qualification item requiring a separately approved isolated-DB test plan.

## Remaining gates

1. Run local non-database tests after pulling this source-only patch.
2. Independently approve and provision the isolated qualification database and synthetic owner fixture.
3. Separately design and authorize concurrency qualification and verify cleanup/rollback behavior.
4. Reconcile the two founder-owned source accounts with exact Supabase provenance; never use email-only matching.
5. Complete reset/re-enrollment qualification and separate legacy membership decisions.
6. Reassess QuoteFlow integration only after those gates, using canonical GHM auth and membership.

No production migration, database connection, production source export, membership translation, public Business API, credential/session migration, QuoteFlow runtime change, payment/DNS/routing/environment change, or cutover is authorized.
