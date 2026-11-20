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
