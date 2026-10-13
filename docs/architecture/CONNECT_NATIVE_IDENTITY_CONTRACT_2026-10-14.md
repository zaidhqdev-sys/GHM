# Connect Native Identity Contract

Status: implementation gate, source-audited 2026-10-14  
Scope: GHM Internal Runtime and ZAID Connect identity/session migration. This document is a contract, not authorization to cut over production.

## Critical operational blocker: Supabase organization billing/access

On 2026-10-14, the connected Supabase account listed the ZAID HQ organization on the Free plan, with both the Zaid Connect project (`wxabopuyqblbpxkoudxy`) and QuoteFlow project (`wetsblzwhxxgqpttwqht`) reporting `INACTIVE`. A supported restore attempt for Zaid Connect was rejected because the organization has unpaid invoices. Read-only table inspection timed out. Treat Supabase as unavailable until account access is restored or data access is independently verified. This observation does not establish whether the organization has a formal account suspension beyond the returned billing restriction.

**Recovery rules:** do not repeatedly retry restore; do not create replacement Supabase projects or incur costs without an explicit cost decision; do not assume the inactive database is deleted or recoverable; preserve existing repo migrations, types, backups and any previously exported data. Contact Supabase billing/support through the dashboard to confirm the exact invoice, any available dispute/payment arrangement, and data-retention/export window. In parallel, proceed with GHM migration readiness and an inventory of dependencies. No live provider switch is authorized until identity linking, data recovery, business authorization, and operational parity are tested.

## Verified current behavior

- Connect currently creates Supabase Auth users with `full_name`, `role`, and `phone` in user metadata. Its React auth hook restores a Supabase session, subscribes to auth-state changes, and loads the profile by the Supabase user UUID.
- Connect's canonical application role is `profiles.role` when available; auth metadata is only a fallback. A missing profile is treated as an identity problem, not proof that metadata is authoritative.
- Connect signup distinguishes a customer from a “run a business” onboarding intent. Both options currently start with the account role `customer`; the latter sets business-operator intent. `contractor` and `supplier` are additional Connect product roles.
- GHM native auth registration accepts only `customer` or `business`. It returns ES256 access token, opaque refresh token, token type, expiry, session ID, and numeric GHM account ID. Refresh rotates the refresh credential; logout revokes the session associated with the presented refresh token.
- GHM authorization uses `admin | customer | business` and currently authorizes at resource level by account role. Connect's GHM authorization binding requires a mapped Supabase external identity and resolves it with `allowBootstrap: false`. A login UI change alone does not remove this dependency.
- Connect business context is derived from active business memberships. Owner/administrator/member membership roles and selected active business are separate from the platform account role.
- The GHM Connect business adapter previously resolved an existing external Business mapping after checking only the account role. The draft branch now checks active membership for the mapped canonical Business before returning it to non-admin business accounts; a regression test covers the no-membership denial. This guard is isolated in the draft and has not been merged or deployed.

## Contract decisions

1. **GHM account ID is the native principal.** The signed access token is verified by GHM; client-provided account IDs, role values, business IDs, or signup metadata never establish authority.
2. **Signup intent is not a permission grant.** `customer` and `business-operator` are onboarding choices. The latter may initiate business creation after authentication, but must not automatically make the GHM account role `business`, create a business, or grant business-management rights.
3. **Base account roles must map explicitly.** GHM currently supports `customer` and `business`; Connect has `customer`, `contractor`, `supplier`, and `admin`. Do not silently equate contractor/supplier to GHM business until endpoint/resource semantics are verified. Do not map Connect `admin` from client input; admin/system-admin status remains controlled provisioning only.
4. **Business authority is membership- and resource-scoped.** A user may select only a business for which GHM confirms an active membership. Ownership, membership role, business status, and each operation's authorization must be enforced server-side. A stored active business ID is only a selection hint. The new guard closes the identified mapped-business resolution path; it is not proof that every governed operation has been audited.
5. **No implicit identity bootstrap during protected operations.** Existing external identity mappings may be resolved; unmapped users must fail closed until an explicit, audited account-linking/migration flow maps them. Registration must not claim or merge an existing account based only on matching email.
6. **Session lifecycle must be explicit.** Store access tokens only in the chosen client session mechanism; protect refresh credentials appropriately; refresh must rotate tokens; logout must revoke the server session and clear client state; expired/reused/revoked refresh tokens must clear the session and require sign-in. Never log credentials.
7. **Recovery is separate from sign-in.** GHM recovery/reset endpoints and Connect's current recovery UX must be reconciled before switching the recovery flow. Do not claim email delivery works until its provider is configured and tested.
8. **No cutover in this slice.** No production data mutation, Supabase shutdown, provider activation, or live-account migration is included.

## Implementation status and remaining slices

1. **Draft only:** an isolated Connect GHM auth client now covers register/login/refresh/logout, validates the documented token response, normalizes errors, and forces registration to the least-privileged `customer` role. Contract tests and a dedicated npm script were added. These tests have not yet been confirmed passing in CI.
2. Build an evidence-based recovery inventory for Supabase data: schema/migrations, backups, exported user list if available, profile/business/membership data, storage objects, and Edge Functions. Do not infer database contents from local TypeScript types.
3. Inventory every direct Supabase Auth and user-scoped data dependency. The auth adapter alone cannot migrate profile, memberships, realtime, storage, directory, business operations, or RLS behavior.
4. Establish an explicit existing-account linking/migration path, including both founder accounts, before enabling native sign-in for existing users.
5. Continue the server-side authorization audit across every governed business operation and complete role/membership/resource parity tests. The mapped-business guard is one narrow fix, not a global authorization guarantee.
6. Only after recovery status, parity tests, and a reviewed migration plan, prepare a separately gated cutover.

## Acceptance criteria

- No client metadata can grant `admin`, `business`, ownership, or membership permissions.
- Existing accounts cannot be silently duplicated, linked to the wrong GHM account, or locked out without a recovery path.
- Access-token validation, expiry, refresh rotation/replay, logout revocation, disabled accounts, and recovery behavior have automated tests.
- Business selection never substitutes for membership authorization.
- All remaining Supabase dependencies are listed and explicitly classified before cutover.
- Production remains unchanged until a separately approved cutover.
- Supabase data recovery/export status is documented before any account or data migration.

## Source references

- GHM: `src/http/auth-router.ts`, `src/auth/ghm-auth-service.ts`, `src/auth/authorization.ts`, `src/integrations/connect/authorization-binding.ts`, `src/integrations/connect/identity-adapter.ts`, `src/integrations/connect/business-adapter.ts`.
- Connect: `src/lib/lib_supabase.js`, `src/hooks/hooks_index.js`, `src/features/authentication/roles.js`, `src/features/authentication/identity.js`.
