# QuoteFlow Existing-User Migration Boundary

**Status:** ARCHITECTURE DECISION — MIGRATION BOUNDARY SELECTED; IMPLEMENTATION SEPARATELY GATED

GHM is the canonical runtime owner for QuoteFlow authentication and account identity. Existing QuoteFlow Supabase Auth state is legacy migration input only.

Target runtime:

`QuoteFlow authenticated GHM session → ghm.account_identity.id → ghm.business_membership → ghm.business.id`

No Supabase UUID, Supabase JWT, or legacy organization UUID becomes a permanent GHM runtime identity or authorization key.

## Verified current boundary

Current QuoteFlow still uses Supabase Auth, its Supabase client, Supabase organization RPCs, and Supabase environment configuration. This slice therefore defines migration semantics without changing QuoteFlow runtime code.

## Existing-user account migration

For each legacy user:

1. Preserve the Supabase Auth UUID as opaque migration provenance.
2. Resolve exactly one canonical GHM `account_identity.id`.
3. Use GHM external identity only for explicit provenance.
4. Never create, merge, move, or take over an account through external-identity linking.
5. Do not assume a Supabase password hash is importable into GHM Argon2id; unsupported credentials require verified reset/re-enrollment.
6. Never migrate Supabase access/refresh tokens into GHM bearer credentials.
7. Establish a fresh GHM session through canonical GHM Auth.
8. Treat email as metadata/login credential, not identity-link authority. Email-only matching is prohibited.

### Verified external-identity primitive

The canonical current mutation primitive is:

`ghm.auth_link_external_identity(provider, subject, account_id)`

It requires an existing GHM account and returns:

- `created`
- `already_linked`
- `conflict`
- `account_not_found`

It explicitly does **not** create accounts, match by email, merge/move mappings, or change account status.

The previously referenced `auth_bootstrap_external_identity` function is **not a current canonical capability** and must not be used or referenced as an executable migration primitive.

Therefore migration provisioning must establish/resolve the GHM account first, then link legacy provenance.

## Migration outcomes

Each legacy account resolves to exactly one of:

- **MIGRATED** — one verified GHM account and all required migration conditions are satisfied.
- **RESET_REQUIRED** — GHM account exists but legacy credential migration is unsupported; verified re-enrollment is required.
- **CONFLICT** — incompatible target account/mapping or source evidence conflict; stop for manual resolution.
- **BLOCKED** — required authoritative evidence is unavailable or invalid.

No ambiguous account is silently migrated.

## Organization → Business

Target:

`legacy organization → authoritative evidence → ghm.business.id → ghm.business_membership`

Organization ownership/admin evidence, Business resolution/creation, and membership establishment are separate migration decisions. The public GHM business-creation endpoint must not be used as an improvised migration mechanism. Legacy roles are source metadata and are not silently translated into GHM roles.

## Local data continuity

QuoteFlow operational data is local-first and currently scoped by legacy organization/user identifiers. Authentication migration does not automatically migrate local data. A future cutover requires an explicit deterministic AsyncStorage scope transition that is atomic from the application's perspective and recoverable if interrupted.

## Cutover sequence

1. Qualify migration capability.
2. Establish GHM accounts and provenance.
3. Reconcile Businesses and memberships.
4. Qualify password reset/re-enrollment.
5. Implement QuoteFlow GHM session client.
6. Implement GHM business-context client.
7. Define local storage-scope transition.
8. Qualify QuoteFlow end-to-end against GHM.
9. Freeze legacy Supabase mutation surface.
10. Execute production migration under a separate founder gate.
11. Remove Supabase runtime dependency only after post-cutover evidence.

## Explicit non-goals

No permanent UUID bridge, Supabase JWT import, unsupported password-hash import, QuoteFlow runtime cutover, package removal, environment/routing change, production migration, local-data rewrite, payment change, or entitlement change is authorized by this slice.

## Qualification gates

- [x] GHM canonical account owner selected.
- [x] Supabase identity classified as migration provenance.
- [x] No permanent UUID bridge selected.
- [x] Password migration/reset boundary selected.
- [x] Current GHM external identity mapping semantics verified.
- [x] Business external mapping semantics verified.
- [x] Existing-user manifest contract defined.
- [ ] authoritative Supabase export/data access boundary defined.
- [ ] deterministic account conflict evidence source finalized.
- [ ] password reset/re-enrollment ceremony defined.
- [ ] organization → Business reconciliation manifest defined.
- [ ] local AsyncStorage scope transition defined.
- [ ] GHM migration/provisioning execution capability separately qualified.
- [ ] QuoteFlow GHM session client separately qualified.
- [ ] end-to-end cutover qualification separately qualified.

## Founder gate

Architecture and qualification only. No production migration, legacy Supabase mutation, credential extraction, environment/routing change, QuoteFlow cutover, payment change, or Supabase dependency removal is authorized.
