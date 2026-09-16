import type { Pool, PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  CreateCustomerInput,
  Customer,
  CustomerId,
  CustomerRepository,
  CustomerStatus,
} from './contracts';

const CUSTOMER_COLUMNS = `
  id,
  account_id,
  name,
  phone,
  email,
  status,
  created_at,
  updated_at
`;

const mapCustomer = (row: any): Customer => ({
  id: Number(row.id),
  accountId: Number(row.account_id),
  name: row.name,
  phone: row.phone,
  email: row.email,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const ownerPredicate = (context: AuthContext): string =>
  context.role === 'admin' ? '' : ' AND account_id = $2';

const ownerValues = (context: AuthContext, customerId: CustomerId): number[] =>
  context.role === 'admin' ? [customerId] : [customerId, context.userId];

const findVisibleCustomer = async (
  client: PoolClient,
  context: AuthContext,
  customerId: CustomerId,
): Promise<Customer | null> => {
  const result = await client.query(
    `SELECT ${CUSTOMER_COLUMNS}
     FROM ghm.customer
     WHERE id = $1${ownerPredicate(context)}`,
    ownerValues(context, customerId),
  );

  return result.rowCount === 1 ? mapCustomer(result.rows[0]) : null;
};

export class PostgresCustomerRepository implements CustomerRepository {
  constructor(private readonly transactionPool?: TransactionPool | Pool) {}

  async createCustomer(
    context: AuthContext,
    input: CreateCustomerInput,
  ): Promise<Customer> {
    return withAuthorizedTransaction(
      context,
      async client => {
        const result = await client.query(
          `INSERT INTO ghm.customer (account_id, name, phone, email)
           VALUES ($1, $2, $3, $4)
           RETURNING ${CUSTOMER_COLUMNS}`,
          [context.userId, input.name, input.phone ?? null, input.email ?? null],
        );
        if (result.rowCount !== 1) throw new Error('Customer creation failed');
        return mapCustomer(result.rows[0]);
      },
      this.transactionPool,
    );
  }

  async getCustomer(
    context: AuthContext,
    customerId: CustomerId,
  ): Promise<Customer | null> {
    return withAuthorizedTransaction(
      context,
      client => findVisibleCustomer(client, context, customerId),
      this.transactionPool,
    );
  }

  async listCustomers(
    context: AuthContext,
    status?: CustomerStatus,
  ): Promise<Customer[]> {
    return withAuthorizedTransaction(
      context,
      async client => {
        const values: unknown[] = [];
        const conditions: string[] = [];
        let parameter = 1;

        if (context.role !== 'admin') {
          conditions.push(`account_id = $${parameter}`);
          values.push(context.userId);
          parameter += 1;
        }
        if (status !== undefined) {
          conditions.push(`status = $${parameter}`);
          values.push(status);
        }

        const result = await client.query(
          `SELECT ${CUSTOMER_COLUMNS}
           FROM ghm.customer
           ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
           ORDER BY created_at DESC, id DESC`,
          values,
        );
        return result.rows.map(mapCustomer);
      },
      this.transactionPool,
    );
  }

  async archiveCustomer(
    context: AuthContext,
    customerId: CustomerId,
  ): Promise<Customer> {
    return this.setStatus(context, customerId, 'archived');
  }

  async restoreCustomer(
    context: AuthContext,
    customerId: CustomerId,
  ): Promise<Customer> {
    return this.setStatus(context, customerId, 'active');
  }

  private async setStatus(
    context: AuthContext,
    customerId: CustomerId,
    status: CustomerStatus,
  ): Promise<Customer> {
    return withAuthorizedTransaction(
      context,
      async client => {
        const result = await client.query(
          `UPDATE ghm.customer
           SET status = $1, updated_at = now()
           WHERE id = $2${context.role === 'admin' ? '' : ' AND account_id = $3'}
           RETURNING ${CUSTOMER_COLUMNS}`,
          context.role === 'admin'
            ? [status, customerId]
            : [status, customerId, context.userId],
        );
        if (result.rowCount !== 1) {
          const existing = await findVisibleCustomer(client, context, customerId);
          if (!existing) throw new Error('Customer not found or ownership required');
          if (existing.status === status) return existing;
          throw new Error('Customer status update failed');
        }
        return mapCustomer(result.rows[0]);
      },
      this.transactionPool,
    );
  }
}
