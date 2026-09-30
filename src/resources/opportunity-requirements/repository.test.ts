import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';
import type {
  OpportunityCapabilityRequirement,
  ReplaceOpportunityCapabilityRequirementInput,
} from './contracts';
import { PgOpportunityRequirementsRepository } from './repository';

const opportunityId = 101;
const capabilityId = '11111111-1111-4111-8111-111111111111';
const secondCapabilityId = '22222222-2222-4222-8222-222222222222';

const requirementRow = {
  id: 1,
  opportunity_id: opportunityId,
  capability_id: capabilityId,
  importance: 'required',
  minimum_proficiency_level: 'proficient',
  description: 'Construction capability required.',
  sort_order: 0,
};

const secondRequirementRow = {
  id: 2,
  opportunity_id: opportunityId,
  capability_id: secondCapabilityId,
  importance: 'preferred',
  minimum_proficiency_level: null,
  description: 'Secondary capability.',
  sort_order: 1,
};

const createFakePool = (
  opportunityReadable: boolean,
  options: {
    manager?: boolean;
    creator?: boolean;
    businessMember?: boolean;
    capabilitiesSelectable?: boolean;
    requirementRows?: Record<string, unknown>[];
  } = {},
): {
  pool: TransactionPool;
  calls: string[];
  insertParams: unknown[][];
} => {
  const calls: string[] = [];
  const insertParams: unknown[][] = [];

  const client = {
    async query(sql: string, params?: unknown[]): Promise<{
      rowCount: number;
      rows: Record<string, unknown>[];
    }> {
      calls.push(sql);

      if (
        sql.includes('FROM ghm.opportunity o') &&
        sql.includes("bm.membership_role IN ('owner', 'administrator')") &&
        sql.includes("bm.membership_status = 'active'")
      ) {
        return {
          rowCount: options.manager ? 1 : 0,
          rows: [],
        };
      }

      if (
        sql.includes('FROM ghm.opportunity o') &&
        sql.includes("o.visibility IN ('authenticated', 'public')")
      ) {
        return {
          rowCount:
            opportunityReadable ||
            options.creator ||
            options.businessMember ||
            options.manager
              ? 1
              : 0,
          rows: [],
        };
      }

      if (sql.includes('FROM ghm.capability')) {
        const requestedIds = Array.isArray(params?.[0])
          ? params[0] as string[]
          : [];

        if (!options.capabilitiesSelectable) {
          return {
            rowCount: 0,
            rows: [],
          };
        }

        return {
          rowCount: requestedIds.length,
          rows: requestedIds.map((id) => ({ id })),
        };
      }

      if (
        sql.includes('SELECT') &&
        sql.includes('FROM ghm.opportunity_capability_requirement')
      ) {
        return {
          rowCount: options.requirementRows?.length ?? 0,
          rows: options.requirementRows ?? [],
        };
      }

      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return {
          rowCount: 0,
          rows: [],
        };
      }

      if (
        sql.includes(
          'DELETE FROM ghm.opportunity_capability_requirement',
        )
      ) {
        return {
          rowCount: 1,
          rows: [],
        };
      }

      if (
        sql.includes(
          'INSERT INTO ghm.opportunity_capability_requirement',
        )
      ) {
        insertParams.push(params ?? []);

        return {
          rowCount: 1,
          rows: [],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },

    release(): void {},
  };

  return {
    pool: {
      async connect(): Promise<PoolClient> {
        return client as unknown as PoolClient;
      },
    },
    calls,
    insertParams,
  };
};
const customerContext = (userId = 7): AuthContext => ({
  userId,
  role: 'customer',
});

const expectedRequirement: OpportunityCapabilityRequirement = {
  id: 1,
  opportunityId,
  capabilityId,
  importance: 'required',
  minimumProficiencyLevel: 'proficient',
  description: 'Construction capability required.',
  sortOrder: 0,
};

const replacementInput: ReplaceOpportunityCapabilityRequirementInput = {
  capabilityId,
  importance: 'required',
  minimumProficiencyLevel: 'proficient',
  description: 'Construction capability required.',
  sortOrder: 0,
};

test(
  'Opportunity requirements read follows authenticated/public Opportunity visibility',
  async () => {
    const { pool, calls } = createFakePool(true, {
      requirementRows: [requirementRow],
    });
    const repository = new PgOpportunityRequirementsRepository(pool);

    const result = await repository.listOpportunityRequirements(
      customerContext(),
      opportunityId,
    );

    assert.deepEqual(result, [expectedRequirement]);
    assert.equal(
      calls.some((sql) =>
        sql.includes(
          "o.visibility IN ('authenticated', 'public')",
        ),
      ),
      true,
    );
  },
);

test(
  'Opportunity requirements read allows the Opportunity creator even when visibility is private',
  async () => {
    const { pool, calls } = createFakePool(false, {
      creator: true,
      requirementRows: [requirementRow],
    });
    const repository = new PgOpportunityRequirementsRepository(pool);

    const result = await repository.listOpportunityRequirements(
      customerContext(7),
      opportunityId,
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].opportunityId, opportunityId);

    assert.equal(
      calls.some((sql) =>
        sql.includes('o.creator_account_id = $2'),
      ),
      true,
    );
  },
);

test(
  'Opportunity requirements read allows an active business owner or administrator',
  async () => {
    const { pool, calls } = createFakePool(false, {
      manager: true,
      requirementRows: [requirementRow],
    });
    const repository = new PgOpportunityRequirementsRepository(pool);

    const result = await repository.listOpportunityRequirements(
      customerContext(7),
      opportunityId,
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].capabilityId, capabilityId);

    assert.equal(
      calls.some((sql) =>
        sql.includes("bm.membership_status = 'active'") &&
        !sql.includes(
          "bm.membership_role IN ('owner', 'administrator')",
        ),
      ),
      true,
    );
  },
);

test(
  'Opportunity requirements read allows an active business member',
  async () => {
    const { pool, calls } = createFakePool(false, {
      businessMember: true,
      requirementRows: [requirementRow],
    });
    const repository = new PgOpportunityRequirementsRepository(pool);

    const result = await repository.listOpportunityRequirements(
      customerContext(7),
      opportunityId,
    );

    assert.deepEqual(result, [expectedRequirement]);

    const membershipQuery = calls.find((sql) =>
      sql.includes('FROM ghm.business_membership bm'),
    );

    assert.ok(membershipQuery);
    assert.equal(
      membershipQuery.includes("bm.membership_status = 'active'"),
      true,
    );
    assert.equal(
      membershipQuery.includes(
        "bm.membership_role IN ('owner', 'administrator')",
      ),
      false,
    );
  },
);

test(
  'Opportunity requirements read returns an empty set for an unrelated private Opportunity',
  async () => {
    const { pool, calls } = createFakePool(false);
    const repository = new PgOpportunityRequirementsRepository(pool);

    const result = await repository.listOpportunityRequirements(
      customerContext(99),
      opportunityId,
    );

    assert.deepEqual(result, []);
    assert.equal(
      calls.some((sql) =>
        sql.includes(
          'FROM ghm.opportunity_capability_requirement',
        ),
      ),
      false,
    );
  },
);

test(
  'Opportunity requirements replacement rejects a non-selectable Capability',
  async () => {
    const { pool, calls } = createFakePool(true, {
      manager: true,
      capabilitiesSelectable: false,
    });
    const repository = new PgOpportunityRequirementsRepository(pool);

    await assert.rejects(
      () =>
        repository.replaceOpportunityRequirements(
          customerContext(7),
          opportunityId,
          [replacementInput],
        ),
      /All opportunity requirement capabilities must be active and selectable/,
    );

    assert.equal(
      calls.some((sql) =>
        sql.includes(
          'AND lifecycle_status = \'active\'',
        ) &&
        sql.includes('AND is_selectable = true'),
      ),
      true,
    );
  },
);

test(
  'Opportunity requirements replacement remains manager-authorized',
  async () => {
    const { pool } = createFakePool(true, {
      manager: false,
    });
    const repository = new PgOpportunityRequirementsRepository(pool);

    await assert.rejects(
      () =>
        repository.replaceOpportunityRequirements(
          customerContext(99),
          opportunityId,
          [replacementInput],
        ),
      /Opportunity requirements access denied/,
    );
  },
);

test(
  'Opportunity requirements replacement remains available to a manager',
  async () => {
    const { pool } = createFakePool(true, {
      manager: true,
      capabilitiesSelectable: true,
      requirementRows: [requirementRow],
    });
    const repository = new PgOpportunityRequirementsRepository(pool);

    const result = await repository.replaceOpportunityRequirements(
      customerContext(7),
      opportunityId,
      [replacementInput],
    );

    assert.deepEqual(result, [expectedRequirement]);
  },
);

test(
  'Opportunity requirements replacement assigns omitted sort order by input ordinal',
  async () => {
    const { pool, calls } = createFakePool(true, {
      manager: true,
      capabilitiesSelectable: true,
      requirementRows: [
        requirementRow,
        secondRequirementRow,
      ],
    });
    const repository = new PgOpportunityRequirementsRepository(pool);

    const result = await repository.replaceOpportunityRequirements(
      customerContext(7),
      opportunityId,
      [
        {
          capabilityId,
          importance: 'required',
        },
        {
          capabilityId: secondCapabilityId,
          importance: 'preferred',
        },
      ],
    );

    assert.deepEqual(
      result.map((requirement) => requirement.sortOrder),
      [0, 1],
    );

    const insertCalls = calls.filter((sql) =>
      sql.includes(
        'INSERT INTO ghm.opportunity_capability_requirement',
      ),
    );

    assert.equal(insertCalls.length, 2);
  },
);
