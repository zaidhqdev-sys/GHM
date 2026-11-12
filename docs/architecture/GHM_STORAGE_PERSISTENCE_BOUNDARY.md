# GHM Storage Persistence Boundary

## Status

**QUALIFIED — narrow runtime persistence boundary — 2026-10-05**

The storage metadata table is intentionally not directly writable by `ghm_runtime`.

Runtime storage lifecycle mutations are exposed through four narrowly scoped GHM-owned PostgreSQL functions:

- `ghm.storage_create_pending`
- `ghm.storage_mark_available`
- `ghm.storage_mark_deletion_pending`
- `ghm.storage_mark_deleted`

These are the legacy direct-runtime persistence functions. They remain controlled `SECURITY DEFINER` functions owned by non-login `ghm_schema_owner`, with fixed `search_path` and PUBLIC execution revoked. They do not independently establish end-user identity. The current Resource API path now uses signed Actor Gateway wrappers; until the separately approved production cutover revokes the five legacy grants, `ghm_runtime` retains its historical direct EXECUTE privileges.

## Security boundary

Direct table DML is denied to `ghm_runtime`; lifecycle execution is limited to the explicitly granted runtime function boundary.

Only the explicitly granted function executions are available to the runtime role.

This preserves the GHM principle that a runtime role receives the minimum persistence authority required by a canonical service contract.

## Lifecycle

The functions enforce the storage lifecycle:

`pending -> available -> deletion_pending -> deleted`

Invalid transitions fail closed.

The provider operation remains outside PostgreSQL. The application/storage adapter must only call the completion/deletion transition after the corresponding provider operation has been verified.

## Authorization

These legacy persistence functions do not replace application authorization. The newer signed Actor Gateway wrappers provide the database-side actor and tenant authorization boundary for application requests.

The storage service must authorize:

- authenticated caller;
- tenant/business membership;
- resource ownership/access;
- object class;
- object policy;

before invoking the persistence function.

The database function is a persistence boundary, not an authorization shortcut.

## Provider independence

No provider-specific credential, bucket, URL, or SDK type is persisted by this migration.

`provider_key` remains an opaque GHM-generated identifier.

## Qualification required

The persistence boundary was runtime-qualified on 2026-10-05: direct runtime DML denial, allowed lifecycle execution, invalid transition rejection, terminal deleted-state persistence, and restricted execution authority all passed.

Historical gate criteria:

1. migration applies cleanly;
2. runtime direct table DML fails;
3. allowed lifecycle functions succeed under `ghm_runtime`;
4. invalid lifecycle transitions fail;
5. `ghm_migrator` has no runtime storage mutation path;
6. tenant/resource authorization remains service-owned;
7. provider failure cannot produce false `available` or `deleted` state;
8. documentation remains reconciled.

No object provider provisioning or product integration is included.


## Metadata lookup scope follow-up

Historical getter-scope checkpoint: migration `20261026120000_scope_storage_metadata_lookup.sql` replaces `storage_get_object(bigint)` with the account-aware `storage_get_object(bigint,bigint)`, checking active public business-logo visibility or active membership. That change remains defense in depth for the legacy function because a shared runtime credential can supply arbitrary parameters. The newer `gateway_storage_get_object` wrapper instead verifies the signed Actor Gateway assertion and binds the object ID to the authenticated actor. The Resource API now uses that wrapper through the Actor Gateway client in production. The five legacy direct-runtime grants remain a production cutover item; their revocation and exact rollback have been qualified on disposable PostgreSQL 18.


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
