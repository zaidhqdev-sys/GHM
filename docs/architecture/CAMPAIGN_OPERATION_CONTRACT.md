# GHM Campaign Operation Contract

**Status:** CONSTRUCTION CONTRACT — OPERATION SURFACE FROZEN
**Resource:** `campaign`
**Purpose:** KBM AI Marketing backend root container
**Depends on:** [CAMPAIGN_SOURCE_AUDIT.md](./CAMPAIGN_SOURCE_AUDIT.md), [CAMPAIGN_SCHEMA_CONTRACT.md](./CAMPAIGN_SCHEMA_CONTRACT.md)

## 1. Purpose

Define the narrow GHM resource operation boundary for Campaign — the durable business-owned root for KBM AI Marketing.

This contract authorizes construction and future runtime qualification of this isolated resource only. It does not authorize HTTP routes, child resources, storage, AI providers, product adapters, or production cutover.

## 2. Resource identity

Canonical resource:

```text
campaign
```

Canonical PostgreSQL relation:

```text
ghm.campaign
```

Canonical parent identities:

```text
ghm.business
ghm.account_identity
```

## 3. Operations

Frozen first-slice vocabulary:

| Operation | Registry op | Purpose |
|---|---|---|
| `read` | `campaign.read` | Read campaign(s) visible to the authorized business membership context |
| `create` | `campaign.create` | Create a campaign root for an eligible business |
| `update` | `campaign.update` | Update mutable title and/or status under transition rules |

Not authorized:

```text
campaign.delete
campaign.readPublic
```

## 4. Typed identifiers

```text
CampaignId = bigint
BusinessId = bigint
AccountId = bigint
```

No provider-specific identifiers are accepted at the GHM boundary.

## 5. Entity projection

Runtime-visible campaign fields:

```text
id
businessId
createdByAccountId
title
status
createdAt
updatedAt
```

Status vocabulary:

```text
draft | active | archived
```

## 6. Authorization boundary

Every authenticated operation carries an `AuthContext` and is authorized before repository mutation:

```text
AuthContext -> authorization boundary -> service -> repository -> authorized transaction
```

Coarse resource ACL: register `campaign` on the GHM `Resource` union and role resource lists (same coarse pattern as peer resources). Fine-grained authorization is **business membership SQL**, not `GhmRole` alone.

Platform `admin` AuthContext role does not invent Business management without membership.

### Membership rules

Membership is evaluated against:

```text
ghm.business_membership
  business_id = campaign.business_id (or create target)
  account_id = context.userId
  membership_status = 'active'
```

| Action | Required membership role |
|---|---|
| `read` | `owner` \| `administrator` \| `member` |
| `create` | `owner` \| `administrator` |
| `update` | `owner` \| `administrator` |

Creator provenance (`created_by_account_id`) does **not** grant access after membership ends and does not bypass membership checks.

## 7. `campaign.read`

Actor: authenticated account.

Authorization:

- target campaign’s `business_id` has an active membership for `context.userId` with role `owner`, `administrator`, or `member`.

Behavior:

- may get by id or list by business (typed filters only);
- must enforce **cross-business isolation** — campaigns for other businesses are not readable;
- deny/hide foreign rows consistently with GHM non-enumeration practice for owned resources;
- no anonymous read;
- no public read projection.

## 8. `campaign.create`

Actor: authenticated account with business management authority.

Input (caller-supplied):

```text
businessId
title
```

Server-derived:

```text
created_by_account_id = context.userId
status = 'draft'
created_at / updated_at = now()
```

Authorization and invariants:

1. authenticated `AuthContext` required;
2. `businessId` is a positive id;
3. business exists;
4. business `is_active = true`;
5. actor has active `owner` or `administrator` membership on that business;
6. title trimmed length between 1 and 200;
7. caller cannot supply or override `created_by_account_id`;
8. caller cannot set initial status other than default `draft` in this slice.

Directory verification / approval is **not** required.

If the actor is not an active owner/administrator member, create **fails**.

## 9. `campaign.update`

Actor: authenticated account with business management authority.

Mutable fields:

- `title` — only when current `status` is `draft` or `active`
- `status` — only along the allowed transition graph

Immutable fields (must reject attempts):

- `id`
- `business_id`
- `created_by_account_id`
- `created_at`

Authorization:

- active `owner` or `administrator` membership on the campaign’s business.

### Status transition graph

```text
draft    → active
draft    → archived
active   → archived
archived → none
```

Illegal transitions must fail.

### Archived behavior

- `status = archived` is terminal for this slice;
- title updates on archived campaigns are rejected;
- status changes from archived are rejected;
- reads of archived campaigns remain allowed for authorized members.

`updated_at` must advance on successful update.

## 10. Cross-business isolation

- create for business A does not grant access to business B;
- read/update predicates must include membership on the campaign’s `business_id`;
- listing must be scoped to an authorized business context;
- no cross-tenant leakage via filters, errors, or projections.

## 11. No delete

There is no `campaign.delete` operation.

Archival is expressed as `status = archived` via `campaign.update`.

Physical row deletion is reserved for migrator/schema-owner governed cleanup (qualification fixtures), not runtime product operations.

## 12. No public read / no HTTP

- no `campaign.readPublic`;
- no anonymous access;
- **no HTTP Resource API routes** in this slice.

Registry registration of `campaign` with `read` / `create` / `update` does **not** imply HTTP exposure.

HTTP requires a separately authorized Resource API qualification.

## 13. Registry and module boundary

When constructed, registration must include:

1. `Resource` type member `'campaign'` in `src/auth/authorization.ts`
2. inclusion in coarse `roleResources` lists
3. `resourceRegistry` entry:

```text
{ resource: 'campaign', operations: ['read', 'create', 'update'] }
```

4. module:

```text
src/resources/campaign/contracts.ts
src/resources/campaign/repository.ts
src/resources/campaign/service.ts
```

Service validates inputs and authz preconditions.
Repository performs membership SQL and governed mutations inside `withAuthorizedTransaction`.
Contracts own types and operation vocabulary.

## 14. Explicit non-goals

This contract does not authorize:

- brief / concept / script / presenter / consent / media / generation resources;
- object storage;
- AI provider calls;
- campaign HTTP routes;
- production cutover;
- reopening Opportunity, Saved Business, Trust, or other closed slices.

## 15. Qualification expectation

Future `scripts/qualify-campaign-runtime.mjs` must prove at least:

- runtime vs migrator identity separation;
- eligible create (active business + owner/administrator);
- ineligible create denials (no membership, member-only, inactive business, outsider);
- member/owner/administrator read;
- cross-business isolation;
- owner/administrator update;
- member update denial;
- immutable ownership;
- legal status transitions only;
- archived immutability of title/status;
- no runtime DELETE path;
- governed fixture cleanup.

Qualification is a later construction step. This document freezes the operation surface only.
