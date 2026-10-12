# GHM ↔ Zaid Connect Identity Bridge Qualification

**Status:** CONSTRUCTION QUALIFIED — PRODUCT ADAPTER / CUTOVER NOT AUTHORIZED
**Historical qualification baseline:** the consolidated `main` state recorded at qualification time; not a current HEAD pointer
**Founder approval:** Authentication Gate 3B approved 2026-09-30
**Current authority — 2026-10-12:** This record establishes the GHM identity foundation. The separately authorized Connect identity adapter is also construction-qualified as recorded in `GHM_CONNECT_IDENTITY_ADAPTER_QUALIFICATION.md`; the full Connect↔GHM service trust boundary, product authentication/session migration, public product exposure, production routing, and cutover remain separately gated.

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

The Authentication Gate 3B construction branch was verified locally with:

- 382 tests passed
- 0 failed
- 0 cancelled
- 0 skipped
- TypeScript build passed

Gate 3B was subsequently merged to `main` as `42c4a22`. The consolidated mainline was then independently reconciled through the current documentation baseline. The 382-test/build result is qualification evidence for the authentication foundation; later documentation-only commits do not alter that implementation evidence.

## Connect mapping boundary

The Connect source audit established:

- Connect currently authenticates with Supabase Auth UUID sessions.
- GHM uses bigint canonical account identity.
- A direct UUID = bigint equivalence is forbidden.
- The selected mapping shape is:

`(provider, subject) → ghm.account_identity.id`

with `provider=supabase` for existing Supabase Auth identities.

Therefore previous readiness statements that treated UUID↔bigint identity mapping as wholly absent are stale with respect to the GHM construction foundation. Current readiness must distinguish the qualified GHM mapping foundation and the separately qualified frozen Connect identity-adapter slice from broader product migration and cutover, which remain unqualified.

## What remains open

This qualification does **not** establish:

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

## Superseded next-step note

The next-target instruction above was superseded when the identity adapter was separately authorized and qualified on 2026-09-30. Retain it as historical decision provenance only; use `GHM_CONNECT_IDENTITY_ADAPTER_QUALIFICATION.md` for the bounded implementation evidence and current restrictions.


## Current adapter reconciliation — 2026-09-30

The separately authorized Connect identity adapter is now construction-qualified on `construction/connect-identity-adapter`. It resolves the existing `(provider=supabase, subject)` mapping and supports explicitly authorized minimum bootstrap through the qualified persistence boundary. This does not make Connect sessions GHM sessions, does not permit Supabase JWT acceptance by GHM, and does not authorize production migration or cutover.
