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


## Confirmed assistant responsibility (2026-11-17 follow-up)

The prior-conversation record has now been retrieved and resolves the attribution question:
- At 2026-10-18 00:16:51Z, an assistant response represented a dedicated GHM staging database as available.
- At 2026-10-18 18:19:55Z, an assistant response instructed the owner to confirm `ghm_identity_qualification_20261018` and explicitly disclosed that it was on a billable plan.
- At 2026-10-18 18:22:58Z, an assistant response explicitly stated: **“I also created”** the separate `ghm_identity_qualification_20261018` database, described it as a third billable database, and discussed whether to keep/remove it.
- The retrieved conversation history contains no explicit informed owner approval to create a third paid PostgreSQL database. The owner's earlier “proceed” preceded the disclosure that the assistant had created a separate billable database and is not treated as informed approval.
- Accordingly, this is not merely an unattributed unexpected resource: the assistant explicitly acknowledged creating it. Responsibility for that unauthorised provisioning lies with the assistant-directed workflow. Do not imply the owner created or approved it.

## Matching service creation and activity evidence

Live Render service details confirm `ghm-identity-qualification` was created at 2026-10-18 19:36:27Z, on branch `integration/ghm-identity-merge-candidate-20261018`. It is a Free Web Service, currently auto-deploy OFF. Its service events show the initial deploy at 19:36:28Z and subsequent deployment/configuration activity on 2026-10-18/19. This establishes a same-day qualification service, but does not by itself prove which database it connected to or who clicked the Render creation action.

The Render service event stream does not include PostgreSQL resource-creation events. The database creator identity and billing ledger remain unverified through the available connector. The assistant's explicit contemporaneous statement “I also created” is the strongest available attribution evidence and must be preserved as such.

## Billing and immediate cost-control status

The unexpected database remains reported as `basic_256mb`, 15 GB, available/not suspended. No invoice-level charge, billing period, or total amount has yet been retrieved. Do not state a dollar amount until supported by the Render invoice/usage ledger. No delete/suspend action has been taken; the available Render connector exposes no Postgres delete/suspend action. This is an acknowledged cost exposure requiring prompt resolution, not a reason to revive the historical sandbox or provision replacement infrastructure.

The owner has stated that they are being billed for infrastructure they did not know about. The next step is to obtain exact billing attribution and a safe preservation/retirement path; do not ask the owner to repeat the history already recovered. Any destructive action still requires the owner's explicit direction.


## Owner-provided Render billing evidence (2026-11-17 03:45Z)

The owner supplied the Render Workspace > Billing page contents:
- Workspace plan: Hobby.
- November month-to-date Datastores accrued: **$9.04 USD**.
- November projected total: **$16.80 USD**.
- Services: $0.00; Pipeline Minutes: $0.00.
- October 2026 invoice: paid, **$9.82 USD**.
- September and August 2026 invoices: paid, $0.00.
- Credit balance: $0.00.

These are workspace-level aggregate amounts. They establish that datastore usage has accrued and that October had a paid invoice, but do not yet allocate either amount to the unexpected database versus production `ghm-db` or any other datastore. Do not claim that the full $9.04 MTD or $9.82 October invoice was caused by the unexpected database until per-resource billing detail is visible. The owner should expand the Datastores usage section or download the billing CSV and provide the per-resource rows; no service-level suspension should be mistaken for stopping a PostgreSQL datastore charge.


## Per-datastore billing attribution and owner data statement (2026-11-17 03:47Z)

The owner supplied the expanded Render Billing > Unbilled Charges > Datastores breakdown. This resolves November month-to-date attribution:
- Production `ghm-db`: **$3.39 USD**.
- Unexpected `ghm-identity-qualification-20261018`: **$5.65 USD**.
- Historical suspended `ghm-payfast-sandbox-db`: **$0.00 USD**.
- Datastore total: **$9.04 USD**.
- November projected workspace total: **$16.80 USD**.
- Services and Pipeline Minutes: **$0.00 USD**.
- October 2026 invoice: **$9.82 USD paid**; per-resource October allocation has not been supplied/verified.
- Credit balance: **$0.00 USD**.

The unexpected qualification database is therefore directly attributed **$5.65 USD of November MTD datastore charges** (approximately 62.5% of the $9.04 datastore total). The production database accounts for $3.39 and the suspended PayFast sandbox for $0.00. Do not attribute the October $9.82 invoice to the unexpected database without itemized October evidence.

The owner has now stated: **“there should be nothing in there i never used the fucker.”** Record this as the owner's direct statement that they did not use the unexpected database and expect it to contain no needed data. This is not an independent inspection of its contents; schemas/data remain uninspected because the read-only SQL attempt was blocked before execution. No export, deletion, or suspension has occurred.

## Immediate retirement decision boundary

The owner has stated the resource was never used, but has not yet given an unambiguous explicit instruction to permanently delete it. Because deletion is destructive and the database contents/backups have not been inspected, do not infer deletion authorization from the statement alone. Ask one direct confirmation: whether the owner authorizes permanent deletion of the exact resource `ghm-identity-qualification-20261018`, accepting loss of any data/backups it contains.

No connected Render action currently exposes Postgres deletion or suspension. Do not claim that charges have stopped. Do not suspend similarly named web services as a substitute; the charge is attached to the PostgreSQL datastore. Once owner authorization is explicit, provide the exact Render dashboard action path and verify the resource is gone and subsequent billing no longer accrues. Separately request a credit/refund review from Render for the $5.65 November MTD charge and investigate the itemized October invoice; do not promise a credit.


## Full owner-provided charge breakdown for unexpected database (2026-11-17 03:50Z)

The owner supplied the expanded line-item detail for `ghm-identity-qualification-20261018`. The $5.65 November MTD charge is fully explained by:
- Basic-256mb compute (plan `0.1c-256mb`): rate **$0.0083/hour**, usage **387.75 hours**, cost **$3.23 USD**.
- Basic-256mb disk (15 GB): rate **$0.0062/hour**, usage **387.75 hours**, cost **$2.42 USD**.
- Outgoing bandwidth: **0 GB**, no charge.
- Private Link: no usage/charge.
- Total: **$5.65 USD**.

This confirms the charge is the sum of compute and 15 GB disk time, not bandwidth or Private Link. The same 387.75-hour usage window is shown for compute and disk. The owner has stated they never used this database. Do not describe these costs as user-approved or as costs of production `ghm-db`.

The earlier November per-datastore breakdown remains: production `ghm-db` $3.39; unexpected qualification database $5.65; suspended PayFast sandbox $0.00; datastore total $9.04. October invoice $9.82 remains paid but not yet itemized by resource.

No deletion has been performed. The exact resource to retire, subject to explicit owner authorization, is Render Postgres `ghm-identity-qualification-20261018` (ID `dpg-dba0tu3rjlhs738fs2sg-a`). The connected Render tools do not expose a Postgres delete action.


## Explicit owner deletion authorization (2026-11-17 03:53Z)

The owner explicitly authorized permanent deletion of `ghm-identity-qualification-20261018`, including any data and backups it contains. The authorization was unambiguous and is limited to this exact unexpected database:
- Render Postgres ID: `dpg-dba0tu3rjlhs738fs2sg-a`
- Display name: `ghm-identity-qualification-20261018`
- Database: `ghm_identity_qualification_20261018`

The authorization does not extend to production `ghm-db` / `ghm_db`, the historical PayFast sandbox DB, or any other service/resource.

Execution status: **NOT YET DELETED**. The connected Render integration currently exposes list/get/query/metrics/create operations for Postgres but no delete operation. The owner must use the Render Dashboard's database Info page: select the exact Postgres resource `ghm-identity-qualification-20261018`, scroll to the bottom, and click **Delete Database**, then complete Render's confirmation. Render's official documentation states deleted database instances have no retained backups or snapshots. Do not claim deletion or cessation of billing until the resource is absent from the live Postgres inventory and billing reflects the change.

Official procedure: https://render.com/docs/postgresql-creating-connecting (section “Deleting your database”). The owner has expressly accepted loss of the database's data/backups by authorizing deletion.


## Live inventory recheck and direct dashboard locator (2026-11-17 03:57Z)

After the owner reported that the database was not visible in the dashboard, the Render Postgres inventory was queried again. It still returns the exact unexpected resource as available and not suspended:
- Name: `ghm-identity-qualification-20261018`
- ID: `dpg-dba0tu3rjlhs738fs2sg-a`
- Direct Render dashboard URL returned by the live API: https://dashboard.render.com/d/dpg-dba0tu3rjlhs738fs2sg-a

The same live inventory confirms the two protected resources separately:
- Production `ghm-db`: https://dashboard.render.com/d/dpg-dag0sdtbedkc7389vi2g-a
- Suspended PayFast sandbox `ghm-payfast-sandbox-db`: https://dashboard.render.com/d/dpg-db4416vlk1mc73eocug0-a

The owner has already explicitly authorized deletion of the unexpected resource. The direct URL is supplied to bypass dashboard list/navigation ambiguity. The resource remains **not deleted** as of this recheck; the Render integration still exposes no delete action. Do not click or delete either protected resource.
