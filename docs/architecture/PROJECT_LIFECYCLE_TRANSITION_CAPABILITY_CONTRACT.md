# Project Lifecycle Transition Capability Contract

**Status:** QUALIFIED / CLOSED / PASS — implementation and runtime qualification completed 2026-09-14

## 1. Purpose

This contract governs the narrow Project lifecycle capability required by the
Project Quote decision operation.

Project owns Project lifecycle semantics.

Project Quote owns the commercial decision that may cause one specific Project
lifecycle transition.

The capability exists only to permit:

    open -> in_progress

It does not create a generic Project status-update operation.

## 2. Capability

Canonical internal capability:

    transitionOpenProjectToInProgress

Inputs:

- existing authorized PostgreSQL PoolClient;
- authenticated AuthContext;
- Project ID.

The capability MUST NOT accept:

- caller-supplied target status;
- caller-supplied account/owner identity as authority;
- provider-specific identifiers.

## 3. Authorization

The capability executes only inside the existing authorized transaction.

The authenticated principal remains the authority.

The Project owner is derived from:

    ghm.project.account_id
        ->
    ghm.account_identity.id

The operation MUST verify that the authenticated account owns the Project.

Ownership MUST NOT be established solely from a caller-supplied account ID.

## 4. Atomic Mutation

The mutation MUST be one parameterized statement equivalent to:

    UPDATE ghm.project
    SET
      status = 'in_progress',
      updated_at = now()
    WHERE
      id = $1
      AND account_id = $2
      AND status = 'open'
    RETURNING ...

The operation MUST NOT:

- accept arbitrary status values;
- expose generic status mutation;
- perform a separate read followed by an unguarded update;
- acquire a second database connection;
- commit independently of the surrounding Project Quote decision.

A zero-row result MUST be treated as a failed transition and MUST NOT be
reported as successful.

## 5. Transaction Ordering

Project Quote acceptance MUST execute within one transaction and one
PoolClient.

Required sequence:

1. establish AuthContext;
2. begin authorized transaction;
3. identify the selected Project Quote's Project;
4. lock the Project;
5. verify Project ownership;
6. verify Project status is open;
7. lock the selected Project Quote;
8. verify the selected quote is submitted;
9. reject competing submitted quotes;
10. accept the selected quote;
11. invoke `transitionOpenProjectToInProgress`;
12. verify the Project transition succeeded;
13. commit.

Any failure MUST roll back the complete decision.

## 6. Concurrency

The Project row is locked before lifecycle transition.

The selected Quote row is locked before decision.

The unique accepted-quote constraint remains the database invariant preventing
multiple accepted quotes for one Project.

A concurrent acceptance MUST therefore fail or serialize rather than producing
two successful accepted decisions.

## 7. PostgreSQL Privilege Boundary

The existing Project runtime boundary is preserved except for the explicitly
qualified underlying database primitive required by this capability.

The selected underlying PostgreSQL primitive is:

    column-level UPDATE(status)

This is the minimum Project privilege required by the governed transition.
It MUST NOT be implemented as generic Project UPDATE authority.

No blanket Project UPDATE privilege may be introduced.

No DELETE privilege may be introduced.

No schema-owner execution may be introduced.

No SECURITY DEFINER function or provider-specific RPC is introduced by this
contract.

The PostgreSQL column privilege is an underlying database capability only. It
is NOT an application-level Project lifecycle API.

The application capability remains strictly:

    open -> in_progress

The transition primitive MUST hard-code the target state and enforce the
authenticated Project-owner predicate and current open state in the mutation
statement.

Runtime qualification MUST additionally prove that:

- the ordinary Project update path cannot mutate status;
- the runtime role has no blanket Project UPDATE privilege;
- the runtime role has only column-level UPDATE(status) in addition to the
  existing Project boundary;
- arbitrary direct status values are not reachable through the GHM application
  boundary;
- the governed transition remains the only application path that mutates
  Project status.

## 8. Application Boundary

The Project repository/service MUST continue to expose only the existing
owner-edit operation for ordinary Project updates.

Ordinary Project update MUST NOT accept or mutate `status`.

The lifecycle transition MUST be reachable only through the dedicated
internal capability used by the governed Project Quote decision operation.

There must be no public resource operation equivalent to:

    project.update({ status: ... })

## 9. Qualification Gate

This capability is CLOSED / PASS. Qualification demonstrated:

### Positive

1. Project owner can accept an eligible submitted quote.
2. Selected quote becomes accepted.
3. Project becomes `in_progress`.
4. Competing submitted quotes become rejected.
5. All changes commit atomically.

### Authorization negatives

6. Non-owner cannot accept.
7. Business cannot accept its own submitted quote.
8. Unrelated customer cannot accept.
9. A quote for another Project cannot be accepted.
10. Caller-supplied identity cannot bypass ownership.

### Lifecycle negatives

11. Accepted quote cannot be accepted again.
12. Rejected quote cannot be accepted.
13. Quote on a non-open Project cannot be accepted.
14. Generic Project update cannot mutate status.
15. The transition primitive cannot receive an arbitrary target status.
16. Missing Project transition cannot be reported as success.

### Concurrency

17. Concurrent acceptance cannot produce two accepted quotes.
18. Project cannot be transitioned twice successfully.
19. Quote and Project state remain consistent after contention.

### Privilege

20. `ghm_runtime` has only the required Project column privilege in addition
    to the existing qualified boundary.
21. No blanket Project UPDATE privilege exists.
22. Runtime still has no Project DELETE privilege.
23. Runtime cannot modify lifecycle status through the ordinary Project
    repository update path.
24. The effective privilege change is explicitly recorded as part of this
    capability qualification.

## 10. Production Safety

This construction contract authorizes no production migration, cutover,
routing change, credential change, provider migration, or deployment.

All implementation and qualification occur against the construction/runtime
environment only.

## 11. Completion Rule

This capability is CLOSED / PASS because the following completion criteria are satisfied:

- implementation exists;
- repository tests pass;
- build passes;
- diff check passes;
- runtime qualification passes;
- effective Project privileges are re-qualified;
- documentation and evidence reconcile.

All completion criteria are satisfied by the 2026-09-14 runtime qualification evidence.

