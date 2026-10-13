# Connect Native Identity Contract

Status: implementation gate, source-audited 2026-10-14  
Scope: GHM Internal Runtime and ZAID Connect identity/session migration. This document is a contract, not authorization to cut over production.

## Verified current behavior

- Connect currently creates Supabase Auth users with `full_name`, `role`, and `phone` in user metadata. Its React auth hook restores a Supabase session, subscribes to auth-state changes, and loads the profile by the Supabase user UUID.
- Connect's canonical application role is `profiles.role` when available; auth metadata is only a fallback. A missing profile is treated as an identity problem, not proof that metadata is authoritative.
- Connect signup distinguishes a customer from a “run a business” onboarding intent. Both options currently start with the account role `customer`; the latter sets business-operator intent. `contractor` and `supplier` are additional Connect product roles.
- GHM native auth registration accepts only `customer` or `business`. It returns ES256 access token, opaque refresh token, token type, expiry, session ID, and numeric GHM account ID. Refresh rotates the refresh credential; logout revokes the session associated with the presented refresh token.
- GHM authorization uses `admin | customer | business` and currently authorizes at resource level by account role. Connect's GHM authorization binding requires a mapped Supabase external identity and resolves it with `allowBootstrap: false`. A login UI change alone does not remove this dependency.
- Connect business context is derived from active business memberships. Owner/administrator/member membership roles and selected active business are separate from the platform account role.

## Contract decisions

1. **GHM account ID is the native principal.** The signed access token is verified by GHM; client-provided account IDs, role values, business IDs, or signup metadata never establish authority.
2. **Signup intent is not a permission grant.** `customer` and `business-operator` are onboarding choices. The latter may initiate business creation after authentication, but must not automatically make the GHM account role `business`, create a business, or grant business-management rights.
3. **Base account roles must map explicitly.** GHM currently supports `customer` and `business`; Connect has `customer`, `contractor`, `supplier`, and `admin`. Do not silently equate contractor/supplier to GHM business until endpoint/resource semantics are verified. Do not map Connect `admin` from client input; admin/system-admin status remains controlled provisioning only.
4. **Business authority is membership- and resource-scoped.** A user may select only a business for which GHM confirms an active membership. Ownership, membership role, business status, and each operation's authorization must be enforced server-side. A stored active business ID is only a selection hint.
5. **No implicit identity bootstrap during protected operations.** Existing external identity mappings may be resolved; unmapped users must fail closed until an explicit, audited account-linking/migration flow maps them. Registration must not claim or merge an existing account based only on matching email.
6. **Session lifecycle must be explicit.** Store access tokens only in the chosen client session mechanism; protect refresh credentials appropriately; refresh must rotate tokens; logout must revoke the server session and clear client state; expired/reused/revoked refresh tokens must clear the session and require sign-in. Never log credentials.
7. **Recovery is separate from sign-in.** GHM recovery/reset endpoints and Connect's current recovery UX must be reconciled before switching the recovery flow. Do not claim email delivery works until its provider is configured and tested.
8. **No cutover in this slice.** No production data mutation, Supabase shutdown, provider activation, or live-account migration is included.

## Required next implementation slices

1. Build a small typed Connect GHM auth client for register/login/refresh/logout, with contract tests for token response validation, error normalization, and refresh rotation.
2. Add an isolated session adapter and auth-hook tests without switching the production app's provider.
3. Inventory every direct Supabase Auth and user-scoped data dependency. The auth adapter alone cannot migrate profile, memberships, realtime, storage, directory, business operations, or RLS behavior.
4. Establish an explicit existing-account linking/migration path, including both founder accounts, before enabling native sign-in for existing users.
5. Map Connect roles and business-membership permissions to GHM endpoints and tests. Fail closed where GHM does not yet expose equivalent authorization.
6. Only after parity tests and a reviewed migration plan, prepare a separately gated cutover.

## Acceptance criteria

- No client metadata can grant `admin`, `business`, ownership, or membership permissions.
- Existing accounts cannot be silently duplicated, linked to the wrong GHM account, or locked out without a recovery path.
- Access-token validation, expiry, refresh rotation/replay, logout revocation, disabled accounts, and recovery behavior have automated tests.
- Business selection never substitutes for membership authorization.
- All remaining Supabase dependencies are listed and explicitly classified before cutover.
- Production remains unchanged until a separately approved cutover.

## Source references

- GHM: `src/http/auth-router.ts`, `src/auth/ghm-auth-service.ts`, `src/auth/authorization.ts`, `src/integrations/connect/authorization-binding.ts`, `src/integrations/connect/identity-adapter.ts`, `src/auth/foundation/persistence.ts`.
- Connect: `src/lib/lib_supabase.js`, `src/hooks/hooks_index.js`, `src/features/authentication/roles.js`, `src/features/authentication/identity.js`.
