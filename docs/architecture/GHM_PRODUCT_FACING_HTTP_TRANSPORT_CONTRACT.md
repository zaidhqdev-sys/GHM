# GHM Product-Facing HTTP Transport Contract

**Canonical owner:** GHM platform governance
**Status:** Documentation-only semantic transport contract
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `0a9a9f72864bf1fc27e5986f262410ec8ccc35b9`
**Prerequisite selection:** `GHM_PRODUCT_FACING_TRANSPORT_SELECTION_DECISION_RECORD.md`

```text
TRANSPORT SELECTED: HTTP/API
FOUNDER AUTHORIZATION: GIVEN
CAMPAIGN HTTP IMPLEMENTATION AUTHORIZED: YES (HEAD `785df12`, Founder-locked wire)
BROADER PRODUCT-FACING HTTP BEYOND CAMPAIGN: NOT BLANKET-AUTHORIZED
AUTHENTICATION ISSUANCE: UNSELECTED
```

## 1. Purpose

This document defines the governed **HTTP/API** transport contract between GHM and supported ZAID products.

HTTP is the selected transport (Founder selection recorded). Campaign HTTP was later Founder-authorized and implemented at `785df12`; broader product-facing HTTP expansion remains gated.

The API is a **product-facing boundary**. It is not:

- a raw database API
- an internal repository API
- an internal service API
- a generic CRUD surface
- an AI protocol
- a storage interface

The transport carries **GHM semantic capabilities** (resource identity, operation identity, AuthContext, authorization outcomes, validation results, lifecycle/transaction semantics, and governed errors) without redefining those meanings.

This contract defines the HTTP boundary.
It does **not** implement the HTTP boundary.

## 2. Architectural position

```text
ZAID product
    ↓
Product integration adapter
    ↓
GHM HTTP/API boundary
    ↓
GHM application/service layer
    ↓
GHM repository/data layer
    ↓
PostgreSQL
```

The product must never bypass the HTTP boundary to reach:

- PostgreSQL
- internal repositories
- internal services
- migration credentials
- GHM runtime database credentials

GHM remains authoritative for authorization.

## 3. Current state (repository evidence)

| Fact | Evidence |
|---|---|
| Express HTTP exists | `src/http/app.ts`, `src/http/enquiry-router.ts` |
| `/api/v1` exists | Routes under `/api/v1/profile`, businesses, projects, enquiries |
| Existing HTTP resources are partial | Profile, business, project, enquiry Resource API slices only |
| Campaign qualified internally | `src/resources/campaign/**`; registry ops `read`/`create`/`update`; HEAD `0a9a9f7` |
| Campaign product-facing HTTP present | `src/http/campaign-router.ts` (GET/LIST/POST/PATCH under `/api/v1/campaigns`); HEAD `785df12` |
| Existing HTTP routes ≠ automatic KBM contract | Transport selection ADR; Product Integration Boundary |
| Authentication verification exists | `src/auth/http.ts` `requireAuth`; `src/auth/request-context.ts` JWT verify → AuthContext |
| Authentication issuance unresolved | `GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md` |
| Error/version semantics documented; runtime mapping incomplete | `GHM_ERROR_SEMANTICS_AND_VERSIONING_CONTRACT.md`; partial `handleError` / `handleEnquiryError`; Campaign-local mapper in `campaign-router.ts` |
| Transport selected HTTP/API | Transport selection ADR |
| Campaign HTTP runtime OPEN at locked wire | This contract does not authorize KBM adapter, issuance, or unrelated resource HTTP expansion |

## 4. Supported consumer model

A supported GHM product consumer is a product that:

- uses the approved HTTP/API boundary
- presents trusted authentication
- receives GHM AuthContext through the approved verification path
- supplies only permitted operation inputs
- does not supply authoritative ownership/role fields
- receives semantic results
- respects GHM authorization decisions
- does not access the GHM database directly

KBM is a **future** supported consumer once its adapter and qualification are complete.
KBM is not automatically a supported consumer by virtue of documentation alone.

## 5. Request semantics

HTTP requests to the product-facing boundary must identify:

| Element | Requirement |
|---|---|
| API version | Present and governed (existing evidence: `/api/v1` path prefix) |
| Resource / capability | Explicit `[RESOURCE]` |
| Operation | Explicit `[OPERATION]` (e.g. read / create / update) |
| Resource identity | `[RESOURCE_ID]` where the operation requires it |
| Permitted caller input | Only fields allowed by the resource contract |
| Authentication context | Trusted credential/token for protected operations |

Exact URL paths and JSON property names are **not** locked by this document unless already established by repository evidence for a given resource.

Placeholders for future wire contracts:

```text
[RESOURCE]
[RESOURCE_ID]
[OPERATION]
```

Do not invent endpoint paths or payload schemas in this gate.

## 6. Authentication

HTTP requests require a trusted authentication mechanism.

GHM must verify the presented credential/token before creating AuthContext.

AuthContext remains (matching existing implementation evidence in `src/auth/authorization.ts`):

```text
userId
role
```

```text
AUTHENTICATION ISSUANCE: UNSELECTED
```

This contract does **not** select:

- IdP
- token issuer
- credential store
- OAuth provider
- session provider

The product-facing HTTP contract **consumes** trusted authentication; it does not decide how credentials are initially issued.

## 7. Authorization

GHM is the authorization authority.

The product cannot override:

- role
- ownership
- membership
- business scope
- resource access

The API must derive authoritative security context from verified AuthContext and GHM-owned business/membership state.

Product-provided fields must never be treated as proof of authorization.

## 8. Business / membership context

Before executing business-scoped resource operations, GHM must resolve the caller’s authorized business/membership context from GHM-owned state.

For Campaign (per existing Campaign contracts; not reinvented here):

- business ownership/scope remains GHM-controlled
- creator identity remains GHM-controlled
- ownership cannot be reassigned by product input
- authorization remains GHM-controlled

No new organization model is introduced by this contract.
No database schema change is authorized.

## 9. Resource operations

Intended HTTP semantic operation model for product-facing resources:

```text
READ
CREATE
UPDATE
```

### Campaign (first product-facing resource at locked wire)

| Operation | Semantic status | HTTP status |
|---|---|---|
| Campaign READ (one + list by business) | Qualified + exposed | Exposed per CAMPAIGN_HTTP_* contracts |
| Campaign CREATE | Qualified + exposed | Exposed per CAMPAIGN_HTTP_* contracts |
| Campaign UPDATE | Qualified + exposed | Exposed per CAMPAIGN_HTTP_* contracts |

```text
CAMPAIGN HTTP EXPOSURE: IMPLEMENTED AND AUTHORIZED AT FOUNDER-LOCKED WIRE (`785df12`).
```

No DELETE requirement is introduced unless existing Campaign contracts explicitly require it (current Campaign surface is read/create/update).

## 10. Input ownership

| Category | Rule |
|---|---|
| Caller-supplied fields | Only fields explicitly allowed by the resource contract |
| GHM-controlled fields | Identity, business ownership, creator, authorization context, lifecycle/security-controlled values (where applicable) |

Authoritative Campaign HTTP field ownership remains in existing Campaign contracts and CAMPAIGN_HTTP_* Founder-locked contracts — do not invent additional payload fields here.

## 11. Response semantics

Successful responses must represent the approved resource/capability result.

Responses must **not** expose:

- database internals
- SQL
- repository objects
- internal service objects
- credentials
- secrets
- unnecessary infrastructure details

Exact JSON wire representation remains a later implementation contract if required.

## 12. Error semantics

Reference: `docs/architecture/GHM_ERROR_SEMANTICS_AND_VERSIONING_CONTRACT.md`

The HTTP layer must eventually map failures to the governed semantic categories:

- `unauthenticated`
- `unauthorized`
- `not_found`
- `validation_failed`
- `conflict`
- `invalid_state`
- `dependency_failure`
- `internal_failure`

Existing Express mappers (`handleError`, `handleEnquiryError`, auth middleware tokens) are **implementation evidence only** and are not yet a complete uniform semantic mapping.

Concrete HTTP status codes and error payload wire format require a later implementation gate.
They are not invented here.

## 13. Versioning

| Fact | Status |
|---|---|
| Existing `/api/v1` evidence | Present |
| HTTP API versioning required | Yes |
| Semantic compatibility must be preserved | Yes |
| Package version `2.0.0` | Not itself the HTTP API compatibility policy |

Not defined by this contract:

- version lifecycle
- deprecation windows
- compatibility periods

Those remain a later gate.

## 14. Transactions

GHM remains responsible for transaction boundaries.

A product request must not perform partial direct database operations.

The HTTP layer should invoke GHM application/service operations whose transaction semantics remain inside GHM.

No transaction code is changed by this document.

## 15. Idempotency / retries

Retry and idempotency behavior must be explicitly defined before operations where duplicate mutation is a risk.

```text
IDEMPOTENCY / RETRY POLICY: UNRESOLVED (later implementation contract)
```

This document does not invent headers, keys, retry counts, or algorithms.

## 16. Security (non-negotiable)

- no direct DB access
- no migration credentials to products
- no runtime DB credentials to products
- no product-controlled authorization
- no secret leakage
- no raw SQL through HTTP
- no arbitrary resource/table selection
- no generic database endpoint
- no internal service/repository exposure
- business isolation enforced by GHM
- AuthContext originates from trusted verification
- authentication issuance remains separate

## 17. Local-first KBM

KBM remains local-first.

The HTTP boundary must support a locally running KBM without requiring:

- Vercel
- Supabase
- cloud storage
- hosted workers
- direct database access

This contract does **not** select where GHM will ultimately be hosted.

The transport boundary remains valid whether GHM is:

- local
- privately hosted
- ZAID-controlled infrastructure
- another explicitly governed deployment

## 18. Provider independence

The HTTP contract must avoid coupling KBM to:

- Express internals
- Node internals
- Supabase SDKs
- database drivers
- PostgreSQL schemas
- vendor-specific GHM implementation details

The transport is HTTP/API.
The product contract is GHM semantic capability.

## 19. KBM adapter boundary

KBM domain code must **not** directly depend on raw GHM HTTP details.

Future structure:

```text
KBM domain
    ↓
KBM GHM adapter
    ↓
GHM HTTP/API
```

The adapter will eventually own:

- request construction
- authentication propagation
- HTTP-specific handling
- semantic error translation
- version handling
- retry behavior where authorized

```text
KBM HTTP ADAPTER: NOT IMPLEMENTED
```

Do not create the adapter in this gate.

## 20. Campaign first use case

Campaign is the first concrete consumer requirement because KBM’s minimum viable GHM consumption path is:

```text
KBM
→ trusted authentication
→ GHM AuthContext
→ business/membership context
→ Campaign READ / CREATE / UPDATE
→ semantic result
```

Campaign status at HEAD `785df12`:

- qualified internally
- HTTP exposed at Founder-locked wire
- product-callable over HTTP for Campaign ops

Authoritative wire: `CAMPAIGN_HTTP_FOUNDER_DECISION_RECORD.md` / `CAMPAIGN_HTTP_RESOURCE_CONTRACT.md` / `src/http/campaign-router.ts`.

KBM adapter remains NOT AUTHORIZED. Auth issuance remains UNSELECTED.

## 21. Qualification requirements

Campaign HTTP unit tests are present at `785df12`. Broader supported-consumer qualification (including KBM adapter integration) remains gated:

- authentication verification
- AuthContext correctness
- business isolation
- membership authorization
- Campaign READ / CREATE / UPDATE
- unauthorized / unauthenticated access
- invalid input / not-found / conflict behavior
- transaction behavior
- no direct DB path / no secret leakage
- API version behavior
- KBM adapter integration — **NOT AUTHORIZED**

## 22. Open questions

Unresolved (not decided by assumption):

- authentication issuance
- API version lifecycle policy (prefix `/api/v1` locked for Campaign; lifecycle OPEN)
- retry/idempotency policy (no special Campaign contract)
- correlation/request IDs
- KBM adapter implementation
- deployment topology
- production hosting

Campaign HTTP paths, envelopes, and status tokens are Founder-locked (see CAMPAIGN_HTTP_* contracts) — not open questions.

## 23. Implementation gate

Campaign HTTP implementation is AUTHORIZED and present at `785df12`.

This contract does **not** authorize:

1. Authentication issuance
2. Platform-wide error/version taxonomy runtime refactor
3. KBM GHM HTTP adapter
4. Broader HTTP expansion beyond the locked Campaign surface
5. Production cutover / hosting changes

Next remaining gates: authentication issuance decision; KBM adapter authorization (separate).

## 24. Relationships

| Document | Role |
|---|---|
| `GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md` | Platform ownership |
| `PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md` | Supported consumer / boundary semantics |
| `GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md` | Issuance separate / UNSELECTED |
| `GHM_ERROR_SEMANTICS_AND_VERSIONING_CONTRACT.md` | Error taxonomy / versioning meanings |
| `GHM_SHARED_PLATFORM_CAPABILITIES_BOUNDARY_AUDIT.md` | Jobs/realtime/storage not forced by transport |
| `GHM_PRODUCT_FACING_TRANSPORT_SELECTION_DECISION_RECORD.md` | Founder selected HTTP/API |
| `CAMPAIGN_OPERATION_CONTRACT.md` / `CAMPAIGN_SCHEMA_CONTRACT.md` / related Campaign docs | Campaign semantics unchanged |

## Final status

GHM PRODUCT-FACING HTTP TRANSPORT CONTRACT COMPLETE.

TRANSPORT SELECTED: HTTP/API.

HTTP TRANSPORT CONTRACT: DEFINED AT SEMANTIC LEVEL.

AUTHENTICATION ISSUANCE: UNSELECTED.

CAMPAIGN HTTP SURFACE: IMPLEMENTED.

CAMPAIGN HTTP IMPLEMENTATION: AUTHORIZED AT `785df12`.

KBM HTTP ADAPTER: NOT IMPLEMENTED.

BROADER HTTP EXPANSION: NOT AUTHORIZED BY THIS DOCUMENT.
