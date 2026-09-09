# GHM Construction Qualification Sequence

## Purpose

This is the execution order for qualifying GHM as the future backend replacement without touching live Zaid Connect or QuoteFlow traffic.

## Gate order

1. **Runtime boundary** — canonical configuration is used and the legacy runtime bootstrap is removed.
2. **Schema authority** — PostgreSQL schema is owned by repository migrations; application startup performs no schema mutation.
3. **Authorization boundary** — authenticated identity and authorization are enforced within the same query/transaction context; no connection-pool context leakage.
4. **Resource API** — unrestricted generic table access is removed and replaced by explicit governed resources.
5. **Operational boundary** — health/readiness, graceful shutdown, structured errors, and safe logging are qualified.
6. **Automated qualification** — build and negative security/runtime checks run deterministically in CI.
7. **Database reconciliation** — actual GHM PostgreSQL catalog is captured and reconciled before product/business migrations are authored.
8. **Product adapters** — Connect and QuoteFlow adapters are implemented only after their concrete backend contracts are evidenced.
9. **Shadow qualification** — product workflows are exercised against GHM while Supabase remains authoritative.
10. **Controlled cutover** — migrate one product at a time with an explicit rollback path.

## Hard stop conditions

Do not proceed to product adapters or cutover while any of these remain true:

- live PostgreSQL schema is unknown;
- application startup creates/changes product tables;
- fixed-ID administrator bootstrap exists;
- generic table querying can cross an approved resource boundary;
- authorization relies on a separate, unawaited pool query for request context;
- password-reset secrets are returned to clients or logs;
- storage/realtime still require Supabase as an undisclosed GHM runtime dependency;
- rollback has not been tested.

## Production safety

This sequence is construction-only until a separate release authorization is issued. Supabase remains the production authority for Connect and QuoteFlow throughout construction and qualification.
