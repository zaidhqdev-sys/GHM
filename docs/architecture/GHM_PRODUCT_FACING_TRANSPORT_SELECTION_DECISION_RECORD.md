# GHM Product-Facing Transport Selection Decision Record

**Canonical owner:** GHM platform governance
**Status:** Architecture decision record — documentation-only; **transport selected**; historical selection-time implementation closed; **superseded for Campaign HTTP by HEAD `785df12`**
**Authority:** Local repository `C:\GHM`
**Baseline (selection record):** branch `construction/saved-business-resource`, HEAD `0a9a9f7`
**Nature:** Decision-space record with Founder transport selection — **HTTP/API selected**; at selection time **no implementation authorized**

```text
TRANSPORT SELECTED: HTTP/API
FOUNDER AUTHORIZATION: GIVEN
At selection time: IMPLEMENTATION AUTHORIZED: NO
Post-785df12: Campaign HTTP surface separately AUTHORIZED and implemented; this ADR still does not authorize issuance, KBM adapter, or unrelated resources
```

## 1. Purpose

GHM currently has internal resource/service mechanisms and **partial** HTTP Resource API exposure, but no governed **product-facing callable transport** covering the cross-product integration contract for all required KBM (and future product) operations—especially Campaign.

This record identifies and compares viable transport mechanisms against already-approved **semantic** requirements. It does **not** choose a winner.

The eventual transport must carry:

- trusted authentication context
- business context
- authorized resource operations
- semantic results / errors
- version / compatibility semantics

without changing their meaning.

## 2. Repository evidence audit

### GHM

| Area | Evidence |
|---|---|
| HTTP app | `src/http/app.ts`, `src/http/enquiry-router.ts` — Express |
| Auth middleware | `src/auth/http.ts` `requireAuth`; `src/auth/request-context.ts` JWT verify → AuthContext |
| Registry | `src/resources/registry.ts` — includes `campaign` ops `read`/`create`/`update` |
| Campaign | `src/resources/campaign/**` — service/repository qualified; Campaign HTTP routes present under `src/http/campaign-router.ts` (HEAD `785df12`) |
| Package | `package.json`: `name` `ghm-core`, `main` `dist/server.js`, **no** `exports` / `types` |
| Build | `tsconfig.json` → CommonJS `dist/`; server entry `src/server.ts` |
| Index library entry | **No** `src/index.ts` |
| MCP / gRPC / tRPC | **No** matches under `src/` |
| Queues / event bus | **Absent** (Shared Platform Capabilities Audit) |
| Semantic contracts | Platform Charter; Product Integration Boundary; Auth Issuance ADR; Error/Versioning Contract; Shared Capabilities Audit |
| Campaign contracts | `docs/architecture/CAMPAIGN_*.md`; HEAD `0a9a9f7` |

### KBM (`C:\KBM Ai Marketing` — inspected read-only)

| Area | Evidence |
|---|---|
| Consumer requirements | `docs/KBM_GHM_PRODUCT_CONSUMPTION_REQUIREMENTS_CONTRACT.md` |
| Campaign consumption / callable semantics | `docs/GHM_CAMPAIGN_CONSUMPTION_CONTRACT.md`, `docs/KBM_GHM_CAMPAIGN_CALLABLE_INTEGRATION_CONTRACT.md` |
| Architecture | `docs/ARCHITECTURE.md`, `docs/GHM_BACKEND.md`, `docs/MVP.md` |
| Runtime / package | **No** `package.json`; docs-only + placeholders; **LOCAL-FIRST** |
| Integration code | **None** (no client/adapter implementation) |

## 3. Current callable surface (do not equate)

| Layer | What exists | Supported product-facing contract? |
|---|---|---|
| **A. HTTP routes** | `/`, `/healthz`, `/readyz`; `/api/v1/profile`; businesses; projects; enquiries; **Campaign** GET/LIST/POST/PATCH under `/api/v1/campaigns` | Construction Resource API slices + Campaign HTTP at `785df12` — **not** a complete KBM supported-consumer contract (adapter + issuance still gated) |
| **B. Resource registry** | Many resources including `campaign` | Registry ≠ product API |
| **C. In-process services/repos** | Campaign and others callable inside GHM process | Internal implementation — **not** governed cross-product contract |
| **D. Supported product-facing callable contract** | Campaign HTTP callable surface **PRESENT** at locked wire; KBM adapter + auth issuance still NOT AUTHORIZED / UNSELECTED | Required for full KBM Campaign consumption |

### Campaign status (confirmed)

| Attribute | State |
|---|---|
| Registered | Yes |
| Implemented | Yes |
| Qualified | Yes (`0a9a9f7`) |
| Callable internally | Yes (service/repository) |
| Exposed via supported product-facing transport | **Yes** — Campaign HTTP at Founder-locked wire (HEAD `785df12`); KBM adapter still NOT AUTHORIZED |

## 4. Semantic payload the transport must carry

From Product Integration Boundary + KBM consumption requirements (unchanged by transport choice):

```text
trusted identity → AuthContext
business context
campaign.read | campaign.create | campaign.update (and other authorized ops later)
semantic SUCCESS | governed failure taxonomy
compatibility / versioning semantics (policy still OPEN)
```

Authentication **issuance** remains a **separate** unresolved decision.

---

## 5. Transport options (neutral — no ranking)

### OPTION A — HTTP / API

#### Mechanism

Synchronous request/response over HTTP to governed Resource API routes (pattern already used for profile/business/project/enquiry).

#### Repository evidence

Express Resource API in `src/http/**`; `/api/v1` path prefix; `handleError` / `handleEnquiryError` string→HTTP token mapping; Campaign HTTP routes present (`campaign-router.ts`, HEAD `785df12`); Resource API Boundary Contract qualifies existing slices; Campaign HTTP Founder-locked separately.

#### Semantic fit

AuthContext via Bearer JWT middleware already demonstrated; business/resource ops as typed routes; errors currently map to HTTP tokens (`unauthorized`, `forbidden`, `invalid_request`, `not_found`, `conflict`, `internal_error`) — implementation evidence, not final semantic taxonomy mapping; versioning via path prefix is evidence only.

#### Product boundary

KBM would call HTTP through a future product adapter (not invented here).

#### GHM boundary

GHM owns routes, auth middleware, service invocation, authz, transactions.

#### Authentication interaction

Verification path exists; issuance still UNSELECTED.

#### Authorization interaction

GHM remains authoritative via middleware + service/SQL.

#### Error interaction

Must map Error Semantics Contract categories onto wire without leaking SQL/stacks; current mappers are incomplete/inconsistent across resources.

#### Versioning interaction

`/api/v1` and package `2.0.0` are evidence; platform compatibility policy still OPEN.

#### Local-first implications

Local KBM can call a local or reachable GHM HTTP process; no Vercel/Supabase required by the mechanism itself.

#### Provider independence

HTTP itself is not a cloud vendor; hosting choice separate.

#### Security implications

TLS/network boundary TBD; no DB credentials to product; AuthContext from verify path only; avoid leaking internals in responses.

#### Operational implications

Process boundary clear; network required; local-dev needs GHM process up; failure modes are request-scoped.

#### Limitations / unresolved questions

Whether to extend existing Express Resource API for Campaign; how to unify error mapping; whether KBM may consume existing business/profile routes as approved surface.

#### Implementation prerequisites

Founder transport selection; Campaign Resource API qualification; transport contract; error/version wire contracts; issuance decision; KBM adapter contract; qualification.

---

### OPTION B — In-process package / library

#### Mechanism

KBM (or a host process) imports GHM as a library and calls services in-process with constructed AuthContext.

#### Repository evidence

`main: dist/server.js`; no `exports`/`types`; no library entrypoint; designed as deployable server (`ghm-core`); Product Integration Boundary forbids treating internal modules as public API.

#### Semantic fit

Could call Campaign services with AuthContext **if** process shares DB/runtime — but trust of AuthContext construction becomes critical; easy to bypass intended product boundary.

#### Product boundary

Tight coupling; KBM process would host GHM runtime/DB pool — deployment merge.

#### GHM boundary

Hard to govern as multi-product platform without publishing intentional package contracts and privilege model.

#### Authentication interaction

Who constructs AuthContext in-process? Risk of product manufacturing privileged context — **forbidden** by existing contracts unless governed.

#### Authorization interaction

Services can enforce if AuthContext is trusted; trust bootstrap is the hard problem.

#### Error interaction

Would surface thrown `Error` strings unless a semantic result layer is added.

#### Versioning interaction

npm package version exists; not a consumer compatibility policy.

#### Local-first implications

Possible on one machine, but couples KBM to GHM DB credentials/runtime — conflicts with “products must not receive DB credentials.”

#### Provider independence

High code coupling.

#### Security implications

**High risk** of privilege escalation / credential co-location unless redesigned; generally conflicts with direct-DB prohibition spirit if GHM DB URL lives in product process.

#### Operational implications

Single process; hard multi-product isolation.

#### Limitations / unresolved questions

Would require intentional library packaging, AuthContext trust model, and Founder authorization; currently **not** a supported consumer package.

#### Implementation prerequisites

Package export contract; security review of in-process trust; likely rejected unless isolation model changes — **not selected here**.

---

### OPTION C — RPC

#### Mechanism

Synchronous remote procedure calls with typed procedures mapping to resource operations.

#### Repository evidence

**No** RPC framework/protocol present in GHM `src/` or dependencies.

#### Semantic fit

Can carry AuthContext metadata, business params, ops, structured errors, versions — **if** contracted.

#### Product boundary

KBM would use an RPC client behind an adapter.

#### GHM boundary

GHM would host RPC server mapping to existing services.

#### Authentication interaction

Token carriage in RPC metadata — verification still GHM; issuance separate.

#### Authorization interaction

Must invoke same service/authz path.

#### Error interaction

Map semantic taxonomy to RPC status/details.

#### Versioning interaction

Package/service versioning needed — OPEN.

#### Local-first implications

Local client ↔ local/remote RPC server viable without cloud vendors.

#### Provider independence

Protocol choice must avoid lock-in; none selected.

#### Security implications

Same authz/AuthContext rules; no DB to product.

#### Operational implications

New infrastructure vs reusing Express; testing/qualification required.

#### Limitations / unresolved questions

Which RPC family (unselected); overlap with HTTP Resource API.

#### Implementation prerequisites

Founder selection; protocol contract; server wiring; qualification — **no protocol named as chosen**.

---

### OPTION D — Generated typed client over a transport

#### Mechanism

A generated client artifact for product consumption. **Not itself a transport** — it layers over HTTP, RPC, or another selected mechanism.

#### Repository evidence

No OpenAPI/client generation pipeline found in GHM; no KBM client package.

#### Semantic fit

Can encode ops/types/errors **once** underlying transport and contracts exist.

#### Product boundary

KBM adapter would use generated client rather than hand-written calls.

#### GHM boundary

GHM owns source contracts that generate the client.

#### Authentication / authorization / errors / versioning

Inherited from underlying transport + semantic contracts.

#### Local-first implications

Client can run locally against local GHM.

#### Provider independence

Depends on generator toolchain — keep contracts semantic.

#### Security implications

Client must not embed secrets; still no DB access.

#### Operational implications

Generation/CI pipeline required.

#### Limitations / unresolved questions

Does not answer transport selection by itself.

#### Implementation prerequisites

Underlying transport selection first; then schema + generator + adapter contracts.

---

### OPTION E — MCP

#### Mechanism

Model Context Protocol tools/resources as a callable surface.

#### Repository evidence

**No** MCP server/tools in GHM `src/` or package deps.

#### Semantic fit

Tool calls could map to resource operations **if** AuthContext/authz/transactions are strictly enforced. Suitability for authoritative multi-tenant business mutations and transactional resource ops is **unresolved** and must be proven against Product Integration Boundary non-negotiables.

#### Product boundary

KBM (or an agent host) would invoke MCP tools — may not match “KBM domain → GHM boundary” product topology without an intervening host.

#### GHM boundary

Would require MCP server owned by GHM with same service authz path.

#### Authentication interaction

How trusted identity reaches GHM via MCP is undefined; issuance still separate.

#### Authorization interaction

Must not weaken GHM authz.

#### Error / versioning interaction

Would need semantic mapping contracts.

#### Local-first implications

Possible locally if MCP host runs locally; must not imply cloud.

#### Provider independence

MCP is a protocol; host/tooling choices separate.

#### Security implications

Tool surfaces can be over-broad; risk of exposing internal ops; must forbid raw SQL/SECURITY DEFINER arbitrary call.

#### Operational implications

New protocol stack; qualification heavy.

#### Limitations / unresolved questions

Whether MCP is appropriate as **primary** product backend integration for Campaign mutations remains **unresolved** — neither selected nor categorically rejected here beyond evidence of absence.

#### Implementation prerequisites

Founder decision; security model; tool taxonomy limited to resource ops; qualification.

---

### OPTION F — Events / webhooks / asynchronous messaging

#### Mechanism

Async event delivery / webhooks / queues for notifications of state change.

#### Repository evidence

No GHM queue/event bus; Shared Capabilities Audit: jobs/realtime not justified for current GHM platform; KBM minimum need is **synchronous** Campaign read/create/update.

#### Semantic fit

Useful for notifications **after** mutations; **cannot alone** fulfill KBM minimum viable surface (create/read/update request/response).

#### Product boundary

KBM would subscribe/poll — secondary to sync ops.

#### GHM boundary

Would need event emission from governed mutations — future/gated.

#### Authentication / authorization

Delivery auth and subscription authz must be governed if ever added.

#### Error / versioning

Async failure semantics differ from sync resource results.

#### Local-first implications

Local queues possible but not required now.

#### Provider independence

Do not select brokers.

#### Security implications

Event payloads must not leak internals; no DB access.

#### Operational implications

New infra; not needed for MVP sync Campaign.

#### Limitations / unresolved questions

Complementary at best; insufficient alone for current KBM blockers.

#### Implementation prerequisites

Not a substitute for sync transport selection.

---

### OPTION G — Other

No additional materially distinct mechanism is evidenced in repositories beyond the above (direct DB explicitly **NOT APPROVED** and excluded as a transport option).

---

## 6. Requirement traceability matrix

| Requirement | HTTP/API | In-process | RPC | Generated Client | MCP | Events/Webhooks | Notes |
|---|---|---|---|---|---|---|---|
| AuthContext propagation | possible; middleware evidence | possible; trust risk | requires new contract | transport-dependent | unresolved | transport-dependent | Issuance separate |
| Business context | possible | possible | requires new contract | transport-dependent | unresolved | weak alone | Product provides; GHM validates |
| Membership / authorization | supported by existing evidence (pattern) | possible if AuthContext trusted | requires new contract | transport-dependent | requires new contract | blocked as sole path | GHM authoritative |
| Campaign read | Campaign HTTP route present at `785df12` | possible internally; not alone a supported product surface | requires new infrastructure/contract | blocked until base transport | requires new infrastructure | blocked as sole path | Qualified + HTTP exposed |
| Campaign create | Campaign HTTP route present at `785df12` | same | same | same | same | blocked as sole path | |
| Campaign update | Campaign HTTP route present at `785df12` | same | same | same | same | blocked as sole path | |
| Semantic errors | possible; mapping incomplete today | requires new contract (string Errors) | requires new contract | transport-dependent | requires new contract | transport-dependent | Error Semantics doc governs meaning |
| Versioning | possible; policy OPEN | package version only | requires new contract | transport-dependent | requires new contract | requires new contract | |
| Transactions | GHM-owned behind HTTP handlers | GHM-owned in-process | GHM-owned behind RPC | N/A | must preserve GHM tx | N/A for sync ops | Product must not own DB tx |
| Local-first KBM | possible | conflicts with DB credential isolation unless redesigned | possible | possible | possible | possible | No Vercel/Supabase required |
| Product isolation | clear process boundary | weak | clear | clear | host-dependent | clear | |
| Provider independence | possible | high coupling | possible | toolchain risk | possible | broker risk | |
| Testing / qualification | pattern exists for Resource API | unit tests exist | new | new | new | new | Campaign HTTP qualification was absent at selection time; Campaign HTTP was later separately authorized, implemented, and qualified at HEAD 785df12. |
| Operational boundary | process + network | single process | process + network | client artifact | process + host | brokers | |

No scores. No ranking.

## 7. Security boundary (any future transport)

Non-negotiables:

- GHM remains authorization authority
- Product-supplied role/ownership cannot override GHM
- Direct PostgreSQL access remains forbidden
- AuthContext from trusted verification path only
- Authentication issuance remains separately unresolved
- Tokens/secrets must not leak into logs or errors
- Transport must not expose raw DB objects or internal repository/service details
- Business isolation enforced by GHM

## 8. Semantic contract boundary

Transport is an implementation mechanism.

Transport-independent:

- resource identity
- operation identity
- authorization semantics
- AuthContext semantics
- validation semantics
- error taxonomy
- lifecycle semantics
- transaction semantics
- version/compatibility semantics

A selected transport must **map onto** these semantics, not redefine them.

## 9. Local-first KBM

KBM runs on the local machine.

Therefore any eventual transport must allow:

- no mandatory Vercel
- no mandatory Supabase
- no mandatory cloud storage
- no mandatory hosted worker
- no direct database connection

without weakening GHM security boundaries.

## 10. Product adapter (follow-up)

After transport selection, a separate **KBM → GHM Product Adapter Contract** is required to isolate:

- transport-specific details
- authentication/session details
- error mapping
- version handling
- retries where authorized
- GHM resource calls

KBM domain must not couple to Express, vendor SDKs, raw HTTP, DB structures, or internal GHM repositories.

**Not implemented now.**

## 11. Decision criteria (for Founder — not a ranking)

When selecting a transport, consider:

- semantic contract fidelity
- security boundary
- AuthContext propagation
- authorization enforcement
- local-first compatibility
- deployment independence
- provider independence
- versioning support
- error semantics
- transactional operations
- testing/qualification
- operational complexity
- product isolation
- future ZAID-controlled infrastructure
- migration/replacement cost

These are criteria, not scores.

## 12. Current decision

```text
TRANSPORT SELECTED: HTTP/API
FOUNDER AUTHORIZATION: GIVEN
At selection time: IMPLEMENTATION AUTHORIZED: NO
Post-785df12: Campaign HTTP surface separately AUTHORIZED and implemented; this ADR still does not authorize issuance, KBM adapter, or unrelated resources
```

The Founder has explicitly selected **HTTP/API** as the product-facing transport.

Alternatives remain documented neutrally above for historical decision context.
No option was ranked, scored, or described as best/preferred/ideal/superior/winner.
**This selection alone did not authorize runtime implementation**; Campaign HTTP was authorized later under separate Founder gates and committed at `785df12`.

## 13. Required follow-up after Founder selection

1. Transport Decision Record update / selection confirmation — **DONE**
2. Concrete transport contract — Campaign HTTP resource contract **DONE** at `785df12`
3. Authentication issuance decision — **OPEN / UNSELECTED**
4. Token/claims/AuthContext contract where applicable — issuance-side still OPEN
5. Error wire representation — Campaign HTTP tokens Founder-locked; platform taxonomy mapping OPEN
6. Version/compatibility implementation contract — lifecycle **OPEN**
7. KBM product adapter contract — **NOT AUTHORIZED**
8. Security qualification — ongoing / gated per surface
9. Runtime qualification — Campaign HTTP unit tests present at `785df12`
10. Campaign callable qualification — Campaign HTTP surface **DONE** at locked wire
11. Product integration test — gated (KBM adapter)
12. Broader HTTP expansion beyond Campaign — gated

Items marked DONE are not re-opened by this ADR.

## 14. Non-goals

This document does **not**:

- by itself expose Campaign over HTTP (Campaign HTTP was authorized/implemented separately at `785df12`)
- create an SDK / RPC service / MCP tools / webhooks / queues
- implement authentication issuance
- choose an IdP or token issuer
- change GHM authorization
- modify database access
- change KBM local-first architecture
- authorize a KBM adapter

## 15. Relationship to existing documents

| Document | Role |
|---|---|
| `GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md` | Platform ownership; transport now HTTP/API (SELECTED) |
| `PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md` | Supported consumer semantics |
| `GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md` | Issuance separate |
| `GHM_ERROR_SEMANTICS_AND_VERSIONING_CONTRACT.md` | Error/version meanings |
| `GHM_SHARED_PLATFORM_CAPABILITIES_BOUNDARY_AUDIT.md` | Jobs/realtime/storage not forced |
| KBM `KBM_GHM_PRODUCT_CONSUMPTION_REQUIREMENTS_CONTRACT.md` | What KBM needs |
| Campaign architecture contracts / CAMPAIGN_HTTP_* | Resource semantics + Founder-locked Campaign HTTP wire |

This ADR sits **above** concrete transport implementation.

## Final gate

GHM PRODUCT-FACING TRANSPORT SELECTION DECISION RECORD COMPLETE.

DOCUMENTATION-ONLY GATE.

TRANSPORT SELECTED: HTTP/API.

FOUNDER AUTHORIZATION: GIVEN.

At selection time: NO TRANSPORT IMPLEMENTATION AUTHORIZED BY THIS ADR.

Post-785df12: Campaign HTTP AUTHORIZED and implemented separately; this ADR still does not authorize issuance, KBM adapter, or unrelated resources.

NO AUTHENTICATION ISSUANCE IMPLEMENTATION AUTHORIZED.

NO GHM API WAS CREATED BY THIS TRANSPORT-SELECTION ADR AT SELECTION TIME.

NO SDK CREATED.

NO RPC SERVICE CREATED.

NO MCP SERVICE CREATED.

NO EVENT/WEBHOOK INFRASTRUCTURE CREATED.

NO DIRECT PRODUCT DATABASE ACCESS APPROVED.

GHM AUTHORIZATION REMAINS AUTHORITATIVE.

KBM REMAINS LOCAL-FIRST.

---

## FOUNDER TRANSPORT SELECTION GATE

**Purpose:** Record the Founder’s explicit architectural transport selection.
Alternatives above were evaluated neutrally; this section records the decision without ranking or scoring.

### Decision distinctions (preserve)

| Distinction | Fact |
|---|---|
| HTTP/API | Selected **transport** |
| Generated typed client | Not itself the underlying transport; layers over another selected mechanism |
| In-process package/library | Process-coupling mechanism — not equivalent to a network API |
| Events/webhooks/async | Asynchronous — does not automatically satisfy synchronous Campaign read/create/update |
| MCP | Protocol/tooling mechanism — not assumed equivalent to an ordinary product backend API |
| RPC | Family of transport/protocol approaches — no specific RPC framework chosen here |
| Authentication issuance | Separate decision; remains **UNSELECTED** |
| Transport selection | Does **not** select an authentication provider |
| Transport selection | Does **not** authorize implementation |

HTTP/API as the selected transport is **not**: an authentication issuer; an authorization model; a database API; an internal repository contract; an AI protocol; a storage system; a queue; or a deployment decision.

### Compact decision table (neutral evaluation preserved)

| Option | What it would mean here | Existing evidence | Main architectural consequence | Main unresolved issue |
|---|---|---|---|---|
| HTTP/API | Synchronous product calls to governed Resource API routes carrying AuthContext, business context, resource ops, semantic results | Express Resource API exists for profile/business/project/enquiry; `/api/v1`; JWT verify middleware; Campaign HTTP routes present at Founder-locked wire (`785df12`) | Extends existing HTTP boundary pattern; clear process/network separation | KBM adapter + auth issuance still UNSELECTED / NOT AUTHORIZED; platform error/version lifecycle OPEN |
| In-process package/library | KBM (or host) imports GHM and invokes services in one process | `main: dist/server.js`; no `exports`/`types`; no library entrypoint; services are internal | Couples product process to GHM runtime/DB credentials; weak product isolation | AuthContext trust bootstrap and credential co-location vs direct-DB prohibition |
| RPC | Synchronous remote procedures mapping to resource operations | **No** RPC framework/protocol in GHM `src/` or deps | New protocol server in front of existing services; process/network boundary | Which RPC family (unselected); overlap with existing HTTP Resource API |
| Generated typed client over another transport | Consumption artifact layered on a selected transport | No OpenAPI/client generation pipeline; no KBM client package | Improves typed consumption **after** transport exists; does not answer transport alone | Underlying transport must be selected first |
| MCP | Tool/resource calls as a callable surface | **No** MCP server/tools in GHM | Host/tool surface in front of GHM; may differ from ordinary product backend topology | Suitability for authoritative transactional Campaign mutations unresolved |
| Events/webhooks/async | Asynchronous notification of state change | No queue/event bus; jobs/realtime not currently justified | Complementary notifications only; not a sync request/response path | Cannot alone fulfill KBM minimum Campaign read/create/update |

### Security invariants (non-negotiable regardless of selection)

- GHM remains the authorization authority.
- Product-supplied role/ownership claims cannot override GHM authorization.
- Direct product → PostgreSQL remains forbidden.
- AuthContext must originate from a trusted verification path.
- Authentication issuance remains a separate unresolved decision.
- Business isolation remains enforced by GHM.
- Raw database objects must not become the product contract.
- Internal GHM repository/service implementation must not become the product contract.
- Secrets and credentials must not be exposed through the product-facing boundary.
- KBM remains LOCAL-FIRST.

### Founder Selection

TRANSPORT SELECTED: HTTP/API

FOUNDER AUTHORIZATION: GIVEN

At selection time: IMPLEMENTATION AUTHORIZED: NO

Founder has explicitly selected HTTP/API as the product-facing transport for the GHM product integration boundary.

This selection establishes the transport direction only.

**Historical (selection-time) non-authorizations preserved:** this ADR itself did NOT authorize HTTP route implementation, Campaign API implementation, authentication issuance, token issuer selection, error wire-format implementation, versioning implementation, KBM adapter implementation, deployment, or infrastructure changes.

**Supersession (post-`785df12`):** Campaign HTTP surface was separately Founder-authorized and implemented at the locked wire. This ADR still does not authorize issuance, KBM adapter, or unrelated resource HTTP expansion.

```text
TRANSPORT SELECTED: HTTP/API

FOUNDER AUTHORIZATION: GIVEN

At selection time: IMPLEMENTATION AUTHORIZED: NO
Post-785df12: Campaign HTTP AUTHORIZED and implemented separately
```

### Decision consequence

The selected direction means GHM product-facing integration is implemented as a governed HTTP/API boundary.

The API must expose semantic GHM capabilities rather than raw database tables or internal service/repository methods.

The transport contract was defined; Campaign HTTP resource contract + implementation are present at `785df12`.

The existing Express `/api/v1` implementation is evidence and foundation; existing non-Campaign routes do not automatically become the approved KBM contract.

Campaign HTTP is product-facing at the Founder-locked wire (`785df12`). KBM adapter remains NOT AUTHORIZED. Auth issuance remains UNSELECTED.

### Required Next Gate

Campaign HTTP resource contract + implementation gates are **DONE** at `785df12`.

Remaining separate gates (not performed by this ADR):

- authentication issuance decision (UNSELECTED)
- KBM product adapter (NOT AUTHORIZED)
- version lifecycle / platform taxonomy mapping (OPEN)
- broader HTTP expansion beyond Campaign (gated)

Do **not** re-select transport in those gates.
