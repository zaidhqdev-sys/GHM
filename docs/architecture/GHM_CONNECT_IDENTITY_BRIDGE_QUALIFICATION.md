# GHM ↔ Zaid Connect Identity Bridge Qualification

**Status:** CONSTRUCTION QUALIFIED — PRODUCT ADAPTER / CUTOVER NOT AUTHORIZED
**Qualified main:** `42c4a22`
**Founder approval:** Authentication Gate 3B approved 2026-09-30

## Purpose

Record the current construction evidence after Authentication Gate 3B was approved and merged. This document does not authorize Connect production cutover.

## Qualified foundation

GHM now has a construction-qualified authentication and identity foundation:

- canonical `ghm.account_identity.id` remains the GHM identity;
- external identity mapping supports `provider + subject → account_identity.id`;
- Supabase Auth UUIDs are represented as external subjects, not as GHM JWT subjects;
- controlled bootstrap/link operations exist behind the GHM persistence boundary;
- GHM issues ES256 bearer access JWTs with decimal GHM account id in `sub`;
- refresh credentials are opaque, rotated, single-use, and session-family scoped;
- account disable/session/recovery semantics are exercised by database tests;
- authorization loads authoritative GHM account state, including system-admin state, rather than trusting a JWT role claim;
- the legacy HS path remains isolated compatibility behavior and is not the target product authentication authority.

## Qualification evidence

The Authentication Gate 3B construction branch was verified locally:

- 382 tests passed
- 0 failed
- 0 cancelled
- 0 skipped
- TypeScript build passed

The branch was merged to `main` as:

`42c4a22` — `merge: qualify authentication gate 3b`

## Connect mapping boundary

The Connect source audit established:

- Connect currently authenticates with Supabase Auth UUID sessions.
- GHM uses bigint canonical account identity.
- A direct UUID = bigint equivalence is forbidden.
- The selected mapping shape is:

`(provider, subject) → ghm.account_identity.id`

with `provider=supabase` for existing Supabase Auth identities.

Therefore the previous readiness statements that treated UUID↔bigint identity mapping as wholly absent are now stale with respect to the GHM construction foundation.

## What remains open

This qualification does **not** establish:

- Connect product adapter behavior;
- automatic product migration;
- Supabase JWT acceptance by GHM;
- business UUID → GHM business-id migration;
- role/permission equivalence between Connect and GHM;
- Connect profile/business provisioning parity;
- storage/realtime/provider adapter contracts;
- shadow qualification;
- production traffic cutover or rollback qualification.

Those remain separately governed boundaries.

## Authority rule

Connect remains on its current Supabase-backed production path.

No production database, DNS, credentials, traffic routing, provider cleanup, or product deployment is changed by this qualification.

## Next construction target

The next evidence-led construction target is the **Connect product identity adapter boundary**: define and qualify the concrete operation that resolves a Connect Supabase identity to a GHM canonical account without granting membership, ownership, system-admin privilege, or accepting a Supabase JWT as a GHM credential.

That adapter must be separately authorized before implementation.
