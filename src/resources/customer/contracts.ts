import type { AuthContext } from '../../auth/authorization';

export type CustomerId = number;
export type AccountId = number;
export type CustomerStatus = 'active' | 'archived';

export interface Customer {
  readonly id: CustomerId;
  readonly accountId: AccountId;
  readonly businessId?: number | null;
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
  createBusinessCustomer?(context: AuthContext, businessId: number, input: CreateCustomerInput): Promise<Customer>;
  listBusinessCustomers?(context: AuthContext, businessId: number, status?: CustomerStatus): Promise<Customer[]>;
  getBusinessCustomer?(context: AuthContext, businessId: number, customerId: CustomerId): Promise<Customer | null>;
  archiveBusinessCustomer?(context: AuthContext, businessId: number, customerId: CustomerId): Promise<Customer>;
  restoreBusinessCustomer?(context: AuthContext, businessId: number, customerId: CustomerId): Promise<Customer>;
}

export interface CustomerService {
  createCustomer(context: AuthContext, input: CreateCustomerInput): Promise<Customer>;
  getCustomer(context: AuthContext, customerId: CustomerId): Promise<Customer | null>;
  listCustomers(context: AuthContext, status?: CustomerStatus): Promise<Customer[]>;
  archiveCustomer(context: AuthContext, customerId: CustomerId): Promise<Customer>;
  restoreCustomer(context: AuthContext, customerId: CustomerId): Promise<Customer>;
  createBusinessCustomer?(context: AuthContext, businessId: number, input: CreateCustomerInput): Promise<Customer>;
  listBusinessCustomers?(context: AuthContext, businessId: number, status?: CustomerStatus): Promise<Customer[]>;
  getBusinessCustomer?(context: AuthContext, businessId: number, customerId: CustomerId): Promise<Customer | null>;
  archiveBusinessCustomer?(context: AuthContext, businessId: number, customerId: CustomerId): Promise<Customer>;
  restoreBusinessCustomer?(context: AuthContext, businessId: number, customerId: CustomerId): Promise<Customer>;
}

export const CUSTOMER_OPERATIONS = Object.freeze({
  read: 'customer.read',
  create: 'customer.create',
  update: 'customer.update',
});
