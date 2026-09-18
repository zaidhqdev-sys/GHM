# GHM Error Semantics and Versioning Compatibility Contract

**Canonical owner:** GHM platform governance
**Status:** Architecture contract — documentation-only; transport-neutral; implementation not authorized
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `0a9a9f7`
**Depends on:**
- [GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md](./GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md)
- [PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md](./PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md)
- [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md)

## 1. Status

| Attribute | Value |
|---|---|
| Document type | Architecture / governance contract |
| Gate | Documentation-only |
| Transport | Semantically transport-neutral; product-facing callable transport = HTTP/API (SELECTED) |
| Runtime refactor | **NOT AUTHORIZED** |
| Versioning implementation | **NOT AUTHORIZED** |
| Callable transport selection | DONE — HTTP/API; this document still does **not** authorize platform error/version runtime refactor |
| Authentication issuance selection | **NOT AUTHORIZED** |

This contract does **not** choose HTTP, RPC, SDK, MCP, events, webhooks, generated clients, endpoint paths, HTTP status codes, or wire-format schemas.

## 2. Purpose

A cross-product backend needs stable **semantic** failure meanings and compatibility rules that are independent of transport.

KBM or another ZAID product must be able to understand the meaning of a GHM result without depending on:

- Express
- HTTP status codes
- PostgreSQL errors
- vendor SDK exceptions
- internal `Error` message strings
- implementation-specific stack traces

Current HTTP Resource API slices may map some outcomes to HTTP responses. That mapping is **implementation evidence**, not the platform semantic contract.

## 3. Current repository evidence

### 3.1 EXISTING IMPLEMENTATION

| Finding | Evidence |
|---|---|
| No dedicated error class hierarchy under `src/` | No `*error*` modules; services/repos throw `new Error('…')` strings |
| Auth middleware returns `{ error: 'unauthorized' }` on verify failure | `src/auth/http.ts` |
| Registry/ACL middleware returns `{ error: 'forbidden' }` | `src/http/app.ts`, `src/http/enquiry-router.ts` |
| Route parsers return `{ error: 'invalid_request' }` | `src/http/app.ts`, `src/http/enquiry-router.ts` |
| Shared HTTP mapper `handleError` maps selected message strings / PG `23505` to `forbidden` / `not_found` / `conflict`, else `internal_error` | `src/http/app.ts` |
| Enquiry-specific mapper `handleEnquiryError` adds validation→`invalid_request` and status-transition→`conflict` | `src/http/enquiry-router.ts` |
| Structured console log on some failures (`http_request_failed` name only) vs plain `console.error` in enquiry path | `src/http/app.ts`, `src/http/enquiry-router.ts` |
| Tests assert HTTP error bodies | `src/http/app.test.ts`, `src/http/enquiry-router.test.ts` |
| Service-layer failures are free-form strings (Campaign examples: title validation, “not found or management permission required”) | `src/resources/campaign/service.ts`, `src/resources/campaign/repository.ts` |
| Auth helpers throw `Authentication required`, `Resource ownership required`, `Insufficient role` | `src/auth/authorization.ts` |
| Project private read uses same not-found boundary for non-owners | `docs/architecture/RESOURCE_API_BOUNDARY_CONTRACT.md` |
| Campaign HTTP exists (`src/http/campaign-router.ts`, HEAD `785df12`); domain still throws string `Error`s; Campaign-local HTTP mapper maps to Founder-locked tokens; platform-wide taxonomy refactor **NOT AUTHORIZED** | `src/resources/campaign/*`; `src/http/campaign-router.ts` |

Observed HTTP product-facing error **tokens** (current Resource API slices only):

```text
unauthorized
forbidden
invalid_request
not_found
conflict
internal_error
```

These tokens and status codes are **CURRENT IMPLEMENTATION EVIDENCE**. They are not declared here as the permanent cross-product semantic vocabulary (see §4).

Inconsistencies observed (evidence, not rewrite authorization):

- authentication failures → `unauthorized`; coarse ACL failures → `forbidden` (distinct at HTTP middleware)
- some ownership/eligibility denials are collapsed into `not_found` via message matching (e.g. Project / Enquiry / Campaign “not found or … permission” style messages)
- lifecycle/validation failures sometimes map to `conflict` (enquiry invalid transition; project “Only open Projects may be updated”) and sometimes to `invalid_request`
- two HTTP mappers (`handleError` vs `handleEnquiryError`) with different matching rules
- most qualified resources have **no** HTTP error mapping at all

### 3.2 Versioning evidence (EXISTING IMPLEMENTATION)

| Finding | Evidence |
|---|---|
| npm package version `2.0.0` | `package.json` |
| Root health identity returns `version: '2.0.0'` | `src/http/app.ts` `GET /` |
| Wired Resource API paths use `/api/v1/...` prefix | `src/http/app.ts`, `src/http/enquiry-router.ts` |
| Database migrations are timestamped files under `database/migrations/` | migrator `src/db/migrate.ts` |
| No platform-wide compatibility / deprecation / breaking-change policy document found | docs search; Product Integration Boundary marks versioning **OPEN** |
| Prior architecture docs mark versioning/compatibility as open | Platform Charter; Product Integration Boundary Contract |

`package.json` version, `/api/v1` path prefix, and migration filenames are **not** automatically the same compatibility contract.

### 3.3 GOVERNED FUTURE SEMANTICS

Sections below define **CONTRACT REQUIREMENTS** for a future supported product-facing boundary.
They do **not** claim every existing GHM path already conforms.

## 4. Semantic result model

A supported GHM operation outcome is conceptually:

```text
SUCCESS
```

or a governed semantic failure.

### CONTRACT REQUIREMENT — failure taxonomy

| Category | Meaning | When GHM should use it | Must NOT be confused with | Retry guidance | Product-facing detail |
|---|---|---|---|---|---|
| `unauthenticated` | No trustworthy authenticated identity was established | Missing/invalid credentials for a protected operation | Authorization denial; not-found | Generally not retryable without new credentials | No token/secret contents |
| `unauthorized` | Authenticated identity is established but not permitted | Role/membership/ownership/ACL/lifecycle authz denial | Unauthenticated; validation | Generally not retryable without privilege/context change | No privilege-escalation hints beyond policy |
| `not_found` | Target resource is not available to the caller under disclosure policy | Missing resource **or** intentional non-disclosure where resource contract requires it | Validation of malformed ids may be `validation_failed` instead | Generally not retryable unless resource may appear later (operation-specific) | Must not leak existence when policy forbids it |
| `validation_failed` | Input fails contract validation before/without durable state transition | Malformed/missing/invalid fields; schema/contract checks | Invalid lifecycle/state transition (`invalid_state`) | Generally not retryable without correcting input | Safe field-level hints may be allowed by resource contract; no SQL |
| `conflict` | Request is well-formed but conflicts with current unique/concurrent constraints | Verified uniqueness violations; concurrent create/update conflicts where contracted | Invalid state transition (prefer `invalid_state` when lifecycle graph rejects) | Potentially retryable only if operation contract declares it | No raw constraint names required |
| `invalid_state` | Resource exists and caller is authorized, but lifecycle/state forbids the operation | Illegal status transitions; closed/immutable states | Input shape errors (`validation_failed`) | Generally not retryable without state change | May name allowed transitions if resource contract permits |
| `dependency_failure` | Failure caused by a dependency outside the immediate governed persistence path | Future/external dependencies when present | Business rule validation | Potentially retryable — **transport/operation-dependent** | Provider-neutral; no vendor payloads |
| `internal_failure` | Unexpected platform/implementation failure | Unmapped exceptions; invariant breaks | Expected domain denials | Potentially retryable only if operation contract says so | No stacks, SQL, secrets |

**Labeling rule:** The categories above are **CONTRACT REQUIREMENTS** for supported product integration. Existing HTTP tokens (`forbidden`, `invalid_request`, `internal_error`, …) are implementation evidence that may later map into this taxonomy under a transport contract. This document does **not** authorize a runtime refactor to rename them.

## 5. Security semantics

- Authentication failure is distinct from authorization failure (`unauthenticated` vs `unauthorized`).
- Authorization failure is distinct from not-found semantics **except** where a resource contract intentionally uses not-found to avoid existence disclosure.
- Example of intentional not-found disclosure policy already documented for Project private reads: non-owners receive the same not-found boundary (`RESOURCE_API_BOUNDARY_CONTRACT.md`). That is a **resource security policy**, not a universal rule for every resource.
- GHM remains authoritative for authorization. Products cannot reinterpret an authorization result as permission.
- Raw database errors must not become product-facing contract semantics.
- Internal stack traces, SQL details, credentials, secrets, or provider-specific failures must not cross the supported product boundary.
- Product UX may translate semantic errors into user-facing language, but must not change their security meaning.
- GHM-controlled identity/ownership fields remain authoritative.

## 6. Validation semantics

Distinguish conceptually:

| Kind | Prefer |
|---|---|
| Malformed input / wrong types / unknown fields | `validation_failed` |
| Missing required fields | `validation_failed` |
| Invalid field values (range/format/enum) | `validation_failed` |
| Business-rule violations that are still “bad input” relative to contract | `validation_failed` (unless resource contract defines otherwise) |
| Illegal lifecycle / status transitions on an otherwise valid resource | `invalid_state` |

Current implementation often uses string throws and HTTP `invalid_request` / `conflict` mappings — **EXISTING IMPLEMENTATION**, not yet a uniform semantic contract.

This document does not create validation implementation.

## 7. Conflict semantics

Conceptually, `conflict` means the request is understandable but cannot proceed because it collides with current durable state constraints, such as:

- uniqueness conflicts (current HTTP evidence maps PostgreSQL unique violation code `23505` in `handleError`)
- concurrent incompatible creates/updates where contracted
- incompatible lifecycle operations **when** the resource contract classifies them as conflicts rather than `invalid_state`

Do not invent specific database constraints as platform-wide requirements beyond verified evidence. Resource contracts remain authoritative for which conflicts exist.

## 8. Dependency failure semantics

`dependency_failure` covers failures caused by a dependency outside the immediate business persistence operation.

Examples / future capability illustrations (not authorized here):

- external provider
- unavailable service
- storage dependency
- future authentication issuer dependency
- future queue/job dependency

Where such dependencies do not currently exist in GHM for a resource, this category remains reserved for future governed use.

This document does not introduce those dependencies.

## 9. Internal failure semantics

`internal_failure` is an unexpected implementation/platform failure.

- raw internal exceptions are not the product contract
- stack traces are internal
- SQL errors are internal
- secrets must never appear in errors
- provider SDK error objects must not leak through the GHM semantic boundary

Current HTTP `internal_error` responses after unmapped errors are implementation evidence (`src/http/app.ts`, `src/http/enquiry-router.ts`).

## 10. Retry semantics

Semantic guidance only — **no automatic retries**, **no queues**, **no idempotency implementation**.

| Failure class | Guidance |
|---|---|
| `unauthenticated` | Generally not retryable without new credentials |
| `unauthorized` | Generally not retryable without privilege/context change |
| `not_found` | Generally not retryable; exceptions only if operation contract says resource may appear later |
| `validation_failed` | Generally not retryable without corrected input |
| `invalid_state` | Generally not retryable without state change |
| `conflict` | Potentially retryable only if operation contract declares it |
| `dependency_failure` | Potentially retryable — transport/operation-dependent |
| `internal_failure` | Potentially retryable only if operation contract declares it |

**Retryability is an operation/transport concern that may require a later contract.**

```text
RETRY POLICY = OPEN / FOLLOW-UP CONTRACT
```

## 11. Versioning model

### Audit summary

GHM currently has package version `2.0.0`, a root service version string, `/api/v1` path prefixes on some HTTP routes, and timestamped SQL migrations. There is **no** governed cross-product compatibility policy tying these together.

### GOVERNANCE REQUIREMENT

Before GHM exposes a supported cross-product callable surface, it needs explicit compatibility/version semantics that separately address:

| Layer | Meaning |
|---|---|
| GHM platform version | Overall platform release identity (today: package/`GET /` evidence only) |
| Callable contract version | Version of the product-facing integration contract (transport = HTTP/API; Campaign wire under `/api/v1`; lifecycle policy OPEN) |
| Resource contract version | Per-resource schema/operation semantics |
| Database / schema migration version | Migration ledger / applied migrations |
| Product adapter compatibility | Which product adapter builds against which contract versions |

Do **not** automatically equate package version, migration version, and product API version.

```text
VERSIONING POLICY = OPEN / FOLLOW-UP CONTRACT
```

No release-number convention is selected here unless already established. `/api/v1` is implementation evidence, not a platform-wide compatibility contract.

## 12. Compatibility rules

### Backward-compatible changes (semantic expectation)

Examples:

- additive optional response fields that do not change meaning of existing fields
- additive operations only where explicitly safe and authorized
- internal implementation changes that preserve resource/authz/error semantics

### Potentially breaking changes (semantic expectation)

Examples:

- removing fields
- changing field meaning
- changing required inputs
- changing authorization semantics
- changing lifecycle semantics
- changing error meanings
- changing identity semantics

A specific release-number scheme is **not** declared by this document.

## 13. Deprecation

Future supported contracts need:

- explicit deprecation notice
- migration path
- compatibility window where applicable
- removal gate

This document does **not** invent a number of days/months for the compatibility window.

## 14. Product adapter responsibility

### GHM owns

- semantic contract
- resource semantics
- authorization semantics
- governed error meanings
- compatibility guarantees (once versioning policy is selected)

### Product adapters own

- mapping semantic results into product UX
- transport-specific parsing
- provider/transport implementation details
- product-specific messaging

### Products must not

- bypass GHM
- interpret database errors
- depend on internal repository/service objects
- depend on Express internals
- depend on provider SDK error structures

## 15. Local-first implications

- KBM remains **LOCAL-FIRST**.
- Local-first does not weaken GHM's semantic boundary.
- Local execution does not permit direct PostgreSQL access.
- No Vercel requirement.
- No Supabase requirement.
- No cloud storage requirement created by this contract.
- A future hosted deployment must preserve the same semantic contract.

## 16. Provider independence

Semantic errors must remain provider-neutral.

Example: a provider timeout may become a governed `dependency_failure` rather than exposing vendor SDK class names, vendor-specific status codes, or raw provider payloads.

Provider-specific diagnostics may remain internal/logged subject to future observability policy.

## 17. Observability boundary

### Current logging evidence

- `src/http/app.ts`: JSON `http_request_failed` with error `name` only on unmapped failures
- `src/http/enquiry-router.ts`: `console.error('HTTP request failed:', error)` (broader dump than app mapper)
- `src/server.ts`: structured startup/uncaught logs with safe error name/code details

### GOVERNANCE REQUIREMENT

- internal diagnostics may be richer than product-facing errors
- product-facing semantic errors must be bounded
- secrets/credentials/tokens must not be logged
- raw provider payloads must not automatically cross boundaries
- correlation/request identifiers may be introduced later as a transport/platform contract

This document does not implement observability changes.

## 18. Authentication interaction

Reference: [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md)

- authentication issuance remains unresolved / unselected
- verification/authentication failure semantics must eventually map into this semantic model (`unauthenticated` and related)
- token issuer specifics remain unselected
- this document does not choose an issuer

## 19. Transport independence

This contract is semantic and transport-neutral.

It does **NOT** select:

- HTTP
- RPC
- SDK
- MCP
- events
- webhooks
- generated clients
- any other callable mechanism

Any future transport contract must map to these semantics without changing their meaning.

Current `/api/v1` HTTP error tokens remain implementation evidence for existing Resource API slices only.

## 20. Open decisions

Genuine unresolved decisions from the audit:

| Decision | Status |
|---|---|
| Exact version numbering policy | OPEN |
| Compatibility window length | OPEN |
| Retry declaration mechanism | OPEN |
| Idempotency semantics | OPEN |
| Correlation identifiers | OPEN |
| Transport mapping of semantic categories | OPEN for platform-wide taxonomy; Campaign HTTP tokens Founder-locked separately |
| Product-facing error payload shape | OPEN |
| Adapter / version negotiation | OPEN |
| Deprecation process details | OPEN |
| Whether/how existing HTTP tokens (`forbidden`, `invalid_request`, …) permanently map to this taxonomy | OPEN |
| Uniform treatment of authz-vs-existence disclosure across resources | Resource-contract-specific; no universal selection here |

Do not silently decide them.

## 21. Implementation gate

```text
NO ERROR SEMANTICS RUNTIME REFACTOR IS AUTHORIZED BY THIS DOCUMENT.
NO VERSIONING IMPLEMENTATION IS AUTHORIZED BY THIS DOCUMENT.
```

Before implementation, Founder authorization is required for:

- concrete error representation
- transport mapping
- versioning scheme
- compatibility policy
- retry/idempotency semantics where needed
- product adapter implementation
- qualification strategy

## 22. Relationship to existing architecture

| Document | Relationship |
|---|---|
| Platform Charter | Cross-product platform; versioning open; no transport selected |
| Product Integration Boundary | Lists semantic error categories and versioning as follow-up; this document governs those semantics |
| Authentication Issuance ADR | Issuance unselected; verification failures must map into semantic model later |
| Resource API Boundary Contract | Current HTTP slices + disclosure/not-found evidence; not rewritten here |
| Campaign domain + Campaign HTTP mapper present; this document does **not** authorize renaming Campaign tokens to the full semantic taxonomy | `src/resources/campaign/`; `src/http/campaign-router.ts`; Campaign HTTP contracts |

This contract:

- does not alter qualified Campaign behavior
- does not authorize platform-wide error/versioning runtime refactor; product callable transport is already HTTP/API
- does not authorize authentication issuance
- does not authorize storage/jobs/audit implementation

## Final gate

GHM ERROR SEMANTICS AND VERSIONING COMPATIBILITY CONTRACT COMPLETE.

DOCUMENTATION-ONLY GATE.

NO ERROR SEMANTICS RUNTIME REFACTOR AUTHORIZED.

NO VERSIONING IMPLEMENTATION AUTHORIZED.

PRODUCT CALLABLE TRANSPORT = HTTP/API (SELECTED); this document remains semantically transport-neutral for taxonomy mapping.

NO AUTHENTICATION ISSUANCE SELECTED.

GHM AUTHORIZATION REMAINS AUTHORITATIVE.

DIRECT PRODUCT DATABASE ACCESS REMAINS NOT APPROVED.
