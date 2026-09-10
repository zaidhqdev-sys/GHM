# GHM Construction Qualification Sequence

## Purpose

This is the governed execution order for qualifying GHM as the future backend replacement without touching live Zaid Connect or QuoteFlow traffic.

The sequence remains the architecture-level gate order. Individual gates may have partial evidence or qualified first slices; a qualified slice does not imply production qualification of the whole sequence.

## Gate order and current state

1. **Runtime boundary** — canonical configuration is used and unsafe legacy runtime bootstrap behavior is removed or formally constrained. **Construction evidence exists; production qualification remains open.**
2. **Schema authority** — PostgreSQL schema is owned by repository migrations; application startup performs no schema mutation. **First canonical GHM Business Identity slice is now established through repository-owned migrations.**
3. **Authorization boundary** — authenticated identity and authorization are enforced within the same query/transaction context; no connection-pool context leakage. **Construction primitives exist; full qualification remains open.**
4. **Resource API** — unrestricted generic table access is removed and replaced with explicit governed resources. **Contract primitives exist; product-resource implementation/qualification remains open.**
5. **Operational boundary** — health/readiness, graceful shutdown, structured errors, and safe logging are qualified. **Not yet a production gate.**
6. **Automated qualification** — build and negative security/runtime checks run deterministically in CI. **Construction checks exist and are passing for the current branch state; they do not close the production gates above.**
7. **Database reconciliation** — actual GHM PostgreSQL catalog evidence is captured and reconciled before dependent product/business migrations are authored. **The existing catalog artifact is an app-role-scoped snapshot captured through `DATABASE_URL` (`ghm_app_user` → `ghm_db_user`), not an authoritative full-database catalog. The current regenerated snapshot sees only the five legacy tables through its `information_schema` queries; it must not be interpreted as proof that the first-slice GHM tables are absent. First-slice schema reconciliation, runtime authority qualification, and dedicated migrator qualification remain evidenced separately. Remaining work includes bootstrap membership cleanup, dedicated-schema/default-privilege reconciliation, and subsequent governed resource slices.**
8. **Product adapters** — Connect and QuoteFlow adapters are implemented only after their concrete backend contracts are evidenced. **Not started as a cutover activity.**
9. **Shadow qualification** — product workflows are exercised against GHM while Supabase remains authoritative. **Not started.**
10. **Controlled cutover** — migrate one product at a time with an explicit rollback path. **Not started; production remains on Supabase.**

## Important sequencing interpretation

The gate order is a dependency model, not permission to skip unresolved gates because an earlier implementation exists.

The current first-slice Business Identity migration does not mean the complete GHM product schema has been authored. It establishes only the canonical construction schema required for the currently qualified slice.

Likewise, PostgreSQL role separation and dedicated migration-runner qualification close only the corresponding construction evidence. They do not close Transaction Qualification, Authorization Qualification, Operational Qualification, or the eventual product replacement gates.

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
- required authentication, authorization, transaction, repository, or runtime-boundary qualification evidence is missing for the resource being advanced.

## Production safety

This sequence is construction-only until a separate release authorization is issued. Supabase remains the production authority for Connect and QuoteFlow throughout construction and qualification.

No construction qualification in this sequence authorizes production environment-variable changes, DNS/routing changes, credential rotation, data migration, or product traffic cutover.
