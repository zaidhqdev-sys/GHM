# Production Migration Dependency Matrix — 20 November 2026

**Status:** READ-ONLY DEPENDENCY ANALYSIS — no production batch authorized  
**Branch:** feat/actor-gateway-production-migration-batches  
**PR:** #298 (draft/open)  
**Target:** Render ghm-db / ghm_db, PostgreSQL 18  
**Execution manifest:** config/production-migration-batches.json = []

## Evidence boundary

Derived from the branch's 50-entry production pending inventory, migration SQL, Actor Gateway app/server, Resource API routers, and production role/service handovers. This is source-contract analysis, not proof of deployed service state.

Not established: exact deployed Resource API commit and route flags; deployed Actor Gateway service/URL (the owner-selected single Free-service form remains unsubmitted); live ledger/checksum match; live Gateway function catalogue/ACL; fresh recoverable backup; provider-authorized PostgreSQL role/migrator ACL remediation.

## Service and principal contracts

| Component | Contract | Required proof |
|---|---|---|
| Resource API | Existing GHM-Internal-Runtime; ghm_runtime; GHM_RUNTIME_DATABASE_URL; startup asserts session_user=current_user=ghm_runtime | Verify exact deployed commit, route flags and secret-to-role binding without disclosing secrets. Keep legacy access until each replacement route is live and rollback is defined. |
| Actor Gateway | One dedicated ghm-actor-gateway service; ghm_actor_gateway; GHM_ACTOR_GATEWAY_DATABASE_URL; capability assertion secret and ES256 public-key contract | Form remains unsubmitted. Require strict-TLS session_user=current_user=ghm_actor_gateway, exact startup ACL, /healthz, positive/negative routes, restart and cold-start recovery tests. Never put its DB URL on Resource API. |
| Migration operator | One-off runner; ghm_migrator then explicit SET ROLE ghm_schema_owner | No hosted migration service. Live preflight blocked by bootstrap membership authority and direct ACLs on 16 relations / 24 sequences. |
| Schema owner | ghm_schema_owner, NOLOGIN | No app/service/password. Preserve ownership and intended migrator SET membership. |
| Storage provider attestation | Actor Gateway login plus distinct provider workflow assertion | Prove provider assertion producer, secret custody and replay rejection; actor identity alone is insufficient. |
| Auth Issuer | Planned ghm_auth_issuer | Role and service absent in last recorded live snapshot; do not assume cutover. |
| PayFast | Separate ghm_payment_provider function boundary | PayFast remains paused; no activation or callback deployment is authorized. |

### Source route map

Actor Gateway routes are authenticated under /v1 and include actor/me; registration identity GET/PUT; admin capability list/draft/transition; supplier classification; Business profile; Business Capability/evidence; Saved Businesses; Business Hours; Trust Scores; Business Logo; Storage metadata lifecycle; Connect business provisioning; campaign/directory review; commercial document authority/approval and payment preparation.

Resource API branch routers include /api/v1/businesses/:businessId/registration-identity, /api/v1/business-capabilities, /api/v1/saved-businesses and storage/logo routes. Gateway clients are conditional and can be configured fail-closed. Before cutover verify production flags and prove no route silently falls back to legacy runtime SQL when Gateway is required.

## Migration-by-migration dependency matrix

Pre-service = schema/function creation before traffic switches. Cutover = runtime access is removed and the replacement must already be live. Support = compatibility/privilege change for an existing Resource API path. These labels do not define a batch boundary.

| Version | Migration | Dependency and gate |
|---|---|---|
| 20261110010000 | add_business_supplier_classification | Resource API / ghm_runtime compatibility; preserve legacy function until signed Gateway route is live. |
| 20261110100000 | create_account_onboarding_progress | Verify deployed onboarding API/schema compatibility and runtime table ACL needs. |
| 20261110120000 | create_business_relationship_outcome_read_models | Confirm read-model consumers; runtime is SELECT-only on new tables. |
| 20261110140000 | allow_pending_storage_object_cleanup | Verify storage lifecycle caller and cleanup semantics; SECURITY DEFINER runtime function. |
| 20261110160000 | add_admin_capability_catalogue_governance | Existing runtime capability routes initially use legacy functions; signed Gateway replacement follows. |
| 20261110210000 | add_actor_gateway_principal_guard | Requires existing LOGIN/NOINHERIT non-elevated role and exact bounded bootstrap membership shape; provider authority remains unresolved. |
| 20261110220000 | add_actor_gateway_self_identity_read | Principal guard; early ID-based wrapper is not yet signed; do not expose before later assertion binding. |
| 20261110230000 | add_gateway_business_registration_identity_read | Principal guard and route contract; signed assertion binding follows. |
| 20261110233000 | add_gateway_business_registration_identity_write | Legacy runtime function and Gateway wrapper coexist; keep legacy path until signed replacement and route are ready. |
| 20261110240000 | enforce_capability_catalogue_cross_row_invariants | Preflight existing catalogue rows against new invariants; trigger owner/search_path and write compatibility. |
| 20261110250000 | add_gateway_capability_governance | Initial ID-based Gateway functions; signed assertion/request-context bindings follow. |
| 20261110260000 | gateway_supplier_classification_cutover | Revokes legacy runtime supplier RPC before signed binding at 20261111030000. Must not be independently executed or exposed in an intermediate state. |
| 20261110265000 | reconcile_business_profile_legacy_contract | Validate Business profile schema/patch compatibility; retain runtime function until signed replacement. |
| 20261110270000 | gateway_business_profile_update | Revokes legacy runtime profile RPC before signed binding at 20261111040000. Must be coordinated with signed binding and service cutover. |
| 20261111020000 | bind_capability_gateway_actor_to_signed_assertion | Gateway-only HMAC secret, nonce replay protection, operation binding and negative tests. |
| 20261111030000 | bind_supplier_gateway_actor_to_signed_assertion | Signed supplier.classification.update operation; exact route/function signature must match. |
| 20261111040000 | bind_business_profile_gateway_actor_to_signed_assertion | Signed business.profile.update; exact route/function signature must match before runtime revocation is relied upon. |
| 20261111050000 | bind_registration_and_self_identity_to_signed_gateway_actor | Signed actor identity and registration read/write operations; Resource API client mapping and negative tests. |
| 20261111060000 | bind_gateway_assertions_to_request_context | Replaces assertion contract with context-bound signature and expanded operation allowlist; all Gateway callers must use matching payload/version. |
| 20261111070000 | add_signed_business_capability_mutations | Requires request-context verifier; signed capability replace/verify/evidence submit/review operation names must match routes. |
| 20261111100000 | add_signed_saved_business_gateway | Requires request-context assertions; Resource API Saved Business client must target Gateway before any future legacy revoke. |
| 20261111130000 | add_signed_business_hours_gateway | Requires signed business.hours.replace operation and compatible member read/write routes. |
| 20261111140000 | add_business_hours_read_projections | Verify signed private member read and safe public projection; confirm Resource API public consumers. |
| 20261111150000 | add_signed_trust_score_gateway | Requires signed trust.score.calculate operation; runtime public projection is a separate contract. |
| 20261111160000 | add_signed_business_logo_gateway | Requires signed logo binding and canonical storage object identity; coordinate upload completion flow. |
| 20261111170000 | add_trust_score_read_projections | Verify public projection exposure and signed Gateway member read semantics. |
| 20261111210000 | revoke_runtime_account_external_identity_table_access | Confirm auth uses retained SECURITY DEFINER functions; no direct table/sequence consumers remain. |
| 20261111220000 | revoke_unused_auth_runtime_entry_points | Prove deployed Resource API/clients do not call auth_revoke_session, auth_change_password or auth_disable_account. |
| 20261111230000 | add_token_bound_recovery_revocation_result | Verify recovery implementation and deployed route compatibility before relying on new result semantics. |
| 20261111240000 | revoke_runtime_quoteflow_migration_provisioning | Confirm no active migration/provisioning caller remains; re-sign-up policy alone does not prove callers are gone. |
| 20261111250000 | revoke_runtime_external_identity_link | Prove identity-link flow no longer calls the direct runtime function. |
| 20261111260000 | revoke_runtime_external_identity_bootstrap | Prove onboarding/registration no longer depends on runtime external-identity bootstrap. |
| 20261112020000 | add_token_bound_password_recovery_reset | Verify deployed reset route uses token hash, one-use binding and current password policy. |
| 20261112030000 | add_conditional_password_rehash | Verify login path uses conditional compare-and-update; test concurrency and unchanged-hash behaviour. |
| 20261112040000 | revoke_runtime_quoteflow_reset_enrollment_registration | Prove reset-enrollment route no longer invokes function; validate support/recovery behaviour. |
| 20261112050000 | revoke_public_default_function_execution | Global PUBLIC EXECUTE change; requires complete live function/grant inventory and explicit allowlist for every deployed principal. |
| 20261112070000 | revoke_legacy_unsigned_actor_gateway_overloads | Requires signed verifier and all dependent operations installed/tested; prove no client calls ID-only assert_actor_gateway(bigint). |
| 20261112080000 | signed_connect_business_provisioning_gateway | Signed business.connect.provision replaces direct mapping helper; verify Resource API onboarding client targets Gateway; do not assume Auth Issuer exists. |
| 20261112090000 | pin_security_definer_search_path | Catalogue-wide ownership and SECURITY DEFINER preflight; postflight every privileged function has ghm_schema_owner and pinned pg_catalog, ghm, pg_temp. |
| 20261112140000 | add_signed_storage_metadata_actor_gateway | Requires request-context signed assertion and correct storage ownership/create/read/deletion route mapping. |
| 20261112150000 | add_storage_provider_workflow_attestation | Requires both actor assertion and distinct provider signature/nonce/context; prove producer, secret custody and replay rejection. |
| 20261112170000 | revoke_redundant_migrator_business_mapping_lookup | Confirm migration runner does not use direct lookup and SET ROLE owner path remains sufficient; does not resolve wider migrator ACL blocker. |
| 20261116140000 | generalize_commercial_payment_provider_code | Verify existing payment-attempt rows and constraints; does not authorize provider activation. |
| 20261116150000 | create_commercial_consent_evidence | Validate immutable document/status/consent evidence tables, triggers, owner and grants; no ungoverned direct writes. |
| 20261116160000 | add_commercial_document_approval_authority | Validate immutable scoped grant/revoke ledger and event references; no approval route before signed Gateway functions. |
| 20261116170000 | add_founder_only_commercial_document_authority_gateway | Requires founder bootstrap state and signed one-use assertion; SQL derives canonical founder actor, not caller-supplied approver. |
| 20261116180000 | add_founder_only_commercial_document_approval_transition | Requires active scoped founder grant, latest draft status, operation-specific assertion and exact immutable version. |
| 20261116190000 | add_commercial_consent_payment_prepare_gateway | Requires approved exact version, explicit consent, idempotency and signed assertion; remains pending_checkout/trialing; no provider call. |
| 20261117010000 | revoke_runtime_business_registration_identity_write | Explicit post-deployment cutover; SQL preflights signed Gateway function, owner and Gateway EXECUTE before revoking runtime. Requires live route and rollback plan. |
| 20261117020000 | revoke_runtime_capability_governance | Explicit post-deployment cutover; preflights signed verifier, four Gateway operations, owner, SECURITY DEFINER, pinned path, Gateway EXECUTE and runtime denial. |

## Ordering hazards

1. Supplier and Business Profile revocations at 20261110260000 and 20261110270000 precede signed replacements at 20261111030000 and 20261111040000. Their intermediate state is not a deployable service cutover. Treat as one reviewed, non-interruptible migration/deployment window or redesign and requalify the SQL sequence. Never select either revocation independently.
2. Do not expose the initial ID-only Gateway wrappers. Traffic requires the signed verifier, operation wrappers, nonce/context rules and startup ACL contract.
3. Do not revoke Auth runtime functions by timestamp. Map each exact Resource API route/caller and prove the deployed commit no longer calls it. Auth Issuer is absent in the last recorded live inventory.
4. PUBLIC EXECUTE revocation needs a complete live function/grant inventory and explicit allowlist for every deployed principal.
5. pin_security_definer_search_path is catalogue-wide; require live owner inventory and exact postflight.
6. Storage provider attestation is a two-party proof; Actor Gateway identity is not provider proof.
7. Commercial payment preparation is not payment activation. PayFast remains paused.
8. 20261117010000 and 20261117020000 are final post-deployment runtime revocations requiring live route, principal and ACL evidence.

## Batch decision

No safe first production batch can be approved. There is no verified deployed service commit/route matrix, fresh live ledger/checksum reconciliation, verified recoverable backup, or resolution of PostgreSQL bootstrap/migrator authority and Gateway identity/ACL readiness.

Keep the manifest exactly []. Keep PR #298 draft/unmerged. Do not run production SQL, change roles/ACLs, submit/deploy the Gateway form, or alter existing Render services. No new paid resource is required or authorized. PayFast remains paused.
