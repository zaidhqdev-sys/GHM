# GHM Storage Persistence Function Authority

## Decision

The `ghm.storage_object` table remains inaccessible for direct runtime DML. The runtime role receives `EXECUTE` only on the canonical storage lifecycle functions.

Those functions use PostgreSQL `SECURITY DEFINER` deliberately because the persistence boundary must perform narrowly scoped table mutations without granting the runtime role table DML.

## Security boundary

- `ghm_schema_owner` owns the storage schema objects.
- `ghm_schema_owner` is a non-login schema owner and is not the application runtime identity.
- `ghm_runtime` has no direct `INSERT`, `UPDATE`, or `DELETE` privilege on `ghm.storage_object`.
- Lifecycle functions use a fixed `search_path` of `pg_catalog, ghm`.
- `PUBLIC` execution is revoked explicitly.
- `ghm_runtime` receives `EXECUTE` only on the explicitly granted canonical storage persistence functions; see `GHM_STORAGE_PERSISTENCE_BOUNDARY.md` for the named lifecycle functions.
- The functions remain persistence-only; service-layer authorization is not delegated to PostgreSQL function privileges.

## Why SECURITY DEFINER is required here

`SECURITY INVOKER` cannot implement this boundary: the runtime caller has no table DML privilege by design, so lifecycle mutation would fail.

`SECURITY DEFINER` is therefore used as a controlled privilege boundary rather than as an authorization substitute. The owner is the non-login canonical schema owner, the function search path is fixed, and execution is restricted to the runtime role.

## Qualification gate

The storage persistence qualification must prove both sides of the boundary:

1. direct runtime table DML remains denied;
2. canonical lifecycle functions can perform only their permitted transitions;
3. invalid lifecycle transitions remain rejected;
4. the terminal deleted state is recorded;
5. no public function execution is available.

This persistence gate did not qualify provider credentials, object upload/download, tenant authorization, provider reconciliation, or backup/recovery. A later controlled live-provider data-path qualification passed signed upload/download, payload integrity, and deletion against Cloudflare R2; see `../evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-05.md`. Full service-level tenant/resource authorization, provider/orphan reconciliation, backup/recovery, HTTP/product exposure, and production provider enablement remain open.

## Documentation reconciliation

This decision reconciles the storage persistence boundary with the storage capability boundary, service contract, metadata schema, database authority model, and runtime authorization boundary.

No provider provisioning is authorized by this change.


## Account-scoped metadata lookup — proposed, not live-applied

Migration `20261026120000_scope_storage_metadata_lookup.sql` replaces the ID-only `storage_get_object(bigint)` with `storage_get_object(bigint,bigint)`. It returns an active public business-logo record only for an active business, or a record for which the supplied account has an active membership in the business; missing and unauthorized IDs share one error. The old unscoped signature is dropped, and runtime callers now pass `AuthContext.userId`. This is defense in depth, not a database-authenticated end-user identity: a shared runtime DB role can invoke a function with caller-supplied parameters, so application authorization must remain authoritative. Apply only through the normal reviewed migration process after CI, disposable-database tests, and migration-ledger reconciliation pass. No live database function was changed by this source commit.


## 2026-11-12 security-boundary reconciliation — persistence is not actor authorization

The original persistence qualification remains valid for its narrow claim: direct runtime table DML is denied and the SECURITY DEFINER functions preserve the storage lifecycle. It did **not** qualify database-authenticated end-user identity or protect against a holder of the shared `ghm_runtime` credential supplying another account/business/object ID directly to those functions. The earlier design deliberately left tenant authorization in the application service; that assumption is superseded for sensitive database operations by the approved isolated issuer / signed Actor Gateway trust-boundary direction in ADR-001 and the 10 November release-readiness handover.

The 12 November whole-database SECURITY DEFINER audit identified five non-public storage functions still directly executable by `ghm_runtime`: `storage_create_pending`, `storage_get_object`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`. Application authorization/provider checks remain defense in depth, but do not establish a database actor boundary for direct SQL invocation. This is an OPEN finding, not an approved exception.

Target remediation: add signed Actor Gateway wrappers for storage metadata create/read/availability/deletion operations. Each wrapper must verify the v2 one-use HMAC assertion and compare its signed context to the actual actor, tenant, object ID and operation arguments; enforce active actor and current owner/administrator membership where mutation is required; and preserve provider-side verification before marking an object available/deleted. Then add a manual-only cutover that revokes runtime EXECUTE on the five legacy functions. Keep `storage_get_public_business_logo` as the narrowly scoped public approved-logo lookup unless separate evidence requires changing it. Do not revoke the current grants until the replacement gateway path and disposable PostgreSQL qualification pass.

Required adversarial evidence: runtime direct invocation denied after cutover; cross-tenant object read denied; non-member pending-object creation denied; member-but-not-manager lifecycle mutations denied; forged/expired/replayed/wrong-operation/context-substituted assertions denied; provider metadata mismatch never reaches available state; authorized upload/completion/read/deletion workflows still pass; public approved-logo lookup remains functional. No production cutover is authorized. The production Render role-administration blocker, fresh-backup gate and no-paid-infrastructure hosting constraint remain independent release blockers.
