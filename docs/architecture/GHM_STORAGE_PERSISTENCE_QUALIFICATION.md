# GHM Storage Persistence Qualification

## Status

**QUALIFIED / PASS — 2026-10-05**

## Purpose

Qualify the narrow PostgreSQL persistence boundary for `ghm.storage_object`.

This qualification is intentionally provider-free. It proves database authority and lifecycle transitions before an object-storage adapter is introduced.

## Required runtime identity

The qualification must run as the intended `ghm_runtime` identity. It records both session and current role.

## Qualified evidence

The harness checks:

1. direct runtime INSERT is denied;
2. runtime has no direct INSERT/UPDATE/DELETE table privilege;
3. pending creation succeeds through the canonical function;
4. invalid lifecycle transition fails;
5. pending -> available succeeds;
6. available -> deletion_pending succeeds;
7. deletion_pending -> deleted succeeds;
8. final metadata records deleted state.

The qualification fails closed on unexpected direct table mutation. The completed runtime qualification passed the required direct-DML denial and lifecycle transition gates.

## Cleanup

The qualification creates one isolated probe object. The object is driven to the terminal `deleted` state rather than being removed from metadata, preserving lifecycle evidence.

## Scope

This qualification is intentionally provider-free and does not itself qualify provider credentials, object upload/download, signed URLs, tenant authorization, provider/object reconciliation, or backup/recovery.

The later controlled live-provider data-path result is recorded separately in `docs/evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-05.md`; it qualifies real signed upload/download, provider metadata observation, payload integrity, and deletion for that bounded test. It does not close the following remaining gates:

- full service-level tenant/resource authorization;
- failed-operation recovery and orphan/provider reconciliation;
- backup/recovery;
- HTTP/product exposure;
- deployment-managed production configuration;
- production provider enablement.

## Documentation reconciliation

The result must remain consistent with:

- storage capability boundary;
- storage service contract;
- storage metadata persistence boundary;
- GHM database authority;
- authorization/tenant-isolation contracts.

This persistence-only qualification does not authorize provider provisioning by itself. Controlled non-production Cloudflare R2 provider data-path qualification was subsequently completed as recorded in `../evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-05.md`. The November Resource API ↔ Actor Gateway storage metadata wiring is now implemented and passed disposable PostgreSQL 18 migration, adversarial dual-proof and legacy-grant rollback qualification. Production provider credential enablement and production revocation of the five legacy runtime grants remain separately gated.

## Qualification reconciliation — 2026-10-26

The migration runner completed successfully against the explicitly selected qualification database on 2026-10-26, and catalog checks confirmed the scoped `storage_get_object(bigint,bigint)` function, absence of the one-argument overload, owner-controlled `SECURITY DEFINER` lifecycle functions, runtime execute grants, and no direct runtime table DML grant. The authenticated storage API, scoped getter migration, migration safeguards, and disposable PostgreSQL lifecycle/tenant qualification were merged into `main` by PR #184 (merge commit `43450e42e902594493bdab4ba2c689b0c4099912`).

The live Cloudflare R2 provider data path was requalified on 2026-10-26; all reported checks passed, including upload, metadata observation, payload integrity, deletion, and absence confirmation. See `../evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-26.md`. The only bucket created so far is named `zaid-ghm-production`; this test does not prove that it is a dedicated non-production bucket.

Still open: deployed authenticated application/API end-to-end qualification, runtime/composition-root verification, any remaining guarded persistence qualification under the intended restricted role, production migration-ledger/DDL reconciliation, recovery/orphan handling, backups, and production enablement/cutover. The code merge is not a production deployment or authorization to change production configuration.


## 2026-11-12 security-boundary reconciliation — persistence is not actor authorization

## 12 November 2026 — Storage metadata authority status

The original persistence qualification remains valid for its narrow claim: direct runtime table DML is denied and the legacy SECURITY DEFINER functions preserve the storage lifecycle. It did not establish database-authenticated end-user identity. The 12 November audit correctly identified five legacy functions that remained directly executable by the shared `ghm_runtime` credential: `storage_create_pending`, `storage_get_object`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`.

**Source remediation is now implemented:**
- `gateway_storage_create_pending`, `gateway_storage_get_object`, and `gateway_storage_mark_deletion_pending` require the one-use signed Actor Gateway v2 assertion, validate the signed operation/context against database arguments, and enforce the actor's active Business membership and owner/administrator authority where mutation is required.
- `gateway_storage_mark_available` and `gateway_storage_mark_deleted` require both the user actor assertion and a separate domain-separated Resource API provider attestation. PostgreSQL verifies the 32-byte HMAC, operation, 60-second freshness, exact provider context and one-use nonce.
- The Actor Gateway has the corresponding authenticated routes and a dedicated database reader. The Resource API uses the HTTPS Storage Metadata Gateway client for metadata create/read/deletion-pending/availability/deletion operations and forwards the caller's bearer token. Production storage fails closed if the Actor Gateway URL or provider-attestation secret is missing; it cannot silently fall back to direct runtime metadata access.
- `storage_get_public_business_logo` remains the narrowly scoped public approved-logo lookup; this work does not broaden public storage access.

**Disposable qualification passed:** the migrations applied to PostgreSQL 18. The expanded provider dual-proof qualification now exercised signed pending-object creation and metadata read; private object access for an authorized Business member and cross-business private-read denial; non-member creation denial; ordinary-member deletion denial; legitimate pending → available → deletion-pending → deleted lifecycle; invalid provider signature; expired attestation; provider-context substitution; wrong provider operation; provider metadata mismatch without state transition; cross-business actor; nonce replay across different pending objects; and invalid lifecycle state. Verifier/secret ACL checks confirmed neither runtime nor Actor Gateway can read the secret or directly execute the verifier, while only Actor Gateway can execute the transition wrappers. A separate five-function cutover rehearsal revoked PUBLIC/runtime execution, confirmed runtime direct calls were denied, verified the replacement Actor Gateway wrappers remained executable, and restored the exact original ACL snapshot. The expanded qualification step passed in run `43235502697`; the remaining repository-wide issuer and database checks in that exact-head run were still running at this checkpoint. The preceding complete workflow passed in run `43233465264`.

**Current status: SOURCE REMEDIATION COMPLETE; DISPOSABLE QUALIFICATION PASSED; PRODUCTION CUTOVER OPEN.** The five legacy direct runtime grants have not been revoked in production. No production migration, provider secret provisioning, role change or deployment occurred. Production cutover still requires the documented fresh verified backup, production role-administration access, final operational approval and a separately reviewed manual execution/rollback window.

Disposable PostgreSQL 18 adversarial evidence now demonstrates: all five legacy direct functions are denied to runtime, migrator and Actor Gateway logins during the revocation rehearsal; the five signed replacement wrappers retain Actor Gateway execution; the original execution state is restored; cross-business private reads and mutations, non-member creation, ordinary-member deletion requests and disabled actors are denied; provider proof signature/expiry/context/operation/metadata mismatch and nonce replay are rejected; and the legitimate pending → available → deletion-pending → deleted metadata lifecycle succeeds. This database qualification does not by itself prove a fresh external provider upload/HEAD/read/delete end-to-end run or production recovery. No production cutover is authorized. The production Render role-administration blocker, fresh independently verified backup, operational/deployment/rollback approval and no-paid-infrastructure hosting constraint remain independent release blockers.
