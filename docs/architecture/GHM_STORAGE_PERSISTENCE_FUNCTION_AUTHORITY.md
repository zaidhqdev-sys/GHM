# GHM Storage Persistence Function Authority

## Decision

The `ghm.storage_object` table remains inaccessible for direct runtime DML. Historically, `ghm_runtime` received EXECUTE on five legacy SECURITY DEFINER metadata functions. Those legacy grants remain present pending the separately approved production cutover; the Resource API's current application path uses the signed Storage Metadata Actor Gateway instead. The constrained `storage_get_public_business_logo` projection remains a separate runtime-granted public read.

Those functions use PostgreSQL `SECURITY DEFINER` deliberately because the persistence boundary must perform narrowly scoped table mutations without granting the runtime role table DML.

## Security boundary

- `ghm_schema_owner` owns the storage schema objects.
- `ghm_schema_owner` is a non-login schema owner and is not the application runtime identity.
- `ghm_runtime` has no direct `INSERT`, `UPDATE`, or `DELETE` privilege on `ghm.storage_object`.
- All 103 SECURITY DEFINER routines in the latest disposable PostgreSQL 18.6 inventory use the fixed `search_path` `pg_catalog, ghm, pg_temp`; the five legacy storage functions and five signed gateway wrappers follow this standard.
- `PUBLIC` execution is revoked explicitly.
- `ghm_runtime` retains historical EXECUTE on the five legacy storage metadata functions and the separate constrained public approved-logo lookup. The current Resource API path does not use those legacy functions directly; it calls the signed Actor Gateway wrappers. See `GHM_STORAGE_PERSISTENCE_BOUNDARY.md` for the exact function boundary.
- The five legacy functions remain persistence-only and do not establish database-authenticated actor authority. The replacement gateway wrappers validate signed JWT-derived actor assertions, operation/argument binding, active account state and Business membership/manager authority inside PostgreSQL. Provider-confirmed transitions additionally require the separate Resource API HMAC attestation.

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


## Historical account-scoped metadata lookup — applied and superseded

Historical getter-scope checkpoint: migration `20261026120000_scope_storage_metadata_lookup.sql` replaces the ID-only `storage_get_object(bigint)` with `storage_get_object(bigint,bigint)` and checks active public visibility or supplied-account membership. This remains defense in depth for the legacy function, not a database-authenticated actor identity. The new `gateway_storage_get_object` wrapper verifies the signed Actor Gateway assertion and is the application-facing read path. Production still retains the legacy runtime grant until the separately approved cutover; disposable PostgreSQL 18 revocation and rollback have passed for PUBLIC, runtime, migrator and Actor Gateway direct execution.


## 2026-11-12 security-boundary reconciliation — persistence is not actor authorization

## 12 November 2026 — Storage metadata authority status

The original persistence qualification remains valid for its narrow claim: direct runtime table DML is denied and the legacy SECURITY DEFINER functions preserve the storage lifecycle. It did not establish database-authenticated end-user identity. The 12 November audit correctly identified five legacy functions that remained directly executable by the shared `ghm_runtime` credential: `storage_create_pending`, `storage_get_object`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`.

**Source remediation is now implemented:**
- `gateway_storage_create_pending`, `gateway_storage_get_object`, and `gateway_storage_mark_deletion_pending` require the one-use signed Actor Gateway v2 assertion, validate the signed operation/context against database arguments, and enforce the actor's active Business membership and owner/administrator authority where mutation is required.
- `gateway_storage_mark_available` and `gateway_storage_mark_deleted` require both the user actor assertion and a separate domain-separated Resource API provider attestation. PostgreSQL verifies the 32-byte HMAC, operation, 60-second freshness, exact provider context and one-use nonce.
- The Actor Gateway has the corresponding authenticated routes and a dedicated database reader. The Resource API uses the HTTPS Storage Metadata Gateway client for metadata create/read/deletion-pending/availability/deletion operations and forwards the caller's bearer token. Production storage fails closed if the Actor Gateway URL or provider-attestation secret is missing; it cannot silently fall back to direct runtime metadata access.
- `storage_get_public_business_logo` remains the narrowly scoped public approved-logo lookup; this work does not broaden public storage access.

**Disposable qualification passed:** the migrations applied to PostgreSQL 18. The expanded provider dual-proof qualification now exercised signed pending-object creation and metadata read; private object access for an authorized Business member and cross-business private-read denial; non-member creation denial; ordinary-member deletion denial; legitimate pending → available → deletion-pending → deleted lifecycle; invalid provider signature; expired attestation; provider-context substitution; wrong provider operation; provider metadata mismatch without state transition; cross-business actor; nonce replay across different pending objects; and invalid lifecycle state. Verifier/secret ACL checks confirmed neither runtime nor Actor Gateway can read the secret or directly execute the verifier, while only Actor Gateway can execute the transition wrappers. A separate five-function cutover rehearsal revoked PUBLIC, runtime, migrator and Actor Gateway execution, confirmed direct calls were denied for runtime/migrator/Actor Gateway logins, verified the five replacement Actor Gateway wrappers remained executable, and restored the original execution state. The expanded storage qualification and complete repository workflow passed in run `43237334881` (960/960 main test suite; both CI jobs passed).

**Current status: SOURCE REMEDIATION COMPLETE; DISPOSABLE QUALIFICATION PASSED; PRODUCTION CUTOVER OPEN.** The five legacy direct runtime grants have not been revoked in production. No production migration, provider secret provisioning, role change or deployment occurred. Production cutover still requires the documented fresh verified backup, production role-administration access, final operational approval and a separately reviewed manual execution/rollback window.

Disposable PostgreSQL 18 adversarial evidence now demonstrates: all five legacy direct functions are denied to runtime, migrator and Actor Gateway logins during the revocation rehearsal; the five signed replacement wrappers retain Actor Gateway execution; the original execution state is restored; cross-business private reads and mutations, non-member creation, ordinary-member deletion requests and disabled actors are denied; provider proof signature/expiry/context/operation/metadata mismatch and nonce replay are rejected; and the legitimate pending → available → deletion-pending → deleted metadata lifecycle succeeds. This database qualification does not by itself prove a fresh external provider upload/HEAD/read/delete end-to-end run or production recovery. No production cutover is authorized. The production Render role-administration blocker, fresh independently verified backup, operational/deployment/rollback approval and no-paid-infrastructure hosting constraint remain independent release blockers.
