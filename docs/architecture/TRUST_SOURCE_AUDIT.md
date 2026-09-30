# GHM Trust Source Audit

## Status

**SOURCE RECONCILIATION COMPLETE — CONSTRUCTION CONTRACT AUTHORIZED**

This document records the verified Zaid Connect Trust capability before GHM schema/resource implementation. It does not authorize production migration, production data movement, provider cutover, or product configuration changes.

Founder construction authorization for Trust is explicit for this slice.

## 1. Canonical product source

Authoritative product repository:

```text
zaidhqdev-sys/zaid-connect
```

Primary production contract source (local audit checkout used for this reconciliation):

```text
C:\zaid-connect-audit\supabase\migrations\20260721170743_establish_trust_and_saved_business_contracts.sql
```

Permission vocabulary source:

```text
C:\zaid-connect-audit\supabase\migrations\20260721023613_establish_business_membership_foundation.sql
```

(`public.has_business_permission` — `trust.read` for owner and administrator)

Application operation source:

```text
C:\zaid-connect-audit\src\lib\lib_supabase.js  (trustScoreService)
C:\zaid-connect-audit\src\features\authentication\identity.js  (TRUST_READ)
C:\zaid-connect-audit\src\features\trust\TrustScoreScreen.jsx
C:\zaid-connect-audit\src\features\administration\AdminVerificationScreen.jsx  (imports trustScoreService)
```

Provider-specific Supabase RLS/`auth.uid()` mechanisms are evidence of the product contract only. They are not copied as the GHM authorization model.

## 2. Canonical domain concept

Trust is a **database-owned, calculated score** persisted one row per Business.

It is:

- **derived-only** (dimension points and `trust_level` are calculated, not free-form caller input);
- **recalculated** on explicit `calculate_business_trust_score` invocation;
- **upserted** into `trust_scores` (`UNIQUE(business_id)`);
- **not** evidence-backed by a separate Trust evidence/history table in production source;
- **not** manually reviewable as a distinct moderation workflow in the Trust migration;
- **publicly readable** for active + verified + approved businesses;
- **additionally readable** by members with `trust.read` (owner, administrator);
- **writable exclusively** through the calculation function (clients have SELECT only; no INSERT/UPDATE/DELETE grants).

Trust is distinct from:

- Saved Business relationships;
- Review moderation and rating aggregates (rating is an *input* to calculation);
- Business membership management;
- External payment/messaging/AI providers.

## 3. Verified production data contract

```text
public.trust_scores
  id                   uuid PK default gen_random_uuid()
  business_id          uuid NOT NULL -> businesses(id) ON DELETE CASCADE
  profile_complete     smallint NOT NULL DEFAULT 0   CHECK 0..15
  phone_verified       smallint NOT NULL DEFAULT 0   CHECK 0..10
  email_verified       smallint NOT NULL DEFAULT 0   CHECK 0..10
  id_verified          smallint NOT NULL DEFAULT 0   CHECK 0..10
  cipc_verified        smallint NOT NULL DEFAULT 0   CHECK 0..10
  vat_verified         smallint NOT NULL DEFAULT 0   CHECK 0..5
  insurance_verified   smallint NOT NULL DEFAULT 0   CHECK 0..15
  reviews_score        smallint NOT NULL DEFAULT 0   CHECK 0..15
  completed_projects   smallint NOT NULL DEFAULT 0   CHECK 0..10
  total_score          smallint NOT NULL DEFAULT 0   CHECK 0..100
  trust_level          text NOT NULL DEFAULT 'bronze'
                       CHECK IN ('bronze','silver','gold','platinum')
  last_updated         timestamptz NOT NULL DEFAULT now()
  created_at           timestamptz NOT NULL DEFAULT now()
  updated_at           timestamptz NOT NULL DEFAULT now()
  UNIQUE(business_id)
```

Indexes:

```text
trust_scores_level_total_idx (trust_level, total_score DESC)
trust_scores_last_updated_idx (last_updated DESC)
```

Trigger: `trust_scores_set_updated_at` sets `updated_at` on UPDATE.

No Trust history, event, or evidence tables are established by the Trust migration.

## 4. Calculation semantics (exact)

Function: `public.calculate_business_trust_score(target_business_id uuid) RETURNS trust_scores`

Authorization inside the function:

1. `auth.uid()` must be non-null;
2. `has_business_permission(target_business_id, 'trust.read')` must be true;
3. target Business row must exist.

Inputs read from `public.businesses` only:

| Dimension | Source field | Rule | Points |
|---|---|---|---|
| profile_complete | `description` | non-blank after trim | 15 else 0 |
| phone_verified | `phone` | non-blank after trim | 10 else 0 |
| email_verified | `email` | non-blank after trim | 10 else 0 |
| id_verified | (none) | hardwired | 0 |
| cipc_verified | (none) | hardwired | 0 |
| vat_verified | (none) | hardwired | 0 |
| insurance_verified | `insurance_verified` | `is true` | 15 else 0 |
| reviews_score | `rating` | `least(greatest(round(coalesce(rating,0)*3),0),15)` | 0..15 |
| completed_projects | `jobs_completed` | `least(greatest(floor(coalesce(jobs_completed,0)/5),0),10)` | 0..10 |

`total_score` = sum of dimensions (0..100).

`trust_level`:

```text
>= 80 platinum
>= 60 gold
>= 40 silver
else bronze
```

Persistence: `INSERT ... ON CONFLICT (business_id) DO UPDATE` of all dimension columns + `total_score` + `trust_level` + `last_updated = now()`.

Concurrency: conflict upsert is idempotent for identical inputs; concurrent calculates race on `last_updated` with last writer winning. No separate advisory lock.

NULL/default boundary: missing Business yields exception; coalesce/trim rules as above; dimension defaults 0 / `bronze` on table defaults for uncalculated rows.

Writes are **not** user-initiated row edits. They are **system/calculation initiated** via the RPC after permission check. Callers cannot supply score values.

## 5. Authorization boundary (Connect)

SELECT policy (`trust_scores_select_visible`) for `anon` and `authenticated`:

```text
business is_active AND is_verified AND verification_status = 'approved'
OR has_business_permission(business_id, 'trust.read')
```

Table grants: **SELECT only** to anon/authenticated. No INSERT/UPDATE/DELETE.

EXECUTE on `calculate_business_trust_score` granted to `authenticated` only.

`trust.read` membership mapping (from `has_business_permission`):

| Role | trust.read |
|---|---|
| owner | yes (all permissions) |
| administrator | yes (explicit list) |
| member | no |

## 6. Client operation vocabulary

`trustScoreService`:

| Method | Backend | Meaning |
|---|---|---|
| `getTrustScore(businessId)` | SELECT by `business_id` | read (visibility gated by RLS) |
| `calculateTrustScore(businessId)` | RPC calculate | recalculate + persist |
| `listByTrustLevel(level)` | SELECT by `trust_level` ORDER BY `total_score` DESC | list (visibility gated by RLS) |

No public HTTP API is defined in Connect for Trust; the client uses the data API/RPC.

## 7. GHM dependency note (Business input columns)

Connect calculation reads `businesses.description`, `phone`, `email`, `insurance_verified`, `jobs_completed`, and `rating`.

GHM first-slice `ghm.business` currently exposes `rating` (and review aggregates) but does **not** yet expose `description`, `phone`, `email`, `insurance_verified`, or `jobs_completed`.

Those dimensions therefore score as **0** under Connect's own formulas until a separately authorized Business profile field extension establishes the columns. This matches Connect's own deferred-zero pattern for `id_verified` / `cipc_verified` / `vat_verified`. It does **not** reopen Business Identity construction and does **not** invent those columns in this Trust slice.

`rating`-driven `reviews_score` remains live against GHM Business aggregates.

## 8. History / evidence / manual review

| Question | Evidence |
|---|---|
| Trust history table? | No |
| Trust evidence table? | No |
| Manual score edit path? | No (SELECT-only + calculate RPC) |
| Versioned scores? | No (single upserted row) |
| External Trust provider? | No (Postgres function) |

## 9. Completeness verdict

The production source establishes a **complete Trust contract**: schema, calculation formulas, authorization predicates, operation surface, concurrency/idempotency, and consumers.

Phase 1 stop condition is **not** triggered. Construction may proceed under the GHM schema/operation contracts with the Business input dependency noted above.
