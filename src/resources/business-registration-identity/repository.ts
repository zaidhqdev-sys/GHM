import type { AuthContext } from '../../auth/authorization';
import { withTenantTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  BusinessRegistrationIdentity,
  BusinessRegistrationIdentityRepository,
  UpdateBusinessRegistrationIdentityInput,
} from './contracts';

const mapRegistrationIdentity = (row: any): BusinessRegistrationIdentity => ({
  businessId: Number(row.business_id),
  registrationStatus: row.registration_status ?? null,
  registrationNumber: row.registration_number ?? null,
  legalName: row.legal_name ?? null,
  updatedAt: row.updated_at ?? null,
});

const requireManager = (membershipRole: string): void => {
  if (membershipRole !== 'owner' && membershipRole !== 'administrator') {
    throw new Error('Business management permission required');
  }
};

export class PostgresBusinessRegistrationIdentityRepository implements BusinessRegistrationIdentityRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async getRegistrationIdentity(context: AuthContext, businessId: number): Promise<BusinessRegistrationIdentity> {
    return withTenantTransaction(context, businessId, async (client, _context, tenant) => {
      requireManager(tenant.membershipRole);
      const result = await client.query(
        'SELECT * FROM ghm.read_business_registration_identity($1, $2)',
        [context.userId, businessId],
      );
      if (result.rowCount !== 1) throw new Error('Business registration identity could not be read');
      return mapRegistrationIdentity(result.rows[0]);
    }, this.transactionPool);
  }

  async updateRegistrationIdentity(context: AuthContext, input: UpdateBusinessRegistrationIdentityInput): Promise<BusinessRegistrationIdentity> {
    return withTenantTransaction(context, input.businessId, async (client, _context, tenant) => {
      requireManager(tenant.membershipRole);
      const result = await client.query(
        'SELECT * FROM ghm.update_business_registration_identity($1, $2, $3, $4, $5)',
        [context.userId, input.businessId, input.registrationStatus, input.registrationNumber, input.legalName],
      );
      if (result.rowCount !== 1) throw new Error('Business registration identity could not be updated');
      return mapRegistrationIdentity(result.rows[0]);
    }, this.transactionPool);
  }
}
