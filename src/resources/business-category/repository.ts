import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization.js';
import { withAuthorizedTransaction } from '../../db/authorized-transaction.js';
import type { TransactionPool } from '../../db/transaction.js';
import type {
  AssignBusinessCategoryInput,
  BusinessCategory,
  BusinessCategoryAssignment,
  BusinessCategoryRepository,
  BusinessCategoryId,
  BusinessId,
  ListBusinessCategoriesFilter,
  SetPrimaryBusinessCategoryInput,
} from './contracts.js';

const CATEGORY_COLUMNS = 'id, parent_id, name, slug, description, is_active, sort_order, created_at, updated_at';
const ASSIGNMENT_COLUMNS = 'id, business_id, category_id, is_primary, created_by, created_at, updated_at';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const requireUuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new Error(`${field} must be a valid UUID`);
  return value;
};

const mapCategory = (row: Record<string, unknown>): BusinessCategory => ({
  id: String(row.id),
  parentId: row.parent_id === null ? null : String(row.parent_id),
  name: String(row.name),
  slug: String(row.slug),
  description: row.description === null ? null : String(row.description),
  isActive: Boolean(row.is_active),
  sortOrder: Number(row.sort_order),
  createdAt: new Date(String(row.created_at)),
  updatedAt: new Date(String(row.updated_at)),
});

const mapAssignment = (row: Record<string, unknown>): BusinessCategoryAssignment => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  categoryId: String(row.category_id),
  isPrimary: Boolean(row.is_primary),
  createdBy: row.created_by === null ? null : Number(row.created_by),
  createdAt: new Date(String(row.created_at)),
  updatedAt: new Date(String(row.updated_at)),
});

const assertBusinessManagementAuthority = async (client: PoolClient, context: AuthContext, businessId: number): Promise<void> => {
  const result = await client.query(
    `SELECT 1 FROM ghm.business b
     WHERE b.id = $1 AND b.is_active = true
       AND EXISTS (
         SELECT 1 FROM ghm.business_membership bm
         WHERE bm.business_id = b.id
           AND bm.account_id = $2
           AND bm.membership_status = 'active'
           AND bm.membership_role IN ('owner', 'administrator')
       )`,
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Business management permission required');
};

const assertBusinessReadAuthority = async (client: PoolClient, context: AuthContext, businessId: number): Promise<void> => {
  const result = await client.query(
    `SELECT 1 FROM ghm.business b
     WHERE b.id = $1 AND b.is_active = true
       AND EXISTS (
         SELECT 1 FROM ghm.business_membership bm
         WHERE bm.business_id = b.id
           AND bm.account_id = $2
           AND bm.membership_status = 'active'
       )`,
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Business access required');
};

const getSelectableCategory = async (client: PoolClient, categoryId: string): Promise<void> => {
  const result = await client.query(
    'SELECT 1 FROM ghm.business_category WHERE id = $1 AND is_active = true',
    [categoryId],
  );
  if (result.rowCount !== 1) throw new Error('Category not found or not selectable');
};

export class PostgresBusinessCategoryRepository implements BusinessCategoryRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async listBusinessCategories(context: AuthContext, filter: ListBusinessCategoriesFilter = {}): Promise<BusinessCategory[]> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ${CATEGORY_COLUMNS}
         FROM ghm.business_category
         ${filter.activeOnly === false ? '' : "WHERE is_active = true"}
         ORDER BY sort_order, name, id`,
      );
      return result.rows.map(mapCategory);
    }, this.transactionPool);
  }

  async getBusinessCategory(context: AuthContext, categoryId: BusinessCategoryId): Promise<BusinessCategory | null> {
    const id = requireUuid(categoryId, 'categoryId');
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(`SELECT ${CATEGORY_COLUMNS} FROM ghm.business_category WHERE id = $1`, [id]);
      return result.rowCount === 1 ? mapCategory(result.rows[0]) : null;
    }, this.transactionPool);
  }

  async listBusinessCategoryAssignments(context: AuthContext, businessId: BusinessId): Promise<BusinessCategoryAssignment[]> {
    const id = requirePositiveId(businessId, 'businessId');
    return withAuthorizedTransaction(context, async client => {
      await assertBusinessReadAuthority(client, context, id);
      const result = await client.query(
        `SELECT ${ASSIGNMENT_COLUMNS}
         FROM ghm.business_category_assignment
         WHERE business_id = $1
         ORDER BY is_primary DESC, created_at ASC, id ASC`,
        [id],
      );
      return result.rows.map(mapAssignment);
    }, this.transactionPool);
  }

  async assignBusinessCategory(context: AuthContext, input: AssignBusinessCategoryInput): Promise<BusinessCategoryAssignment> {
    const businessId = requirePositiveId(input.businessId, 'businessId');
    const categoryId = requireUuid(input.categoryId, 'categoryId');
    return withAuthorizedTransaction(context, async client => {
      await assertBusinessManagementAuthority(client, context, businessId);
      await getSelectableCategory(client, categoryId);
      const result = await client.query(
        `INSERT INTO ghm.business_category_assignment (business_id, category_id, created_by)
         VALUES ($1, $2, $3)
         RETURNING ${ASSIGNMENT_COLUMNS}`,
        [businessId, categoryId, context.userId],
      );
      return mapAssignment(result.rows[0]);
    }, this.transactionPool);
  }

  async setPrimaryBusinessCategory(context: AuthContext, input: SetPrimaryBusinessCategoryInput): Promise<BusinessCategoryAssignment> {
    const businessId = requirePositiveId(input.businessId, 'businessId');
    const categoryId = requireUuid(input.categoryId, 'categoryId');
    return withAuthorizedTransaction(context, async client => {
      await assertBusinessManagementAuthority(client, context, businessId);
      await getSelectableCategory(client, categoryId);

      const target = await client.query(
        `SELECT id FROM ghm.business_category_assignment
         WHERE business_id = $1 AND category_id = $2
         FOR UPDATE`,
        [businessId, categoryId],
      );
      if (target.rowCount !== 1) throw new Error('Category assignment not found');

      await client.query(
        `UPDATE ghm.business_category_assignment
         SET is_primary = false
         WHERE business_id = $1 AND is_primary = true AND id <> $2`,
        [businessId, target.rows[0].id],
      );

      const result = await client.query(
        `UPDATE ghm.business_category_assignment
         SET is_primary = true
         WHERE id = $1
         RETURNING ${ASSIGNMENT_COLUMNS}`,
        [target.rows[0].id],
      );
      return mapAssignment(result.rows[0]);
    }, this.transactionPool);
  }
}
