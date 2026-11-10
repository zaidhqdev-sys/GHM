import type { PoolClient } from 'pg';
import type {
  AccountIdentity, BusinessId, BusinessIdentity, BusinessIdentityRepository,
  BusinessMembership, CreateBusinessInput, UpdateBusinessProfileInput, UpdateProfileInput,
} from './contracts';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction, withTenantTransaction } from '../../db/authorized-transaction';
import { resolveTenantContext } from '../../auth/tenant-resolver';
import type { TransactionPool } from '../../db/transaction';

const ACCOUNT_SELECT = `SELECT id, full_name, phone, avatar_ref, role, created_at, updated_at FROM ghm.account_identity WHERE id = $1`;
const BUSINESS_COLUMNS = `id, name, slug, description, phone, email, province, city, physical_address, latitude, longitude, whatsapp, website, avatar_letter, avatar_color, years_in_business, is_supplier, logo_storage_object_id, insurance_verified, jobs_completed, verification_status, is_active, created_at, updated_at`;
const BUSINESS_SELECT = `SELECT ${BUSINESS_COLUMNS} FROM ghm.business WHERE id = $1`;
const BUSINESS_BY_SLUG_SELECT = `SELECT ${BUSINESS_COLUMNS} FROM ghm.business WHERE slug = $1`;
const MEMBERSHIPS_SELECT = `SELECT id, business_id, account_id, membership_role, membership_status, created_by, created_at, updated_at FROM ghm.business_membership WHERE account_id = $1 AND membership_status = 'active' ORDER BY created_at, id`;

const ALLOWED_PROFILE_FIELDS = new Set(['name', 'slug', 'description', 'phone', 'email', 'province', 'city', 'physicalAddress', 'latitude', 'longitude', 'whatsapp', 'website', 'avatarLetter', 'avatarColor', 'yearsInBusiness']);

const mapAccount = (row: any): AccountIdentity => ({ id: Number(row.id), fullName: row.full_name, phone: row.phone, avatarRef: row.avatar_ref, role: row.role, createdAt: row.created_at, updatedAt: row.updated_at });
const mapBusiness = (row: any): BusinessIdentity => ({
  id: Number(row.id),
  name: row.name,
  slug: row.slug,
  description: row.description ?? null,
  phone: row.phone ?? null,
  email: row.email ?? null,
  province: row.province ?? null,
  city: row.city ?? null,
  physicalAddress: row.physical_address ?? null,
  latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
  longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
  whatsapp: row.whatsapp ?? null,
  website: row.website ?? null,
  avatarLetter: row.avatar_letter ?? null,
  avatarColor: row.avatar_color ?? null,
  yearsInBusiness: row.years_in_business === null || row.years_in_business === undefined ? null : Number(row.years_in_business),
  isSupplier: row.is_supplier === true,
  logoUrl: row.logo_storage_object_id === null || row.logo_storage_object_id === undefined ? null : `/api/v1/public/businesses/${Number(row.id)}/logo`,
  insuranceVerified: row.insurance_verified === true,
  jobsCompleted: Number(row.jobs_completed ?? 0),
  verificationStatus: row.verification_status,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const mapMembership = (row: any): BusinessMembership => ({ id: Number(row.id), businessId: Number(row.business_id), accountId: Number(row.account_id), role: row.membership_role, status: row.membership_status, createdBy: row.created_by === null ? null : Number(row.created_by), createdAt: row.created_at, updatedAt: row.updated_at });

const requireAccount = async (client: PoolClient, context: AuthContext, lock = false): Promise<AccountIdentity> => {
  const result = await client.query(lock ? `${ACCOUNT_SELECT} FOR UPDATE` : ACCOUNT_SELECT, [context.userId]);
  if (result.rowCount !== 1) throw new Error('Authenticated account not found');
  return mapAccount(result.rows[0]);
};
const findBusiness = async (client: PoolClient, businessId: BusinessId) => { const result = await client.query(BUSINESS_SELECT, [businessId]); return result.rowCount === 1 ? mapBusiness(result.rows[0]) : null; };
const findBusinessBySlug = async (client: PoolClient, slug: string) => { const result = await client.query(BUSINESS_BY_SLUG_SELECT, [slug]); return result.rowCount === 1 ? mapBusiness(result.rows[0]) : null; };
const findMemberships = async (client: PoolClient, accountId: number) => { const result = await client.query(MEMBERSHIPS_SELECT, [accountId]); return result.rows.map(mapMembership); };
const normalizeName = (name: string) => { const normalized = name.trim(); if (!normalized) throw new Error('Business name is required'); return normalized; };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const buildProfilePatch = (input: UpdateBusinessProfileInput): Record<string, unknown> => {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (!ALLOWED_PROFILE_FIELDS.has(key)) throw new Error(`Unsupported Business update field: ${key}`);
    if (key === 'name') {
      patch.name = normalizeName(String(value));
      continue;
    }
    if (key === 'slug') {
      const slug = String(value).trim();
      if (!slug) throw new Error('Business slug is required');
      patch.slug = slug;
      continue;
    }
    if (key === 'description') {
      if (value === null) { patch.description = null; continue; }
      const description = String(value);
      if (description.length > 5000) throw new Error('Description must be 5000 characters or fewer');
      patch.description = description.trim() === '' ? null : description;
      continue;
    }
    if (key === 'phone') {
      if (value === null) { patch.phone = null; continue; }
      const phone = String(value).trim();
      if (phone === '') { patch.phone = null; continue; }
      if (phone.length < 7 || phone.length > 32) throw new Error('Phone must be between 7 and 32 characters');
      patch.phone = phone;
      continue;
    }
    if (key === 'province' || key === 'city' || key === 'physicalAddress' || key === 'whatsapp' || key === 'website') {
      if (value === null) { patch[key === 'physicalAddress' ? 'physical_address' : key] = null; continue; }
      if (typeof value !== 'string') throw new Error(`${key} must be text or null`);
      const normalized = value.trim();
      const limits = { province: 120, city: 120, physicalAddress: 500, whatsapp: 32, website: 2048 };
      if (!normalized) { patch[key === 'physicalAddress' ? 'physical_address' : key] = null; continue; }
      if (normalized.length > limits[key]) throw new Error(`${key} exceeds its maximum length`);
      if (key === 'whatsapp' && normalized.length < 7) throw new Error('whatsapp must be between 7 and 32 characters');
      if (key === 'website' && !/^https?:\/\/[^\s]+$/i.test(normalized)) throw new Error('website must be a valid HTTP(S) URL');
      patch[key === 'physicalAddress' ? 'physical_address' : key] = normalized;
      continue;
    }
    if (key === 'latitude' || key === 'longitude') {
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`${key} must be a finite number or null`);
      if (value !== null && (key === 'latitude' ? value < -90 || value > 90 : value < -180 || value > 180)) throw new Error(`${key} is out of range`);
      patch[key] = value;
      continue;
    }
    if (key === 'avatarLetter' || key === 'avatarColor') {
      if (value === null) { patch[key === 'avatarLetter' ? 'avatar_letter' : 'avatar_color'] = null; continue; }
      if (typeof value !== 'string') throw new Error(`${key} must be text or null`);
      const normalized = value.trim();
      const max = key === 'avatarLetter' ? 3 : 32;
      if (normalized.length > max) throw new Error(`${key} exceeds its maximum length`);
      patch[key === 'avatarLetter' ? 'avatar_letter' : 'avatar_color'] = normalized || null;
      continue;
    }
    if (key === 'yearsInBusiness') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) throw new Error('yearsInBusiness must be a whole number between 0 and 100');
      patch.years_in_business = value;
      continue;
    }
    if (key === 'email') {
      if (value === null) { patch.email = null; continue; }
      const email = String(value).trim();
      if (email === '') { patch.email = null; continue; }
      if (email.length < 3 || email.length > 320) throw new Error('Email must be between 3 and 320 characters');
      if (!EMAIL_PATTERN.test(email)) throw new Error('Enter a valid email address');
      patch.email = email;
      continue;
    }
  }
  if (Object.hasOwn(patch, 'latitude') !== Object.hasOwn(patch, 'longitude')) throw new Error('latitude and longitude must be supplied together');
  return patch;
};

export const createBusinessSlug = (name: string): string => {
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  if (!slug) throw new Error('Business name cannot produce a valid slug');
  return slug;
};

export const createBusinessInTransaction = async (
  client: PoolClient,
  context: AuthContext,
  input: CreateBusinessInput,
  slug: string,
): Promise<BusinessIdentity> => {
  await requireAccount(client, context, true);
  const businessResult = await client.query(
    `INSERT INTO ghm.business (name, slug, verification_status, is_active)
     VALUES ($1, $2, 'unverified', true)
     RETURNING ${BUSINESS_COLUMNS}`,
    [normalizeName(input.name), slug],
  );
  const business = mapBusiness(businessResult.rows[0]);
  await client.query(
    `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
     VALUES ($1, $2, 'owner', 'active', $2)`,
    [business.id, context.userId],
  );
  return business;
};

export class PostgresBusinessIdentityRepository implements BusinessIdentityRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}
  async getAccount(context: AuthContext) { return withAuthorizedTransaction(context, c => requireAccount(c, context), this.transactionPool); }
  async updateAccount(context: AuthContext, input: UpdateProfileInput) {
    return withAuthorizedTransaction(context, async client => {
      await requireAccount(client, context);
      const result = await client.query(`UPDATE ghm.account_identity SET full_name = CASE WHEN $2 THEN $3 ELSE full_name END, phone = CASE WHEN $4 THEN $5 ELSE phone END, avatar_ref = CASE WHEN $6 THEN $7 ELSE avatar_ref END, updated_at = now() WHERE id = $1 RETURNING id, full_name, phone, avatar_ref, role, created_at, updated_at`, [context.userId, Object.hasOwn(input, 'fullName'), input.fullName ?? null, Object.hasOwn(input, 'phone'), input.phone ?? null, Object.hasOwn(input, 'avatarRef'), input.avatarRef ?? null]);
      if (result.rowCount !== 1) throw new Error('Authenticated account not found');
      return mapAccount(result.rows[0]);
    }, this.transactionPool);
  }
  async getBusinessById(context: AuthContext, businessId: BusinessId) { return withAuthorizedTransaction(context, c => findBusiness(c, businessId), this.transactionPool); }
  async getBusinessBySlug(context: AuthContext, slug: string) { return withAuthorizedTransaction(context, c => findBusinessBySlug(c, slug), this.transactionPool); }
  async getMembershipsForAccount(context: AuthContext) { return withAuthorizedTransaction(context, c => findMemberships(c, context.userId), this.transactionPool); }
  async createBusiness(context: AuthContext, input: CreateBusinessInput, slug: string) {
    return withAuthorizedTransaction(
      context,
      client => createBusinessInTransaction(client, context, input, slug),
      this.transactionPool,
    );
  }
  async updateBusiness(_context: AuthContext, _businessId: BusinessId, _input: UpdateBusinessProfileInput): Promise<BusinessIdentity> {
    throw new Error('Business profile must be updated through the authenticated actor gateway');
  }
}
