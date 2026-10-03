# QuoteFlow ↔ GHM Identity Link Authority Contract

## Status

**DUAL-SIDED CONFIRMATION SELECTED — LIFECYCLE/PERSISTENCE CONTRACT STILL TO BE QUALIFIED**

Founder/Product decision: normal cross-system identity linking will use explicit confirmation from both independently authoritative systems. GHM platform governance may provide narrowly defined recovery/revocation authority; it does not silently become ordinary unilateral link-creation authority.

## Authority model

The normal pathway requires:

1. an authenticated QuoteFlow principal with authority over the target QuoteFlow organization;
2. an authenticated GHM principal with the required authority over the target GHM account/Business;
3. explicit confirmation on each side;
4. compatibility and existing-link checks;
5. auditable actor and timestamp provenance;
6. idempotent handling of repeated identical requests.

Neither side may establish the active relationship from a caller-supplied identifier alone.

### Account relationship

The QuoteFlow principal confirms control of the QuoteFlow identity. The GHM side independently confirms control/authorization for the target GHM account identity.

### Business relationship

The QuoteFlow organization authority confirms control of the organization. The GHM side independently confirms authority over the target Business and active membership with the required management authority.

An account link does not automatically authorize or create a Business link.

## GHM governance boundary

A GHM platform administrator may be considered for exceptional recovery/revocation operations, but this contract does **not** grant the existing `admin` role ordinary unilateral link-creation authority.

Any recovery/revocation authority must be separately specified with audit provenance, scope, and fail-closed behavior before implementation.

## Required lifecycle contract

The implementation contract must define:

- pending/proposed state;
- confirmation by each side;
- active state;
- revoked state;
- who may initiate, confirm, revoke, and recover;
- relinking rules;
- cardinality and uniqueness;
- account-to-organization consistency;
- revocation propagation;
- audit provenance;
- concurrency;
- partial failure and unavailable-system behavior;
- recovery and rollback;
- shadow-read behavior;
- cutover ownership.

## Security rules

- No email/phone/name/slug matching as proof.
- No implicit mapping.
- No caller-supplied GHM identity accepted as authorization.
- No adapter may bypass GHM authorization.
- No ordinary Business operation creates a cross-system link.
- No production routing through an unqualified mapping.
- Unresolved or ambiguous mapping fails closed.

## Explicit non-goals

This decision does not yet authorize:

- `identity_link` persistence;
- external UUID columns;
- mapping RPCs or HTTP routes;
- Supabase mutation;
- QuoteFlow runtime changes;
- account or Business migration;
- adapters;
- shadow qualification;
- production cutover.

## Construction decision

The Founder/Product authority gate for the **normal link-creation model** is resolved: **dual-sided confirmation**.

The next engineering gate is to author and qualify the exact lifecycle/persistence contract. No runtime mutation is authorized until that contract is independently qualified.
