# GHM Product Integration Boundary Contract

**Canonical owner:** GHM platform governance
**Status:** Semantic contract defined (documentation only)
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `0a9a9f7`
**Depends on:** [GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md](./GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md)
**Related:** [RESOURCE_API_BOUNDARY_CONTRACT.md](./RESOURCE_API_BOUNDARY_CONTRACT.md)

## Nature

This document defines the **semantic contract** for how a ZAID software product is allowed to consume GHM.

It is **transport-neutral**.

It does **not**:

- choose HTTP, REST, RPC, package imports, generated SDK, events, queues, MCP, sockets, or database access
- invent endpoint paths or wire schemas
- authorize implementation
- authorize hosting / deployment
- select a JWT issuer or identity provider
- expand Campaign or any other resource
- authorize shared storage, jobs, durable audit, or product adapters

```text
CALLABLE TRANSPORT = HTTP/API (SELECTED)
```

## 1. Purpose

Define what it means for a ZAID product to be a **supported GHM consumer**.

Canonical consumption topology:

```text
Product
  →
Supported GHM Integration Boundary
  →
GHM AuthContext / Authorization
  →
GHM Resource Service
  →
GHM governed persistence / infrastructure
```

**A technical path is not automatically a supported integration path.**

A product may only consume GHM through a contractually approved boundary that preserves GHM's security and ownership model.

## 2. Supported consumer principle

### Supported consumer

A product is a supported GHM consumer only when:

- its integration surface is explicitly authorized
- authentication semantics are defined
- AuthContext reaches GHM without privilege escalation
- GHM remains authoritative for authorization
- resource operations are typed and bounded
- the product cannot bypass GHM service authorization
- transaction / security boundaries remain inside GHM
- errors have defined semantic meaning
- compatibility / versioning rules apply
- the integration has qualification evidence

A product does **not** have to be cloud-hosted to be a supported consumer.

**A local product is a valid supported consumer architecture.**

## 3. Consumer / platform ownership

### Product owns

- product UX
- product workflows
- product-specific business behavior
- product-specific intelligence
- product-specific child resources unless separately promoted into GHM
- AI capability ports / adapters
- provider integrations
- local artifacts
- generated media
- product-specific publishing / export behavior

### GHM owns

- identity verification
- AuthContext
- business identity
- membership
- authorization
- governed resource operations
- resource lifecycle rules
- transaction boundary
- database authority
- runtime least privilege
- platform-level contracts

Neither side may silently assume ownership of the other side's domain.

## 4. Authentication semantics

Separate three concerns:

| Concern | Status |
|---|---|
| A. Authentication issuance | Unresolved — separate platform decision |
| B. Authentication verification | GHM responsibility (present) |
| C. Authorization | GHM responsibility (present) |

GHM currently provides verification and AuthContext derivation.

Authentication issuance remains a separate unresolved platform decision.
This contract does **not** select an issuer or identity provider.

The integration contract requires that GHM receive a trustworthy authenticated identity represented semantically as:

```text
AuthContext {
  userId
  role
}
```

Transport representation of that identity remains **undefined**.

Products must not manufacture arbitrary privileged AuthContext values.

## 5. Authorization semantics

**GHM remains authoritative.**

A product must never decide that a user may perform a GHM operation and then bypass GHM authorization.

Semantic flow:

```text
authenticated identity
  → GHM AuthContext
  → resource authorization
  → governed operation
  → transaction
  → persistence
```

Preserved guarantees include:

- role authorization
- business membership
- ownership rules
- resource ACL
- fine-grained authorization
- lifecycle rules
- cross-business isolation
- revoked membership behavior

A product may provide UX guidance but cannot replace GHM authorization.

## 6. Resource operations

The integration boundary exposes **resource capabilities**, not database capabilities.

When explicitly authorized for a given resource, semantic operation categories may include:

- read
- create
- update
- delete
- public read
- other explicitly contracted operations

Each resource must have its own approved operation contract.

This contract does **not** define:

- `/tables/:table`
- `/raw-query`
- `/arbitrary-function`
- generic CRUD over arbitrary tables

### Campaign reference (do not expand)

Currently qualified Campaign operations:

- `campaign.read`
- `campaign.create`
- `campaign.update`

Not available:

- delete
- public read

Campaign root remains as qualified at `0a9a9f7`. This document does not expand Campaign.

## 7. Input ownership

Product callers may provide only fields explicitly allowed by the resource contract.

GHM-controlled fields must not be caller-selectable when the resource contract derives them from AuthContext or authorization context.

### Campaign example

`created_by_account_id` is derived from authenticated GHM identity.
The caller does not choose another account.

Ownership and business boundaries cannot be overridden by product input.

## 8. Business context

Where a resource is business-scoped:

- `business_id` must be explicitly part of the resource contract where appropriate
- GHM validates that the business exists
- GHM validates applicable membership / authorization
- cross-business access must be prevented
- membership loss must remove access according to the resource contract

A product's selected business is **not** proof of authorization.

**The product provides context. GHM validates authority.**

## 9. Transaction boundary

The product integration boundary must not expose database transactions as product-managed primitives.

GHM owns:

- transaction opening
- authorization binding
- SQL execution
- commit
- rollback
- database security boundary

Products request semantic operations.
GHM decides how those operations are persisted.

## 10. Database boundary

```text
DIRECT PRODUCT DATABASE ACCESS IS NOT APPROVED.
```

Products must not receive:

- GHM database credentials
- `ghm_runtime` credentials
- `ghm_migrator` credentials
- schema-owner credentials

Products must not:

- execute arbitrary SQL
- call arbitrary SECURITY DEFINER functions
- bypass repositories / services
- depend on table layout
- depend on migration internals

The database is GHM infrastructure.

## 11. Error semantics

Transport-neutral semantic error categories (minimum):

- `unauthenticated`
- `unauthorized`
- `not_found`
- `validation_failed`
- `conflict`
- `invalid_state`
- `dependency_failure`
- `internal_failure`

This contract does **not** define HTTP status codes.
This contract does **not** prescribe a JSON error schema.

Purpose: every supported transport must be able to preserve the same semantic meaning.

```text
transport error representation ≠ GHM semantic error contract
```

## 12. Response semantics

Supported operations return typed resource results according to their resource contracts.

Products must not depend on:

- raw SQL rows
- internal repository objects
- internal TypeScript classes
- database-specific metadata
- undocumented columns

This contract does not invent a wire schema.

## 13. Validation

GHM remains authoritative for validation relevant to GHM resources.

Validation may exist in both layers:

| Layer | May validate |
|---|---|
| Product | UX validation; product workflow validation |
| GHM | security validation; resource contract validation; authorization validation; persistence constraints; lifecycle validation |

Product validation cannot replace GHM validation.

## 14. Versioning / compatibility

A supported integration must eventually define:

- contract version
- compatibility expectations
- breaking-change policy
- deprecation policy

Until the transport-specific contract exists:

```text
VERSIONING POLICY = OPEN / FOLLOW-UP CONTRACT
```

This document does not invent `/v1`, package versions, endpoint versions, or wire version fields.

Existing `/api/v1` routes (where present) are **implementation evidence** for current Resource API slices, not a platform-wide compatibility contract.

## 15. Idempotency / retries

The platform contract must eventually distinguish:

- safe reads
- repeatable reads
- retryable operations
- non-idempotent mutations
- explicitly idempotent mutations

This document does not invent idempotency keys or headers.

Retry semantics require operation-specific and eventually transport-specific contracts.

Until then:

```text
RETRY POLICY = OPEN / FOLLOW-UP CONTRACT
```

## 16. Observability / audit

This contract does not authorize observability or audit implementation.

Semantic expectation only: a supported platform boundary should eventually make it possible to correlate a product request with GHM execution where required.

Durable cross-resource audit remains **FUTURE / GATED**.

## 17. Security requirements

The supported integration boundary must preserve:

- least privilege
- AuthContext integrity
- no direct database access
- no arbitrary SQL
- no arbitrary SECURITY DEFINER invocation
- resource-level authorization
- business isolation
- membership enforcement
- no caller-controlled identity substitution
- no privilege escalation through transport
- no vendor credentials exposed to products
- no provider secrets in product-facing contracts

## 18. Local-first compatibility

A product does not have to be hosted in the cloud to consume GHM.

KBM may initially run on a local machine.
Generated KBM media may remain local.

The GHM integration boundary must therefore not implicitly require:

- Vercel
- Supabase
- cloud object storage
- CDN
- cloud workers
- hosted frontend

Those are separate infrastructure decisions.

## 19. Provider independence

The integration boundary must not leak infrastructure / vendor implementation details into product contracts.

Products should consume GHM **capabilities** rather than:

- database vendor features
- specific hosting provider APIs
- specific cloud storage APIs
- internal deployment details

This supports the long-term ZAID direction toward greater infrastructure independence.

This document does not implement provider replacement.

## 20. Campaign as reference example

### GHM owns (Campaign root)

- persistence
- schema
- authorization
- lifecycle
- transaction boundary

### Product (KBM) owns

- campaign UX
- marketing meaning
- future marketing-specific children
- AI generation
- media
- publishing

### Current status

| Item | Status |
|---|---|
| Campaign root | QUALIFIED (`0a9a9f7`) |
| Semantic callable contract (KBM external) | DEFINED |
| Callable transport | HTTP/API (SELECTED) |
| Campaign HTTP | PRESENT at Founder-locked wire (HEAD `785df12`) |
| Package consumer API | NOT PRESENT |
| Direct DB access | NOT APPROVED |

Do not expand Campaign under this contract.

## 21. Supported vs unsupported integration

### Supported in principle

- explicitly authorized integration
- authenticated caller
- GHM-derived AuthContext
- typed resource operation
- GHM authorization
- GHM transaction
- bounded response
- defined semantic errors
- compatibility contract
- qualification evidence

### Unsupported

- browser → GHM PostgreSQL
- product → GHM database
- arbitrary SQL
- arbitrary SECURITY DEFINER functions
- product → internal repository
- product → internal service without approved boundary
- undocumented endpoint
- undocumented package import
- bypassing GHM authorization
- caller-selected privileged identity
- copying GHM tables into a product as a substitute for integration

## 22. Transport gate

```text
CALLABLE TRANSPORT: HTTP/API (SELECTED)
```

Transport-specific questions for broader surfaces remain gated after Founder authorization where not already locked (Campaign HTTP wire is Founder-locked at `785df12`):

- authentication carriage
- request representation
- response representation
- error encoding
- versioning
- retry semantics
- timeout semantics
- connection / security model
- deployment topology

## 23. Implementation gate

**This contract does NOT authorize implementation by itself.**

Callable mechanism status:

1. Founder selected / authorized callable mechanism — **DONE — HTTP/API**; Campaign HTTP implemented at `785df12`.
2. Transport-specific Campaign HTTP contract — **DONE** (CAMPAIGN_HTTP_*).
3. Authentication issuance decision — still required / **UNSELECTED**.
4. Error / version / retry transport semantics — Campaign tokens locked; platform taxonomy + version lifecycle + retry/idempotency remain **OPEN**.
5. Broader resource HTTP expansion — gated.
6. Product adapter — separately authorized; KBM adapter **NOT AUTHORIZED**.
7. Shadow / cutover — separately authorized; **NOT AUTHORIZED**.

## 24. Relationship to the Platform Charter

This document refines the platform charter's **supported product integration boundary**. Product-facing callable transport is **HTTP/API (SELECTED)**; this semantic contract does not invent Campaign wire details (see CAMPAIGN_HTTP_* contracts).

Authority:

- [GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md](./GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md)

## 25. Relationship to existing Resource API contract

Authority:

- [RESOURCE_API_BOUNDARY_CONTRACT.md](./RESOURCE_API_BOUNDARY_CONTRACT.md)

The existing Resource API contract governs the **current HTTP Resource API slices**.

This Product Integration Boundary Contract defines the broader **semantic platform requirement** for any supported product consumer.

This document does **not** rewrite or alter the existing HTTP Resource API contract.

Registry membership and internal service existence do **not** imply a supported product integration surface.

## 26. Open decisions

| Decision | Status |
|---|---|
| GHM platform charter | COMPLETE |
| Product integration semantic contract | THIS DOCUMENT |
| Callable transport | HTTP/API (SELECTED) |
| JWT issuance | UNRESOLVED |
| Error transport encoding | OPEN |
| Versioning / compatibility | OPEN |
| Retry / idempotency | OPEN |
| Product adapters | FUTURE / GATED |
| Shared storage | FUTURE / GATED |
| Durable audit | FUTURE / GATED |
| Jobs / realtime | FUTURE / GATED |
| ZAID-controlled infrastructure | FUTURE / STRATEGIC |

## 27. Governance rule

> No product integration becomes supported merely because a technical path works. It becomes supported only when the semantic contract, transport contract, security boundary, ownership model and qualification evidence are all established.

## Evidence (inspected)

| Claim area | Path |
|---|---|
| Platform charter | `docs/architecture/GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md` |
| Resource API HTTP slices / non-goals | `docs/architecture/RESOURCE_API_BOUNDARY_CONTRACT.md` |
| Construction gates; adapters not started | `docs/architecture/CONSTRUCTION_QUALIFICATION_SEQUENCE.md` |
| Handover / Campaign status | `docs/HANDOVER_2026-09-16.md` |
| AuthContext verification | `src/auth/request-context.ts` |
| Authorization | `src/auth/authorization.ts` |
| Registry | `src/resources/registry.ts` |
| Transactions | `src/db/authorized-transaction.ts`, `src/db/transaction.ts` |
| Narrow HTTP surface | `src/http/app.ts` |
| Package shape (service entry; no consumer exports) | `package.json` |
| Campaign contracts | `docs/architecture/CAMPAIGN_SOURCE_AUDIT.md`, `CAMPAIGN_SCHEMA_CONTRACT.md`, `CAMPAIGN_OPERATION_CONTRACT.md` |
| Campaign implementation | `src/resources/campaign/` |
| Baseline | `0a9a9f7` |

External KBM semantic consumption / callable contracts are product-side context only and do not authorize GHM transport or implementation.
