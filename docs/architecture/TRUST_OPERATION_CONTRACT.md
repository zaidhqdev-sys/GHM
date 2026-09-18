# GHM Trust Operation Contract

## Status

**CONSTRUCTION CONTRACT — AUTHORIZED FOR DEDICATED RESOURCE SLICE**

This contract freezes the first GHM Trust boundary reconciled from the live Zaid Connect source audit. It authorizes construction and qualification of this isolated resource only. It does not authorize production migration, provider cutover, data movement, DNS/routing changes, shadow traffic, or product configuration changes.

## 1. Canonical domain concept

A **Trust score** is the calculated, persisted reputation score for one Business.

It is derived from Business inputs by a database-owned calculation function and stored as a single upserted row per Business.

## 2. Canonical identity mapping

Production Connect:

```text
trust_scores.business_id -> businesses.id
calculate_business_trust_score uses auth.uid() + has_business_permission(..., 'trust.read')
```

GHM:

```text
trust_score.business_id -> ghm.business.id
calculate_business_trust_score(p_account_id, p_business_id)
  uses AuthContext.userId as p_account_id
  + active owner/administrator membership as trust.read
```

## 3. First-slice operation surface

```text
trust_score.readPublic
trust_score.read
trust_score.calculate
```

Registry resource: `trust_score` with operations `read`, `readPublic`, `calculate`.

No create/update/delete of score rows outside `calculate`. No HTTP routes in this slice.

### `trust_score.readPublic`

Actor: any caller (no AuthContext required).

Authorization:

```text
business.is_active = true
AND business.is_verified = true
AND business.verification_status = 'approved'
```

Result: Trust score for the Business, or null if missing/not publicly visible.

### `trust_score.read`

Actor: authenticated account.

Authorization (OR):

1. public visibility predicate above; or
2. active `owner` or `administrator` membership on the Business (`trust.read`).

Result: Trust score row or null.

### `trust_score.calculate`

Actor: authenticated account with `trust.read` (active owner or administrator membership).

Invariants:

1. `p_account_id = context.userId`;
2. Business exists;
3. membership grants trust.read;
4. dimensions computed by Connect formulas;
5. upsert on `business_id`;
6. caller cannot supply dimension values.

Denial cases:

- unauthenticated;
- member role (no trust.read);
- non-member / cross-business;
- missing Business.

### List by trust level

`listByTrustLevel(level)` returns scores matching `trust_level`, ordered by `total_score DESC`, filtered by the same visibility rules as read/readPublic (public-only when unauthenticated; public OR trust.read when authenticated).

## 4. Authorization translation

| Connect | GHM |
|---|---|
| RLS SELECT public approved | service/repository public predicate |
| RLS SELECT + trust.read | AuthContext + membership owner/administrator |
| `auth.uid()` in calculate | `AuthContext.userId` passed as `p_account_id` |
| SELECT-only table grants | `ghm_runtime` SELECT-only + EXECUTE calculate |
| no INSERT/UPDATE/DELETE grants | REVOKE INSERT/UPDATE/DELETE from runtime |

Platform `admin` AuthContext role does **not** invent founder Trust override; Connect calculate is membership-gated.

## 5. Concurrency / idempotency

- `UNIQUE(business_id)` + `ON CONFLICT DO UPDATE`
- Concurrent calculate: both may succeed; final row reflects last completed upsert
- Identical inputs → identical dimension/total/level results (idempotent content)

## 6. Explicit non-operations

Not authorized in this slice:

- manual score patch;
- delete Trust row via product API;
- Trust evidence upload;
- Trust history listing;
- public HTTP Trust routes;
- Business profile column invention;
- adapters / shadow / cutover.

## 7. Registry

Register `trust_score` because GHM registry semantics require an explicit resource entry for governed capabilities with AuthContext resource access.

Registration does not imply a public HTTP API.
