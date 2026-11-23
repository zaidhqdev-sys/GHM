import type { AuthContext } from '../../auth/authorization';
import type {
  CreateCustomerInput,
  Customer,
  CustomerRepository,
  CustomerService,
  CustomerStatus,
} from './contracts';

const normalizeNullableText = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${field} must be null or a string`);
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
};

const validateCreateInput = (input: CreateCustomerInput): CreateCustomerInput => {
  if (!input || typeof input !== 'object') throw new Error('Customer input is required');
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    throw new Error('name is required');
  }

  return {
    name: input.name.trim(),
    phone: normalizeNullableText(input.phone, 'phone'),
    email: normalizeNullableText(input.email, 'email'),
  };
};

const validateStatus: (status: unknown) => asserts status is CustomerStatus = (status) => {
  if (status !== 'active' && status !== 'archived') {
    throw new Error('Invalid Customer status');
  }
};

export class CustomerServiceImpl implements CustomerService {
  constructor(private readonly repository: CustomerRepository) {}

  async createBusinessCustomer(context: AuthContext, businessId: number, input: CreateCustomerInput): Promise<Customer> {
    if (!this.repository.createBusinessCustomer) throw new Error('Business Customer capability unavailable');
    return this.repository.createBusinessCustomer(context, businessId, validateCreateInput(input));
  }

  async listBusinessCustomers(context: AuthContext, businessId: number, status?: CustomerStatus): Promise<Customer[]> {
    if (!this.repository.listBusinessCustomers) throw new Error('Business Customer capability unavailable');
    if (status !== undefined) validateStatus(status);
    return this.repository.listBusinessCustomers(context, businessId, status);
  }

  async getBusinessCustomer(context: AuthContext, businessId: number, customerId: number): Promise<Customer | null> {
    if (!this.repository.getBusinessCustomer) throw new Error('Business Customer capability unavailable');
    return this.repository.getBusinessCustomer(context, businessId, customerId);
  }

  async archiveBusinessCustomer(context: AuthContext, businessId: number, customerId: number): Promise<Customer> {
    if (!this.repository.archiveBusinessCustomer) throw new Error('Business Customer capability unavailable');
    return this.repository.archiveBusinessCustomer(context, businessId, customerId);
  }

  async restoreBusinessCustomer(context: AuthContext, businessId: number, customerId: number): Promise<Customer> {
    if (!this.repository.restoreBusinessCustomer) throw new Error('Business Customer capability unavailable');
    return this.repository.restoreBusinessCustomer(context, businessId, customerId);
  }

  async createCustomer(
    context: AuthContext,
    input: CreateCustomerInput,
  ): Promise<Customer> {
    return this.repository.createCustomer(context, validateCreateInput(input));
  }

  async getCustomer(context: AuthContext, customerId: number): Promise<Customer | null> {
    return this.repository.getCustomer(context, customerId);
  }

  async listCustomers(
    context: AuthContext,
    status?: CustomerStatus,
  ): Promise<Customer[]> {
    if (status !== undefined) validateStatus(status);
    return this.repository.listCustomers(context, status);
  }

  async archiveCustomer(context: AuthContext, customerId: number): Promise<Customer> {
    return this.repository.archiveCustomer(context, customerId);
  }

  async restoreCustomer(context: AuthContext, customerId: number): Promise<Customer> {
    return this.repository.restoreCustomer(context, customerId);
  }
}
