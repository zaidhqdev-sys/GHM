# Connect Provider Boundary Source Audit

**Status:** HISTORICAL CONNECT SOURCE AUDIT — 2026-09-18; NO CONSTRUCTION AUTHORIZATION BY THIS RECORD  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Date:** 2026-09-18

## 1. Purpose

This 2026-09-18 source audit classified provider-owned responsibilities and Connect-persisted state before subsequent GHM commercial/Trust construction. Its statements about implementation authorization and provider use are historical to that audit and must not be used as current GHM implementation status. At that time, Trust score calculation was Connect database logic rather than an external provider. Later GHM Trust construction qualification is recorded in `TRUST_QUALIFICATION.md`; PayFast checkout/ITN implementation and local qualification are recorded in the current commercial contracts/evidence. Neither later construction qualifies Connect production provider cutover, and PayFast approval must not be conflated with Paystack status.

## 2. Provider matrix

| Provider | Connect surface | Connect persists | Provider owns | Live vs stub |
|---|---|---|---|---|
| **Paystack** | Edge `commercial-payment-checkout` + `commercial-payment-webhook` | payment attempts, provider events, transactions, subscription lifecycle via RPCs | Checkout UI/charge rails, event payloads, signatures | **Live** path gated by `is_commercial_launch_authorized` |
| **PayFast** | `lib_payfast.js` (no importers) + edge `payfast-webhook` | Intended legacy `subscriptions` tokens / tier / notifications | Recurring billing ITN | **Legacy/unused** relative to current importers; targets non-migration `subscriptions` |
| **WhatsApp (Meta Cloud API)** | `lib_whatsapp.js` (no importers) | Would send messages if wired | Message delivery | **Unused library** |
| **WhatsApp deep links** | UI `wa.me` / `WhatsAppLink` | Business phone fields; optional engagement event type | None (client opens WhatsApp) | **Live client convenience** — CONNECT-LOCAL |
| **Anthropic via ai-proxy** | Edge `ai-proxy`; client `aiProxyClient.js` | None from proxy (stateless) | Model inference | **Implemented**, feature-flag gated |
| **Anthropic via lib_ai.js** | Direct browser fetch | None | Model inference | Parallel client path |
| **Email / SMS** | — | — | — | **Not evidenced** under Connect `src/` |
| **Trust score** | `trust_scores` + `calculate_business_trust_score` | Scores in Postgres | N/A (not external provider) | **Live DB capability**; GHM has no Trust resource |

## 3. What GHM would abstract (evidence only)

If later authorized:

- Commercial **payment attempt / provider event / result application** contracts (provider SDK stays external)
- Optional notification/outbox contracts (delivery providers stay external)
- Trust as a **GHM domain resource** (calculation is Connect DB logic, not Paystack/WhatsApp)

GHM must **not** absorb Paystack/PayFast/Meta/Anthropic SDKs as core resources merely because Connect calls them.

## 4. Conclusions

1. Paystack is the evidenced commercial launch payment provider.
2. PayFast and Meta WhatsApp API libraries appear unused by current importers.
3. WhatsApp deep links are Connect-local.
4. AI inference is external; no email provider evidenced.
5. At this audit date, Trust was an internal Connect DB domain and GHM construction had not yet been authorized. This historical statement is superseded for GHM implementation status by `TRUST_QUALIFICATION.md`; Connect production routing/cutover remains separately gated.
6. No provider cleanup or production credential change is authorized by this audit.
