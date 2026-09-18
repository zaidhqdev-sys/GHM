# GHM Application Backend Platform Charter

**Canonical owner:** GHM platform governance
**Status:** Charter defined (documentation only)
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `0a9a9f7`
**Nature:** Governance / architecture document — **not** an implementation plan

## Definition

GHM is:

```text
A governed backend platform for ZAID software products.
```

GHM is **not** a product-specific backend for KBM AI Marketing, Zaid Connect, QuoteFlow, or any single product. Products consume GHM for governed backend authority. Products retain ownership of product behavior.

This charter does **not**:

- select a callable transport
- authorize HTTP, package, RPC, or other implementation
- authorize hosting/deployment implementation
- authorize storage, jobs, audit platforms, or product adapters
- select an identity provider or JWT issuer
- modify Campaign or any other resource

## 1. Mission

GHM provides governed, reusable backend capabilities to ZAID products while preserving strict ownership boundaries.

**GHM provides backend authority, not product behavior.**

Operating principles:

```text
Mission Before Technology.
Architecture Before Implementation.
Documentation Before Code.
Capability Before Provider.
One Concept → One Owner → One Canonical Source.
```

GHM should own a capability only when it is a genuinely **cross-product backend concern**, not merely because a product would find it useful.

## 2. Current and long-term operating model

### Current horizon

ZAID products may operate **locally** and do not require cloud hosting.

In particular:

**KBM is LOCAL-FIRST** for its initial operating phase.

Generated media may remain product-owned on the local machine, including:

- videos
- images
- audio
- thumbnails
- exports
- temporary generation artifacts
- working files

GHM must **not** require a product to upload all product artifacts into GHM merely because GHM is the backend platform.

A local product may consume GHM **selectively** for governed backend capabilities once an approved callable boundary exists.

### Future horizon

ZAID intends to progressively build and control more of its own:

- software infrastructure
- deployment infrastructure
- cloud / platform capabilities

Future ZAID-controlled deployment and cloud infrastructure may eventually reduce dependence on outside hosting and platform providers.

This is **strategic direction**, not current implementation.
This charter does **not** name a specific future provider or deployment technology unless already established in repository evidence. No such selection is made here.

## 3. GHM owns

Cross-product backend responsibilities that belong in GHM:

- account identity
- business identity
- membership
- authenticated identity verification
- AuthContext
- authorization
- governed resource persistence
- resource lifecycle enforcement
- transaction boundaries
- runtime / migrator separation
- least-privilege database access
- typed resource contracts
- reusable backend capabilities when explicitly qualified
- supported product integration boundary once authorized

Ownership rule:

> GHM owns capabilities because they are genuinely cross-product backend concerns, not simply because a product would find them useful.

Evidence for the current construction core includes identity verification, authorization, registry, transactions, and least-privilege runtime (see Evidence).

## 4. Products own

Products own their own:

- user experience
- product workflows
- domain-specific intelligence
- product-specific business behavior
- product-specific child concepts unless separately promoted into GHM
- AI capability ports / adapters
- AI provider integration
- generation workflow policy
- generated media
- local working files
- product-specific export / publishing behavior
- product-specific temporary artifacts

### KBM-specific boundary

Do **not** move into GHM:

- marketing intelligence
- generation logic
- AI providers
- presenter / avatar behavior
- media generation

KBM owns marketing product behavior. GHM may persist qualified shared root resources (for example Campaign root) without absorbing KBM product logic.

## 5. Local-First Product Support

GHM must support a product architecture in which the product runs locally and owns its local artifacts.

**Local operation is a legitimate product deployment mode, not a temporary architectural violation.**

GHM should not require:

- cloud hosting
- cloud object storage
- CDN
- cloud generation workers
- hosted product UI

unless a specific product / platform contract later requires them.

Future hosting / cloud adoption is a **separate architectural phase**. It is not implied by this charter.

## 6. Media storage boundary

**Product-generated media does not automatically belong in GHM.**

For the current KBM operating model, generated assets may remain local.

**GHM Storage is a FUTURE / GATED platform capability.**

This charter does not create storage implementation.

If shared / durable storage is later required, it requires its own:

- capability contract
- ownership decision
- security model
- lifecycle model
- qualification gate

## 7. Provider independence / replaceability

ZAID should progressively reduce unnecessary dependence on external providers by owning more of its critical software infrastructure.

However:

> Provider independence does not mean provider elimination is an immediate requirement.

GHM architecture must therefore favor:

- capability boundaries
- replaceable providers
- internal contracts
- no vendor leakage into core domain contracts
- no unnecessary provider-specific assumptions

External providers may be used where currently necessary.

Provider replacement is a **future capability / architecture objective**, not permission to prematurely rebuild everything.

For AI specifically:

- AI providers remain **product-owned** through capability ports / adapters
- GHM must **not** absorb AI vendor SDKs merely to pursue independence

## 8. Future ZAID-controlled infrastructure

Strategic direction (not current implementation):

ZAID may eventually operate its own controlled:

- deployment infrastructure
- cloud / runtime infrastructure
- storage
- backend services
- internal platform services
- developer tooling

These are **future platform capabilities**.

This charter does **not** select:

- a cloud vendor
- Kubernetes
- VPS
- Docker architecture
- hosting provider
- CDN
- storage provider

unless existing repository evidence already establishes one. Technology neutrality is preserved.

## 9. Product integration boundary

Products must consume GHM through an **approved, governed integration boundary**.

Products must **not**:

- connect directly to PostgreSQL
- receive privileged database credentials
- call arbitrary SECURITY DEFINER functions
- bypass AuthContext
- bypass GHM authorization
- treat internal TypeScript modules as a public API
- invent unsupported resource endpoints

Actual transport:

```text
HTTP/API (SELECTED; see transport selection ADR and HEAD `785df12`)
```

Transport selection is recorded separately. This charter does **not** by itself authorize transport implementation, product adapters, or JWT issuance.

Related external context (not part of this repository): KBM may define product-side semantic consumption contracts. Those do not select GHM transport and do not authorize GHM implementation.

## 10. Authentication boundary

Separate three concerns:

| Concern | Status in this charter |
|---|---|
| Authentication issuance | Unresolved — separate decision |
| Authentication verification | GHM responsibility (present) |
| Authorization | GHM responsibility (present) |

GHM currently verifies JWTs and derives AuthContext.

JWT issuance remains unresolved.
This charter does **not** select an identity provider or issuer.

## 11. Platform capability model

### CURRENT / QUALIFIED

- identity verification
- AuthContext
- authorization
- business / membership
- typed resources
- governed transactions
- least privilege
- qualification discipline

Campaign root resource is QUALIFIED at `0a9a9f7` (persistence / authz). Campaign HTTP resource surface was later Founder-authorized and committed at `785df12`; this charter does not by itself authorize further product adapters, children, storage, AI, or cutover.

### PLATFORM CANDIDATES / FUTURE GATED

- supported product callable boundary
- durable audit
- shared storage
- shared jobs / queues
- realtime where genuinely cross-product
- product adapters
- deployment / cloud infrastructure

### PRODUCT-OWNED

- AI generation
- product intelligence
- product UX
- local media
- product workflows
- publishing integrations unless later promoted

### ARCHITECTURAL DECISIONS

- callable transport
- JWT issuance
- compatibility / versioning policy
- storage ownership / model
- jobs / realtime ownership
- future deployment model

## 12. Non-goals

GHM is **not**:

- KBM
- an AI platform by default
- a marketing engine
- a product UI
- a generic database API
- a generic CRUD gateway
- a browser-to-Postgres backend
- a forced cloud dependency
- a mandatory storage system for product artifacts
- a vendor SDK container
- a replacement for every external provider immediately

Do not add product behavior into GHM merely because it can be shared in theory.

Do not expose unrestricted table access as a long-term product contract (see Resource API boundary evidence).

## 13. Governance principles

1. New platform capability requires evidence.
2. New resource requires a contract before implementation.
3. Cross-product capability requires an ownership decision.
4. Transport requires explicit Founder authorization.
5. Product adapters require explicit gates.
6. Storage / jobs / audit require explicit gates.
7. No silent expansion of existing resources.
8. No implementation from an unresolved architectural decision.
9. No direct database consumption by products.
10. Read-only audit precedes mutation wherever practical.
11. Qualification evidence is required before declaring a platform capability operational.

Construction qualification sequence and Resource API rules remain binding for governed slices (see Evidence).

## 14. Relationship to Campaign

Current example of platform vs product ownership:

| Concern | Owner / status |
|---|---|
| GHM Campaign root | QUALIFIED at `0a9a9f7` |
| Campaign persistence / authorization | GHM |
| Campaign product behavior (UX, marketing workflow, children) | Product (KBM) |
| Semantic KBM↔GHM Campaign callable contract | Exists externally in KBM docs; transport-neutral |
| Transport | HTTP/API (SELECTED) |
| Campaign HTTP | Authorized separately and implemented at `785df12` (not by this charter alone) |
| Package / RPC / other implementation | **NOT authorized by this charter** |

Campaign child resources, storage, jobs, and AI remain outside Campaign root qualification and outside this charter’s authorization.

## 15. Status / open decisions

| Item | Status |
|---|---|
| GHM backend core | QUALIFIED (construction) |
| Campaign root | QUALIFIED (`0a9a9f7`) |
| Product-facing callable boundary | PARTIAL — Campaign HTTP present at `785df12`; KBM adapter + auth issuance still NOT AUTHORIZED / UNSELECTED |
| Callable transport | HTTP/API (SELECTED) |
| JWT issuance | UNRESOLVED |
| Error semantic platform contract | OPEN |
| Versioning / compatibility policy | OPEN |
| Shared storage | FUTURE / GATED |
| Durable audit | FUTURE / GATED |
| Jobs / realtime | FUTURE / GATED |
| Product adapters | FUTURE / GATED |
| ZAID-controlled deployment / cloud | FUTURE / STRATEGIC |
| KBM local-first operation | CURRENT PRODUCT DIRECTION |

## 16. Next contract sequence

Documentation sequence (historical). Transport selection and Campaign HTTP construction have occurred; remaining sequence items below stay gated:

1. GHM Application Backend Platform Charter *(this document)*
2. Product Integration Boundary Contract
3. Authentication Issuance Decision Record
4. Error Semantic Contract
5. Versioning / Compatibility Contract
6. Founder decision on callable transport — **DONE — HTTP/API**
7. Transport-specific contract — Campaign HTTP resource contract present at `785df12`
8. Campaign HTTP implementation + qualification — **DONE at `785df12`**; broader resource HTTP expansion remains gated
9. Per-product adapter / cutover gates

## 17. Evidence

Material claims in this charter are grounded in inspected repository evidence:

| Claim area | Evidence path |
|---|---|
| Mission / production safety / adapters gated | `docs/HANDOVER_2026-09-16.md` |
| Qualification gate order; adapters / shadow / cutover not started | `docs/architecture/CONSTRUCTION_QUALIFICATION_SEQUENCE.md` |
| Resource API rules; no generic tables; adapters consume contracts | `docs/architecture/RESOURCE_API_BOUNDARY_CONTRACT.md` |
| Runtime / migrator / least privilege | `docs/architecture/POSTGRES_AUTHORITY_MODEL.md` |
| JWT verification → AuthContext | `src/auth/request-context.ts` |
| AuthContext / authorization helpers | `src/auth/authorization.ts` |
| Typed resource registry | `src/resources/registry.ts` |
| Authorized transactions | `src/db/authorized-transaction.ts`, `src/db/transaction.ts` |
| Narrow HTTP Resource API surface | `src/http/app.ts` |
| Deployable service package shape (`main`: `dist/server.js`; no consumer `exports`) | `package.json` |
| Campaign qualified construction | `src/resources/campaign/`, `docs/architecture/CAMPAIGN_SOURCE_AUDIT.md`, `docs/architecture/CAMPAIGN_SCHEMA_CONTRACT.md`, `docs/architecture/CAMPAIGN_OPERATION_CONTRACT.md`, handover Campaign section |
| Baseline commit | `0a9a9f7` (`feat: add campaign resource`) |

This charter does not claim evidence that was not inspected. External KBM documentation is referenced only as product-side context, not as GHM repository authority.

## Charter closure

This document defines platform governance.
It does **not** by itself authorize hosting, storage, jobs, audit platforms, product adapters, JWT issuance, or further implementation beyond separately Founder-authorized surfaces.

```text
CALLABLE TRANSPORT = HTTP/API (SELECTED)
JWT ISSUANCE = UNRESOLVED
DIRECT DATABASE ACCESS BY PRODUCTS = NOT APPROVED
SHARED STORAGE = FUTURE / GATED
ZAID-CONTROLLED DEPLOYMENT / CLOUD = FUTURE / STRATEGIC
```
