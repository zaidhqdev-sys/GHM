import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  OpportunityCapabilityRequirement,
  OpportunityRequirementImportance,
  OpportunityRequirementProficiency,
  OpportunityRequirementsRepository,
  ReplaceOpportunityCapabilityRequirementInput,
} from './contracts';
import type { OpportunityId } from '../opportunity/contracts';

const REQUIREMENT_COLUMNS = `
  id,
  opportunity_id,
  capability_id,
  importance,
  minimum_proficiency_level,
  description,
  sort_order
`;

const MAX_REQUIREMENTS = 50;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertOpportunityId = (opportunityId: OpportunityId): void => {
  if (!Number.isSafeInteger(opportunityId) || opportunityId <= 0) {
    throw new Error('Invalid opportunityId');
  }
};

const assertCapabilityId = (capabilityId: string): void => {
  if (!UUID_PATTERN.test(capabilityId)) {
    throw new Error('Invalid capabilityId');
  }
};

const assertImportance = (
  importance: OpportunityRequirementImportance,
): void => {
  if (importance !== 'required' && importance !== 'preferred') {
    throw new Error('Invalid importance');
  }
};

const assertProficiency = (
  proficiency: OpportunityRequirementProficiency | null | undefined,
): void => {
  if (
    proficiency !== undefined &&
    proficiency !== null &&
    proficiency !== 'foundational' &&
    proficiency !== 'proficient' &&
    proficiency !== 'advanced' &&
    proficiency !== 'expert'
  ) {
    throw new Error('Invalid minimumProficiencyLevel');
  }
};

const normalizeDescription = (
  description: string | null | undefined,
): string | null => {
  if (description === undefined || description === null) {
    return null;
  }

  const normalized = description.trim();

  if (normalized.length < 1 || normalized.length > 1000) {
    throw new Error(
      'Description must be between 1 and 1000 characters',
    );
  }

  return normalized;
};

const normalizeSortOrder = (
  sortOrder: number | undefined,
  fallbackIndex: number,
): number => {
  const value = sortOrder ?? fallbackIndex;

  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 1000
  ) {
    throw new Error('Invalid sortOrder');
  }

  return value;
};

const normalizeInput = (
  requirements: readonly ReplaceOpportunityCapabilityRequirementInput[],
): ReplaceOpportunityCapabilityRequirementInput[] => {
  if (!Array.isArray(requirements)) {
    throw new Error('Requirements must be an array');
  }

  if (requirements.length > MAX_REQUIREMENTS) {
    throw new Error(`Requirements cannot exceed ${MAX_REQUIREMENTS}`);
  }

  const seen = new Set<string>();

  return requirements.map((requirement, index) => {
    if (!requirement || typeof requirement !== 'object') {
      throw new Error('Invalid requirement');
    }

    assertCapabilityId(requirement.capabilityId);

    if (seen.has(requirement.capabilityId.toLowerCase())) {
      throw new Error('Duplicate capabilityId');
    }

    seen.add(requirement.capabilityId.toLowerCase());

    const importance = requirement.importance ?? 'required';
    assertImportance(importance);

    assertProficiency(requirement.minimumProficiencyLevel);

    return {
      capabilityId: requirement.capabilityId,
      importance,
      minimumProficiencyLevel:
        requirement.minimumProficiencyLevel ?? null,
      description: normalizeDescription(requirement.description),
      sortOrder: normalizeSortOrder(
        requirement.sortOrder,
        index,
      ),
    };
  });
};

const mapRequirement = (
  row: Record<string, unknown>,
): OpportunityCapabilityRequirement => ({
  id: Number(row.id),
  opportunityId: Number(row.opportunity_id),
  capabilityId: String(row.capability_id),
  importance:
    row.importance as OpportunityRequirementImportance,
  minimumProficiencyLevel:
    row.minimum_proficiency_level === null
      ? null
      : (row.minimum_proficiency_level as OpportunityRequirementProficiency),
  description:
    row.description === null ? null : String(row.description),
  sortOrder: Number(row.sort_order),
});

const assertOpportunityManager = async (
  client: PoolClient,
  context: AuthContext,
  opportunityId: OpportunityId,
): Promise<void> => {
  const result = await client.query(
    `SELECT 1
     FROM ghm.opportunity o
     WHERE o.id = $1
       AND (
         o.creator_account_id = $2
         OR (
           o.owner_business_id IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM ghm.business_membership bm
             WHERE bm.business_id = o.owner_business_id
               AND bm.account_id = $2
               AND bm.membership_role IN ('owner', 'administrator')
               AND bm.membership_status = 'active'
           )
         )
       )
     LIMIT 1`,
    [opportunityId, context.userId],
  );

  if (result.rowCount !== 1) {
    throw new Error('Opportunity requirements access denied');
  }
};

const canReadOpportunity = async (
  client: PoolClient,
  context: AuthContext,
  opportunityId: OpportunityId,
): Promise<boolean> => {
  const result = await client.query(
    `SELECT 1
     FROM ghm.opportunity o
     WHERE o.id = $1
       AND (
         o.creator_account_id = $2
         OR (
           o.owner_business_id IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM ghm.business_membership bm
             WHERE bm.business_id = o.owner_business_id
               AND bm.account_id = $2
               AND bm.membership_status = 'active'
           )
         )
         OR o.visibility IN ('authenticated', 'public')
       )
     LIMIT 1`,
    [opportunityId, context.userId],
  );

  return result.rowCount === 1;
};

const assertActiveCapabilities = async (
  client: PoolClient,
  requirements: readonly ReplaceOpportunityCapabilityRequirementInput[],
): Promise<void> => {
  if (requirements.length === 0) {
    return;
  }

  const capabilityIds = requirements.map(
    (requirement) => requirement.capabilityId,
  );

  const result = await client.query(
    `SELECT id
     FROM ghm.capability
     WHERE id = ANY($1::uuid[])
       AND lifecycle_status = 'active'
       AND is_selectable = true`,
    [capabilityIds],
  );

  if (result.rowCount !== capabilityIds.length) {
    throw new Error(
      'All opportunity requirement capabilities must be active and selectable',
    );
  }
};

const findRequirements = async (
  client: PoolClient,
  opportunityId: OpportunityId,
): Promise<readonly OpportunityCapabilityRequirement[]> => {
  const result = await client.query(
    `SELECT ${REQUIREMENT_COLUMNS}
     FROM ghm.opportunity_capability_requirement
     WHERE opportunity_id = $1
     ORDER BY
       CASE WHEN importance = 'required' THEN 0 ELSE 1 END,
       sort_order,
       id`,
    [opportunityId],
  );

  return result.rows.map(mapRequirement);
};

export class PgOpportunityRequirementsRepository
  implements OpportunityRequirementsRepository
{
  constructor(private readonly transactionPool?: TransactionPool) {}

  async listOpportunityRequirements(
    context: AuthContext,
    opportunityId: OpportunityId,
  ): Promise<readonly OpportunityCapabilityRequirement[]> {
    assertOpportunityId(opportunityId);

    return withAuthorizedTransaction(
      context,
      async (client) => {
        const readable = await canReadOpportunity(
          client,
          context,
          opportunityId,
        );

        if (!readable) {
          return [];
        }

        return findRequirements(client, opportunityId);
      },
      this.transactionPool,
    );
  }

  async replaceOpportunityRequirements(
    context: AuthContext,
    opportunityId: OpportunityId,
    requirements: readonly ReplaceOpportunityCapabilityRequirementInput[],
  ): Promise<readonly OpportunityCapabilityRequirement[]> {
    assertOpportunityId(opportunityId);

    const normalized = normalizeInput(requirements);

    return withAuthorizedTransaction(
      context,
      async (client) => {
        await assertOpportunityManager(
          client,
          context,
          opportunityId,
        );

        await assertActiveCapabilities(client, normalized);

        await client.query(
          `DELETE FROM ghm.opportunity_capability_requirement
           WHERE opportunity_id = $1`,
          [opportunityId],
        );

        for (const requirement of normalized) {
          await client.query(
            `INSERT INTO ghm.opportunity_capability_requirement (
               opportunity_id,
               capability_id,
               importance,
               minimum_proficiency_level,
               description,
               sort_order,
               created_by
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              opportunityId,
              requirement.capabilityId,
              requirement.importance ?? 'required',
              requirement.minimumProficiencyLevel ?? null,
              requirement.description ?? null,
              requirement.sortOrder ?? 0,
              context.userId,
            ],
          );
        }

        return findRequirements(client, opportunityId);
      },
      this.transactionPool,
    );
  }
}
