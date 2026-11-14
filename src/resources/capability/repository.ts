import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization.js';
import { withAuthorizedTransaction } from '../../db/authorized-transaction.js';
import type { TransactionPool } from '../../db/transaction.js';
import type {
  Capability,
  CapabilityId,
  CapabilityRepository,
  CapabilityDraftInput,
  CapabilityLifecycle,
} from './contracts.js';

const CAPABILITY_COLUMNS = `
  id,
  parent_id,
  name,
  slug,
  description,
  sort_order,
  lifecycle_status,
  taxonomy_version,
  effective_from,
  effective_to,
  source_authority,
  source_reference,
  replaced_by_capability_id,
  is_selectable,
  created_at,
  updated_at
`;

const mapCapability = (row: Record<string, unknown>): Capability => ({
  id: String(row.id),
  parentId: row.parent_id === null ? null : String(row.parent_id),
  name: String(row.name),
  slug: String(row.slug),
  description: row.description === null ? null : String(row.description),
  sortOrder: Number(row.sort_order),
  lifecycleStatus: row.lifecycle_status as Capability['lifecycleStatus'],
  taxonomyVersion: Number(row.taxonomy_version),
  effectiveFrom:
    row.effective_from === null ? null : new Date(String(row.effective_from)),
  effectiveTo:
    row.effective_to === null ? null : new Date(String(row.effective_to)),
  sourceAuthority: String(row.source_authority),
  sourceReference:
    row.source_reference === null ? null : String(row.source_reference),
  replacedByCapabilityId:
    row.replaced_by_capability_id === null
      ? null
      : String(row.replaced_by_capability_id),
  isSelectable: Boolean(row.is_selectable),
  createdAt: new Date(String(row.created_at)),
  updatedAt: new Date(String(row.updated_at)),
});

const assertCapabilityId = (capabilityId: CapabilityId): void => {
  if (
    typeof capabilityId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      capabilityId,
    )
  ) {
    throw new Error('Invalid capabilityId');
  }
};

const findCapability = async (
  client: PoolClient,
  capabilityId: CapabilityId,
): Promise<Capability | null> => {
  const result = await client.query(
    `SELECT ${CAPABILITY_COLUMNS}
     FROM ghm.capability
     WHERE id = $1`,
    [capabilityId],
  );

  return result.rowCount === 1 ? mapCapability(result.rows[0]) : null;
};

const findActiveCapabilities = async (
  client: PoolClient,
): Promise<Capability[]> => {
  const result = await client.query(
    `SELECT ${CAPABILITY_COLUMNS}
     FROM ghm.capability
     WHERE lifecycle_status = 'active'
     ORDER BY sort_order, name, id`,
  );

  return result.rows.map(mapCapability);
};

const findSelectableCapabilities = async (
  client: PoolClient,
): Promise<Capability[]> => {
  const result = await client.query(
    `SELECT ${CAPABILITY_COLUMNS}
     FROM ghm.capability
     WHERE lifecycle_status = 'active'
       AND is_selectable = true
     ORDER BY sort_order, name, id`,
  );

  return result.rows.map(mapCapability);
};

export class PgCapabilityRepository implements CapabilityRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async getCapability(
    context: AuthContext,
    capabilityId: CapabilityId,
  ): Promise<Capability> {
    assertCapabilityId(capabilityId);

    return withAuthorizedTransaction(
      context,
      async (client) => {
        const capability = await findCapability(client, capabilityId);

        if (!capability) {
          throw new Error('Capability not found');
        }

        return capability;
      },
      this.transactionPool,
    );
  }

  async listActiveCapabilities(
    context: AuthContext,
  ): Promise<Capability[]> {
    return withAuthorizedTransaction(
      context,
      (client) => findActiveCapabilities(client),
      this.transactionPool,
    );
  }

  async listGoverned(context: AuthContext): Promise<Capability[]> {
    return withAuthorizedTransaction(
      context,
      async (client) => {
        const result = await client.query(
          `SELECT ${CAPABILITY_COLUMNS}
           FROM ghm.capability
           ORDER BY taxonomy_version DESC, sort_order, name, id`,
        );
        return result.rows.map(mapCapability);
      },
      this.transactionPool,
    );
  }

  async createDraft(context: AuthContext, input: CapabilityDraftInput): Promise<Capability> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT * FROM ghm.create_capability_draft($1,$2,$3,$4,$5,$6,$7,$8)`,
        [context.userId, input.name, input.slug, input.description ?? null,
          input.parentId ?? null, input.sortOrder ?? 0, input.sourceReference ?? null, 1],
      );
      return mapCapability(result.rows[0]);
    }, this.transactionPool);
  }

  async updateDraft(context: AuthContext, capabilityId: CapabilityId, input: CapabilityDraftInput): Promise<Capability> {
    assertCapabilityId(capabilityId);
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT * FROM ghm.update_capability_draft($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [context.userId, capabilityId, input.name, input.slug, input.description ?? null,
          input.parentId ?? null, input.sortOrder ?? 0, input.sourceReference ?? null, 1],
      );
      return mapCapability(result.rows[0]);
    }, this.transactionPool);
  }

  async transition(
    context: AuthContext,
    capabilityId: CapabilityId,
    targetStatus: CapabilityLifecycle,
    replacedByCapabilityId: CapabilityId | null = null,
  ): Promise<Capability> {
    assertCapabilityId(capabilityId);
    if (replacedByCapabilityId !== null) assertCapabilityId(replacedByCapabilityId);
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT * FROM ghm.transition_capability_lifecycle($1,$2,$3,$4,$5)`,
        [context.userId, capabilityId, targetStatus, replacedByCapabilityId, 1],
      );
      return mapCapability(result.rows[0]);
    }, this.transactionPool);
  }

  async listSelectableCapabilities(
    context: AuthContext,
  ): Promise<Capability[]> {
    return withAuthorizedTransaction(
      context,
      (client) => findSelectableCapabilities(client),
      this.transactionPool,
    );
  }
}
