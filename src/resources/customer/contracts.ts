import type { AuthContext } from '../../auth/authorization';

export type CustomerId = number;
export type AccountId = number;
export type CustomerStatus = 'active' | 'archived';

export interface Customer {
  readonly id: CustomerId;
  readonly accountId: AccountId;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly status: CustomerStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCustomerInput {
  readonly name: string;
  readonly phone?: string | null;
  readonly email?: string | null;
}

export interface CustomerRepository {
  createCustomer(context: AuthContext, input: CreateCustomerInput): Promise<Customer>;
  getCustomer(context: AuthContext, customerId: CustomerId): Promise<Customer | null>;
  listCustomers(context: AuthContext, status?: CustomerStatus): Promise<Customer[]>;
  archiveCustomer(context: AuthContext, customerId: CustomerId): Promise<Customer>;
  restoreCustomer(context: AuthContext, customerId: CustomerId): Promise<Customer>;
}

export interface CustomerService {
  createCustomer(context: AuthContext, input: CreateCustomerInput): Promise<Customer>;
  getCustomer(context: AuthContext, customerId: CustomerId): Promise<Customer | null>;
  listCustomers(context: AuthContext, status?: CustomerStatus): Promise<Customer[]>;
  archiveCustomer(context: AuthContext, customerId: CustomerId): Promise<Customer>;
  restoreCustomer(context: AuthContext, customerId: CustomerId): Promise<Customer>;
}

export const CUSTOMER_OPERATIONS = Object.freeze({
  read: 'customer.read',
  create: 'customer.create',
  update: 'customer.update',
});
