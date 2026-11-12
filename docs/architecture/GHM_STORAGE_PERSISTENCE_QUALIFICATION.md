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

This persistence-only qualification does not authorize provider provisioning by itself. Controlled non-production Cloudflare R2 provider data-path qualification was subsequently completed as recorded in `../evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-05.md`; production provider enablement and application wiring remain separately gated.

## Qualification reconciliation — 2026-10-26

The migration runner completed successfully against the explicitly selected qualification database on 2026-10-26, and catalog checks confirmed the scoped `storage_get_object(bigint,bigint)` function, absence of the one-argument overload, owner-controlled `SECURITY DEFINER` lifecycle functions, runtime execute grants, and no direct runtime table DML grant. The authenticated storage API, scoped getter migration, migration safeguards, and disposable PostgreSQL lifecycle/tenant qualification were merged into `main` by PR #184 (merge commit `43450e42e902594493bdab4ba2c689b0c4099912`).

The live Cloudflare R2 provider data path was requalified on 2026-10-26; all reported checks passed, including upload, metadata observation, payload integrity, deletion, and absence confirmation. See `../evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-26.md`. The only bucket created so far is named `zaid-ghm-production`; this test does not prove that it is a dedicated non-production bucket.

Still open: deployed authenticated application/API end-to-end qualification, runtime/composition-root verification, any remaining guarded persistence qualification under the intended restricted role, production migration-ledger/DDL reconciliation, recovery/orphan handling, backups, and production enablement/cutover. The code merge is not a production deployment or authorization to change production configuration.


## 2026-11-12 security-boundary reconciliation — persistence is not actor authorization

The original persistence qualification remains valid for its narrow claim: direct runtime table DML is denied and the SECURITY DEFINER functions preserve the storage lifecycle. It did **not** qualify database-authenticated end-user identity or protect against a holder of the shared `ghm_runtime` credential supplying another account/business/object ID directly to those functions. The earlier design deliberately left tenant authorization in the application service; that assumption is superseded for sensitive database operations by the approved isolated issuer / signed Actor Gateway trust-boundary direction in ADR-001 and the 10 November release-readiness handover.

The 12 November whole-database SECURITY DEFINER audit identified five non-public storage functions still directly executable by `ghm_runtime`: `storage_create_pending`, `storage_get_object`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`. Application authorization/provider checks remain defense in depth, but do not establish a database actor boundary for direct SQL invocation. This is an OPEN finding, not an approved exception.

Target remediation: add signed Actor Gateway wrappers for storage metadata create/read/availability/deletion operations. Each wrapper must verify the v2 one-use HMAC assertion and compare its signed context to the actual actor, tenant, object ID and operation arguments; enforce active actor and current owner/administrator membership where mutation is required; and preserve provider-side verification before marking an object available/deleted. Then add a manual-only cutover that revokes runtime EXECUTE on the five legacy functions. Keep `storage_get_public_business_logo` as the narrowly scoped public approved-logo lookup unless separate evidence requires changing it. Do not revoke the current grants until the replacement gateway path and disposable PostgreSQL qualification pass.

Required adversarial evidence: runtime direct invocation denied after cutover; cross-tenant object read denied; non-member pending-object creation denied; member-but-not-manager lifecycle mutations denied; forged/expired/replayed/wrong-operation/context-substituted assertions denied; provider metadata mismatch never reaches available state; authorized upload/completion/read/deletion workflows still pass; public approved-logo lookup remains functional. No production cutover is authorized. The production Render role-administration blocker, fresh-backup gate and no-paid-infrastructure hosting constraint remain independent release blockers.
