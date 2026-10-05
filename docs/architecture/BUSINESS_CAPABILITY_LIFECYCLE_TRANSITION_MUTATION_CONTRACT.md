# Business Capability Lifecycle Transition Mutation Contract

**Status:** QUALIFIED / CLOSED — governed Business Capability lifecycle transition boundary qualified on the consolidated mainline

## Purpose

Define the least-privilege database mutation boundary for governed Business Capability verification transitions without granting the runtime database role broad UPDATE or DELETE authority on `ghm.business_capability`.

## Canonical ownership

- `ghm.business_capability` remains the canonical Business Capability assertion relation.
- The application service remains the canonical authorization boundary.
- Verification authority is distinct from ordinary Business ownership/profile management.
- Evidence remains a separate future boundary.

## Mutation mechanism

The transition implementation shall use a **dedicated, narrowly scoped PostgreSQL function** owned by `ghm_schema_owner` and exposed to `ghm_runtime` through `EXECUTE` only.

The function shall:

1. accept only the Business Capability row identity, expected current verification status, target verification status, authenticated verifier identity, and transition reason where applicable;
2. validate the requested transition against the frozen transition matrix;
3. lock the target row with `FOR UPDATE`;
4. re-check the expected current state after locking;
5. derive `verified_at` inside the database transaction;
6. persist `verified_by` from the authenticated application context supplied by the service;
7. require a non-empty reason for `rejected` and `revoked`;
8. reject a caller-supplied verifier timestamp;
9. leave assertion content unchanged;
10. leave `assertion_status` unchanged;
11. update only the governed verification columns and `updated_at`;
12. return the resulting canonical row state.

The function must not provide a generic table-update primitive.

## Runtime privilege boundary

`ghm_runtime` shall receive:

- `EXECUTE` on the dedicated transition function;
- existing `SELECT`/`INSERT` privileges required by the qualified assertion path.

`ghm_runtime` shall **not** receive:

- `UPDATE` on `ghm.business_capability`;
- `DELETE` on `ghm.business_capability`;
- ownership of the function;
- ownership of the table;
- arbitrary function execution capable of mutating unrelated resources.

## Application authorization

The service must require an authenticated GHM `admin` context before invoking the transition function.

The database function is a least-privilege mutation mechanism, not a replacement for application authorization.

The verifier identity must be derived from authenticated context and must not be accepted as an independently trusted governance claim from an HTTP payload.

## Concurrency and stale-state protection

The transition API shall require the caller to supply the expected current verification state.

A stale expected state must fail after row locking rather than silently overwriting a concurrent transition.

There is no last-write-wins behavior.

## Transition matrix

Only these transitions are authorized:

- `unverified → pending`
- `pending → verified`
- `pending → rejected`
- `verified → revoked`
- `verified → expired`
- `rejected → pending`
- `revoked → pending`
- `expired → pending`

No other transition is authorized by this contract.

Creation remains separate and cannot create a directly verified capability through the transition mechanism.

## Verification invariants

- `verified` requires `verified_by` and `verified_at`.
- `rejected` and `revoked` require `verified_by`, `verified_at`, and a non-empty reason.
- `unverified` and `pending` have no verifier identity, verifier timestamp, or reason.
- `expired` retains the existing verification timestamp and has no newly supplied verifier timestamp.
- `assertion_status` is not changed by verification transitions.
- `business_id`, `capability_id`, assertion content, proficiency, effective period, and source reference are immutable through this boundary.

## Non-goals

This contract does not authorize:

- automatic verification;
- self-verification;
- evidence storage or upload;
- accreditation;
- third-party provider verification;
- matching or ranking;
- public discovery;
- production migration or cutover;
- Supabase mutation;
- Payfast/provider integration;
- public HTTP exposure;
- shadow qualification.

## Qualification gate

Implementation is not considered closed until runtime qualification proves:

- admin authorization;
- non-admin denial;
- self-verification policy;
- valid transitions;
- invalid transition denial;
- stale-state denial;
- verifier provenance;
- reason requirements;
- assertion-field immutability;
- direct runtime `UPDATE` denial;
- direct runtime `DELETE` denial;
- concurrent transition safety;
- rollback behavior;
- full regression.

No production routing or cutover follows from this contract alone.
