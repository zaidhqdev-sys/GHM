# Connect Identity Backend Source Audit

**Status:** SOURCE EVIDENCE ONLY — NO CONSTRUCTION AUTHORIZATION  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**GHM tree compared:** `cf4fc08a8331bb8ecbf43e033b71431a8d7913b3` (resources) / branch tip includes docs through gap register  
**Date:** 2026-09-18

## 1. Purpose

Trace Zaid Connect authentication and identity end-to-end and compare it to GHM’s AuthContext / account / membership model. This document does not design a mapping implementation or authorize construction.

## 2. Connect identity chain

```text
Supabase Auth (email/password)
→ auth.users (UUID)
→ trigger handle_new_auth_user
→ public.profiles (id = auth.users.id)
→ optional public.business_memberships
→ client resolveApplicationIdentity / useAuth
→ RLS predicates and SECURITY DEFINER RPCs using auth.uid()
→ Postgres / Storage / Realtime / Edge calls
```

### 2.1 Auth provider and session

Source: `src/lib/lib_supabase.js` `authService`.

| Operation | Mechanism |
|---|---|
| Sign up | `supabase.auth.signUp` with metadata `full_name`, `role`, `phone` |
| Sign in | `supabase.auth.signInWithPassword` |
| Sign out | `supabase.auth.signOut` |
| Session | `supabase.auth.getSession` → Supabase session object |
| Change listener | `supabase.auth.onAuthStateChange` |

Client options: `persistSession: true`, `autoRefreshToken: true`.

Session identity consumed as `session.user.id` (UUID). There is no GHM-style `{ userId: number, role }` JWT payload in Connect.

### 2.2 Account provisioning

Sources:

- `supabase/migrations/20260718030909_establish_identity_foundation.sql`
- `supabase/migrations/20260830123000_persist_business_operator_intent.sql`

`AFTER INSERT ON auth.users` runs `handle_new_auth_user`, inserting `public.profiles`:

| Column | Notes |
|---|---|
| `id` | UUID PK = `auth.users.id` |
| `full_name` | from metadata |
| `role` | `customer` \| `contractor` \| `supplier` \| `admin` (CHECK); signup metadata accepts customer/contractor/supplier only — otherwise `customer` |
| `phone` | from metadata |
| `avatar_url` | nullable |
| `referral_code` | unique nullable |
| `business_operator_intent` | boolean, later migration |
| timestamps | `created_at`, `updated_at` |

Ownership: Supabase Auth owns user credentials/session; Connect DB owns the profile row.

### 2.3 Business membership and context

Source: `supabase/migrations/20260721023613_establish_business_membership_foundation.sql`.

- Table `business_memberships`: UUID FKs to `businesses` and `profiles`
- Roles: `owner`, `administrator`, `member`
- Status: `active`, `inactive`, `revoked`
- RPCs: `is_business_member`, `is_business_owner`, `has_business_permission`

Permission vocabulary (administrator): `business.read`, `business.manage`, `analytics.read`, `trust.read`. Member: `business.read`. Owner: all.

Client identity resolution: `src/features/authentication/identity.js`

- Canonical account role from `profiles.role`
- Active business from memberships + `sessionStorage` key `zc_active_business_id`
- One membership → auto-select; multiple → require selection (`BUSINESS_SELECTION_REQUIRED`)

There is no React `AuthContext` provider; hooks (`useAuth`) and app bootstrap compose identity from session + profile + memberships.

### 2.4 Logout / invalidation

`authService.signOut` → Supabase session cleared. No separate Connect server session store evidenced.

## 3. GHM identity chain

```text
Bearer JWT (HS secret)
→ jwt.verify → AuthContext { userId: number, role: admin|customer|business }
→ requireAuthenticatedContext / resource registry
→ service → withAuthorizedTransaction(context)
→ SQL binds context.userId
→ ghm_runtime least-privilege / SECURITY DEFINER functions
```

Sources: `src/auth/authorization.ts`, `src/auth/request-context.ts`, `database/migrations/20260909150000_create_business_identity.sql`.

| Concern | GHM |
|---|---|
| Account ID | `bigint` identity on `ghm.account_identity` |
| Business ID | `bigint` on `ghm.business` |
| Roles | `admin`, `customer`, `business` |
| Membership | `ghm.business_membership` with owner/administrator/member |
| Business selection | `BusinessIdentityService.resolveIdentity(selectedBusinessId)` |
| Provisioning | Account row must already exist; no `auth.users` trigger |

## 4. Comparison matrix

| Concern | Connect | GHM | Evidence of mapping |
|---|---|---|---|
| Identity key | UUID | bigint | **None found** |
| Business key | UUID | bigint | **None found** |
| Session | Supabase session | Application JWT | Not interchangeable |
| Who owns credentials | Supabase Auth | Unspecified / GHM JWT issuer | Separate ownership |
| Profile creation | Trigger on auth user | Manual/migrator account insert | Different |
| Role vocabulary | customer/contractor/supplier/admin | admin/customer/business | Not 1:1 |
| Permission model | Membership RPC permissions | Coarse GhmRole + membership manage checks | Parallel, not identical |
| Business context | Client + sessionStorage | Service selectedBusinessId | Conceptual parity only |

## 5. Evidence conclusions

1. Connect production identity is **UUID + Supabase Auth**.
2. GHM construction identity is **bigint + JWT AuthContext**.
3. **No stable cross-system identity mapping table or adapter exists** in either repository under audited paths.
4. Before GHM can back Connect, explicit evidence and authorization are required for: identity issuance ownership, UUID↔bigint mapping, role vocabulary mapping, session validation, and account bootstrap.
5. This audit does **not** authorize identity construction or adapter work.

## 6. Required future evidence (no implementation)

- Decision: retain Supabase Auth, replace it, or front GHM with a compatible issuer
- Mapping ownership and lifecycle for account/business IDs
- Role and permission vocabulary reconciliation
- Bootstrap path for first login / profile creation without `auth.users` trigger assumptions
