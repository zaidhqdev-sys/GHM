import type { AuthContext } from '../../auth/authorization.js';
import { withAuthorizedTransaction } from '../../db/authorized-transaction.js';
import { resolveTenantContext } from '../../auth/tenant-resolver.js';
import { withTransaction } from '../../db/transaction.js';
import type { TransactionPool } from '../../db/transaction.js';
import type { BusinessOffering, BusinessOfferingRepository, CreateBusinessOfferingInput, UpdateBusinessOfferingInput } from './contracts.js';

const COLUMNS = 'id, business_id, offering_type, name, slug, description, price_amount, currency_code, price_unit, is_active, sort_order, created_by, created_at, updated_at';

const mapOffering = (row: Record<string, unknown>): BusinessOffering => ({
  id: String(row.id),
  businessId: Number(row.business_id),
  offeringType: row.offering_type as BusinessOffering['offeringType'],
  name: String(row.name),
  slug: String(row.slug),
  description: row.description === null ? null : String(row.description),
  priceAmount: row.price_amount === null ? null : String(row.price_amount),
  currencyCode: String(row.currency_code),
  priceUnit: row.price_unit === null ? null : String(row.price_unit),
  isActive: Boolean(row.is_active),
  sortOrder: Number(row.sort_order),
  createdBy: row.created_by === null ? null : Number(row.created_by),
  createdAt: new Date(String(row.created_at)),
  updatedAt: new Date(String(row.updated_at)),
});

const requireBusinessManagement = async (client: PoolClient, context: AuthContext, businessId: number) => {
  const r = await client.query(`SELECT 1 FROM ghm.business b WHERE b.id = $1 AND b.is_active = true
    AND EXISTS (SELECT 1 FROM ghm.business_membership bm WHERE bm.business_id = b.id AND bm.account_id = $2
      AND bm.membership_status = 'active' AND bm.membership_role IN ('owner', 'administrator'))`, [businessId, context.userId]);
  if (r.rowCount !== 1) throw new Error('Business management permission required');
};

const requireBusinessRead = async (client: PoolClient, context: AuthContext, businessId: number) => {
  const r = await client.query(`SELECT 1 FROM ghm.business b WHERE b.id = $1 AND b.is_active = true
    AND EXISTS (SELECT 1 FROM ghm.business_membership bm WHERE bm.business_id = b.id AND bm.account_id = $2 AND bm.membership_status = 'active')`, [businessId, context.userId]);
  if (r.rowCount !== 1) throw new Error('Business access required');
};

export class PostgresBusinessOfferingRepository implements BusinessOfferingRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async listBusinessOfferings(context: AuthContext, input: { businessId: number; activeOnly?: boolean }) {
    return withAuthorizedTransaction(context, async client => {
      await resolveTenantContext(client, context, input.businessId);
      const result = await client.query(`SELECT ${COLUMNS} FROM ghm.business_offering WHERE business_id = $1 ${input.activeOnly === false ? '' : 'AND is_active = true'} ORDER BY sort_order, name, id`, [input.businessId]);
      return result.rows.map(mapOffering);
    }, this.transactionPool);
  }

  async getBusinessOfferingBySlug(context: AuthContext, businessId: number, slug: string) {
    return withAuthorizedTransaction(context, async client => {
      await resolveTenantContext(client, context, businessId);
      const result = await client.query(`SELECT ${COLUMNS} FROM ghm.business_offering WHERE business_id = $1 AND slug = $2`, [businessId, slug]);
      return result.rowCount === 1 ? mapOffering(result.rows[0]) : null;
    }, this.transactionPool);
  }

  async createBusinessOffering(context: AuthContext, input: CreateBusinessOfferingInput) {
    return withAuthorizedTransaction(context, async client => {
      const tenant = await resolveTenantContext(client, context, input.businessId);
      if (!['owner', 'administrator'].includes(tenant.membershipRole)) throw new Error('Business management permission required');
      const result = await client.query(`INSERT INTO ghm.business_offering
        (business_id, offering_type, name, slug, description, price_amount, currency_code, price_unit, sort_order, created_by)
        VALUES ($1,$2,$3,NULLIF(btrim($4),''),NULLIF(btrim($5),''),$6,$7,NULLIF(btrim($8),''),$9,$10)
        RETURNING ${COLUMNS}`,
        [input.businessId, input.offeringType ?? 'service', input.name, input.slug, input.description ?? null, input.priceAmount ?? null, input.currencyCode ?? 'ZAR', input.priceUnit ?? null, input.sortOrder ?? 0, context.userId]);
      return mapOffering(result.rows[0]);
    }, this.transactionPool);
  }

  async updateBusinessOffering(context: AuthContext, offeringId: string, input: UpdateBusinessOfferingInput) {
    return withAuthorizedTransaction(context, async client => {
      const target = await client.query('SELECT business_id FROM ghm.business_offering WHERE id = $1 FOR UPDATE', [offeringId]);
      if (target.rowCount !== 1) throw new Error('Offering not found');
      const businessId = Number(target.rows[0].business_id);
      const tenant = await resolveTenantContext(client, context, businessId);
      if (!['owner', 'administrator'].includes(tenant.membershipRole)) throw new Error('Business management permission required');

      const keys = Object.keys(input) as (keyof UpdateBusinessOfferingInput)[];
      if (keys.length === 0) throw new Error('Offering update input is required');
      const allowed = new Set(['offeringType','name','slug','description','priceAmount','currencyCode','priceUnit','isActive','sortOrder']);
      if (keys.some(k => !allowed.has(k))) throw new Error('Unsupported offering mutation');

      const columns: Record<string,string> = { offeringType:'offering_type', name:'name', slug:'slug', description:'description', priceAmount:'price_amount', currencyCode:'currency_code', priceUnit:'price_unit', isActive:'is_active', sortOrder:'sort_order' };
      const sets: string[]=[]; const values: unknown[]=[offeringId];
      for (const key of keys) {
        const col=columns[key];
        if (key==='description'||key==='priceUnit') sets.push(`${col}=NULLIF(btrim($${values.length+1}), '')`);
        else sets.push(`${col}=$${values.length+1}`);
        values.push(input[key]);
      }
      const result=await client.query(`UPDATE ghm.business_offering SET ${sets.join(', ')} WHERE id=$1 RETURNING ${COLUMNS}`,values);
      return mapOffering(result.rows[0]);
    }, this.transactionPool);
  }

  async listPublicBusinessOfferings(businessId: number) {
    return withTransaction(async client => {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM ghm.business_offering o
         WHERE o.business_id = $1 AND o.is_active = true
           AND EXISTS (SELECT 1 FROM ghm.business b WHERE b.id=o.business_id AND b.is_active=true AND b.is_verified=true AND b.verification_status='approved')
         ORDER BY o.sort_order, o.name, o.id`, [businessId]);
      return result.rows.map(mapOffering);
    }, this.transactionPool);
  }
}
