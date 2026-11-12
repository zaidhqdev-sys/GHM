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

`SECURITY DEFINER` is used as a controlled privilege boundary rather than as an authorization substitute. The legacy direct persistence functions remain owned by the non-login canonical schema owner with fixed search paths and historical runtime EXECUTE grants. The newer signed gateway wrappers are separately owned by `ghm_schema_owner`, grant EXECUTE only to `ghm_actor_gateway`, and establish actor/tenant authority checks inside PostgreSQL.

## Qualification gate

The storage persistence qualification must prove both sides of the boundary:

1. direct runtime table DML remains denied;
2. canonical lifecycle functions can perform only their permitted transitions;
3. invalid lifecycle transitions remain rejected;
4. the terminal deleted state is recorded;
5. no public function execution is available.

Historical scope of the October persistence gate: it did not qualify provider credentials, object upload/download, tenant authorization, provider reconciliation, or backup/recovery. A later controlled live-provider data-path qualification passed signed upload/download, payload integrity, and deletion against Cloudflare R2; see `../evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-05.md`. The November signed Actor Gateway storage wrappers and Resource API gateway integration now implement and pass disposable PostgreSQL 18 tenant/actor authorization qualification. Provider/orphan reconciliation, backup/recovery, production provider enablement, and production legacy-grant cutover remain open.

## Documentation reconciliation

This decision reconciles the storage persistence boundary with the storage capability boundary, service contract, metadata schema, database authority model, and runtime authorization boundary.

No provider provisioning is authorized by this change.


## Account-scoped metadata lookup — proposed, not live-applied

Historical getter-scope checkpoint: migration `20261026120000_scope_storage_metadata_lookup.sql` replaces the ID-only `storage_get_object(bigint)` with `storage_get_object(bigint,bigint)` and checks active public visibility or supplied-account membership. This remains defense in depth for the legacy function, not a database-authenticated actor identity. The new `gateway_storage_get_object` wrapper verifies the signed Actor Gateway assertion and is the application-facing read path. Production still retains the legacy runtime grant until the separately approved cutover; disposable PostgreSQL 18 revocation and exact rollback have passed.


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

Required adversarial evidence: runtime direct invocation denied after cutover; cross-tenant object read denied; non-member pending-object creation denied; member-but-not-manager lifecycle mutations denied; forged/expired/replayed/wrong-operation/context-substituted assertions denied; provider metadata mismatch never reaches available state; authorized upload/completion/read/deletion workflows still pass; public approved-logo lookup remains functional. No production cutover is authorized. The production Render role-administration blocker, fresh-backup gate and no-paid-infrastructure hosting constraint remain independent release blockers.
