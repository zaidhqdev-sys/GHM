# GHM Business Capability Lifecycle / Verification Transition Contract

**Status:** CONSTRUCTION ARCHITECTURE CONTRACT — AUTHORITY BOUNDARY DEFINED; IMPLEMENTATION NOT YET QUALIFIED.

## 1. Purpose

Define the narrow transition authority for the lifecycle and verification state already persisted by `ghm.business_capability`.

This contract extends the existing Business Capability assertion resource only for explicit governed transitions. It does not authorize generic UPDATE, public management, matching, ranking, recommendation, certification, accreditation, or production cutover.

## 2. Canonical resource

Canonical resource: `business_capability`

Canonical relation: `ghm.business_capability`

The existing assertion contract remains authoritative for `read` and `create`.

## 3. Separation of concerns

The following concepts remain distinct:
- Assertion: a Business claims a Capability.
- Verification: an explicitly governed actor changes the verification state of that assertion.
- Evidence: supporting material or provenance used by a future separately governed evidence boundary.
- Activation: `assertion_status` remains distinct from verification status.

Verification must not be inferred from `assertion_basis`, `source_reference`, ownership, membership, or creation.

## 4. Existing verification vocabulary

The persisted GHM vocabulary is: `unverified`, `pending`, `verified`, `rejected`, `revoked`, `expired`.

No additional states are authorized by this contract.

## 5. Transition authority

Lifecycle mutation is not a generic profile-management operation.

A future implementation must expose an explicit transition operation whose authorization is independently registered and checked. Ordinary Business owners, administrators, and members must not gain verification authority merely because they can create or manage Business Capability assertions.

No self-verification is authorized.

The exact governance principal/role and bootstrap mechanism remain a Founder-controlled authorization decision and are therefore not invented by this contract.

## 6. Allowed transition semantics

The transition service must validate the requested transition against the current persisted state.

Authorized transition classes:

| Current | Next | Meaning |
|---|---|---|
| `unverified` | `pending` | Verification is explicitly entered into review. |
| `pending` | `verified` | Authorized verifier accepts the assertion. |
| `pending` | `rejected` | Authorized verifier rejects the assertion with a reason. |
| `verified` | `revoked` | Previously verified assertion loses verification authority, with a reason. |
| `verified` | `expired` | Verification validity expires under a governed rule. |
| `rejected` | `pending` | A new governed review is opened. |
| `revoked` | `pending` | A new governed review is opened. |
| `expired` | `pending` | A new governed review is opened. |

No other transition is authorized without a new contract decision.

Creation does not authorize direct transition to `verified`.

## 7. Transition invariants

For every transition:
- `verified_by` is derived from the authenticated governance context.
- `verified_at` is derived by the service/database transaction.
- `verification_reason` is required for `rejected` and `revoked`.
- `verification_reason` remains absent for `verified`.
- `verified_by` and `verified_at` are absent for `unverified` and `pending`.
- `expired` retains existing `verified_at` provenance and does not invent a new verifier.
- `assertion_status` is not silently changed by a verification transition.
- capability, business, proficiency, description, and effective-period fields are not changed by transition.
- every transition is atomic with its state validation.

## 8. Evidence boundary

This contract does not create or mutate a verification-evidence relation.

`source_reference` remains assertion provenance and must not be treated as a substitute for an evidence subsystem.

If evidence is required for a transition, the evidence capability must be separately specified and qualified before becoming a prerequisite or authorization primitive.

## 9. Concurrency

Transition authority must use a transaction and protect against stale-state transitions.

A transition must only succeed when the persisted current state still equals the state evaluated by the transition rule.

Concurrent conflicting transitions must resolve deterministically through the database transaction boundary; no generic last-write-wins update is permitted.

## 10. Mutation boundary

The existing runtime INSERT privilege remains unchanged until implementation is separately qualified.

No runtime UPDATE or DELETE grant is authorized merely by approving this contract.

A future implementation must grant only the columns and mechanism required for explicit transition authority, preferably through a governed database function or narrowly scoped transaction path rather than broad table UPDATE.

## 11. HTTP boundary

No standalone HTTP transition route is authorized by this contract.

If HTTP is later required, it must have a dedicated registered operation, explicit governance authorization, strict request validation, stable domain-error mapping, and separate HTTP qualification evidence.

The Connect read adapter remains read-only.

## 12. Qualification requirements

Before transition implementation is closed, evidence must establish:
1. authenticated governance context is required;
2. ordinary Business membership cannot self-verify;
3. unsupported transitions fail before mutation;
4. stale current-state transitions fail safely;
5. verified transitions derive verifier identity from authenticated context;
6. rejected/revoked transitions require a bounded reason;
7. verified transitions do not accept caller-supplied verifier identity;
8. assertion fields are immutable through the transition boundary;
9. `assertion_status` remains independent;
10. verification invariants hold after every permitted transition;
11. concurrent transitions are safe;
12. runtime direct UPDATE remains denied;
13. runtime DELETE remains denied;
14. transaction rollback leaves prior state intact;
15. build, tests, and regression qualification pass;
16. existing qualified Business Capability read/create capability does not regress.

## 13. Explicit non-goals

This contract does not authorize automatic verification, self-verification, evidence storage, document uploads, accreditation/certification, third-party provider verification, matching/ranking, recommendations, public discovery, production migration, Supabase mutation, provider integration, production routing, or cutover.

## 14. Construction sequence

`this contract -> Founder governance decision where required -> typed transition contract -> service/repository implementation -> least-privilege mutation mechanism -> transition qualification -> documentation reconciliation -> separate product-adapter decision`

The current Business Capability read/create boundary remains CLOSED / QUALIFIED independently.

## 15. Founder boundary

This document freezes transition semantics without authorizing production mutation or defining a governance principal that has not yet been established.

The next implementation gate is the explicit governance-authority decision.