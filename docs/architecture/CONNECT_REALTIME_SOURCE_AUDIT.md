# Connect Realtime Source Audit

**Status:** SOURCE EVIDENCE ONLY — NO CONSTRUCTION AUTHORIZATION  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Date:** 2026-09-18

> **Status reconciliation — 2026-10-13:** This document is a source audit of Connect at the recorded 2026-09-18 commit, not a current GHM implementation or production-readiness verdict. Its Connect-side observations remain tied to that exact source snapshot. Current GHM construction and qualification status is governed by `GHM_CURRENT_STATE.md` and `GHM_REMAINING_WORK_REGISTER_2026-10-05.md`; qualified resource slices do not imply complete Connect workflow parity, production routing, or cutover. Any row describing a GHM capability as missing/not implemented records the state at this audit's comparison point unless explicitly reconciled by later evidence.

## 1. Purpose

> **Specific current-status clarification — 2026-10-13:** Unlike several resource slices that have since been constructed, GHM Realtime remains unimplemented and unauthorized. The current decision is still to defer GHM-owned event transport until an explicit ownership decision selects provider Realtime, a GHM event transport, or polling. This audit does not authorize construction; existing Connect/Supabase realtime remains outside GHM cutover authorization.

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

1. The 2026-09-18 Connect source snapshot contained two realtime subscription call sites: notifications and leads. The 2026-10-13 reachability review has **not** established that either consumer is mounted in a launch-active route.
2. Notifications publication is migration-backed; leads publication is not proven in migrations.
3. Realtime is not required to preserve GHM’s closed Notification persistence contract.
4. Any GHM realtime work requires explicit authorization and an ownership decision; this audit does not provide one.

## Active-caller reachability reconciliation — 2026-10-13

The subscription inventory above is a source-code snapshot, not proof that both consumers are mounted in the current Connect runtime. The current migration caller audit has not established a mounted active inbox/push consumer; the lead hook cited above is in the older `hooks_index.js` path, whose production route reachability has not been demonstrated. Keep the source evidence, but classify realtime/push as **not proven launch-active** until current route/component reachability is evidenced. This does not change the no-Supabase target: any Supabase realtime dependency that is confirmed active must be removed or replaced, but no GHM event transport should be built without a separate product ownership decision. Notification persistence and producer operations must be audited separately from realtime transport.
