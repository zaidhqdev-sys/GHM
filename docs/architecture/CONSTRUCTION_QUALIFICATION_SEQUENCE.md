# GHM Construction Qualification Sequence

## Purpose

This is the governed execution order for qualifying GHM as the future backend replacement without touching live Zaid Connect or QuoteFlow traffic.

The sequence remains the architecture-level gate order. Individual gates may have partial evidence or qualified first slices; a qualified slice does not imply production qualification of the whole sequence.

## Gate order and current state

1. **Runtime boundary** — canonical configuration is used and unsafe legacy runtime bootstrap behavior is removed or formally constrained. **Construction evidence exists; production qualification remains open.**
2. **Schema authority** — PostgreSQL schema is owned by repository migrations; application startup performs no schema mutation. **First canonical GHM Business Identity slice is established through repository-owned migrations, relocated into the dedicated `ghm` schema, and qualified against the live catalog.**
3. **Authorization boundary** — authenticated identity and authorization are enforced within the same query/transaction context; no connection-pool context leakage. **Construction primitives exist; full qualification remains open.**
4. **Resource API** — unrestricted generic table access is removed and replaced with explicit governed resources. **Contract primitives exist; product-resource implementation/qualification remains open.**
5. **Operational boundary** — health/readiness, graceful shutdown, structured errors, and safe logging are qualified. **Not yet a production gate.**
6. **Automated qualification** — build and negative security/runtime checks run deterministically in CI. **Construction checks exist and are passing for the current branch state; they do not close the production gates above.**
7. **Database reconciliation** — actual GHM PostgreSQL catalog evidence is captured and reconciled before dependent product/business migrations are authored. **Dedicated-schema catalog reconciliation and Business Identity runtime qualification are PASS for the current construction slice. The existing catalog artifact remains an app-role-scoped snapshot captured through `DATABASE_URL` (`ghm_app_user` → `ghm_db_user`), not an authoritative full-database catalog. Canonical GHM recovery has also been captured separately through the dedicated migrator/schema-owner path. Remaining work includes provider/bootstrap authority limits, legacy authority cleanup, dedicated-schema/default-privilege reconciliation, and subsequent governed resource slices.**
8. **Product adapters** — Connect and QuoteFlow adapters are implemented only after their concrete backend contracts are evidenced. **Not started as a cutover activity.**
9. **Shadow qualification** — product workflows are exercised against GHM while Supabase remains authoritative. **Not started.**
10. **Controlled cutover** — migrate one product at a time with an explicit rollback path. **Not started; production remains on Supabase.**

## Current closed construction gates

### Dedicated Schema → Business Identity Runtime: CLOSED / PASS

The relocated first-slice Business Identity runtime qualification was rerun after the qualification harness was reconciled to the canonical `ghm.*` resource names. The final run passed all checks:

```text
RUNTIME IDENTITY PASS: ghm_db/ghm_runtime
CLEANUP AUTHORITY PASS: ghm_db/ghm_migrator
PROFILE READ PASS
EMPTY MEMBERSHIP READ PASS
BUSINESS CREATE + OWNER MEMBERSHIP PASS
MANAGED READ PASS
PUBLIC APPROVAL BOUNDARY PASS
MANAGED UPDATE PASS
ROLE AUTHORIZATION REJECTION PASS
ACTIVE MEMBERSHIP REJECTION PASS
DUPLICATE SLUG ATOMIC FAILURE PASS
DUPLICATE SLUG ATOMIC ROLLBACK PASS
CONCURRENT BUSINESS CREATION SERIALIZATION PASS
GHM BUSINESS IDENTITY RUNTIME QUALIFICATION: PASS
```

The preceding `relation "business" does not exist` failure was a qualification-harness schema-reference defect. The harness was corrected to use explicit `ghm.account_identity`, `ghm.business`, and `ghm.business_membership` references; the corrected qualification then passed and cleaned its fixtures successfully.

### Transaction Qualification: CLOSED / PASS

Transaction qualification is closed for the first Business Identity slice against the relocated `ghm` schema. The live qualification verified atomic duplicate-slug rollback and concurrent Business creation serialization, with the transaction primitive covered for commit, rollback, release, same-context binding, and rejection of invalid authentication context before checkout.

### TEMP Privilege Decision: CLOSED / NO GRANT REQUIRED

The current runtime source and qualification harness require no temporary tables or other temporary objects. Least privilege therefore requires no `TEMP` grant to `ghm_runtime` at this stage.

## Provider / bootstrap authority gate

**Status: OPEN / BLOCKED FOR MUTATION**

Render workspace and resource administration have been evidenced through the customer-facing Render control plane. The `ghm-db` PostgreSQL resource exposes the Render-managed credentials `ghm_app_user` (default) and `ghm_db_user), while the dedicated GHM roles (`ghm_runtime`, `ghm_migrator`, and `ghm_schema_owner`) are PostgreSQL-created roles and are not Render-managed credentials.

The customer-facing PostgreSQL connection controls do not expose a separate PostgreSQL `postgres` superuser/bootstrap credential. Existing live catalog evidence shows that the legacy `ghm_db_user` memberships to `ghm_schema_owner`, `ghm_migrator`, and `ghm_runtime` were granted by `postgres`. The dedicated roles do not have authority to revoke those memberships themselves.

Therefore:

- Render workspace/resource administration is established;
- PostgreSQL bootstrap/superuser authority is not established through the customer-facing control plane;
- `ghm_db_user` cleanup remains blocked;
- no credential rotation is authorized merely to seek authority;
- no pgAdmin deployment is authorized merely to seek authority;
- no production `DATABASE_URL` change is authorized;
- no production cutover is authorized.

This is a provider-authority limitation, not permission to approximate bootstrap authority through an application role.

## Recovery evidence

A canonical GHM-only recovery dump was captured using `GHM_MIGRATOR_DATABASE_URL`, `ghm_schema_owner`, and `--schema=ghm`. The custom-format archive was successfully created and its restore catalog was independently verified with PostgreSQL 18.6 tooling. No restore was performed.

This artifact covers the canonical `ghm` schema only. It is not represented as a full-database backup because the legacy `public` catalog is not fully accessible through the dedicated GHM roles.

## Important sequencing interpretation

The gate order is a dependency model, not permission to skip unresolved gates because an earlier implementation exists.

The current first-slice Business Identity migration does not mean the complete GHM product schema has been authored. It establishes only the canonical construction schema required for the currently qualified slice.

Likewise, PostgreSQL role separation and dedicated migration-runner qualification close only the corresponding construction evidence. They do not close Authorization Qualification, Operational Qualification, or the eventual product replacement gates.

The next governed work is **provider/bootstrap authority reconciliation and legacy-authority recovery/cleanup qualification where authority permits**. If provider authority remains unavailable, that limitation must remain explicitly recorded and the cleanup must remain blocked. In parallel, construction may advance only to resource slices whose database contracts and privileges can be evidenced without relying on unresolved bootstrap authority.

No product adapter or production cutover work begins from the Business Identity, Transaction, or TEMP gates alone.

## Hard stop conditions

Do not proceed to product adapters or cutover while any of these remain true:

- live PostgreSQL schema is unknown or unreconciled for the resource being implemented;
- application startup creates/changes product tables;
- fixed-ID administrator bootstrap exists;
- generic table querying can cross an approved resource boundary;
- authorization relies on a separate, unawaited pool query for request context;
- password-reset secrets are returned to clients or logs;
- storage/realtime still require Supabase as an undisclosed GHM runtime dependency;
- rollback has not been tested;
- required authentication, authorization, transaction, repository, or runtime-boundary qualification evidence is missing for the resource being advanced;
- legacy authority cleanup requires PostgreSQL bootstrap privileges that are not independently available.

## Production safety

This sequence is construction-only until a separate release authorization is issued. Supabase remains the production authority for Connect and QuoteFlow throughout construction and qualification.

No construction qualification in this sequence authorizes production environment-variable changes, DNS/routing changes, credential rotation, data migration, or product traffic cutover.
