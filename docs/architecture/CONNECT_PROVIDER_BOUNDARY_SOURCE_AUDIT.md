# Connect Provider Boundary Source Audit

**Status:** SOURCE EVIDENCE ONLY — NO CONSTRUCTION AUTHORIZATION  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Date:** 2026-09-18

## 1. Purpose

Separate provider-owned responsibilities from Connect-persisted state for payments, messaging, and AI. Trust score calculation is database-owned in Connect (not an external Trust provider). No payment/Trust implementation is authorized.

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
5. Trust is an internal Connect DB domain, still requiring explicit GHM construction authorization (handover forbids opening without it).
6. No provider cleanup or production credential change is authorized by this audit.
