# Handover — unexpected Render PostgreSQL resource investigation (2026-11-17)

## Owner clarification

The owner explicitly states that the only PostgreSQL database they paid for / intended to pay for was production `ghm-db`. The intended database inventory was two resources: production `ghm-db` and the historical PayFast sandbox database `ghm-payfast-sandbox-db`. The owner did not identify or approve a third paid database.

Do not describe `ghm-identity-qualification-20261018` as an approved or expected qualification database. Treat it as an unexpected, unapproved resource until its origin and billing are established.

## Render inventory evidence

Workspace: `tea-d9svua6417fc73bhcutg`.

Unexpected resource returned by live Render inventory:
- Display name: `ghm-identity-qualification-20261018`
- Render Postgres ID: `dpg-dba0tu3rjlhs738fs2sg-a`
- Database: `ghm_identity_qualification_20261018`
- Database user: `ghm_identity_qualification_20261018_user`
- Region: Frankfurt
- Engine: PostgreSQL 18
- Plan reported by inventory: `basic_256mb`
- Disk reported by inventory: 15 GB
- State: available / not suspended
- Resource creation date reported in inventory: 2026-10-18

The matching Render Web Service `ghm-identity-qualification` exists:
- Service ID: `srv-dbahvenbtjjs73f83rlg`
- Free Web Service, Frankfurt
- Repository: `zaidhqdev-sys/GHM`
- Branch: `integration/ghm-identity-merge-candidate-20261018`
- Auto-deploy was ON in the 2026-11-17 inventory.
- URL: `https://ghm-identity-qualification.onrender.com`

The matching names and creation date suggest a historical qualification setup, but do not establish who created it, whether the owner authorised it, whether it was ever intentionally paid for, or what data it contains.

## Read-only investigation results

Render metrics were successfully queried for the unexpected Postgres resource over 2026-10-18 00:00Z through 2026-11-17 03:39Z at one-hour resolution:
- 720 hourly active-connection samples.
- 40 hourly samples reported one active connection.
- Peak observed active connections: 1.
- Last nonzero hourly samples included 2026-11-15 11:00Z, 2026-11-16 05:00Z, and 2026-11-17 00:00Z.
- This indicates the database has had occasional connection activity; it is not evidence that the database is unused. Hourly metrics do not identify the connecting client or prove continuous use.

A read-only SQL inspection was attempted through the hosted Render connector. It failed before executing because the database's external IP allowlist is empty and the hosted Render MCP server does not expose an allowlistable IP. No IP allowlist change was made. Therefore the database's schemas, tables, contents, current sessions, and data value remain unknown.

The Render `get_postgres` lookup returned an empty object in earlier attempts. No billing/invoice ledger or resource-creation audit trail has yet been obtained. The plan classification alone is not proof of a specific charge or payment.

## Current conclusion

- Production `ghm-db` remains the only owner-confirmed paid production database and must be retained.
- `ghm-payfast-sandbox-db` is the historical Free sandbox database, suspended by billing; do not resume it.
- `ghm-identity-qualification-20261018` is an unexpected available `basic_256mb` resource. Treat it as a potential unauthorised recurring-cost exposure and investigate its origin and billing urgently.
- Do not claim the owner knowingly created or approved this resource.
- Do not delete, suspend, resize, modify networking, or otherwise alter it until data preservation and origin are understood and the owner explicitly authorises the relevant action.
- Do not add an external IP to its allowlist merely to enable this investigation.

## Next bounded actions

1. Check Render billing/invoices/usage for this exact Postgres resource ID and identify the first and latest billed dates and amounts.
2. Ask Render support/account audit for the resource creator, creation event, and any associated project/team audit trail if the dashboard does not expose it.
3. Identify any service/environment references to this database without exposing secrets; the similarly named qualification service is a candidate, not proof of connection.
4. Establish a safe, owner-approved data-preservation path before any retirement decision. Current hosted SQL inspection is blocked by the empty IP allowlist.
5. Once billing, ownership/origin, and preservation are established, present the exact action and obtain owner approval before changing or deleting the resource.

## Change record

All checks in this investigation were read-only. No database, service, plan, network allowlist, environment variable, deployment, secret, backup, or production data was changed. No deletion or suspension was performed.
