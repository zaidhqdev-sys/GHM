# GHM Objectives and Operating Rules

**Status:** Standing product and engineering direction  
**Owner:** ZAID Technologies / ZM Projects (Pty) Ltd  
**Applies to:** The GHM repository, GHM Internal Runtime, `ghm-db`, and every product integrating with GHM  
**Last reviewed:** 2026-11-23

## 1. Mission

Build GHM into the dependable, secure, continuously improving backend and system of record that ZAID Technologies deserves.

The immediate business objective is simple:

**Move ZAID Technologies' products onto GHM, implement the capabilities those products genuinely need, and improve GHM continuously as those needs emerge.**

GHM is not a theoretical platform that must be declared complete before products can use it. Product requirements drive its development. A real product gap is a reason to improve GHM—not a reason to start another architecture project, duplicate existing work, or indefinitely delay integration.

The measure of success is working ZAID Technologies products operating on GHM, with their required data, identity, permissions and workflows handled reliably by GHM.

## 2. Product-first development

Product integration is the primary driver of GHM priorities.

### Zaid Connect
Move Connect's application data and backend workflows to GHM. Remove its Supabase runtime dependency. Preserve and complete the capabilities Connect actually uses, including:
- Authentication, account identity and business membership.
- Business profiles, categories, operating hours and directory visibility.
- Saved businesses, marketplace and supplier discovery.
- Projects and Opportunities, including atomic linked creation.
- Enquiries, quotes, notifications and relevant account workflows.
- Media/logo storage and uploads.
- Correct tenant isolation, authorization and business permissions.
- Referrals, onboarding and other remaining product workflows as their current implementation is reconciled.

Do not assume every item above is unfinished. Inspect the current Connect repository, merged PRs, open PRs and handovers before classifying any capability. Do not rebuild completed functionality.

### QuoteFlow
Restore QuoteFlow as a functioning product on GHM, not merely a client pointed at a new URL. Its migration includes:
- GHM authentication and account identity.
- Multi-Business access and isolation.
- Quote and related business workflows.
- Required storage and API operations.
- Removal of Supabase dependencies.
- Rebuild, test, sign and republish the Android application after the required GHM issuer and QuoteFlow integration work is ready.

The currently distributed APK is known to be non-functional after the backend switch. Treat restoring a working, tested release as a product outcome—not as a documentation milestone.

### Other ZAID Technologies products
Design GHM capabilities for reuse across products, but do not build speculative features without a product requirement, a concrete security/reliability need, or an explicit owner objective. Connect and QuoteFlow are the immediate integration drivers; future products should benefit from capabilities built for real use.

## 3. GHM capability principles

GHM should become a strong, reusable backend through incremental delivery:

1. **One system of record:** GHM Internal Runtime and `ghm-db` are the target. Supabase is legacy to remove, not a parallel target dependency.
2. **Product-led capabilities:** implement the smallest complete GHM capability needed by a real product workflow.
3. **Secure by design:** authentication, actor identity, tenant isolation, authorization, least privilege, auditability and safe data handling are core requirements—not optional follow-up work.
4. **Reuse before creating:** inspect existing APIs, services, migrations, functions, tests, PRs and branches before adding anything.
5. **End-to-end outcomes:** a capability is not complete merely because a migration, unit test or backend endpoint exists. Verify the product can use it through its real integration path.
6. **Continuous improvement:** improve the underlying GHM capability when a real requirement exposes a gap. Keep improvements proportionate to the requirement.
7. **No artificial perfection gate:** do not require every GHM subsystem to be finished before a product can migrate. Establish the minimum safe, complete path for the product workflow being delivered, then continue improving.
8. **No duplicate architecture:** one chosen implementation path per capability. Do not develop competing gateways, migration systems, auth issuers or hosting approaches in parallel without an explicit reason and owner decision.

## 4. Priority and decision order

For each task, use this order:

1. Identify the concrete Connect or QuoteFlow workflow that must work.
2. Establish its current state from the product repository, GHM repository, handovers, merged/open PRs, branches and available qualification evidence.
3. Identify the exact missing or defective GHM capability, if any.
4. Reuse the existing implementation wherever possible.
5. Make the smallest complete change that closes the product gap.
6. Validate the changed capability at the appropriate level, without repeating unchanged qualification.
7. Verify the product integration or clearly record the remaining integration work.
8. Update the existing authoritative handover with the result and the next actionable step.

When priorities compete, prefer work that removes a real product dependency, restores a broken product workflow, or closes a concrete security/data-integrity requirement. Do not prioritize PR activity, architectural novelty, report volume or qualification for its own sake.

## 5. Mandatory pre-task procedure

This procedure applies before **every** task, decision, recommendation, code change, PR action or operational instruction concerning GHM or its products.

### A. Read the governing objectives
Read this document first. Treat it as the standing direction, not optional background.

### B. Inspect the current handover
Read the latest relevant existing handover and any linked dependency/current-state documents. Follow the recorded decisions, constraints, evidence and next steps. If a handover conflicts with newer verified evidence, reconcile the conflict before acting and record the correction.

### C. Inspect repository state
Check the relevant repository's current main/default branch, working tree where local access is used, existing branches/worktrees, and relevant merged/open/closed PRs. Inspect the actual PR head and changed files when the task depends on them.

### D. Reuse existing work
Search for an existing implementation, prior qualification, test, migration, issue, branch or PR before proposing new work. Determine whether prior work is:
- merged and available;
- open and active;
- closed but preserved and reusable;
- superseded;
- genuinely missing.

A closed PR is not proof that its work was deleted. An open PR is not proof that its implementation is still the correct path. Verify the code and current disposition.

### E. State the task narrowly
Before acting, establish:
- the product outcome being pursued;
- the exact capability or defect being addressed;
- the existing implementation being reused;
- the smallest intended change;
- the required validation;
- any real operational or security boundary.

Do not expand the task into unrelated architecture, broad audits or speculative future work.

### F. Hard stop — this procedure is an execution gate

The pre-task procedure above is a **mandatory execution gate**, not guidance, a reminder, or a checklist that may be skipped when a task appears small or familiar.

For every task, before giving a substantive recommendation, asking the owner to perform an operational step, or making any repository, PR, branch, deployment, database, product or configuration change, the assistant must:

1. Re-read this objectives document.
2. Inspect the latest relevant handover(s) in **every repository affected by the task**. Follow links to dependent handovers where the task depends on them.
3. Inspect the current default/main branch and relevant working-tree state where local repository access is being used. Preserve all existing local changes.
4. Inspect the relevant PR history, including open, draft, closed and merged PRs—not only the PR most recently mentioned. Check their current head/base commits, changed files, reviews and exact-head validation when relevant.
5. Inspect existing branches and worktrees relevant to the task, including preserved or closed-PR branches. Establish which implementation is current and which work is reusable before proposing another branch, PR or implementation.
6. Reconcile the evidence with the product objective and the owner's recorded decisions and constraints. Do not ask the owner to repeat information already present in those records.

**No evidence, no assumption:** if any required repository, handover, PR, branch or local-state inspection cannot be completed, the assistant must identify exactly what could not be inspected, must not present guesses or stale recollections as current facts, and must not proceed with a change or operational instruction that depends on that missing evidence. It may continue only with work that is demonstrably independent of the unavailable evidence.

The assistant must perform these inspections for **each new task**, including follow-up tasks in the same conversation. A previous task's inspection does not carry forward as proof of current state. A prior answer, summary, memory, PR description or old handover is not a substitute for checking the current repository records.

The task scope must remain tied to the owner's stated product outcome. Do not invent blockers, change established product architecture, reopen rejected options, duplicate already-qualified work, create branches/PRs for convenience, or turn a focused task into an unrelated audit. If the evidence shows work already exists, continue from that work rather than starting over.

## 6. Mandatory post-task procedure

After every completed task:

1. Record what changed and why in the existing relevant handover.
2. Record exact repository, branch, commit and PR references where applicable.
3. Record validation against the exact commit; distinguish code/CI qualification from production or end-to-end product verification.
4. Record production impact explicitly: what was and was not changed.
5. Update the next actionable step so the next task can continue without reconstructing the history.
6. Verify that the handover update itself was committed to the intended existing branch.

Do not create a new handover for every small step. Append to or correct the existing authoritative handover unless a genuinely separate subject requires its own document. Keep the objectives here stable; put changing execution facts in handovers.

A task is not fully closed merely because code was changed. Its handover update is part of completion.

## 7. Branch, PR and qualification discipline

- Reuse existing branches and worktrees. Do not create a branch or worktree unless technically necessary and explicitly justified.
- Do not create overlapping PRs for the same capability.
- Before opening or changing a PR, inspect related PRs, branch ancestry, current main and existing handover decisions.
- Keep one authoritative active implementation path for each workstream.
- Preserve local staged, unstaged and untracked work. Never use destructive Git operations to make a task easier.
- Do not requalify an unchanged commit without a specific reason. Reuse exact-head CI evidence while the qualified commit and relevant environment remain unchanged.
- If a commit changes, qualify the new exact head only to the extent required by the change.
- Keep historical work and findings available. Do not delete branches or close PRs merely to make the list look cleaner.
- Do not merge, close, rebase, force-push or otherwise alter PR disposition without the required owner direction and review of consequences.
- A PR, passing CI run, migration plan or handover is not itself a product outcome.

## 8. Operational and financial constraints

Standing constraints must be checked before proposing operational work:

- Production database target: Render `ghm-db`, database `ghm_db`.
- Runtime target: GHM Internal Runtime. Do not reintroduce Supabase as a target dependency.
- Do not create additional paid databases, Render services, database tools, schedules or monitoring processes without an explicit owner decision.
- Do not revive the expired/suspended sandbox database or repurpose sandbox services as production.
- Preserve the existing cost and account constraints; do not assume new funds or capacity are available.
- No production migration, database role/ACL/credential change, secret/environment change, deployment, restart, payment action or other production mutation without the applicable explicit authorization and verified procedure.
- PayFast and payment activation remain outside active work until the owner confirms provider sandbox access is restored and authorizes that work.
- User migration is not a prerequisite: users may re-register where that is the chosen product path.
- Do not expose credentials, tokens, connection strings or private secrets in chat, logs, commands or Git.

These constraints are not invitations to repeatedly investigate already rejected infrastructure alternatives. Use the current handover for the latest verified operational state.

## 9. Evidence and language rules

Be precise about the difference between:
- capability implemented in source;
- capability merged to main;
- tests passed on an exact commit;
- production database state verified;
- service deployed and healthy;
- authenticated product integration verified end to end;
- product release restored and usable.

Never describe one as proof of another.

Do not call something a blocker unless the current evidence shows that it prevents the specific next product outcome. Identify the exact dependency and its evidence. Do not revive stale blocker statements from old handovers without checking current state.

Do not claim GHM is incapable because a particular integration is not yet connected. Conversely, do not claim production readiness merely because GHM has the relevant source code.

When uncertain, inspect the evidence. Do not guess, invent missing work, or ask the owner to repeat information already recorded.

## 10. Scope boundaries

This document governs GHM's engineering direction and how work is performed. It does not authorize production operations, payments, spending, deployment, migration execution, or changes to security controls.

It does not make every possible GHM feature an immediate priority. The owner’s product objectives and the real requirements of Connect and QuoteFlow determine the work.

It does not replace detailed technical handovers. It makes consulting and updating those handovers mandatory and gives them a consistent purpose.

## 11. Definition of success

GHM is succeeding when:
- Connect operates on GHM without a Supabase runtime dependency.
- QuoteFlow operates on GHM, and its Android release is restored, tested, signed and published.
- Product data, identities, business boundaries, permissions and workflows behave correctly.
- GHM capabilities are reusable, secure, observable and maintainable.
- Real product needs lead to measured improvements in GHM.
- Work progresses through one coherent implementation path, with no repeated rediscovery or unnecessary qualification.
- The owner can see concrete product progress rather than an expanding collection of branches, PRs and reports.

**Standing instruction:** Before every GHM task, read these objectives and the relevant existing handover, inspect the current PR/branch/repository state, and reuse prior work. After every completed task, update the existing handover. Do not drift from the objective: get ZAID Technologies products onto GHM and improve GHM as the products require.
