import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  CreateCustomerInput,
  Customer,
  CustomerRepository,
  CustomerStatus,
} from './contracts';
import { CustomerServiceImpl } from './service';

const customer = (
  id: number,
  accountId: number,
  status: CustomerStatus = 'active',
): Customer => ({
  id,
  accountId,
  name: `Customer ${id}`,
  phone: null,
  email: null,
  status,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

class FakeRepository implements CustomerRepository {
  customers = new Map<number, Customer>();
  nextId = 1;

  async createCustomer(context: AuthContext, input: CreateCustomerInput): Promise<Customer> {
    const created: Customer = {
      ...customer(this.nextId++, context.userId),
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
    };
    this.customers.set(created.id, created);
    return created;
  }

  async getCustomer(context: AuthContext, customerId: number): Promise<Customer | null> {
    const value = this.customers.get(customerId);
    return value && (context.role === 'admin' || value.accountId === context.userId) ? value : null;
  }

  async listCustomers(context: AuthContext, status?: CustomerStatus): Promise<Customer[]> {
    return [...this.customers.values()].filter(value =>
      (context.role === 'admin' || value.accountId === context.userId) &&
      (status === undefined || value.status === status),
    );
  }

  async archiveCustomer(context: AuthContext, customerId: number): Promise<Customer> {
    return this.setStatus(context, customerId, 'archived');
  }

  async restoreCustomer(context: AuthContext, customerId: number): Promise<Customer> {
    return this.setStatus(context, customerId, 'active');
  }

  private async setStatus(context: AuthContext, customerId: number, status: CustomerStatus): Promise<Customer> {
    const existing = await this.getCustomer(context, customerId);
    if (!existing) throw new Error('Customer not found or ownership required');
    const updated = { ...existing, status, updatedAt: new Date(1) };
    this.customers.set(customerId, updated);
    return updated;
  }
}

const serviceFor = () => {
  const repository = new FakeRepository();
  return { repository, service: new CustomerServiceImpl(repository) };
};

test('Customer creation binds ownership to authenticated account', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service } = serviceFor();

  const created = await service.createCustomer(context, {
    name: '  Acme Client  ',
    phone: ' 0123456789 ',
    email: ' client@example.com ',
  });

  assert.equal(created.accountId, 10);
  assert.equal(created.name, 'Acme Client');
  assert.equal(created.phone, '0123456789');
  assert.equal(created.email, 'client@example.com');
  assert.equal(created.status, 'active');
});

test('Customer phone and email may be omitted', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service } = serviceFor();

  const created = await service.createCustomer(context, { name: 'No Contact Details' });

  assert.equal(created.phone, null);
  assert.equal(created.email, null);
});

test('blank Customer name is rejected', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service } = serviceFor();

  await assert.rejects(
    () => service.createCustomer(context, { name: '   ' }),
    /name is required/,
  );
});

test('non-owner cannot read Customer', async () => {
  const context: AuthContext = { userId: 20, role: 'customer' };
  const { service, repository } = serviceFor();
  repository.customers.set(1, customer(1, 10));

  assert.equal(await service.getCustomer(context, 1), null);
});

test('owner can read and list Customers', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service, repository } = serviceFor();
  repository.customers.set(1, customer(1, 10));
  repository.customers.set(2, customer(2, 10, 'archived'));
  repository.customers.set(3, customer(3, 20));

  assert.equal((await service.getCustomer(context, 1))?.id, 1);
  assert.deepEqual((await service.listCustomers(context)).map(value => value.id), [1, 2]);
  assert.deepEqual((await service.listCustomers(context, 'active')).map(value => value.id), [1]);
});

test('archive and restore are the supported lifecycle mutations', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service, repository } = serviceFor();
  repository.customers.set(1, customer(1, 10));

  const archived = await service.archiveCustomer(context, 1);
  assert.equal(archived.status, 'archived');

  const restored = await service.restoreCustomer(context, 1);
  assert.equal(restored.status, 'active');
});

test('invalid Customer status filter is rejected', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service } = serviceFor();

  await assert.rejects(
    () => service.listCustomers(context, 'invalid' as never),
    /Invalid Customer status/,
  );
});
