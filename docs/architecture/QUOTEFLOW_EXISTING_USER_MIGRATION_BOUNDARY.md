# QuoteFlow Existing-User Migration Boundary

**Status:** ARCHITECTURE DECISION — MIGRATION BOUNDARY SELECTED; IMPLEMENTATION SEPARATELY GATED

## Decision

GHM is the canonical runtime owner for QuoteFlow authentication and account identity.

Existing QuoteFlow users currently authenticate through Supabase Auth. That state is treated as legacy migration input only.

Target runtime:

`QuoteFlow authenticated GHM session → ghm.account_identity.id → ghm.business_membership → ghm.business.id`

No Supabase UUID, Supabase JWT, or QuoteFlow legacy organization UUID becomes a permanent GHM runtime identity or authorization key.

## Current QuoteFlow evidence

The current QuoteFlow `main` implementation still has Supabase as an active runtime dependency:

- `src/state/AuthContext.tsx` uses Supabase Auth session state, sign-in, sign-up, sign-out and callback handling.
- `src/lib/supabase.ts` creates the Supabase client and persists its session through AsyncStorage.
- `src/lib/organizationContext.ts` resolves and creates organization context through Supabase RPCs.
- `src/lib/accountStorage.ts` scopes local operational data by the current organization identifier, falling back to the current user identifier.
- `package.json` still declares `@supabase/supabase-js`.
- `src/lib/env.ts` still defines the Supabase URL and anon-key environment contract.

Therefore this slice must define migration semantics without changing the QuoteFlow runtime yet.

## Existing-user account migration

For each existing Supabase Auth user:

1. **Legacy source identity**
   - Preserve the Supabase Auth UUID as migration provenance.
   - Treat `provider=supabase`, `subject=<Supabase Auth UUID>` as source evidence only.
   - Do not issue GHM authorization from that mapping.
2. **Canonical GHM account**
   - Resolve exactly one GHM `account_identity.id`.
   - The GHM account is the sole canonical runtime identity after migration.
   - Account status remains independently governed by GHM.
3. **Mapping**
   - Use GHM's existing external-identity capability only for explicit migration provenance.
   - Mapping must be link-only and conflict-detecting.
   - Never create/merge/move an account from the external mapping operation.
4. **Credential migration**
   - Do not assume a Supabase password hash is importable into GHM Argon2id.
   - If a verified compatible hash migration format is not available, require verified password reset/re-enrollment.
   - Never request or persist plaintext passwords for migration.
   - Never weaken the GHM password contract to accommodate the legacy provider.
5. **Session migration**
   - Do not convert Supabase access/refresh tokens into GHM bearer credentials.
   - A migrated account must establish a fresh GHM session through the canonical GHM Auth protocol.
   - Legacy Supabase sessions remain legacy until the controlled application cutover.
6. **Email**
   - Email is an account attribute and login credential, not an identity-link authority.
   - Email-only matching is prohibited for account merge or takeover.
   - Normalized email may assist deterministic migration review only when paired with authoritative source evidence.

## Migration outcomes

Each legacy account must resolve to exactly one of:

- **MIGRATED** — one verified GHM account exists and migration provenance is recorded.
- **RESET_REQUIRED** — GHM account is established but credential migration is unsupported; verified password re-enrollment is required.
- **CONFLICT** — source evidence resolves to multiple/incompatible GHM accounts or mappings; migration stops for manual resolution.
- **BLOCKED** — required authoritative source evidence is unavailable or invalid.

No ambiguous account is silently migrated.

## Organization → Business reconciliation

QuoteFlow currently treats the organization as the business/account boundary and uses organization identifiers throughout its local storage scope.

The target is:

`legacy organization → authoritative migration evidence → ghm.business.id → ghm.business_membership`

For every legacy organization:

1. Establish authoritative ownership/admin evidence from the legacy system.
2. Resolve or create exactly one GHM `business.id`.
3. Establish the corresponding GHM membership for each migrated account through an explicitly authorized migration operation.
4. Preserve the legacy organization identifier only as migration provenance where needed.
5. After cutover, QuoteFlow resolves tenant context from GHM membership and `business.id`.

The existing public GHM business-creation endpoint must **not** be used as an improvised migration mechanism. Existing organization reconciliation requires a dedicated, separately authorized migration/provisioning capability.

## Local data continuity

QuoteFlow's operational records are currently local-first and scoped by legacy organization/user identifiers.

This creates a separate migration concern from authentication:

- changing authentication does not automatically migrate local operational data;
- changing the organization identifier can orphan existing AsyncStorage scopes;
- the migration must define an explicit deterministic local-scope transition;
- data must not be copied between businesses based solely on email;
- the transition must be atomic from the application's perspective and recoverable if interrupted.

No local-data rewrite is authorized by this architecture slice.

## Cutover sequence

The future controlled cutover is expected to follow this order:

1. Qualify GHM existing-user migration capability.
2. Establish GHM accounts and migration provenance.
3. Establish/reconcile GHM Businesses and memberships.
4. Qualify password reset/re-enrollment where required.
5. Implement QuoteFlow GHM session client.
6. Implement GHM organization/business context client.
7. Introduce a deterministic local storage-scope compatibility transition.
8. Qualify QuoteFlow end-to-end against GHM.
9. Freeze the legacy Supabase mutation surface.
10. Execute production migration under a separate founder gate.
11. Remove Supabase runtime dependency only after post-cutover evidence.

Supabase package removal is therefore a **late cutover consequence**, not part of this construction slice.

## Explicit non-goals

This architecture slice does not:

- add permanent QuoteFlow UUID → GHM identity tables;
- import Supabase JWTs into GHM;
- import unsupported password hashes;
- change QuoteFlow authentication code;
- remove `@supabase/supabase-js`;
- change QuoteFlow environment variables;
- change production routing/DNS;
- migrate production users;
- migrate production organizations;
- rewrite local business data;
- change payment or entitlement behavior.

## Required next qualification gates

Before implementing migration mechanics:

- [x] GHM canonical account owner selected.
- [x] Supabase identity classified as migration provenance.
- [x] No permanent UUID bridge selected.
- [x] Password migration/reset boundary selected.
- [x] GHM external identity mapping semantics verified.
- [x] Business external mapping semantics verified.
- [ ] authoritative Supabase export/data access boundary defined.
- [ ] migration manifest/crosswalk format defined.
- [ ] deterministic account conflict resolution defined.
- [ ] password reset/re-enrollment ceremony defined.
- [ ] organization → Business reconciliation manifest defined.
- [ ] local AsyncStorage scope transition defined.
- [ ] GHM migration/provisioning execution capability separately qualified.
- [ ] QuoteFlow GHM session client separately qualified.
- [ ] end-to-end cutover qualification separately qualified.

## Founder gate

This document authorizes architecture and qualification work only.

It does **not** authorize production migration, legacy Supabase mutation, credential extraction, environment changes, routing/DNS changes, QuoteFlow runtime cutover, payment changes, or removal of Supabase dependencies.
