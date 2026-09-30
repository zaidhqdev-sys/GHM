# Connect Server Runtime Source Audit

**Status:** SOURCE EVIDENCE ONLY — NO CONSTRUCTION AUTHORIZATION  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Date:** 2026-09-18

## 1. Purpose

Inventory Connect Edge Functions and related server-side invoke paths. No GHM runtime hosting is authorized.

## 2. Edge Function directories (`supabase/functions`)

| Name | Purpose | Auth | Provider dependency | DB dependency | Remain external? | GHM contract needed? |
|---|---|---|---|---|---|---|
| `commercial-payment-checkout` | Initialize Paystack checkout for a payment attempt | User Bearer JWT + launch gate RPC | Paystack secret | `get_commercial_payment_attempt_for_provider`, `record_commercial_provider_checkout`, `commercial_provider_events` | Yes (secrets/CORS/provider HTTP) | Yes — payment attempt/checkout recording |
| `commercial-payment-webhook` | Apply Paystack charge results | Provider signature (`verify_jwt=false`) | Paystack HMAC | `apply_commercial_payment_result` | Yes (webhook ingress) | Yes — apply payment result |
| `payfast-webhook` | Legacy PayFast ITN handling | IP allowlist | PayFast | Writes legacy `subscriptions` / `businesses.tier` / notifications | Yes if retained | N/A/supersede — legacy model |
| `ai-proxy` | Proxy Anthropic Messages API (`quote`, `lead_score`, `description`, `moderation`, `support`) | Invoker key/config | Anthropic | Stateless | Yes (API key) | No core table contract |

## 3. Client invoke evidence

| Pattern | Evidence |
|---|---|
| `functions.invoke` | **None** in `src/` |
| `fetch(.../functions/v1/commercial-payment-checkout)` | `commercialService.startCheckout` in `lib_supabase.js` |
| `fetch(.../functions/v1/ai-proxy)` | `src/features/ai/aiProxyClient.js` |
| `/functions/v1/send-whatsapp` | Commented sample only in `src/supabase/supabase_edge_functions.ts` |

## 4. Related modules (not Edge dirs)

| Module | Status |
|---|---|
| `lib_payfast.js` | **No importers** — dead client relative to current tree |
| `lib_whatsapp.js` Meta Cloud API | **No importers** — UI uses `wa.me` deep links instead |
| `lib_ai.js` | Direct client Anthropic fetch path (parallel to edge) |
| Commented `whatsapp-webhook` | Documentation/sample only |

## 5. Conclusions

1. Live Edge surfaces for product operation: **Paystack checkout**, **Paystack webhook**, **AI proxy**.
2. PayFast edge/client paths look **legacy/unused** relative to current importers.
3. Provider secrets and webhook ingress should remain outside GHM core resources.
4. GHM may later need **contracts** for payment prepare/record/apply; hosting of Edge runtimes is a separate authorization.
5. No email Edge Function evidenced.
