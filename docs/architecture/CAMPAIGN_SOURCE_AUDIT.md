# GHM Campaign Source Audit

## Status

**SOURCE AUDIT — CONSTRUCTION AUTHORIZED (Founder-directed)**

**Resource:** `campaign`
**Purpose:** KBM AI Marketing backend root container
**Date:** 2026-09-18

> **Historical-status reconciliation — 2026-10-12:** This source audit records the original Campaign root construction scope and its then-current HTTP non-goal. Subsequent repository evidence records a bounded Campaign HTTP surface at the Founder-locked wire (`785df12`); the “HTTP absent/not authorized” statements below are historical for the earlier slice and must not be read as current Campaign HTTP status. This does not imply broad product-adapter authorization, blanket HTTP expansion, or production cutover. Consult the current transport-selection and product-integration contracts for present scope.

This document records the approved source basis for constructing a typed GHM `campaign` resource for **KBM AI Marketing**.

It authorizes **construction documentation and subsequent governed construction** of the campaign **root only**, subject to the frozen schema and operation contracts.

It does **not** authorize:

- production migration or cutover;
- product adapters for Connect/QuoteFlow;
- blanket Campaign HTTP/API expansion beyond the separately Founder-authorized bounded surface at `785df12`; this source audit itself does not authorize HTTP routes;
- child resources (brief, concept, script, presenter, consent, media, generation jobs);
- object storage;
- AI provider integrations;
- generic table persistence.

## 1. Canonical product source

Unlike Saved Business / Opportunity / Business Capability slices, Campaign is **not** reconciled from a live Zaid Connect or QuoteFlow Supabase schema.

Authoritative product intent:

```text
KBM AI Marketing (ZAID Technologies)
Local product architecture: C:\KBM Ai Marketing\docs\
```

Primary product evidence (architecture foundation; not production traffic):

```text
docs/PRODUCT.md
docs/ARCHITECTURE.md
docs/GHM_BACKEND.md
docs/DATA_MODEL.md
docs/MVP.md
```

Approved construction audit (Cursor / Founder review, 2026-09-18):

```text
KBM ↔ GHM campaign source audit — APPROVED
```

Provider-specific mechanisms in other products are not copied into GHM.

## 2. Canonical domain concept

A **Campaign** is a durable, **business-owned** root container for an AI marketing production effort in KBM.

It will eventually relate to (later slices only):

- marketing brief;
- concepts;
- scripts;
- presenter / consent;
- media asset metadata;
- generation jobs / provider generations.

The **first slice owns only the campaign root**. Those related concepts are explicitly **not** part of this construction authorization.

Campaign is distinct from:

- Opportunity (marketplace commercial container);
- Project;
- Quote / Customer;
- Enquiry;
- Saved Business (account-owned bookmark relationship);
- Business Capability / Business Hours;
- Trust Score.

**Do not reuse Opportunity** as the campaign resource.

## 3. Capability levels (do not conflate)

At the time of this audit, Campaign exists at these levels only:

| Level | Campaign status |
|---|---|
| Code (`src/resources/campaign`) | **Absent** |
| Database (`ghm.campaign`) | **Absent** |
**Historical first-slice snapshot — before the separately qualified Campaign HTTP work at the Founder-locked wire (`785df12`):**

| Service / repository | **Absent at this historical checkpoint** |
| Authorization wiring | **Absent at this historical checkpoint** (pattern exists for other resources) |
| Runtime qualification | **Absent at this historical checkpoint** |
| HTTP / API surface | **Absent at this historical checkpoint** — not authorized for that slice |
| Production-usable | **No; production use remains gated** |

Existing GHM capabilities Campaign will **consume** (not redefine):

| Capability | Status when consumed | Evidence |
|---|---|---|
| `account_identity` | Constructed / qualified (Business Identity) | `ghm.account_identity` |
| `business` | Constructed / qualified | `ghm.business` |
| `business_membership` | Constructed / qualified | `ghm.business_membership` |
| JWT verify → `AuthContext` | Implemented (verify only; no login issuer in `src/`) | `src/auth/request-context.ts` |
| `withAuthorizedTransaction` | Implemented | `src/db/authorized-transaction.ts` |
| Resource registry pattern | Implemented for other resources | `src/resources/registry.ts` |

Construction-stage GHM is **not** production-ready for Connect/QuoteFlow cutover. Campaign construction inherits that boundary.

## 4. Construction exemplars

### Primary — Saved Business (QUALIFIED / CLOSED)

Use for:

- docs → migration → contracts → repository → service → registry → qualification sequence;
- least-privilege runtime mutation (governed mutation path; ownership not arbitrarily rewritten);
- explicit statement that **registry ≠ HTTP**;
- qualification harness shape (`scripts/qualify-*-runtime.mjs`).

Evidence:

```text
docs/architecture/SAVED_BUSINESS_SOURCE_AUDIT.md
docs/architecture/SAVED_BUSINESS_SCHEMA_CONTRACT.md
docs/architecture/SAVED_BUSINESS_OPERATION_CONTRACT.md
docs/architecture/SAVED_BUSINESS_QUALIFICATION.md
src/resources/saved-business/
database/migrations/20260916230000_create_saved_business.sql
scripts/qualify-saved-business-runtime.mjs
```

Saved Business **ownership shape** (account-owned relationship) is **not** copied for Campaign.

### Secondary — Business Hours / Business Capability

Use for:

- business-owned resource semantics;
- management authority = active `owner` \| `administrator` membership;
- managed read for active business members.

### Secondary — Opportunity Core (pattern only)

Use for:

- `created_by` / creator account provenance from `AuthContext.userId`;
- `ON DELETE RESTRICT` foreign keys;
- explicit lifecycle/status discipline separate from generic CRUD.

**Do not** adopt nullable business ownership, Opportunity lifecycle vocabulary, visibility model, or Opportunity table.

## 5. Approved ownership model

```text
ghm.campaign.business_id              NOT NULL  →  ghm.business.id
ghm.campaign.created_by_account_id    NOT NULL  →  ghm.account_identity.id
```

Rules:

1. A campaign **cannot** exist without a business.
2. `created_by_account_id` is derived only from `AuthContext.userId`.
3. Callers must not choose or override creator provenance.
4. **Membership** is the authorization source for access.
5. Creator provenance does **not** grant permanent access after membership ends.

### Business eligibility (create)

- business exists;
- business `is_active = true`;
- authenticated actor has an **active** membership on that business;
- membership role is `owner` or `administrator`.

Directory verification / `verification_status = approved` is **not** required for this first slice.

### Read access

Active membership role in:

```text
owner | administrator | member
```

may read campaigns for that business.

### Management access (create / update)

Active membership role in:

```text
owner | administrator
```

## 6. Approved first-slice field set

```text
id
business_id
created_by_account_id
title
status
created_at
updated_at
```

Status vocabulary:

```text
draft | active | archived
```

Allowed transitions:

```text
draft  → active | archived
active → archived
archived → (none)
```

Title mutable only while `status` is `draft` or `active`.
Ownership fields immutable after create.

## 7. Approved operations

```text
campaign.read
campaign.create
campaign.update
```

Historical scope exclusion — the following operation remains outside the qualified Campaign surface:

```text
campaign.delete
campaign.readPublic
```

HTTP Resource API: this original source-audit slice did not authorize it; a later separate Founder decision qualified the bounded Campaign HTTP surface at `785df12`. Broader HTTP expansion remains unauthorized by this audit.

## 8. Persistence stance

- Schema: `ghm`
- Relation: `ghm.campaign`
- No independent KBM application database
- No generic `/tables/:table` persistence
- Runtime privilege separation: `ghm_schema_owner` / `ghm_migrator` / `ghm_runtime`
- Mutation enforcement: Saved Business–style governed mutation approach so ownership columns cannot be arbitrarily rewritten through broad runtime table privileges

## 9. Future child relationship (not authorized now)

```text
campaign
  → brief
  → concept
  → script
  → presenter / consent
  → media asset
  → generation job → provider generation
```

Each requires a separate source audit, schema/operation contract, and construction authorization.

## 10. Construction authorization statement

Founder-directed authorization (2026-09-18):

| Item | Value |
|---|---|
| Resource | `campaign` |
| Purpose | KBM AI Marketing backend |
| Construction status | **Historical snapshot at this audit point:** authorized (docs frozen; implementation not started then); Campaign root and bounded HTTP surface have since been implemented and integrated on mainline |
| Scope | Campaign root only |
| HTTP | **Historical snapshot:** not authorized for the original root-only slice; bounded Campaign HTTP later authorized and integrated (see `CAMPAIGN_HTTP_RESOURCE_CONTRACT.md`) |
| Child resources | Not authorized |
| Storage | Not authorized |
| AI providers | Not authorized |
| Production cutover | Not authorized |

Authoritative follow-on contracts:

```text
docs/architecture/CAMPAIGN_SCHEMA_CONTRACT.md
docs/architecture/CAMPAIGN_OPERATION_CONTRACT.md
```

Governing handover records this authorization in `docs/HANDOVER_2026-09-16.md`.
