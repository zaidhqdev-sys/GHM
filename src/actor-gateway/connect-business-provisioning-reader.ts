import type { Pool, PoolClient } from 'pg';
import { createBusinessSlug } from '../resources/business-identity/slug';
import type { BusinessIdentity } from '../resources/business-identity/contracts';
import type { ConnectBusinessProvisioningInput, ConnectBusinessProvisioningReader, ConnectBusinessProvisioningResult } from '../integrations/connect/business-provisioning-contracts';
import { createActorGatewayAssertion } from './request-assertion';


type ConnectablePool = Pick<Pool, 'connect'>;
type JsonRow = Record<string, unknown>;

const mapBusiness = (row: JsonRow): BusinessIdentity => ({
  id: Number(row.id),
  name: String(row.name),
  slug: String(row.slug),
  description: (row.description as string | null) ?? null,
  phone: (row.phone as string | null) ?? null,
  email: (row.email as string | null) ?? null,
  province: (row.province as string | null) ?? null,
  city: (row.city as string | null) ?? null,
  physicalAddress: (row.physical_address as string | null) ?? null,
  latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
  longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
  whatsapp: (row.whatsapp as string | null) ?? null,
  website: (row.website as string | null) ?? null,
  avatarLetter: (row.avatar_letter as string | null) ?? null,
  avatarColor: (row.avatar_color as string | null) ?? null,
  yearsInBusiness: row.years_in_business === null || row.years_in_business === undefined ? null : Number(row.years_in_business),
  isSupplier: row.is_supplier === true,
  logoUrl: row.logo_storage_object_id === null || row.logo_storage_object_id === undefined
    ? null
    : `/api/v1/public/businesses/${Number(row.id)}/logo`,
  insuranceVerified: row.insurance_verified === true,
  jobsCompleted: Number(row.jobs_completed ?? 0),
  verificationStatus: row.verification_status as BusinessIdentity['verificationStatus'],
  isActive: row.is_active === true,
  createdAt: new Date(String(row.created_at)),
  updatedAt: new Date(String(row.updated_at)),
});

const mapMapping = (row: JsonRow): ConnectBusinessProvisioningResult['mapping'] => ({
  id: Number(row.id),
  provider: String(row.provider),
  externalBusinessId: String(row.external_business_id),
  businessId: Number(row.business_id),
  createdAt: new Date(String(row.created_at)),
  updatedAt: new Date(String(row.updated_at)),
});

const normalizeExternalBusinessId = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error('Invalid Connect external Business identifier');
  }
  return normalized;
};

export class PostgresConnectBusinessProvisioningReader implements ConnectBusinessProvisioningReader {
  private readonly key: Buffer;

  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  async provisionOrResolve(
    accountId: number,
    input: ConnectBusinessProvisioningInput,
  ): Promise<ConnectBusinessProvisioningResult> {
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      throw new Error('Actor account ID must be a positive safe integer');
    }
    const externalBusinessId = normalizeExternalBusinessId(input.externalBusinessId);
    const name = input.name.trim();
    if (!name || name.length > 200) throw new Error('Connect Business name is required');
    const slug = createBusinessSlug(name);
    const assertion = createActorGatewayAssertion(this.key, accountId, 'business.connect.provision', {
      externalBusinessId,
      name,
      slug,
    });

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        outcome: 'resolved' | 'provisioned';
        business: JsonRow;
        mapping: JsonRow;
      }>(
        `SELECT * FROM ghm.gateway_provision_connect_business($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          accountId,
          assertion.issuedAt,
          assertion.nonce,
          assertion.context,
          assertion.signature,
          externalBusinessId,
          name,
          slug,
        ],
      );
      if (result.rowCount !== 1 || !result.rows[0]?.business || !result.rows[0]?.mapping) {
        throw Object.assign(new Error('Connect Business provisioning is unavailable'), { code: '42501' });
      }
      const row = result.rows[0];
      await client.query('COMMIT');
      return {
        outcome: row.outcome,
        business: mapBusiness(row.business),
        mapping: mapMapping(row.mapping),
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
