# QuoteFlow ↔ GHM Identity Link Lifecycle Contract

## Status

**CONTRACT DRAFT — DUAL-SIDED CONFIRMATION SELECTED; IMPLEMENTATION NOT AUTHORIZED**

This contract translates the Founder/Product authority decision into a bounded lifecycle. It does not authorize runtime persistence, migration, adapters, shadow qualification, or production cutover.

## Canonical relationships

Two relationships are distinct and must be established independently:

1. **Account link:** QuoteFlow Supabase user UUID ↔ GHM `account_identity.id`
2. **Business link:** QuoteFlow organization UUID ↔ GHM `business.id`

An account link does not imply a Business link.

## Lifecycle

The canonical lifecycle is:

```text
NONE
  ↓
PENDING
  ↓
ACTIVE
  ↓
REVOKED
```

A link may enter PENDING only after a valid initiating party establishes an authenticated request. It becomes ACTIVE only after the required confirmation has been independently recorded from both systems.

### Allowed transitions

- NONE → PENDING
- PENDING → ACTIVE
- PENDING → REVOKED
- ACTIVE → REVOKED

No implicit reactivation is allowed. A revoked relationship requires a new explicit linking ceremony and returns through PENDING.

## Initiation and confirmation authority

### QuoteFlow side

For an account link, the authenticated QuoteFlow user must control the target QuoteFlow principal.

For a Business link, the authenticated QuoteFlow user must have the required active management authority over the target QuoteFlow organization.

### GHM side

For an account link, the authenticated GHM principal must have the required authority over the target GHM account identity.

For a Business link, the authenticated GHM principal must have the required authority over the target Business and active GHM Business membership.

The exact GHM management role/permission used for this cross-system operation must be bound explicitly during implementation qualification. Existing Business owner/admin permissions must not be silently reinterpreted as cross-system authority.

## Proof requirements

Every activation must establish:

- authenticated QuoteFlow actor;
- authenticated GHM actor;
- target identifiers on both sides;
- explicit confirmation from both sides;
- compatibility checks;
- uniqueness/cardinality checks;
- actor and timestamp provenance;
- idempotent handling of a repeated identical request.

Matching profile attributes such as email, phone, name, slug, or timestamps are never sufficient proof.

## Cardinality

Until separately justified by product evidence, the safe construction assumption is **one active QuoteFlow principal to one active GHM account identity** and **one active QuoteFlow organization to one active GHM Business**, with no active target collision.

Any many-to-one or one-to-many relationship requires an explicit product decision before implementation.

An organization-to-Business link must not be created solely because the corresponding account link is active.

## Consistency

The implementation must verify that the proposed account and Business relationships are compatible but must retain them as separately governed links.

A mismatch, ambiguity, conflicting active link, or unavailable authority source must fail closed.

## Revocation

Revocation must be explicit and auditable.

Revocation of an account link must not silently mutate or delete the Business link. The Business relationship has its own lifecycle.

Revocation must prevent the revoked relationship from being used as authorization for future cross-system operations.

Existing GHM domain authorization remains authoritative after revocation; the link is never an authorization bypass.

## Idempotency and concurrency

Repeated identical confirmation must produce the same effective relationship rather than duplicate links.

Competing requests must serialize on the canonical relationship and enforce uniqueness atomically. Last-write-wins is prohibited.

A stale confirmation must fail rather than activating a relationship that has changed since the confirmation was issued.

## Failure and recovery

If either system is unavailable, activation must not occur.

If one side confirms and the other does not, the relationship remains PENDING and must not be treated as active.

Partial failure must be recoverable without creating two active conflicting relationships.

Recovery/revocation by GHM platform governance is an exceptional capability and requires a separately qualified authority contract; it is not ordinary unilateral link creation.

## Persistence boundary

A future persistence design must retain, at minimum:

- relationship type;
- QuoteFlow principal/organization identifier;
- GHM account/Business identifier;
- lifecycle state;
- initiating actor provenance;
- QuoteFlow confirmation provenance;
- GHM confirmation provenance;
- creation/activation/revocation timestamps;
- revocation provenance/reason;
- uniqueness constraints;
- version/concurrency protection.

Exact table names, keys, foreign-key strategy, retention, and cross-database identifier representation remain implementation decisions subject to schema qualification.

## Authorization boundary

Link management is a dedicated cross-system capability.

It must not be reachable through ordinary Business create/update operations and must not bypass existing GHM resource authorization.

No caller-supplied GHM identifier constitutes proof of authority.

## Shadow and cutover

Before production use:

1. lifecycle persistence must qualify against live PostgreSQL;
2. authorization and negative paths must qualify;
3. concurrency and uniqueness must qualify;
4. cross-system confirmation behavior must qualify;
5. shadow behavior must be explicitly defined;
6. rollback/recovery must be qualified;
7. only then may controlled cutover be considered.

Supabase remains QuoteFlow's production authority until that sequence is complete.

## Explicit non-goals

This contract does not authorize:

- implementation code;
- database migration;
- `identity_link` table creation;
- mapping RPCs or HTTP routes;
- QuoteFlow runtime changes;
- adapters;
- account or Business migration;
- shadow traffic;
- production routing;
- cutover.

## Construction gate

**Current gate: CONTRACT DRAFT / IMPLEMENTATION NOT AUTHORIZED.**

The next engineering task is to reconcile the required GHM-side management authority and existing Business membership authorization against the live/repository contract. Once that authority is evidenced, the persistence schema and qualification plan can be authored without inventing a new role or weakening existing authorization.
