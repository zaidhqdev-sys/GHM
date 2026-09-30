# GHM ↔ Zaid Connect Identity Adapter Qualification

**Status:** CONSTRUCTION IN PROGRESS — LOCAL QUALIFICATION REQUIRED
**Construction branch:** `construction/connect-identity-adapter`
**Scope:** Connect external identity → GHM canonical identity resolution only

## 1. Authorized slice

Founder authorization on 2026-09-30 permits construction of the Connect identity adapter within the frozen contract in `GHM_CONNECT_IDENTITY_ADAPTER_CONTRACT.md`.

This slice is limited to:

- resolving `(provider=supabase, subject=Connect Supabase UUID)`;
- returning the existing GHM canonical account identity mapping;
- controlled minimum bootstrap when the integration caller explicitly authorizes bootstrap;
- idempotent persistence through the already-qualified GHM auth persistence boundary.

It does not authorize:

- Supabase JWT verification by GHM;
- Connect session migration;
- Connect login replacement;
- membership/ownership/admin grants;
- business migration;
- product profile migration;
- production routing/cutover;
- storage, realtime, payments, or other product adapters.

## 2. Implementation boundary

The implementation is intentionally a domain/integration seam rather than a public HTTP endpoint.

Reason: the existing repository does not yet contain a separately qualified service-to-service trust contract for an external Connect caller. Adding a public endpoint here would create a new credential/trust boundary not covered by the approved slice.

Therefore:

`trusted Connect integration boundary`
→ `ConnectIdentityAdapter`
→ `qualified AuthPersistence`
→ `account_external_identity / account_identity`

A future HTTP/service transport requires its own trust/credential contract before exposure.

## 3. Implemented invariants

The implementation must preserve:

1. provider is fixed to `supabase`;
2. subject must be a UUID;
3. UUID is normalized before mapping;
4. Supabase JWTs are not accepted as identity input;
5. existing mapping is returned without bootstrap;
6. absent mapping remains unmapped unless bootstrap is explicitly allowed;
7. bootstrap delegates to the existing minimum-bootstrap function;
8. mapping does not grant authorization;
9. no membership/ownership/admin mutation occurs in this slice.

## 4. Qualification checklist

Local evidence required before branch can be considered qualified:

- [ ] TypeScript build passes.
- [ ] full test suite passes.
- [ ] adapter unit tests pass.
- [ ] database persistence qualification remains green.
- [ ] documentation/readiness reconciliation updated with final evidence.
- [ ] branch remains isolated from main until qualification review.

## 5. STOP boundary

Do not add HTTP transport, product session migration, business mapping, membership migration, or production configuration in this branch.

Final construction status remains **not qualified** until local evidence is returned and reviewed.
