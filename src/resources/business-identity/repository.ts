import type { PoolClient } from 'pg';
import type {
  AccountIdentity,
  BusinessId,
  BusinessIdentity,
  BusinessIdentityRepository,
  BusinessMembership,
  CreateBusinessInput,
  UpdateBusinessProfileInput,
  UpdateProfileInput,
} from './contracts';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';

const ACCOUNT_SELECT = `
  SELECT id, full_name, phone, avatar_ref, role, created_at, updated_at
  FROM account_identity
  WHERE id = $1
`;

const BUSINESS_SELECT = `
  SELECT id, name, slug, verification_status, is_active, created_at, updated_at
  FROM business
  WHERE id = $1
`;

const BUSINESS_BY_SLUG_SELECT = `${BUSINESS_SELECT.replace('WHERE id = $1', 'WHERE slug = $1')}`;

const MEMBERSHIPS_SELECT = `
  SELECT id, business_id, account_id, membership_role, membership_status,
         created_by, created_at, updated_at
  FROM business_membership
  WHERE account_id = $1
  ORDER BY created_at, id
`;

const mapAccount = (row: any): AccountIdentity => ({
  id: Number(row.id),
  fullName: row.full_name,
  phone: row.phone,
  avatarRef: row.avatar_ref,
  role: row.role,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapBusiness = (row: any): BusinessIdentity => ({
  id: Number(row.id),
  name: row.name,
  slug: row.slug,
  verificationStatus: row.verification_status,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapMembership = (row: any): BusinessMembership => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  accountId: Number(row.account_id),
  role: row.membership_role,
  status: row.membership_status,
  createdBy: row.created_by === null ? null : Number(row.created_by),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const requireAccount = async (client: PoolClient, context: AuthContext): Promise<AccountIdentity> => {
  const result = await client.query(ACCOUNT_SELECT, [context.userId]);
  if (result.rowCount !== 1) throw new Error('Authenticated account not found');
  return mapAccount(result.rows[0]);
};

const findBusiness = async (client: PoolClient, businessId: BusinessId): Promise<BusinessIdentity | null> => {
  const result = await client.query(BUSINESS_SELECT, [businessId]);
  return result.rowCount === 1 ? mapBusiness(result.rows[0]) : null;
};

const findBusinessBySlug = async (client: PoolClient, slug: string): Promise<BusinessIdentity | null> => {
  const result = await client.query(BUSINESS_BY_SLUG_SELECT, [slug]);
  return result.rowCount === 1 ? mapBusiness(result.rows[0]) : null;
};

const findMemberships = async (client: PoolClient, accountId: number): Promise<readonly BusinessMembership[]> => {
  const result = await client.query(MEMBERSHIPS_SELECT, [accountId]);
  return result.rows.map(mapMembership);
};

const assertManagedMembership = async (
  client: PoolClient,
  context: AuthContext,
  businessId: BusinessId,
): Promise<void> => {
  const result = await client.query(
    `
      SELECT 1
      FROM business_membership
      WHERE business_id = $1
        AND account_id = $2
        AND membership_status = 'active'
        AND membership_role IN ('owner', 'administrator')
      LIMIT 1
    `,
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Business management permission required');
};

const normalizeName = (name: string): string => {
  const normalized = name.trim();
  if (!normalized) throw new Error('Business name is required');
  return normalized;
};

const slugify = (name: string): string => {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!slug) throw new Error('Business name cannot produce a valid slug');
  return slug;
};

export class PostgresBusinessIdentityRepository implements BusinessIdentityRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async getAccount(context: AuthContext): Promise<AccountIdentity> {
    return withAuthorizedTransaction(context, (client) => requireAccount(client, context), this.transactionPool);
  }

  async updateAccount(context: AuthContext, input: UpdateProfileInput): Promise<AccountIdentity> {
    return withAuthorizedTransaction(
      context,
      async (client) => {
        await requireAccount(client, context);
        const result = await client.query(
          `
            UPDATE account_identity
            SET full_name = CASE WHEN $2 THEN $3 ELSE full_name END,
                phone = CASE WHEN $4 THEN $5 ELSE phone END,
                avatar_ref = CASE WHEN $6 THEN $7 ELSE avatar_ref END,
                updated_at = now()
            WHERE id = $1
            RETURNING id, full_name, phone, avatar_ref, role, created_at, updated_at
          `,
          [
            context.userId,
            Object.prototype.hasOwnProperty.call(input, 'fullName'),
            input.fullName ?? null,
            Object.prototype.hasOwnProperty.call(input, 'phone'),
            input.phone ?? null,
            Object.prototype.hasOwnProperty.call(input, 'avatarRef'),
            input.avatarRef ?? null,
          ],
        );
        if (result.rowCount !== 1) throw new Error('Authenticated account not found');
        return mapAccount(result.rows[0]);
      },
      this.transactionPool,
    );
  }

  async getBusinessById(context: AuthContext, businessId: BusinessId): Promise<BusinessIdentity | null> {
    return withAuthorizedTransaction(context, (client) => findBusiness(client, businessId), this.transactionPool);
  }

  async getBusinessBySlug(context: AuthContext, slug: string): Promise<BusinessIdentity | null> {
    return withAuthorizedTransaction(context, (client) => findBusinessBySlug(client, slug), this.transactionPool);
  }

  async getMembershipsForAccount(context: AuthContext): Promise<readonly BusinessMembership[]> {
    return withAuthorizedTransaction(context, (client) => findMemberships(client, context.userId), this.transactionPool);
  }

  async createBusiness(context: AuthContext, input: CreateBusinessInput, slug: string): Promise<BusinessIdentity> {
    return withAuthorizedTransaction(
      context,
      async (client) => {
        await requireAccount(client, context);
        const name = normalizeName(input.name);
        const result = await client.query(
          `
            INSERT INTO business (name, slug, verification_status, is_active, created_at, updated_at)
            VALUES ($1, $2, 'pending', true, now(), now())
            RETURNING id, name, slug, verification_status, is_active, created_at, updated_at
          `,
          [name, slug],
        );
        if (result.rowCount !== 1) throw new Error('Business creation failed');
        const business = mapBusiness(result.rows[0]);
        const membership = await client.query(
          `
            INSERT INTO business_membership
              (business_id, account_id, membership_role, membership_status, created_by, created_at, updated_at)
            VALUES ($1, $2, 'owner', 'active', $2, now(), now())
          `,
          [business.id, context.userId],
        );
        if (membership.rowCount !== 1) throw new Error('Business owner membership creation failed');
        return business;
      },
      this.transactionPool,
    );
  }

  async updateBusiness(
    context: AuthContext,
    businessId: BusinessId,
    input: UpdateBusinessProfileInput,
  ): Promise<BusinessIdentity> {
    if (Object.keys(input).length === 0) throw new Error('Business update requires at least one field');
    if (Object.keys(input).some((key) => !['name', 'slug'].includes(key))) {
      throw new Error('Business profile fields are not yet present in the canonical first migration');
    }

    return withAuthorizedTransaction(
      context,
      async (client) => {
        await assertManagedMembership(client, context, businessId);
        const current = await findBusiness(client, businessId);
        if (!current) throw new Error('Business not found');
        const name = input.name === undefined ? current.name : normalizeName(input.name);
        const slug = input.slug === undefined ? current.slug : input.slug.trim();
        if (!slug) throw new Error('Business slug is required');

        const result = await client.query(
          `
            UPDATE business
            SET name = $2,
                slug = $3,
                updated_at = now()
            WHERE id = $1
            RETURNING id, name, slug, verification_status, is_active, created_at, updated_at
          `,
          [businessId, name, slug],
        );
        if (result.rowCount !== 1) throw new Error('Business update failed');
        return mapBusiness(result.rows[0]);
      },
      this.transactionPool,
    );
  }
}

export const createBusinessSlug = (name: string): string => slugify(normalizeName(name));
