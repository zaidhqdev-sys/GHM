# Signed Business Capability Create — Feature Handover

Date: 2026-11-20
Feature branch: `feat/signed-business-capability-create`
Base: current `main`
Related but separate: PR #298, production migration batching

This handover records the signed append-only Business Capability create work. It is deliberately separate from PR #298.

## Business Capability create-route correction — 2026-11-20

This is a separate Resource API / Actor Gateway feature gap, not part of the production migration-batch runner scope of PR #298. Do not mix the feature implementation into this migration-runner PR.

### Existing implementation confirmed from merged PR #272 / current main

- `PUT /api/v1/business-capabilities` uses the signed Actor Gateway replacement operation `business.capability.replace`.
- `PATCH /api/v1/business-capabilities/:businessCapabilityId/verification` uses the signed Gateway verification operation.
- `POST /api/v1/business-capabilities` still calls `BusinessCapabilityService.createBusinessCapability()`, whose PostgreSQL repository performs a direct INSERT into `ghm.business_capability` under the Resource API runtime transaction.
- The existing signed Gateway migration `20261111070000_add_signed_business_capability_mutations.sql` implements replacement, verification, evidence review and evidence submission. It does not implement a signed single-assertion create operation.
- The existing HMAC assertion verifier already recognizes the operation name `business.capability.create`, but the current `GatewayCapabilityMutationReader` operation union and methods do not expose it. Merely allowing the operation string in the verifier is not an implementation.

### Required separate feature work

Create a dedicated feature branch/PR based on current main; do not change PR #298's migration-batch scope.

Before authoring the SQL migration, inspect the canonical `ghm.business_capability` table DDL, all constraints/indexes, the existing create repository validation, and the SECURITY DEFINER helper functions it can safely reuse. The new SQL operation must preserve the POST contract (including `effectiveFrom`, `effectiveUntil`, proficiency, description and source reference), derive actor identity from the signed assertion, verify active owner/administrator membership and selectable active catalogue capability, perform exactly one append-style INSERT, and preserve existing duplicate/withdrawn-row semantics. Do not implement by calling the bulk replacement function.

Required SQL qualification on the existing disposable PostgreSQL harness: valid owner/admin insert; non-member and non-admin denial; inactive business/capability denial; invalid/expired/forged/replayed assertion denial; exact context mismatch denial; duplicate/withdrawn-row behavior matching the existing unique constraint; rollback on failure; runtime direct INSERT/sequence denial after the later cutover. Keep the runtime grant unchanged until the route is wired and the separate cutover is qualified.

### Scope and safety

- This work is not included in PR #298's 50-entry migration inventory or its empty production execution manifest.
- Do not add a production batch or run any production migration.
- No deployment, Render change, credential/secret change, paid resource, new database, or recurring process is authorized by this handover.
- The previous conversational plan to implement SQL first is retained only as a task sequence; implementation must wait until the table DDL and repository contract are fully inspected on the dedicated feature branch.

## Business Capability signed-create source inspection — 2026-11-20

Inspected the canonical current-main sources before implementation. No SQL or application code was changed in this pass.

### Confirmed current contracts

- Resource API POST is `POST /api/v1/business-capabilities`; it parses and permits exactly `businessId`, `capabilityId`, `proficiencyLevel`, `description`, `effectiveFrom`, `effectiveUntil`, and `sourceReference`. It currently calls `service.createBusinessCapability(context, input)` directly and does not consult `gatewayRequired`. This confirms the production-required bypass.
- The create contract excludes caller-controlled lifecycle/verification fields. `createdBy`, assertion status/basis, verification status, submitted/verified timestamps and verifier fields are server-governed.
- The canonical table's relevant uniqueness behavior is exercised by the existing replacement SQL: `ON CONFLICT (business_id, capability_id) DO UPDATE`. Replacement can reactivate an existing withdrawn row. A new create operation must not reuse that upsert path; a plain INSERT should preserve duplicate rejection for either active or withdrawn existing rows.
- Existing signed SQL migration `20261111070000_add_signed_business_capability_mutations.sql` recognizes `business.capability.create` in the assertion verifier's operation allowlist, but its Gateway reader's TypeScript `Operation` union and interface have only replace, verify, evidence review and evidence submit. No signed create SQL wrapper or reader method is present.
- Existing assertion verification checks `session_user='ghm_actor_gateway'`, HMAC, 60-second expiry, active account, and nonce replay. The create wrapper must bind its full canonical payload in the signed context and derive actor only from the verified assertion.
- Existing replacement SQL checks active Business membership and owner/administrator role, verifies selectable active catalogue entries, and performs broad replacement/upsert. It is not safe to call for single-item create.
- Existing manual cutover `20261111030000_revoke_legacy_business_capability_runtime_mutations.sql` revokes Evidence INSERT/sequence access and legacy mutation function EXECUTE. It does not revoke `ghm.business_capability` INSERT or its identity sequence. Do not infer that those create ACLs are already cut over.

### Remaining pre-implementation inspection

The table's original CREATE TABLE migration and exact constraints/defaults/indexes, plus the full `PostgresBusinessCapabilityRepository.createBusinessCapability` implementation and its existing lifecycle qualification fixture, still need to be fetched and reviewed together. The signed create SQL must match that repository's exact normalization, date validation and returned-row mapping before implementation.

### Scope

Keep this as a separate Resource API / Actor Gateway feature branch and PR, based on current main. It is not part of PR #298's production migration inventory. No migration batch, production execution, deployment, Render change, secret change, new database/service, paid resource, or recurring process is authorized. Preserve the existing runtime INSERT/sequence grants until the new signed route and later manual cutover are separately qualified.

## Business Capability create contract — repository/service validation inspected — 2026-11-20

Inspected current-main `src/resources/business-capability/repository.ts` and `service.ts`. No implementation code or SQL was changed in this pass.

### Exact service validation to preserve

- Authenticated context required.
- `businessId`: positive safe integer.
- `capabilityId`: UUID matching the existing version/variant regex.
- `proficiencyLevel`: null/omitted or one of `foundational`, `proficient`, `advanced`, `expert`.
- `description`: null/omitted or trimmed length 1–1000.
- `sourceReference`: null/omitted or trimmed length 1–500.
- `effectiveFrom`: omitted or a valid Date.
- `effectiveUntil`: omitted/null or a valid Date.
- When both are Dates, `effectiveUntil` must be later than `effectiveFrom`.

### Exact repository behavior

- Opens `withTenantTransaction(context, businessId, ...)`.
- Requires resolved tenant membership role `owner` or `administrator`.
- Requires catalogue row with matching UUID, `lifecycle_status='active'` and `is_selectable=true`.
- Inserts only `business_id`, `capability_id`, `proficiency_level`, `description`, `effective_from`, `effective_until`, `source_reference`, `created_by`.
- Normalizes blank description/source reference using `NULLIF(btrim(value),'')`.
- Defaults effective_from using `COALESCE(input, now())`.
- Sets created_by from authenticated `context.userId`.
- Returns the canonical full BusinessCapability projection including lifecycle, verification and audit fields. Those fields are not caller inputs.

### Implementation implications

- Validate and normalize payload before signing; the Gateway must sign the exact canonical normalized values the SQL function consumes.
- SQL must derive actor from verified signed assertion, not accept a caller-supplied actor ID.
- Preserve the tenant and role checks inside the database function; HTTP/service checks are not a replacement.
- Preserve the effective-date ordering check in SQL as defense in depth.
- Plain INSERT must retain existing uniqueness rejection for both active and withdrawn rows; do not invoke replacement/upsert.
- Do not grant Resource API direct INSERT/sequence access after cutover; only the Gateway SQL function's owner-controlled execution should consume the identity sequence.

### Still outstanding before implementation

The exact original CREATE TABLE migration filename and complete DDL/default/check/index definitions have not yet been located in the current-main file inspection. The initial guessed paths were not found; do not treat that as evidence that constraints are absent. Search the migration history/PR #272 patches for the original table creation before authoring SQL. Also inspect the existing disposable `qualify-business-capability-gateway-cutover-postgres.mjs` fixture and tests to reuse its setup/assertion helpers.

No feature branch implementation or migration was created in this pass. Keep this feature separate from PR #298. No production execution, deployment, paid infrastructure, new database/service, or recurring process.

## Disposable Gateway cutover harness inspection — 2026-11-20

Inspected current-main `scripts/qualify-business-capability-gateway-cutover-postgres.mjs`, the signed mutation migration, the Gateway reader, router tests and migration contract test.

### Reusable harness behavior

- Requires three distinct URLs for runtime, Actor Gateway and migrator.
- Hard-fails unless qualification DB name is exactly `ghm_disposable_test` and host exactly `localhost`.
- Requires canonical base64 32-byte assertion secret.
- Uses migrator with `SET LOCAL ROLE ghm_schema_owner` for fixture setup/cleanup.
- Signs assertions with the same v2 HMAC format and calls the signed SQL functions using the Gateway pool.
- Existing coverage includes evidence submission/replay/tampering, membership denial, signed replacement/verification/review, runtime function denial, evidence table INSERT/sequence denial, and role privilege matrix.

### Coverage boundary

The existing script does NOT qualify signed single Business Capability creation. It creates the initial `ghm.business_capability` fixture directly through the migrator before applying the existing manual cutover, then tests the existing replacement/verification/evidence paths. Its current runtime privilege matrix covers Evidence INSERT, not Business Capability INSERT or its identity sequence.

The existing SQL migration's verifier allows `business.capability.create`, but no create SQL wrapper is defined. The existing reader Operation union and interface also lack a create method. Existing router tests cover PUT replacement fail-closed behavior, not POST create Gateway forwarding/fail-closed behavior.

### Important fixture/cleanup note

The qualification script cleanup runs in a finally block and deletes its fixture rows through the migrator, then closes all pools. Any new create qualification should follow this isolated-fixture discipline and explicitly clean up a created Business Capability row before its parent Business/capability/account rows. It must test a withdrawn duplicate as well as an active duplicate; plain INSERT must reject both under the current unique constraint.

### Original DDL search status

PR #272 contains the signed mutation/cutover and qualification additions, not the original Business Capability table creation. Several earlier capability-related commits were searched, but the original table CREATE migration has not yet been conclusively identified from current-main paths or these PRs. Do not infer constraints/defaults solely from the existing SELECT projection or repository insert. Continue locating the original migration by querying the full migration filename inventory/history; do not author the new SQL migration until its exact table DDL is established.

No code, SQL migration, test or feature branch was changed in this task. Keep the signed-create feature separate from PR #298. No production migration, deployment, new database/service, paid resource, CI dispatch or recurring process.

## Historical PR lineage search — Business Capability original DDL — 2026-11-20

Continued the requested handover/PR/branch review. The following historical PRs were checked by changed-file inventory and, where relevant, patches:

- PR #49 introduced the verification transition function and runtime lifecycle qualification, but not the base table creation.
- PR #103 adopted the existing Business Capability repository onto the durable tenant boundary; its changed-file inventory includes the repository and qualification script, but no table-creation migration.
- PR #213 introduced evidence lifecycle and replacement SQL migrations; it operates on the pre-existing `ghm.business_capability` table and is not its original DDL.
- PR #250 introduced catalogue governance, not the Business Capability assertion table.
- PR #272 introduced the signed Gateway mutation/cutover and its disposable qualification; it also does not contain the base table creation.

### Newly confirmed reusable behavior

PR #49's lifecycle qualification fixture demonstrates the canonical fixture setup and service behavior:
- owner account, admin verifier, customer account;
- approved/active Business and active owner membership;
- active selectable capability catalogue row;
- service create returns an initially `unverified` assertion with no verifier provenance;
- lifecycle transitions preserve assertion fields;
- cleanup deletes business-capability rows before Business, catalogue and account fixtures.

PR #213's replacement SQL confirms that the unique key `(business_id, capability_id)` is relied upon for conflict handling and that replacement deliberately uses upsert/reactivation semantics. The new create operation must remain a plain INSERT.

### Original DDL status and next search

The original table-creation migration is still not identified. Do not mistake later transition/replacement/evidence migrations for the table DDL. Next inspect the complete migration filename inventory through the repository tree/commit history (rather than guessing timestamped filenames), then fetch the exact original migration and verify its primary key identity mechanism, unique/check constraints, defaults, indexes and sequence ownership before implementing signed create SQL.

No application or SQL implementation was made in this task. The only change is this handover entry. PR #298 remains separate. No production operation, deployment, CI dispatch, paid resource, new database/service, or recurring process.

## Original Business Capability table DDL located — 2026-11-20

Located the exact original migration through the complete GitHub `database/migrations` directory inventory (rather than guessed filenames):

`database/migrations/20260916210000_create_business_capability.sql`

Also inspected the immediately following runtime narrowing migration:

`database/migrations/20260916213000_narrow_business_capability_runtime_insert.sql`

### Canonical DDL findings

- `id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`; owned identity sequence is `ghm.business_capability_id_seq`.
- `business_id` FK to `ghm.business(id)`, ON DELETE CASCADE.
- `capability_id` FK to `ghm.capability(id)`, ON DELETE RESTRICT.
- Unique constraint `business_capability_unique` on `(business_id, capability_id)`.
- Defaults: assertion_status `active`; assertion_basis `self_declared`; verification_status `unverified`; effective_from/submitted_at/created_at/updated_at `now()`.
- Check constraints cover proficiency enum, trimmed description 1–1000, assertion status, assertion basis, verification status, effective period, source reference 1–500, verification reason 1–1000, and consistent verification provenance.
- Two indexes: business/status/verification/effective_from/id and capability/status/verification/business.
- Table owner is `ghm_schema_owner`.
- Initial migration grants runtime SELECT and broad INSERT columns plus sequence USAGE; the next migration narrows INSERT to exactly business_id, capability_id, proficiency_level, description, effective_from, effective_until, source_reference, created_by. Runtime has no UPDATE/DELETE.

### Important consequence for the signed-create implementation

- A plain INSERT will use the identity sequence under the function owner; Resource API runtime direct sequence access is not needed by the eventual cutover.
- The existing unique constraint rejects both active and withdrawn duplicates; do not change the constraint or use ON CONFLICT.
- SQL must explicitly preserve `assertion_status='active'`, `assertion_basis='self_declared'`, `verification_status='unverified'`, `submitted_at=clock_timestamp()`, and signed-actor `created_by`; no caller-supplied verification/audit fields.
- The effective-period and text checks are already enforced by table constraints, but the new function should validate/normalize consistently with service behavior and return the canonical table row.
- Do not alter existing grants in this feature migration; direct INSERT/sequence revocation remains a separate post-route qualification/cutover task.

### Status

The original DDL and runtime narrowing history are now conclusively identified and inspected. This removes the previous blocker to designing the create SQL. No application or SQL implementation has been added yet. Next inspect the exact signed assertion helper/function signatures and transaction/context binding in the current Gateway migration before creating a dedicated feature branch and writing the function.

This is a separate Resource API / Actor Gateway feature and remains outside PR #298. No production migration, deployment, paid resource, database/service, recurring process, or CI dispatch.

## Signed Business Capability create — SQL implementation stage 1 — 2026-11-20

Created dedicated feature branch `feat/signed-business-capability-create` from current `main`. This is separate from PR #298 and the migration-batch branch.

### Implemented

Added `database/migrations/20261120010000_add_signed_business_capability_create.sql`.

The new `ghm.gateway_create_business_capability(bigint,bigint,uuid,text,text,jsonb)` SECURITY DEFINER entry point:

- Requires the existing `ghm_actor_gateway` session through `ghm.assert_actor_gateway_capability`.
- Uses the existing HMAC v2 assertion verifier with operation `business.capability.create`; actor identity is returned by the verifier, not trusted from unsigned payload data.
- Requires signed context JSON to match the complete payload exactly.
- Rejects unknown payload keys and validates positive Business ID, UUID, proficiency, description, source reference and effective timestamps.
- Checks active Business, active owner/administrator membership and active/selectable catalogue Capability inside SQL.
- Performs one plain INSERT, setting active/self_declared/unverified state and deriving `created_by` from the verified actor.
- Uses transaction timestamp defaults consistent with the existing Resource API repository.
- Leaves the unique constraint untouched; active and withdrawn duplicates both fail. It does not call replacement/upsert and does not reactivate withdrawn rows.
- Is owned by `ghm_schema_owner`; EXECUTE is revoked from PUBLIC, `ghm_runtime` and `ghm_migrator`, and granted only to `ghm_actor_gateway`.

### Explicitly not yet complete or qualified

This is SQL stage 1 only. No Gateway reader method, HTTP endpoint, Resource API POST forwarding/fail-closed change, harness test, or direct runtime INSERT/sequence cutover has been implemented yet. The new migration has not been applied to any database and has not been executed against disposable PostgreSQL. Treat it as unqualified source pending migration-contract tests and the existing disposable harness.

Next task: add a focused migration contract test, then extend the existing `qualify-business-capability-gateway-cutover-postgres.mjs` fixture to exercise the signed create SQL operation, authorization, invalid/expired/forged/replayed assertions, exact context binding, duplicates including withdrawn rows, rollback and actor attribution. Only after SQL qualification implement Gateway reader/HTTP/Resource API wiring. Preserve runtime grants until that entire path is qualified.

### Cost / production boundary

No database was created, no migration was applied, no production execution or deployment occurred, no CI was dispatched, and no paid/recurring resource was added. PR #298 remains untouched and separate.

## Signed Business Capability create — contract and disposable harness extended — 2026-11-20

Continued implementation on `feat/signed-business-capability-create`; PR #298 remains untouched.

### Changes committed on feature branch

- Added `src/db/actor-gateway-business-capability-create-migration-contract.test.ts` to verify canonical identity/unique constraint assumptions, append-only plain INSERT, exact signed context, active Business and owner/admin checks, selectable catalogue checks, server-derived lifecycle/provenance, and least-privilege EXECUTE grants.
- Registered the new compiled contract test in the package test command.
- Extended `scripts/qualify-business-capability-gateway-cutover-postgres.mjs` to apply the new migration only to its already enforced disposable localhost PostgreSQL target and qualify:
  - signed create and actor attribution;
  - normalized description/source reference;
  - initial active/self-declared/unverified state;
  - active duplicate rejection;
  - withdrawn duplicate rejection without reactivation;
  - non-management member denial;
  - signed-context payload tampering denial;
  - forged HMAC denial;
  - Resource API runtime denial from executing the new signed wrapper.
- Corrected Business ID validation to preserve the full positive JavaScript safe-integer range (up to 9007199254740991), rather than an unnecessarily restrictive 15-digit ceiling.

### Review notes

- Harness deliberately does NOT assert direct Resource API INSERT or identity-sequence denial yet. Those legacy grants are still in place and must remain until Gateway HTTP + Resource API wiring is complete and a separate cutover is qualified.
- The SQL migration has not been run against any PostgreSQL instance in this environment. The harness extension is authored but not executed. No test/CI result is claimed.
- Additional runtime cases still to add/verify in disposable PostgreSQL: expired assertion, replay nonce, invalid payload/date bounds, inactive Business, inactive/non-selectable Capability, rollback/no partial write, and exact runtime INSERT/sequence privilege matrix after the later separate cutover.
- Review of the current source indicates the new function uses the canonical table, existing HMAC v2 verifier, actor-gateway session principal, owner/admin membership and selectable catalogue checks. Do not treat static contract tests as proof of PostgreSQL behavior.

### Next task

Review the extended harness and SQL carefully, add the remaining adversarial cases, then execute only on the existing `ghm_disposable_test` localhost harness if its already-provisioned credentials and instance are available. Do not create or relaunch a database. If the disposable instance is unavailable, stop and record the qualification as blocked rather than substituting production or a paid database. After SQL qualification, add Gateway reader/HTTP/Resource API forwarding and fail-closed tests.

No production migration, production database access, deployment, Render modification, secret change, paid service, new database, recurring process or CI dispatch occurred.

## Handover ownership correction — 2026-11-20

The earlier capability notes had been appended to the PR #298 migration-batch handover branch. That was inappropriate scope coupling. Those capability notes have now been moved into this dedicated feature handover, and the PR #298 handover has been restored to its migration-batch-only content. Keep all future Business Capability create notes on this feature branch/hand-over file.

## SQL contract and disposable harness extension — 2026-11-20

### Feature commits

- SQL function initial implementation: `afded2ef2e9842617dad72f614190eba34e7a667`
- Timestamp and safe-integer corrections: `80182e529aeb4f12f2cd465f493d0a1230b3378a`, `570333e43e9659e46d8f3515d73f9010caa0be3d`
- Contract test: `0e77b0393dd340463ab8ff6e73712cead5bbde32`
- Package test registration: `4b112bbe69a4504128b65f1e3d73c888bba1384c`
- Disposable harness extension: `2314a4a8bf2f776f0dd88c3c8791c750c064e28a`

### Current authored test coverage

The migration contract test checks append-only plain INSERT, exact payload binding, existing signed operation recognition, active Business and owner/admin authorization, active/selectable catalogue checks, server-derived lifecycle and provenance, function ownership and Actor Gateway-only EXECUTE.

The existing disposable qualification script now applies the new migration only after its hard localhost/ghm_disposable_test guard and adds checks for signed create, actor attribution, field normalization, active duplicate rejection, withdrawn duplicate rejection, non-management member denial, payload tampering, forged HMAC and runtime inability to execute the signed wrapper.

The Business ID parser now allows the full positive JavaScript safe-integer range through 9007199254740991.

### Qualification status — not executed

No PostgreSQL instance was available through the GitHub source-editing workflow. Neither the migration nor the extended harness has been run. No CI was dispatched. Static source and contract review is not a substitute for PostgreSQL execution.

The existing harness deliberately does not claim direct runtime INSERT or identity-sequence denial; those grants remain unchanged until the HTTP/Resource API path is wired and a separate cutover is qualified.

### Next

1. Review the harness additions and migration as a whole.
2. Add missing adversarial PostgreSQL cases: expired assertion, replay nonce, invalid payload/date bounds, inactive Business, inactive/non-selectable Capability, and rollback/no partial write.
3. Run only against the existing localhost disposable `ghm_disposable_test` if already available; never create or relaunch a database. If unavailable, leave SQL unqualified and record the blocker.
4. After SQL qualification, implement Gateway reader, HTTP endpoint, Resource API POST forwarding and fail-closed behavior.
5. Only then qualify the separate runtime INSERT/identity-sequence revocation.

No production migration, production database access, deployment, Render change, secret change, paid service, new database, recurring process or CI dispatch.

## Verifier allowlist correction and adversarial cases — 2026-11-20

A deeper source review found the existing `assert_actor_gateway_capability` operation allowlist did not include `business.capability.create`, despite the create function calling it. This meant all create requests would fail closed. Corrected with a new forward-only migration rather than editing the earlier migration:

`database/migrations/20261120011000_allow_signed_business_capability_create_assertion.sql`

This replaces the verifier with the same HMAC v2/session/expiry/active-account/nonce-replay checks and adds the missing create operation. It preserves all existing allowlisted operations and least-privilege function grants.

The disposable harness now applies this allowlist migration before the create function migration and adds cases for expired assertion denial, same-nonce replay denial after a successful create, and invalid effective-period denial with no row written. Replay uses a fresh active selectable catalogue fixture so the first signed call succeeds and consumes the nonce before the second identical assertion is rejected.

### Review warning

The SQL/harness remain unexecuted. Do not call these cases passing. The harness has been source-edited only. Continue static review for correct fixture cleanup, migration order, and full test command registration before attempting execution against the existing localhost disposable DB. No new DB or paid service.

## Follow-up verifier and adversarial harness review — 2026-11-20

### Security defect found and corrected

Static review caught that the existing verifier migration's original operation allowlist did not include `business.capability.create`. The new create function would therefore have failed closed for every request. Added the forward-only migration `20261120011000_allow_signed_business_capability_create_assertion.sql`, which replaces the verifier while preserving the existing HMAC v2 checks, 60-second expiry, active-account check, nonce replay protection, constant-time signature comparison, session_user restriction and all pre-existing allowed operations. The create operation is now explicitly included. The original historical migration was not edited.

The migration inventory was checked on the feature branch; the two new migration versions are unique and ordered:
- `20261120010000_add_signed_business_capability_create.sql`
- `20261120011000_allow_signed_business_capability_create_assertion.sql`

### Harness cases now authored

In addition to the previously recorded signed create/actor provenance/normalization/duplicate/withdrawn/member/tamper/forged/runtime-wrapper cases, the harness now applies the verifier allowlist migration before the create-function migration and adds:
- expired assertion rejection;
- nonce replay rejection after a first successful create using the same exact assertion;
- invalid effective-period rejection and explicit no-row assertion;
- inactive Business denial;
- inactive catalogue Capability denial;
- active but non-selectable catalogue Capability denial.

The replay fixture uses its own active selectable catalogue row and is included in deterministic cleanup.

The migration contract test now asserts that the original verifier did not contain the create operation and that the forward-only follow-up migration adds it.

### Execution status

These are authored source tests only. No local PostgreSQL execution was possible through the connected GitHub source-editing workflow. No CI was dispatched. Do not describe any SQL/harness test as passing.

### Next review gate

Before Gateway reader integration:
1. Run static diff review over both migrations and the complete qualification script.
2. Run the registered normal test command locally if the user's existing working tree/dependencies are available, then run the disposable PostgreSQL harness only if the already-existing localhost `ghm_disposable_test` is available with its three distinct principals and assertion secret.
3. Never create/relaunch a database or use production as a substitute. If unavailable, keep the SQL stage explicitly unqualified.
4. Verify the create SQL's database object references and row-lock semantics against canonical current schema, then add reader/route/Resource API wiring only after SQL qualification.

No production database was accessed or changed; no migration was applied; no deployment, Render change, secret modification, CI dispatch, paid infrastructure, new database/service or recurring process occurred. PR #298 remains separate.

## Further static security review — catalogue race and test correction — 2026-11-20

### Catalogue state race closed

Review identified a time-of-check/time-of-use window: the create function previously checked that a catalogue Capability was active/selectable with `EXISTS`, but did not hold the catalogue row stable through the INSERT. A concurrent catalogue governance transaction could deactivate or make the Capability unselectable after the check but before insertion.

The create function now uses `PERFORM ... FOR SHARE` on the selected `ghm.capability` row and checks `FOUND`. This holds a row lock through the transaction, serializing the create against concurrent updates/deletion of that catalogue row. The migration contract test now requires this lock.

Commit: `a9f35058ab672c2c1549c7dacf898f80ede5d4aa`.

### Contract test corrected

The contract test now correctly verifies that the historical verifier migration does NOT include `business.capability.create`, and that the forward-only allowlist migration adds it while retaining the Actor Gateway-only EXECUTE grant. It also requires the catalogue `FOR SHARE` lock.

Commit: `6be9544bcf0f7cfdc5ea9ee4f99e9a42e79bf63`.

### Harness review notes

- The qualification script is a combined Business Capability gateway cutover harness. It applies the existing manual evidence/legacy-mutation cutover only inside its hard-guarded disposable localhost target. That cutover is not the new direct `business_capability` INSERT/sequence revocation; those original runtime grants remain untouched by the two new migrations.
- The existing cutover script itself explicitly says production use is gated on deployed/qualified signed routes, resolved Render role model and a fresh verified production backup. No such production cutover is authorized or performed here.
- The fixture includes the fresh replay Capability in deterministic cleanup. The invalid effective-period case checks no row exists for its new Business+Capability pair.
- The harness and migration contract test have still not been executed. GitHub source editing does not provide the local working tree, dependencies, or disposable PostgreSQL connection needed to run them. Do not infer a passing result from source review.

### Current next gate

1. Continue static review of SQL/harness and package test registration.
2. Execute source tests and the disposable PostgreSQL harness only from the existing local checkout if its installed dependencies and pre-existing `ghm_disposable_test` are available.
3. Do not create/relaunch a DB, use production, dispatch CI, deploy, or modify Render.
4. Do not begin Gateway HTTP/Resource API integration until PostgreSQL behavior is actually qualified.

No production access/change, migration execution, deployment, CI dispatch, paid resource, new database/service, secret change or recurring process occurred.


## Static review checkpoint — repository state reconciled — 2026-11-20

### Authoritative branch and PR state

Re-read the feature branch, commit history, main ref and PR #298 directly from GitHub before continuing.

- Feature branch: `feat/signed-business-capability-create`
- Feature branch HEAD: `0898ad69cf5dba6adaa920d7c484b9d76336be82`
- Feature branch comparison: 20 commits ahead of `main`, 0 behind.
- Main HEAD: `ddb31ff59ab470973edf60a5078a75e5f962f803`
- PR #298 remains open, draft, targets `main`, head `f2f3cbb9588dad8ac0fdd8477e7434f6fc3d4b60`, GitHub reports `mergeable=false`.
- The signed Business Capability feature remains a separate branch and has no PR in this checkpoint.

### Static review findings

Reviewed both new SQL migrations, the complete disposable qualification script, its package registration, and the existing manual cutover SQL.

1. The create function is a separate SECURITY DEFINER operation, derives the actor from `assert_actor_gateway_capability`, checks the active Business and owner/administrator membership, locks the selectable active catalogue row with `FOR SHARE`, and uses a plain INSERT. It does not use the replacement/upsert function.
2. The follow-up verifier migration adds `business.capability.create` while retaining the existing operation names shown in the migration. It retains the 60-second expiry, HMAC, active-account and nonce replay checks. This remains static review only; migration execution has not been observed.
3. The harness applies the verifier allowlist migration, then the create migration, then the existing manual cutover script against its guarded disposable target. It contains signed create, duplicate/withdrawn duplicate, authorization, inactive Business/Capability, non-selectable Capability, expiry, replay, invalid-date/no-row, payload-tampering, forged-signature and signed-wrapper-denial assertions.
4. The manual cutover SQL currently revokes Evidence INSERT/sequence access and legacy mutation function EXECUTE. It does **not** revoke direct INSERT or sequence access on `ghm.business_capability`. The harness's direct INSERT/sequence denial assertions are for Evidence, not Business Capability. Therefore direct Business Capability runtime ACL cutover remains unimplemented and unqualified; do not describe it as covered.
5. The SQL/harness test files are registered in `package.json`, but no local test or PostgreSQL harness execution result is available from this GitHub-only inspection. Authored tests are not passing tests.

### Next gate

- Keep the SQL stage explicitly unqualified until the existing local checkout can run the registered migration contract test and the disposable PostgreSQL harness against the already-existing disposable database and its three principals.
- Do not create or relaunch a database, use production, dispatch CI, deploy, or modify Render.
- Do not start Gateway reader/HTTP/Resource API integration until PostgreSQL behavior is actually qualified.
- After SQL qualification, design a separate Business Capability direct INSERT/identity-sequence ACL cutover and test it in the disposable harness; preserve current runtime grants until route integration and cutover are qualified.

No production database access/change, migration execution, deployment, CI dispatch, paid resource, new database/service, secret change or recurring process occurred.


## Follow-up static harness review — 2026-11-20

Re-read the complete qualification script from its first fixture through cleanup, both SQL migrations, package test registration, and the existing manual cutover SQL.

### Confirmed test ordering and scope

- The harness hard-guards three distinct connection URLs and the exact localhost disposable database name/host before opening pools.
- It provisions fixtures through the migrator principal under `SET LOCAL ROLE ghm_schema_owner`.
- It applies the verifier allowlist migration, then the signed create migration, then the pre-existing manual Evidence/legacy-mutation cutover, all through the disposable migrator connection.
- It then tests signed create, actor provenance, normalized fields, active duplicate rejection, expired assertion, nonce replay, invalid effective period/no-row, inactive Business, inactive Capability, unselectable Capability, payload tampering, forged signature, membership denial, signed replacement/evidence workflows, and the existing runtime wrapper/Evidence privilege boundaries.
- Cleanup deletes fixture Evidence, Business Capability assertions, Businesses, catalogue Capabilities and accounts, then closes all three pools.
- The package's `test` command includes the compiled migration contract test. The dedicated PostgreSQL qualification script is registered as `qualify:business-capability-gateway-cutover`.

### Explicit non-coverage retained

The harness's final privilege matrix checks the Evidence INSERT denial and existing wrapper EXECUTE permissions. It does not check:
- `has_table_privilege('ghm_runtime','ghm.business_capability','INSERT')`;
- column-level INSERT privileges on `ghm.business_capability`;
- `ghm.business_capability_id_seq` USAGE/SELECT privileges;
- corresponding PUBLIC or inherited-role effective access.

This is consistent with the current manual cutover SQL, which revokes Evidence INSERT/sequence privileges and legacy function EXECUTE only. The new signed create migration intentionally does not revoke Business Capability direct grants. This is an outstanding, separately gated cutover—not a passing or completed control.

### Execution limitation

The connected GitHub workflow exposes repository source operations, not the user's Windows checkout or localhost PostgreSQL sockets. The current execution environment also has no mounted GHM checkout. Therefore no package test, TypeScript build, SQL migration, or PostgreSQL qualification was executed in this task. No test result is inferred from static review.

### Next task

The immediate next step remains executing the registered migration contract test and guarded PostgreSQL qualification from the user's existing local checkout, if its already-existing disposable DB and all three principals are available. If unavailable, keep the feature SQL unqualified and request the local command output; do not create a database or use production. Only after a genuine SQL pass should Gateway reader/HTTP/Resource API integration begin.

No production access/change, migration execution, deployment, CI dispatch, paid resource, new database/service, secret change or recurring process occurred.


## Local qualification handoff — user's 2026-11-20 03:02 UTC output

The user successfully fetched and checked out `feat/signed-business-capability-create`; `git pull --ff-only` reported already up to date. The two attempted environment lookups for `GHM_QUALIFICATION_DATABASE_NAME` and `GHM_QUALIFICATION_DATABASE_HOST` returned "path ... does not exist", so those variables are not currently defined in that PowerShell process. The transcript stops before `npm test`; no test result was supplied.

Re-read the qualification script's configuration contract. It loads `dotenv/config` and requires all of the following before opening database pools:
- `GHM_RUNTIME_DATABASE_URL`
- `GHM_ACTOR_GATEWAY_DATABASE_URL`
- `GHM_MIGRATOR_DATABASE_URL` (all three URLs must be distinct)
- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET` (canonical base64-encoded 32-byte key)
- `GHM_QUALIFICATION_DATABASE_NAME=ghm_disposable_test`
- `GHM_QUALIFICATION_DATABASE_HOST=localhost`

Do not print or request the URL or secret values in chat. The user should first run `npm test` independently; this package test is separate from the database qualification script and should not require those three database URLs. For the database qualification, inspect only variable presence and the two non-secret guard values, then use the existing local `.env` setup if it is already provisioned. Do not invent credentials, reuse production credentials, create a new database, or bypass the localhost/name guards.

No test, SQL migration, PostgreSQL harness, deployment, production operation, CI dispatch, or paid resource was executed in this task.


## Windows test-run checkpoint — 2026-11-20 03:03 UTC

User checked out the feature branch successfully and ran `npm test`. The package script began by expanding a very long explicit list of compiled test paths; Windows rejected the resulting command with `The command line is too long.` This is a Windows command-line length limitation, not a test assertion failure. The output shows the script did not reach a test summary, so no tests passed or failed and no test result can be claimed.

The branch is current with origin. The attempted environment lookups confirmed the two optional qualification guard variables are not defined in the current PowerShell process. The transcript did not show whether local dotenv configuration exists.

### Next local validation sequence

Avoid invoking the oversized `npm test` script again on this Windows shell for now. Run the build independently, then the focused feature migration contract test using the short explicit path:

```powershell
npm run build
node --require ./scripts/test-env.cjs --test dist/db/actor-gateway-business-capability-create-migration-contract.test.js
```

This focused test is a source/migration contract test only; it does not execute SQL against PostgreSQL. If it passes, report its actual summary. Then inspect local `.env` variable presence without printing values, and only run the PostgreSQL qualification if all three distinct localhost disposable URLs, the signing key, and the exact database name/host guards are already configured.

Do not alter the package-wide test script as part of this checkpoint; first establish whether this is only a Windows invocation issue and preserve the canonical test coverage. No PostgreSQL migration, disposable DB test, CI run, deployment, production operation, or paid resource occurred.


## Focused Windows test result and contract-test repair — 2026-11-20 03:06 UTC

User ran `npm run build`: TypeScript compilation succeeded.

User then ran the focused compiled test:
`node --require ./scripts/test-env.cjs --test dist/db/actor-gateway-business-capability-create-migration-contract.test.js`

Result: 3 passed, 2 failed. These failures were in the newly authored static contract test matchers, not SQL execution:
1. The operation-allowlist matcher incorrectly expected an escaped-dot string; the migration correctly contains the literal operation name.
2. The function ownership/GRANT matcher assumed the signature formatting as one exact substring, while the SQL formats the signature across lines. While repairing, the matcher was changed to whitespace-tolerant patterns and an exact verifier GRANT assertion.

Three follow-up test-source commits were made:
- `b3b62a23151d080cf01d02c87018977062e25445`
- `ff462eec94f033887295c7c8e6460520a825e562`
- `c20df9f8193ba8b192a4a8fa5218e58e326d7283`

Important: the focused test has **not yet been rerun** after these edits. Do not call it passing. Re-run `npm run build` and the focused test command from the user's local checkout to compile and execute the corrected assertions. The PostgreSQL harness remains unexecuted; no SQL has been applied.

No production access/change, database migration, deployment, CI dispatch, paid resource, or new database occurred.


## Focused Windows migration contract test — verified pass — 2026-11-20 03:08 UTC

User pulled the corrected feature branch through commit `32c7681ec8ffeb00764ca304a1952638a0fd7898`, ran `npm run build`, and reran the focused compiled test:
`node --require ./scripts/test-env.cjs --test dist/db/actor-gateway-business-capability-create-migration-contract.test.js`

Observed result:
- TypeScript build: exit success.
- Focused migration contract tests: 5 passed, 0 failed, 0 skipped.
- All five assertions now pass: canonical append-only relation, exact signed payload/operation, Business authority and selectable active catalogue, server-derived lifecycle/verification/provenance, and Actor Gateway-only execution grants.

This is a static migration-contract test pass only. It does not execute either SQL migration against PostgreSQL and does not qualify transaction behavior, HMAC execution, nonce replay, or runtime privileges.

### Next gate — inspect existing local qualification configuration without exposing secrets

Use a local presence-only check after loading the existing dotenv file. Do not print URL or secret values. Required variables from the qualification script are:
- `GHM_RUNTIME_DATABASE_URL`
- `GHM_ACTOR_GATEWAY_DATABASE_URL`
- `GHM_MIGRATOR_DATABASE_URL`
- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`
- `GHM_QUALIFICATION_DATABASE_NAME=ghm_disposable_test`
- `GHM_QUALIFICATION_DATABASE_HOST=localhost`

Only if the existing local configuration already supplies all required values and the three connection URLs are distinct should the guarded PostgreSQL qualification be attempted. Do not create a database, invent credentials, use production, or bypass the script's target guard. If configuration is absent, stop and report which variable names are missing (never values).

No SQL migration, PostgreSQL harness, CI dispatch, deployment, production operation, paid resource or new database occurred in this checkpoint.


## Qualification environment check clarification — 2026-11-20 03:09 UTC

User's PowerShell presence-only check reported all six required variables as NOT SET in the current PowerShell process.

Important correction: the qualification script imports `dotenv/config` at module startup. The check the user ran queried only process environment variables and did not load `.env`. Therefore this output does **not** establish that the repository's existing local `.env` configuration is absent. Do not ask the user to create or populate credentials based on this result.

Next step is a safe presence/guard check that runs Node with `--require dotenv/config`, prints only SET/MISSING for each required variable, checks the three URL values are distinct without printing them, and reports whether database name and host exactly match `ghm_disposable_test` and `localhost`. Never print URLs or the assertion secret. Only if all checks pass may the existing guarded qualification script be run. If any value is missing or guards fail, stop and inspect existing local setup/handovers; do not invent credentials, create a database, use production or bypass the guard.

The focused static contract test result remains 5/5 passed and the TypeScript build succeeded. No PostgreSQL qualification has been executed.


## Dotenv-backed qualification check — partial local configuration — 2026-11-20 03:11 UTC

User ran the recommended `node --require dotenv/config` presence-only check. Observed:
- `GHM_RUNTIME_DATABASE_URL`: SET
- `GHM_ACTOR_GATEWAY_DATABASE_URL`: MISSING
- `GHM_MIGRATOR_DATABASE_URL`: SET
- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`: MISSING
- `GHM_QUALIFICATION_DATABASE_NAME`: MISSING
- `GHM_QUALIFICATION_DATABASE_HOST`: MISSING
- Three distinct database URLs: FAIL
- Disposable target guard: FAIL

Conclusion: dotenv is loading at least two existing values, but the full three-principal, signed-assertion disposable qualification configuration is not provisioned in the current checkout. Do not run the PostgreSQL qualification script; its required preconditions are unmet. Do not copy production URLs, generate a signing secret ad hoc, create a database, or relax the database-name/localhost guards.

Next safe action is inspect local file/configuration inventory without printing contents or secrets: identify whether `.env`, `.env.local`, `.env.test`, or documented local qualification setup files exist, and inspect repository handovers/branch notes for an already-established Actor Gateway principal and disposable DB setup. The user has previously said there is an existing local qualification environment, so reconcile that prior setup before concluding it is absent. If no existing configuration/DB/principals can be located, stop and report this as an environment provisioning gap rather than introducing paid infrastructure or new DBs.

Static checks remain: TypeScript build succeeded and focused migration contract test passed 5/5. PostgreSQL qualification remains NOT RUN. No production access/change, SQL migration, deployment, CI dispatch, paid resource, new database or secret generation occurred.


## Local inventory result — existing PostgreSQL installations found, qualification setup unresolved — 2026-11-20 03:13 UTC

User's inventory from C:\GHM-main reported:
- Root files matching environment/qualification/handover patterns: .env.example, docker-compose.payfast-qualification.yml, and payfast-qualification.env.example; no visible .env, .env.local, or qualification-specific env file in that root-file listing.
- PostgreSQL client: psql (PostgreSQL) 18.6.
- Windows services listed: postgresql-x64-17 and postgresql-x64-18. The pasted output does not clearly establish their Running/Stopped status.
- No database inventory or listening-port check was run.

This is not enough to conclude that the pre-existing disposable database/principals are absent. The dotenv check earlier resolved runtime and migrator URL values while the environment inventory did not show a root .env file; determine whether .env is a directory, whether dotenv is resolving a parent path, or whether those values are injected through another existing local mechanism. Do not print env file contents or secret values.

### Next safe local inspection

Ask for metadata-only inspection of:
1. Get-Item -Force .env and Get-ChildItem -Force (including directories) in C:\GHM-main;
2. metadata-only check for .env in parent C:\ and sibling checkout C:\GHM (do not recursively search the whole drive);
3. service Name/Status for PostgreSQL 17 and 18;
4. local PostgreSQL readiness/port and database-name inventory using local service connections only, with no connection strings or passwords printed.

Use existing installed PostgreSQL services and previously provisioned local DBs only. Do not start/stop services, create roles/databases, generate secrets, modify env files, or use production credentials without establishing the existing setup. The earlier remembered local PayFast qualification DB on PG18 port 5433 is a separate database and is not automatically the required ghm_disposable_test.

Static TypeScript build and focused migration contract test are confirmed passed (5/5). PostgreSQL qualification is still NOT RUN. No SQL migration, database creation, role creation, secret generation, deployment, CI dispatch, paid resource or production operation occurred.


## Corrected local qualification setup source from prior handovers — 2026-11-20 03:15 UTC

The user correctly pointed out that the existing setup is documented in prior handovers. Re-reading `docs/GHM_CURRENT_STATE.md` and prior context recovered the key fact: the established local qualification environment explicitly uses the verified `C:\GHM\.env` file via the process environment variable `$env:DOTENV_CONFIG_PATH`. The previous checks ran `node --require dotenv/config` without setting this path, so they loaded dotenv's default `.env` resolution from `C:\GHM-main` rather than the established qualification env file. Therefore the earlier MISSING results for Actor Gateway URL, assertion secret, database name and host were false negatives about the intended environment; they did not establish that the documented `C:\GHM\.env` lacks those values.

User's latest machine output confirms both Windows PostgreSQL services are Running and local listeners exist on ports 5432 and 5433. Existing prior local notes identify PostgreSQL 18.6 and a separate PayFast qualification database on PG18/5433; do not assume that DB is `ghm_disposable_test`. Prior handover records specifically establish `C:\GHM\.env` as the source path; use it, not newly created env files.

### Correct next action

In the user's existing `C:\GHM-main` PowerShell session, set only the current-process variable `$env:DOTENV_CONFIG_PATH = 'C:\GHM\.env'`, then run the Node presence-only check with `node --require dotenv/config`. Do not print any URLs or signing secret. Check all six required variables, three URL distinctness, and exact `ghm_disposable_test` / `localhost` guards. If those pass, run the existing guarded qualification script using the same `DOTENV_CONFIG_PATH` in that PowerShell session. If a required value is missing, stop and inspect the existing documented file/configuration without modifying it. Do not create databases, roles, env files or secrets, do not use production credentials, and do not change PostgreSQL services.

The focused static migration contract test passed 5/5 and TypeScript build passed. PostgreSQL qualification remains NOT RUN pending use of the correct existing env file. No SQL migration, DB creation, role creation, secret generation, service changes, deployment, CI dispatch, production operation or paid resource occurred.



## Qualification environment investigation correction — 2026-11-20

The previous handover entry titled "Corrected local qualification setup from prior handovers" incorrectly concluded that the required Actor Gateway values were present in `C:\\GHM\\.env` and that earlier MISSING results came from loading the wrong dotenv path. The user's subsequent check explicitly set `DOTENV_CONFIG_PATH=C:\\GHM\\.env` and still reported the Actor Gateway URL, assertion secret, qualification database name and host as MISSING. That later direct observation supersedes the earlier inference. Do not repeat the claim that these values are present in the local env file.

This is not an Actor Gateway deployment defect. Actor Gateway has not been deployed, and production deployment configuration is intentionally absent. The local qualification harness has a separate requirement: three distinct connections (runtime, Actor Gateway, migrator), a test-only 32-byte HMAC key, and exact localhost/disposable-database guards. These values must be supplied by a local disposable test setup or a disposable CI runner; they must never be sourced from production.

### Existing CI provisioning pattern recovered from merged PR #272

The current `.github/workflows/ci.yml` already provisions a fresh PostgreSQL 18 service named `ghm_disposable_test` for CI, then creates isolated test roles including `ghm_runtime`, `ghm_actor_gateway`, `ghm_migrator` and `ghm_schema_owner`. The workflow defines distinct localhost URLs, the exact `GHM_QUALIFICATION_DATABASE_NAME=ghm_disposable_test` and `GHM_QUALIFICATION_DATABASE_HOST=localhost` guards, and a fixed 32-byte test-only assertion key. It then applies migrations and runs existing disposable PostgreSQL qualifications, including the Business Capability signed Gateway qualification. PR #272's merged CI implementation is the precedent; it does not deploy Actor Gateway or require Render configuration.

The feature's new `qualify-business-capability-gateway-cutover-postgres.mjs` script is separately registered as `npm run qualify:business-capability-gateway-cutover` in `package.json`. The script itself refuses to run unless all three URLs are distinct and the database name/host guards match. Do not weaken or bypass these checks.

### Current status and next safe action

- Build passed and the focused static migration contract test passed 5/5 in the user's Windows checkout.
- Full `npm test` did not run because PowerShell hit Windows' command-line length limit; this is not a test failure.
- PostgreSQL signed-create qualification has NOT run.
- The local PostgreSQL services/listeners being active does not prove that `ghm_disposable_test` or the three dedicated local principals exist.
- No database, role, secret, env file, service, CI workflow, production configuration or paid resource was created or changed during this investigation.
- PR #298 remains a separate open draft and is not modified by this feature.

Next, inspect the existing local PostgreSQL instances read-only for whether `ghm_disposable_test` and the required roles already exist. If they do not, do not create them under this task's no-new-database/no-new-resource constraint. The existing CI workflow's ephemeral PostgreSQL service is the established alternative qualification environment; use it only through the normal feature-branch PR validation path, not a manual workflow dispatch. Keep the signed-create SQL unqualified until a real disposable PostgreSQL run passes.


## Draft PR opened for existing PostgreSQL CI qualification — 2026-11-20

Created draft PR #300: https://github.com/zaidhqdev-sys/GHM/pull/300
- Title: `feat(actor-gateway): add signed Business Capability create`
- Base: `main`
- Head: `feat/signed-business-capability-create`
- Head SHA at creation: `d361cf36228bb00a8121e5f1af473a8d536bb5e8`
- State: open, draft, unmerged.
- Scope: six changed files, 929 additions, one deletion at PR creation.

### Why draft PR #300 is the qualification trigger

The current CI workflow's `pull_request` trigger includes `main` as a target branch. The feature branch is not listed under the workflow's direct `push.branches`, and the workflow ignores documentation-only changes; therefore a docs-only handover commit does not trigger CI on this branch. Opening PR #300 against `main` causes the existing pull-request CI path to evaluate the feature head. No workflow file changes or manual workflow dispatch are needed.

The workflow's `quality` job provisions its own ephemeral PostgreSQL 18 service and isolated principals, sets the localhost/disposable-database guards and test-only HMAC key, applies all migrations, and then runs the registered command `npm run qualify:business-capability-gateway-cutover`. This is a disposable CI database, not Render and not a newly purchased resource.

### PR #300 boundaries and status

PR #300 was intentionally created as draft. It must remain unmerged until the actual PostgreSQL qualification and all relevant CI checks pass and the feature is reviewed. PR #298 remains separate and untouched. No production DB, Render service, local database, role, env file, secret, or CI workflow was changed. No paid resource was added. PayFast remains out of scope.

At PR creation the connector returned `mergeable: false`; treat that as GitHub's current mergeability calculation, not as evidence of a conflict or permission to merge. Recheck PR status and CI checks before taking further action.


## PR #300 initial CI run observed — 2026-11-20

PR #300 opened successfully as a draft against `main`. GitHub created CI run #5398 (run ID `44667449795`) for the feature code head `d361cf36228bb00a8121e5f1af473a8d536bb5e8`.

At the last check:
- `quality`: in progress.
- `web-quality`: in progress.
- Cloudflare Pages: success, reported a branch preview URL. This is a preview check, not evidence of a production Render deployment or production database change.
- No CI conclusion is yet available for either quality job. In particular, do not report the PostgreSQL signed-create qualification as passed until the `quality` job completes and its logs confirm the qualification step succeeded.

The handover-only commit `72590214bd9891df6032414e3d696a460d080598` was pushed after the PR opened. The workflow ignores documentation-only changes, so run #5398 is evaluating the code tree from `d361cf3`; the intervening change only appends this handover record. If any source code changes are made, verify a fresh CI run is triggered before treating the new code as qualified.


## PR #300 CI failure diagnosis and source correction — 2026-11-20

The first complete PR CI attempt for head 2521b2f303c2a5bbbbfa4a4393bfd2844f591dac completed:
- web-quality: success.
- quality: failure at the dedicated node --check scripts/qualify-business-capability-gateway-cutover-postgres.mjs step.
- PostgreSQL 18 container initialization and isolated role provisioning succeeded. The job stopped before migrations were applied or any database qualification ran.

The exact syntax error in the job log was: SyntaxError: Identifier 'replayContext' has already been declared at line 111. The new Business Capability create replay probe declared replayContext in the same function scope as an existing Business Capability Evidence replay probe. This was a local variable-name collision, not a database, secret, PostgreSQL or production issue.

Corrected only the evidence replay probe variable name to evidenceReplayContext (including its corresponding sign(...) reference) in scripts/qualify-business-capability-gateway-cutover-postgres.mjs.

Source correction commit: 6a8081549a081ba33292aa9810ba851276a44f77. No SQL migration, production configuration, database, role, secret, CI workflow, or PR #298 file was changed. PR #300 remains draft and unmerged.

Next: verify a new PR CI run was triggered for the corrected source head. Confirm the syntax-check step passes, then inspect migration application and the actual signed Business Capability PostgreSQL qualification result. Do not count the prior run as a SQL qualification attempt: it stopped before migration application.


## PR #300 migration-chain security-path correction — 2026-11-20

After the duplicate replay variable was corrected, CI run #5402 (head 688722d33d8263d14e59801be39c0ff5a675c60c) passed all qualification-script syntax checks and the TypeScript build. It then failed while applying the existing migration chain, specifically at 20261117020000_revoke_runtime_capability_governance.sql, before any new Business Capability PostgreSQL qualification ran.

Root cause confirmed by source and CI logs: 20261112090000_pin_security_definer_search_path.sql deliberately pins every SECURITY DEFINER function to `pg_catalog, ghm, pg_temp` (pg_temp last). The existing 20261117020000 preflight expected `search_path=pg_catalog, ghm`, so it rejected the established hardened path. This was a real migration contract mismatch, not a PostgreSQL service or CI secret problem.

PR #298 was inspected. Its parallel branch contains the same root-cause correction, including a robust catalog-option parser and expected pinned path. PR #298 is a separate draft and was not edited or merged. For this feature branch, the correction was applied directly and narrowly:

1. Commit 7028b518884676d1c9b7a15a9ca90afc114ce189 updates the existing cutover guard to expect the exact established `pg_catalog, ghm, pg_temp` path.
2. Commit 396265a5e72f3f39553129004cd4de8bc4c49cfc pins the new signed create SECURITY DEFINER wrapper to `pg_catalog, ghm, pg_temp`.
3. Commit 6b7e135432f025aa482029487b06154d600bafb9 pins the replaced signed assertion verifier to the same `pg_catalog, ghm, pg_temp` path.

The pg_temp schema remains last; no weaker search path was introduced. The existing migration was edited on the feature branch only; production database was not touched. No PR #298 files or branch were changed. The three migrations were updated sequentially using exact existing declarations; no other SQL behavior was intentionally changed.

Next: verify the new exact-head PR #300 CI run. The migration chain must now pass the `20261117020000` preflight and continue applying subsequent migrations. Only then can the signed Business Capability qualification execute. If another migration fails, inspect its exact SQL and relevant handovers/PRs before making a narrowly scoped forward-safe correction. Keep PR #300 draft/unmerged and PR #298 untouched.


## PR #300 run #5405 migration failure and SQL quoting fix — 2026-11-20

Run #5405 (head 7f4abe6435b15b253c7b259f5e17cbd2032aefe4) passed all syntax checks, the TypeScript build, and Worker bundling. The disposable PostgreSQL service and isolated principal setup also succeeded. The migration-application step failed before any Business Capability qualification with PostgreSQL 42601: syntax error at or near "$" at character 387 in migration 20261120011000_allow_signed_business_capability_create_assertion.sql.

The exact failing source line had `... SET search_path=pg_catalog,ghm,pg_temp AS $` (single dollar) while the function body terminator was `$$`. This typo was introduced while aligning the verifier's pinned search_path. Corrected the opener to `AS $$` in commit 96317053a17163ce82559772bfead51fd56c5e5b. No logic, verifier checks, privileges or function body were otherwise changed.

Run #5405 is a failed migration-chain attempt; it does not qualify the new SQL. The corrected source should trigger another PR CI run. Next verify that run's migration step, then confirm the dedicated `Qualify Business Capability signed gateway cutover on disposable PostgreSQL` step actually runs and passes. PR #300 remains draft/unmerged. PR #298 remains open/draft and untouched. No production resources, paid services, or local databases were changed.


## PR #300 run #5407 — migrations pass; shared runtime ACL qualification baseline reconciled — 2026-11-20

Run #5407 (head 609ab30b1b5aef300b6295284cf8670e6981e30a) passed the full migration application step on ephemeral PostgreSQL 18. The new migrations therefore parse/apply successfully. `web-quality` also passed. The quality job then failed at the pre-existing shared `Qualify isolated actor gateway database principal` step; the dedicated new `Qualify Business Capability signed gateway cutover on disposable PostgreSQL` step was skipped because of that earlier failure. Do not claim signed-create PostgreSQL qualification yet.

Exact failure: `assertRuntimeDatabaseFunctionPrivileges` reported that the runtime's actual SECURITY DEFINER EXECUTE grants did not match any of its 512 allowed stages. The diagnostic showed the actual database had already revoked the three legacy capability governance functions (create/update/transition) and the registration-identity write function. The feature branch's runtime privilege model still described the older pre-migration baseline (43 functions, 9 manual cutover groups, 512 stages), while PR #298 had already corrected this model to the post-migration baseline (39 functions, 8 remaining manual cutover groups, 256 stages). The discrepancy was not caused by the new Business Capability create wrapper; it is a stale shared validator/test model relative to migrations already in main.

Inspected PR #298's exact source and commit history. Its runtime privilege correction is the relevant established fix, with explicit tests for registration read remaining until its manual cutover and registration write being migration-revoked. Reused those two exact source files from PR #298's branch on this feature branch only:
- `src/db/runtime-database-privileges.ts` copied from PR #298 source SHA `ac7c44d0d23883dbd368c5d7a5def14d80e9738f`; feature commit `39dcc1c0e8c8f0a8e086633c53073a545c097f7a`.
- `src/db/runtime-database-privileges.test.ts` copied from PR #298 source SHA `ab77b12ed387c9b2d1def6951a3b21d10fa5b27e`; feature commit `96465bb05e1009bb7f7464e8b33ac5395ca069e6`.

No PR #298 branch/file was modified. This is a feature-branch-only reconciliation of the shared validator and its unit tests to the already-migrated mainline database state. It does not revoke any database grants, execute any production cutover, or alter production. Next check exact-head PR #300 CI, confirm the updated validator passes, then ensure the dedicated Business Capability qualification runs. If it fails, diagnose its own SQL evidence; do not widen the runtime allow-list or weaken ACL checks without source/hand-over evidence.


## PR #300 run #5408 cancellation diagnosis — 2026-11-20

Inspected PR #300 and PR #298 metadata, the feature branch handover, the feature branch CI workflow, and the latest available branch search result before proceeding. PR #300 remains open and draft; PR #298 remains a separate open draft with no review submissions. The feature branch remains `feat/signed-business-capability-create`.

Run #5408 (run ID `44668651541`) completed with conclusion `cancelled`, not `failure`. Both `quality` and `web-quality` were cancelled. The quality job was cancelled during container initialization; checkout, dependency installation, role provisioning, syntax checks, build, migration application, and all database qualification steps were skipped. Therefore run #5408 provides no new evidence about the shared runtime privilege validator or the signed Business Capability SQL.

The workflow defines `concurrency.group: ghm-${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`. This means a newer run for the same PR ref can cancel an in-progress attempt. The available workflow-run query for commit `96465bb05e1009bb7f7464e8b33ac5395ca069e6` returned only run #5408; it did not identify a later successful replacement. Do not describe #5408 as a code or SQL failure, and do not claim the new qualification passed.

Current qualification evidence remains:
- TypeScript build and static migration contract tests passed in earlier local validation.
- Migration application passed on run #5407.
- Run #5407 then failed at the shared isolated Actor Gateway principal permission-stage validator, before the dedicated signed Business Capability qualification step.
- The feature branch reused PR #298's reviewed runtime privilege baseline and matching tests (feature commits `39dcc1c0e8c8f0a8e086633c53073a545c097f7a` and `96465bb05e1009bb7f7464e8b33ac5395ca069e6`); PR #298 itself was not modified.
- Run #5408 was cancelled before it could validate those corrections.

Important workflow observation: the branch's `.github/workflows/ci.yml` pull_request target list includes `main`; markdown-only handover changes are excluded by `paths-ignore`. The CI job uses ephemeral PostgreSQL 18 and isolated principals; no local or production database is involved.

Next: establish the current PR #300 head and its latest associated workflow run, then inspect that run's job state/logs. If no replacement run exists, make a narrowly scoped source change only if justified, or otherwise use the normal PR code-change trigger (not manual workflow dispatch) to obtain a fresh exact-head run. Keep PR #300 draft/unmerged and PR #298 untouched. No production changes, local DB changes, paid resources, deployments, or secrets were made in this task.


## PR #300 CI run #5410 — Gateway function allow-list drift isolated — 2026-11-20

Re-inspected PR #300, PR #298, the `feat/signed-business-capability-create` branch, its current handover, package qualification command, CI workflow and the exact run/job logs before proceeding. PR #300 remains draft/unmerged. PR #298 remains a separate draft and was not modified.

Run #5410 (run ID `44668868603`) completed:
- `web-quality`: passed.
- TypeScript build: passed.
- All migration syntax checks and Worker bundle: passed.
- All repository migrations applied successfully to ephemeral PostgreSQL 18 `ghm_disposable_test`.
- Auth issuer principal qualification: passed.
- Actor Gateway principal qualification: failed at step 32 with `gateway_function_allow_list_mismatch`.
- The dedicated Business Capability signed Gateway PostgreSQL qualification was skipped because the shared principal qualification failed first.

Retrieved the full quality job log and the exact branch source `src/actor-gateway/database-privileges.ts`. The failure is a genuine exact-signature allow-list mismatch, not an environment, connection, role setup, migration syntax, or production issue. The diagnostic shows the actual executable Gateway set includes the new `ghm.gateway_create_business_capability(bigint,bigint,uuid,text,text,jsonb)`, while the source expected set does not include it. The diagnostic also shows three campaign/directory-review signatures expected by the current source but absent from the actual executable set: `gateway_create_campaign`, `gateway_update_campaign`, and `gateway_get_business_directory_review_presentation`. The actual list includes the rest of the currently granted signatures, including the registration identity read/write wrappers.

The helper currently permits only two exact Campaign states (the full three-function campaign set or that set absent) while requiring all other expected signatures. Its source expected array still needs a reviewed exact-state reconciliation that accounts for the signed Business Capability create wrapper and the campaign/directory-review migration state. Do not simply append the new function or remove the three campaign functions based only on a count: inspect migration history, relevant PRs/handovers and exact migration effects first, then encode explicit safe states and regression tests. Preserve rejection of arbitrary extra/missing Gateway functions, PUBLIC/runtime execution, unsafe SECURITY DEFINER ownership/search_path, unsafe grants and direct relation access.

No SQL Business Capability operation tests ran in #5410. The prior static migration contract test (5/5) and build pass remain valid but do not replace this missing runtime qualification. No local database, production database, Render service, secret, paid resource, deployment, or PR #298 content was changed in this task.

Next: trace the three Campaign/directory-review signatures through migration files, PR #298 and other relevant PRs/handovers to establish the canonical post-migration Gateway allow-list state. Then update the validator and focused tests narrowly, run normal PR CI, and only proceed once the shared principal check passes to the dedicated signed-create PostgreSQL qualification.


## Follow-up investigation — Campaign/directory-review ACL provenance not yet established — 2026-11-20

Before this task, re-read the signed Business Capability handover, inspected the current Actor Gateway privilege validator and its focused tests on `feat/signed-business-capability-create`, and searched the repository's indexed code, PR history and commit history for:
- `gateway_create_campaign`
- `gateway_update_campaign`
- `gateway_get_business_directory_review_presentation`
- `gateway_create_business_capability`
- Campaign Gateway revoke/grant migration references.

The repository code search (which indexes the default branch rather than arbitrary feature refs) returned no matching indexed files, and PR/commit search returned no matching results. This does not prove the migration history is absent; it means the current available search results are insufficient to attribute the three absent functions to a specific migration/PR or establish the intended permission state.

The current source validator is still unchanged: it expects the three Campaign/directory-review functions as one exact optional group, while run #5410's actual database diagnostic showed all three absent and the new Business Capability create wrapper present. The safe correction is not yet established. Do not remove the Campaign group, do not merely add the Business Capability function, and do not change expected function counts based on the diagnostic alone. Preserve all existing least-privilege checks.

No source code, migration, PR, branch configuration, database, secret, deployment or paid resource was changed in this task. PR #300 remains draft/unmerged; PR #298 remains untouched. The handover is updated with the incomplete provenance investigation so the same searches are not repeated blindly.

Next required evidence: inspect the exact migration tree/files at the PR #300 head (including grant/revoke history for the three Campaign functions and the Business Capability wrapper), and compare against the mainline migration ledger and PR #298's relevant source diff. Once the intended post-migration Gateway signature set is established, update the exact allow-list and add regression coverage for both accepted migration states and rejection of arbitrary extra/missing signatures. Then trigger normal PR CI and verify that the dedicated signed-create PostgreSQL qualification runs.


## Migration/PR provenance follow-up — directory-review retirement confirmed; Campaign wrapper provenance still open — 2026-11-20

Re-read the current feature handover and branch validator/tests, then inspected mainline migration source and historical PR records. Findings:

1. PR #214 introduced Founder directory review, including the review authority probe, queue, decision and owner submission/presentation routes. Its PR description explicitly records the feature and its deliberate empty reviewer allowlist: https://github.com/zaidhqdev-sys/GHM/pull/214
2. Mainline migration `20261109140000_close_evidence_and_founder_review_authority.sql` explicitly revokes PUBLIC and `ghm_runtime` EXECUTE on:
   - `ghm.submit_business_directory_review(bigint,bigint)`
   - `ghm.list_businesses_for_directory_review(bigint,text,integer,integer)`
   - `ghm.review_business_directory_listing(bigint,bigint,text,text)`
   It also replaces `ghm.is_directory_listing_founder_reviewer(bigint)` with `SELECT false` and revokes its PUBLIC/runtime execution.
3. PR #242 then removed the founder-reviewer lookup from the Resource API repository/service path and changed the authenticated authority endpoint to return `isFounderReviewer:false` without calling the revoked database function. The commit search result for PR #242 shows the endpoint no longer invokes the repository lookup. PR #242's description states it made no DB permission/migration changes; it relies on the prior retirement migration.
4. This confirms Founder review is deliberately disabled in the current mainline contract. It does **not yet prove** that `ghm.gateway_get_business_directory_review_presentation(...)` is the same legacy function or that its wrapper should be removed: that exact Actor Gateway wrapper is not among the three signatures explicitly revoked in migration `20261109140000`.
5. The two missing Campaign wrappers `ghm.gateway_create_campaign(...)` and `ghm.gateway_update_campaign(...)` also have not yet been tied to an exact mainline grant/revoke migration. The PR #300 CI diagnostic alone is insufficient to authorize dropping them.

No source validator, test, migration, or PR was modified. The current safe decision is to keep the exact allow-list strict and not encode a guessed optional state. PR #300 remains draft/unmerged; PR #298 remains untouched. No database, secret, production setting, deployment or paid resource changed.

Next evidence needed: inspect the migration(s) that originally granted the three exact `gateway_*` wrappers and all later forward migrations that revoke or replace them. Compare those exact signatures against the live migration chain and PR #272 gateway integration source. Once proven, encode the single canonical post-migration allow-list (or narrowly documented explicitly safe migration stages) and regression tests; then rerun normal PR CI to reach the signed Business Capability qualification.


## PR #272 exact-commit comparison — qualification harness confirmed; wrapper grant provenance still unresolved — 2026-11-20

Re-read this feature handover, PR #300's current branch validator and tests, and PR #298's separate draft scope before comparing PR #272's merge commit `4463bbb989f9d1173596f5371663b3e9e7afc0a9` (https://github.com/zaidhqdev-sys/GHM/commit/4463bbb989f9d1173596f5371663b3e9e7afc0a9).

Confirmed from PR #272's exact commit:
- CI provisions ephemeral PostgreSQL 18 `ghm_disposable_test`, runtime/migrator/Actor Gateway principals and a test-only base64 32-byte capability assertion secret.
- CI runs `npm run qualify:business-capability-gateway-cutover` after migration application and the Actor Gateway principal qualification.
- This establishes the intended automated qualification harness and does not require a deployed production Actor Gateway.
- The PR #272 resource registry changes `directory_review` to read-only (`operations: ['read']`), consistent with the earlier Founder review retirement.

However, the PR #272 merge commit's available diff does not contain grant/revoke migration changes for the exact signatures `ghm.gateway_create_campaign(...)`, `ghm.gateway_update_campaign(...)`, or `ghm.gateway_get_business_directory_review_presentation(...)`. It therefore does not establish their SQL ACL provenance or prove the two Campaign wrappers were retired. The exact directory-review Actor Gateway wrapper remains distinct from the underlying Founder review SQL functions explicitly revoked in `20261109140000_close_evidence_and_founder_review_authority.sql`.

Decision: do not modify the validator or tests yet. The current test calls the three wrappers an exact optional Campaign group, but the run #5410 diagnostic shows that group absent and the new Business Capability create wrapper present. We still need the migration(s) that create/grant those wrappers and any later migration that revokes/replaces them. The CI workflow and resource registry are not sufficient proof of the SQL execution set.

No source/migration/PR change was made. PR #300 remains draft/unmerged; PR #298 remains untouched. No database, secret, deployment, paid resource or production setting changed.

Next: use the PR #300 head's migration file inventory/ledger and commit ancestry to identify exact CREATE/GRANT/REVOKE statements for these signatures. Once the canonical end-state is proven, add `gateway_create_business_capability(...)` to the expected set, remove only wrappers demonstrably revoked, and add focused tests proving exact expected signatures and rejection of arbitrary extra/missing functions. Then trigger ordinary PR CI and verify the signed-create PostgreSQL test actually runs.
