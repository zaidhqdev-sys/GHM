# Connect Realtime Source Audit

**Status:** SOURCE EVIDENCE ONLY — NO CONSTRUCTION AUTHORIZATION  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Date:** 2026-09-18

## 1. Purpose

Inventory Connect realtime subscriptions and assess whether each is a hard product requirement or a degradable convenience. No GHM realtime implementation is authorized.

## 2. Client subscriptions found

| # | Channel | Event | Table | Filter | Consumer | Initial load without realtime? |
|---|---|---|---|---|---|---|
| 1 | `notif:{userId}` | `INSERT` | `public.notifications` | `user_id=eq.{userId}` | `notificationService.subscribeToUser` → `useNotifications` | Yes — `getForUser` |
| 2 | `leads:{businessId}` | `INSERT` | `public.leads` | `business_id=eq.{businessId}` | `useLeads` in `hooks_index.js` | Yes — `leadService.getForBusiness`; live inserts only via channel |

Client throttle: `realtime: { params: { eventsPerSecond: 10 } }` on Supabase client creation.

No `broadcast` / `presence` consumers found under Connect `src`.

## 3. Publication evidence

| Table | Migration adds to `supabase_realtime`? | Notes |
|---|---|---|
| `notifications` | Yes — `20260718202200_establish_notifications_contract.sql` | Matches client |
| `leads` | **Not found** in `supabase/migrations` | Appears in legacy `src/supabase/supabase_schema.sql`; client still subscribes → publication status **EVIDENCE INSUFFICIENT** for production migrations |
| `messages` | Legacy dump only | No client `postgres_changes` consumer found |

## 4. Authorization expectation

Realtime filters are client-supplied (`user_id` / `business_id`). Production safety depends on Supabase Realtime + RLS publication rules. Exact Realtime authorization policy text beyond publication membership: further evidence may be required.

## 5. Degradeability

| Subscription | Can product function without it? | Assessment |
|---|---|---|
| Notifications INSERT | Yes, with polling/manual refresh | Convenience / UX freshness; Notification **persistence** is separate (already qualified in GHM without transport) |
| Leads INSERT | Partially — inbox loads historically; live arrival needs refresh | UX convenience unless product mandates push-live inbox |

## 6. GHM impact

- GHM Notification resource explicitly excludes transport.
- No GHM realtime implementation exists under `src/`.
- Ownership decision required: remain Supabase/provider Realtime vs GHM event transport vs polling adapter.

## 7. Conclusions

1. Only two live client realtime subscriptions are evidenced: notifications and leads.
2. Notifications publication is migration-backed; leads publication is not proven in migrations.
3. Realtime is not required to preserve GHM’s closed Notification persistence contract.
4. Any GHM realtime work requires explicit authorization and an ownership decision; this audit does not provide one.
