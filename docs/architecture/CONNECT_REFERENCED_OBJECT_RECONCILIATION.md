# Connect Referenced Object Reconciliation

**Status:** SOURCE RECONCILIATION — NO GHM TABLE CONSTRUCTION AUTHORIZED  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Date:** 2026-09-18

## 1. Purpose

Classify every Connect-referenced object that was ambiguous in the readiness audit so GHM does not invent fake resources.

### Classification legend

| Code | Meaning |
|---|---|
| A | Live production table proven in `supabase/migrations` |
| B | Live production view proven in migrations |
| C | RPC/function-owned only |
| D | Edge-function/internal object |
| E | Local/client-only state (app references without migration) |
| F | Legacy/dead reference (legacy SQL / schema dump / unused) |
| G | Evidence insufficient |

Authority order: `supabase/migrations` + generated `src/lib/database.types.ts` ≫ `src/supabase/supabase_schema.sql` / `supabase/legacy/*`.

## 2. Reconciliation results

| Object | Class | Evidence |
|---|---|---|
| `business_capability_evidence` | **A** | Migration `20260726201418_*`; in `database.types.ts`; client + RPCs |
| `business_categories` | **A** | Migration `20260721110400_*` + seeds; types; client |
| `business_category_assignments` | **A** | Same foundation; types; client |
| `business_offerings` | **A** | Same; types; client |
| `trust_scores` | **A** | Migration `20260721170743_*`; types; client + calculate RPC |
| `account_onboarding_progress` | **A** | Migration `20260728220000_*`; types; onboarding RPCs |
| `business_engagement_events` | **A** | Migration `20260727010000_*`; types; written via RPC |
| `business_profile_view_visitors` | **A** | Migration `20260902023000_*`; types; RPC-owned |
| `business_directory_review_events` | **A** | Migration `20260825170000_*`; types; directory review RPCs |
| `business_relationships` | **A** | Migration `20260725141500_*`; types; client |
| `relationship_types` | **A** | Same |
| `outcome_types` / `outcomes` | **A** | Same |
| `commercial_plans` (+ versions/prices/entitlements/consents/events/payment_*/refund/founding/reconciliation) | **A** | Commercial migrations; types |
| `business_commercial_trials` / `business_subscriptions` | **A** | Commercial foundation |
| `project_marketplace` | **B** | View in projects migration; types |
| `quote_analyses` | **E** (+G remote) | Client only; not in migrations/types |
| `project_workspace` | **E** (+G) | Client only |
| `workspace_files` | **E** (+G) | Client only |
| `suppliers` / `supplier_products` | **E** (+G) | Client only; UI “supplier” often means business flag, not table |
| `admin_verification_queue` | **F/E** | Legacy SQL + client; not in migrations/types |
| `audit_logs` | **F/E** | Legacy + client |
| `feature_access` | **F/E** | Legacy + client |
| `referrals` | **F/E** | `supabase_schema.sql` + client; not migrations/types |
| `referral_tracking` | **E** (+G) | Client only |
| `disputes` | **F/E** | schema dump + client |
| `business_images` | **E** (+G) | Client + storage `media`; no migration create |
| `project_images` | **E** (+G) | Client; no migration create |
| `verification_documents` | **F/E** | schema dump + client; no migration create |

## 3. Corrections to prior readiness wording

The readiness audit / gap register previously listed several **A**-class objects together with orphan references as “requiring deeper evidence before schema inference.”

**Correction:**

- **Proven live tables (A)** still require **source/operation contracts and construction authorization** before GHM builds them, but they are **not** “migration-missing.”
- **E/F objects** must **not** become GHM tables until remote production schema proves they exist or product removes the dead client paths.

## 4. Construction rule

```text
No GHM CREATE TABLE may be inferred from class E/F/G alone.
Class A objects still require an authorized GHM construction slice.
```

## 5. Residual evidence work

- Prove or retire remote existence of E/F tables (`quote_analyses`, images, workspace, suppliers, disputes, referrals, verification_documents, admin queue, audit_logs, feature_access, referral_tracking)
- Confirm Storage bucket `private-docs` exists in production
- Confirm Realtime publication for `leads`
