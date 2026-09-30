# GHM Brief Source Audit

## Status

**SOURCE AUDIT — DOCUMENTATION AUTHORIZED (Founder-directed)**

**Resource candidate:** `brief`  
**Purpose:** Campaign child candidate for KBM AI Marketing brief content  
**Date:** 2026-09-21  
**Branch baseline:** `construction/saved-business-resource` @ `239ef5d`

This document freezes **source evidence** required before deciding whether a GHM Brief resource should be constructed.

It authorizes **this source audit only**.

It does **not** authorize:

- Brief schema / operation contracts freeze;
- database migration or relation creation;
- `src/resources/brief` (or any production Brief code);
- registry or authorization wiring;
- HTTP Resource API routes for Brief;
- KBM adapter work;
- auth issuance;
- storage / jobs / AI / provider infrastructure;
- Campaign schema mutation;
- sibling Campaign children (concept, script, presenter, consent, media, generation jobs);
- production cutover;
- reopening any already-qualified / closed resource.

---

## 1. Purpose

**Brief** is the next natural **Campaign child** candidate after the qualified Campaign root.

Boundary:

| Concern | Owner |
|---|---|
| Campaign identity / lifecycle (`title`, `status`, `business_id`, provenance) | **Campaign** (`ghm.campaign`) |
| Campaign-specific marketing brief **content** | **Brief** (candidate; not constructed) |

Rules for this audit:

1. Campaign remains the durable **root** container.
2. Brief must **not** duplicate Campaign identity or lifecycle fields.
3. Brief must **not** be folded into `ghm.campaign` columns.
4. KBM product documentation is **source evidence only**. Where KBM product meaning and GHM ownership/security boundaries disagree, **GHM boundaries win**.

---

## 2. Existing GHM evidence

### 2.1 Campaign child relationship (future; not authorized by Campaign slice)

Authoritative GHM tree (`CAMPAIGN_SOURCE_AUDIT.md` §9):

```text
campaign
  → brief
  → concept
  → script
  → presenter / consent
  → media asset
  → generation job → provider generation
```

Campaign root construction explicitly deferred children. Handover and Campaign contracts still list Brief as **not authorized**.

### 2.2 Campaign schema exclusion of brief content

`CAMPAIGN_SCHEMA_CONTRACT.md` §12 excludes from `ghm.campaign`:

- objective / audience / **offer** columns;
- selected concept / script foreign keys;
- presenter / consent / media references;
- generation job references;
- visibility / public disclosure columns;
- soft-delete flags parallel to `archived`;
- provider-specific identifiers.

Qualified Campaign field set (`CAMPAIGN_OPERATION_CONTRACT.md` / `contracts.ts`):

```text
id
businessId
createdByAccountId
title
status
createdAt
updatedAt
```

There is **no** existing GHM column, resource, route, test, or migration that already implements Brief (`brief_id`, `ghm.brief`, etc. are absent).

### 2.3 Existing Campaign contracts (authoritative for parent)

| Document | Role |
|---|---|
| `CAMPAIGN_SOURCE_AUDIT.md` | Source basis; children deferred |
| `CAMPAIGN_SCHEMA_CONTRACT.md` | `ghm.campaign` frozen; brief content excluded |
| `CAMPAIGN_OPERATION_CONTRACT.md` | `read` / `create` / `update`; no `delete` / `readPublic` |
| `CAMPAIGN_HTTP_RESOURCE_CONTRACT.md` | Campaign HTTP only; children expansion is a non-goal |

Campaign domain qualified at `0a9a9f7`; Campaign HTTP at `785df12`. Neither authorizes Brief.

### 2.4 Child / domain construction patterns to follow (when later authorized)

Primary GHM exemplar sequence (Campaign source audit §4; Saved Business QUALIFIED / CLOSED):

```text
source audit → schema contract → operation contract
  → Founder construction authorization
  → migration (ghm.*)
  → src/resources/<resource>/{contracts,repository,service}
  → registry + authorization wiring
  → qualify-*-runtime.mjs
  → HTTP only if separately Founder-authorized
```

Secondary exemplars for **business-scoped** membership authorization:

- Business Hours / Business Capability (owner/administrator manage; member read).

Secondary exemplar for durable FK / provenance discipline:

- Opportunity Core pattern (`created_by` from `AuthContext.userId`; `ON DELETE RESTRICT`) — **without** adopting Opportunity lifecycle or visibility.

### 2.5 Authorization and runtime / migrator boundaries (inherited expectations)

From Campaign / Saved Business–style governed resources:

- Coarse ACL: GHM `Resource` registry + role resource lists.
- Fine-grained authority: **business membership SQL**, not `GhmRole` alone.
- Creator provenance (`created_by_account_id`) is **not** permanent access after membership ends.
- Schema roles: `ghm_schema_owner` / `ghm_migrator` / `ghm_runtime`.
- Runtime: SELECT on table; mutations via governed `SECURITY DEFINER` functions; no unrestricted INSERT/UPDATE/DELETE; no runtime DELETE for first-slice durable roots that archive instead.
- Registry membership ≠ HTTP surface.

Brief, if constructed later, must inherit these platform boundaries rather than invent a KBM-local security model.

---

## 3. External product-source reconciliation (KBM)

### 3.1 Canonical product source inspected

```text
KBM AI Marketing (ZAID Technologies)
Local product architecture: C:\KBM Ai Marketing\docs\
```

Documents inspected for this audit (read-only; no KBM implementation):

```text
DATA_MODEL.md
MVP.md
PRODUCT.md
ARCHITECTURE.md
GHM_BACKEND.md
GHM_CAMPAIGN_CONSUMPTION_CONTRACT.md
KBM_GHM_CAMPAIGN_CALLABLE_INTEGRATION_CONTRACT.md
KBM_GHM_PRODUCT_CONSUMPTION_REQUIREMENTS_CONTRACT.md
KBM_GHM_HTTP_ADAPTER_CONTRACT.md
ROADMAP.md
PROVIDER_ABSTRACTION.md
LOCAL_VIDEO_PRODUCTION_ARCHITECTURE.md
```

KBM mechanisms, adapters, UX, and local creative artifacts are **not** GHM architecture. They do not authorize GHM migrations, routes, or privilege changes.

### 3.2 What a Campaign Brief means (KBM product meaning)

KBM defines Brief as a **marketing brief** entity: the structured marketing intent that feeds concept/script generation.

Evidence:

| Source | Statement |
|---|---|
| `DATA_MODEL.md` | `Brief` purpose: “Objective, product, audience, constraints” |
| `MVP.md` | Operator enters a **brief** (objective, product, audience) after creating a campaign |
| `PRODUCT.md` | Initial use case starts with marketing objective / product / audience |
| `ARCHITECTURE.md` | Marketing intelligence includes briefs; product layer owns campaign/brief/script UX |
| `GHM_BACKEND.md` | Brief is a Campaign **child** resource; absent / not authorized in GHM today |

GHM interpretation: Brief is the persistence candidate for campaign-specific brief **content**, not a second campaign root.

### 3.3 Cardinality evidence (KBM)

| Source | Signal |
|---|---|
| `DATA_MODEL.md` entity map | `Campaign → Brief` (singular) vs `Concept[]`, `GenerationJob[]` (explicitly plural) |
| `MVP.md` | “Enter a **brief**”; “Create + **initial brief**” (singular workflow) |
| `PRODUCT.md` | “Container for **briefs**, concepts, assets” (plural English; weaker) |
| Contracts / consumption docs | Name “campaign brief” as future child; no UNIQUE / requiredness rule |

**Resolution for this audit:**

| Candidate | Evidence support |
|---|---|
| One-to-many Briefs per Campaign | **Not supported** by the typed entity map (singular `Brief` vs plural `Concept[]`) |
| Exactly one Brief per Campaign (required) | **Insufficient** — MVP suggests an initial brief, but no requiredness rule is frozen |
| Zero-or-one Brief per Campaign | **Plausible** and consistent with singular association, but **not explicitly frozen** |

**Cardinality status: UNFROZEN** (singular association preferred by strongest typed evidence; required-at-create vs optional not decided; one-to-many rejected for schema planning unless Founder reopens with new evidence).

### 3.4 Field semantics (KBM conceptual Brief)

`DATA_MODEL.md` conceptual Brief fields:

```text
id
campaignId
objective
product
audience
constraints
tone
```

MVP success criteria name a narrower create set: **objective, product, audience** (constraints / tone omitted there).

#### Objective

- Product meaning: marketing objective / goal of the campaign creative effort.
- Appears in MVP brief entry and PRODUCT initial use case.
- Requiredness: **UNFROZEN** (named in MVP entry set; no length/nullability contract).

#### Audience

- Product meaning: target audience for the marketing content.
- Same MVP / PRODUCT evidence as objective.
- Requiredness: **UNFROZEN**.

#### Product / offer terminology

- KBM names the commercial subject field **`product`**.
- GHM Campaign schema exclusion names **`offer`** (alongside objective / audience).
- These are treated as the **same conceptual slot** pending Founder terminology freeze (`product` vs `offer`).
- Requiredness: **UNFROZEN**.

#### Additional KBM fields that may need GHM ownership

| Field | Evidence | GHM stance |
|---|---|---|
| `constraints` | `DATA_MODEL.md` Brief list | Candidate content field; nullability/length **UNFROZEN** |
| `tone` | `DATA_MODEL.md` Brief list | Candidate content field; nullability/length **UNFROZEN** |

No KBM evidence requires Brief to own Campaign `title` / `status` / `business_id`.

### 3.5 Brief lifecycle / state (KBM)

- Brief conceptual fields in `DATA_MODEL.md` include **no** `status` / lifecycle vocabulary.
- Nearby entities that *do* have status: Campaign (`draft|active|archived`), Script (`draft|approved`), PresenterProfile (`pending_consent|approved|revoked`), GenerationJob (generation lifecycle).
- Conclusion: **no Brief status is justified** by current evidence.

### 3.6 Editability after Campaign activation / archive (KBM)

- KBM docs do **not** freeze whether Brief content may change while Campaign is `active` or `archived`.
- GHM Campaign rules: archived Campaign rejects title/status mutation; reads remain allowed for authorized members.
- Brief mutability relative to parent Campaign status is therefore a **Founder gap** (see §10). Do not invent rules from UX convenience.

### 3.7 Explicit non-transfer from KBM

Do **not** copy into GHM from KBM product docs:

- KBM HTTP adapter contracts as GHM route authority;
- ops-issued JWT / product login decisions as Brief authorization;
- local creative storage / mock AI adapters as Brief persistence;
- invented Brief endpoints;
- any claim that Campaign root authorization already covers Brief.

---

## 4. Cardinality (audit decision)

```text
CARDINALITY: UNFROZEN
```

Working interpretation for later schema discussion (not a freeze):

- Plan for a **singular Brief association** per Campaign (reject 1:N unless Founder reopens).
- Decide `UNIQUE(campaign_id)` and whether create-of-Campaign requires Brief in **Brief schema / operation contracts**, not in this audit alone.

---

## 5. Ownership

### Campaign owns

```text
id
business_id
created_by_account_id
title
status                  # draft | active | archived
created_at
updated_at
```

### Brief should own (candidate content + structural keys)

Structural (pattern-level; not schema-frozen):

```text
id
campaign_id             # parent Campaign
created_by_account_id   # provenance only
created_at
updated_at
```

Content candidates from reconciled evidence:

```text
objective
product                 # GHM docs historically said "offer" — terminology UNFROZEN
audience
constraints             # optional candidate; UNFROZEN
tone                    # optional candidate; UNFROZEN
```

### Must not belong on Brief

- Campaign `title` / `status` / `business_id` as Brief-owned identity/lifecycle
- Concept / script / presenter / consent / media / job foreign keys as Brief columns in a first slice without separate audits
- Provider identifiers, public visibility flags, soft-delete parallel to Campaign archive

---

## 6. Authorization

Brief access must be authorized through the **parent Campaign’s business membership**, consistent with Campaign operation rules:

| Action class | Membership role on Campaign’s `business_id` |
|---|---|
| Read (candidate) | `owner` \| `administrator` \| `member` |
| Manage create/update (candidate) | `owner` \| `administrator` |

Rules:

1. Evaluate membership against `ghm.business_membership` for the parent Campaign’s `business_id`.
2. `created_by_account_id` is provenance from `AuthContext.userId` only.
3. Creator provenance **must not** grant permanent access after membership ends or is revoked.
4. Platform `admin` AuthContext role does not invent Business management without membership.
5. Cross-business isolation must hold for any later Brief read/list/update predicates.
6. KBM UI permissions are not the security boundary.

This section documents the **inherited pattern**. It does **not** register Brief in GHM authorization code.

---

## 7. Lifecycle

```text
Brief status vocabulary: NOT JUSTIFIED
```

Campaign remains the sole lifecycle authority among Campaign + Brief for this evidence set.

Unresolved (not invented here): whether Brief content updates are allowed when parent Campaign `status` is `active` or `archived`.

---

## 8. Operations (evaluation only — not authorized)

| Operation | Evidence-based evaluation | Authorized by this audit? |
|---|---|---|
| `brief.read` | Needed for campaign workspace / MVP loop; matches Campaign member read pattern | **No** |
| `brief.create` | Needed to enter initial brief; matches owner/admin manage pattern | **No** |
| `brief.update` | Needed to refine brief before/during creative loop; no contrary freeze | **No** |
| `brief.delete` | No product delete workflow; Campaign root uses archive not delete; durable child should not invent runtime DELETE without evidence | **No** |
| `brief.readPublic` | No public brief surface in KBM/GHM evidence | **No** |

Operations must be frozen later in a Brief operation contract under separate Founder authorization. Technical possibility alone does not authorize them.

HTTP for Brief remains a **separate** future gate (Campaign HTTP explicitly excludes children).

---

## 9. Persistence stance (minimum likely shape — not created)

If later authorized, the minimum provider-neutral shape consistent with evidence and GHM patterns:

```text
Schema:   ghm
Relation: ghm.brief          # name TBD at schema freeze
```

Likely structural columns:

```text
id                        bigint identity PK
campaign_id               bigint NOT NULL → ghm.campaign(id)
created_by_account_id     bigint NOT NULL → ghm.account_identity(id)
<object / product|offer / audience / constraints? / tone?>
created_at                timestamptz
updated_at                timestamptz
```

FK / deletion behavior supported by GHM durable-root pattern (Campaign↔Business exemplar):

```text
campaign_id → ghm.campaign(id) ON DELETE RESTRICT
created_by_account_id → ghm.account_identity(id) ON DELETE RESTRICT
```

Cascade-delete of Brief with Campaign is **not** evidenced as a product requirement and should not be assumed.

Runtime privilege expectation (pattern only): SELECT to `ghm_runtime`; mutations via governed functions; no runtime DELETE in a first slice unless a future operation contract explicitly authorizes it.

This audit does **not** create the table, functions, grants, or indexes.

---

## 10. Gaps / unresolved decisions (Founder required before schema freeze)

1. **Cardinality freeze** — confirm singular association and choose `0..1` vs exactly-one (and whether `UNIQUE(campaign_id)` is mandatory).
2. **Terminology** — freeze `product` vs `offer` for the commercial-subject field.
3. **Required vs optional content fields** — which of objective / product|offer / audience / constraints / tone are NOT NULL at create; max lengths; trim rules.
4. **Parent-status mutability** — may Brief update while Campaign is `active`? while `archived`?
5. **Create coupling** — is Brief created only via explicit `brief.create`, or atomically with `campaign.create`? (MVP “Create + initial brief” is product UX, not a GHM API freeze.)
6. **Operation vocabulary freeze** — authorize which of read/create/update proceed; confirm delete/readPublic remain out.
7. **HTTP** — whether Brief gets a Founder-locked HTTP surface after domain qualification (not implied by Campaign HTTP).
8. **Naming** — resource key `brief` vs `campaign_brief`; relation `ghm.brief` vs `ghm.campaign_brief`.

Until these are resolved in schema/operation contracts under Founder authorization, Brief construction remains blocked.

---

## 11. Construction authorization statement

Founder-directed authorization (2026-09-21):

| Item | Value |
|---|---|
| Resource candidate | `brief` |
| Purpose | Campaign child — marketing brief content |
| Authorization | **Source audit documentation only** |
| Schema / operation contracts | **Not authorized** |
| Migration / code / tests / registry / HTTP | **Not authorized** |
| KBM adapter / auth issuance / storage / AI | **Not authorized** |
| Campaign schema changes | **Not authorized** |

---

## 12. Recommended next gate

```text
GATE: BRIEF SCHEMA + OPERATION CONTRACT FREEZE (docs only)
```

Smallest governed next step:

1. Founder resolves §10 gaps (especially cardinality, terminology, required fields, parent-status mutability).
2. Author **only**:
   - `docs/architecture/BRIEF_SCHEMA_CONTRACT.md`
   - `docs/architecture/BRIEF_OPERATION_CONTRACT.md`
3. Stop again for Founder **construction authorization** before any migration or `src/` work.

Do **not** skip from this source audit directly into implementation.
