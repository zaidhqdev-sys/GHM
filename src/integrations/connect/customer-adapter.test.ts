import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { Customer, CustomerService } from '../../resources/customer/contracts';
import type { ConnectAuthorizedOperation } from './authorization-binding';
import { ConnectCustomerAdapterError, dispatchConnectCustomerCapability } from './customer-adapter';

const context: AuthContext = { userId: 42, role: 'customer' };
const customer = (id = 7): Customer => ({
  id, accountId: 42, name: 'Alice', phone: null, email: null, status: 'active',
  createdAt: new Date('2026-10-02T00:00:00Z'), updatedAt: new Date('2026-10-02T00:00:00Z'),
});

const authorized = (
  capability: ConnectAuthorizedOperation['capability'],
  operation: ConnectAuthorizedOperation['operation'],
): ConnectAuthorizedOperation => ({ capability, resource: 'customer', operation, context });

const service = (calls: string[]): CustomerService => ({
  listCustomers: async (_context, status) => { calls.push(`list:${status ?? 'all'}`); return [customer()]; },
  getCustomer: async (_context, id) => { calls.push(`get:${id}`); return customer(id); },
  createCustomer: async (_context, input) => { calls.push(`create:${input.name}`); return customer(8); },
  archiveCustomer: async (_context, id) => { calls.push(`archive:${id}`); return { ...customer(id), status: 'archived' }; },
  restoreCustomer: async (_context, id) => { calls.push(`restore:${id}`); return customer(id); },
});

test('customer read list dispatches to typed service', async () => {
  const calls: string[] = [];
  const result = await dispatchConnectCustomerCapability(
    authorized('customer.read', 'read'), { capability: 'customer.read', status: 'active' }, { customers: service(calls) },
  );
  assert.equal((result as Customer[])[0].id, 7);
  assert.deepEqual(calls, ['list:active']);
});

test('customer read item dispatches to typed service', async () => {
  const calls: string[] = [];
  await dispatchConnectCustomerCapability(
    authorized('customer.read', 'read'), { capability: 'customer.read', customerId: 9 }, { customers: service(calls) },
  );
  assert.deepEqual(calls, ['get:9']);
});

test('customer create dispatches typed input', async () => {
  const calls: string[] = [];
  await dispatchConnectCustomerCapability(
    authorized('customer.create', 'create'),
    { capability: 'customer.create', name: 'Alice', phone: '123', email: 'a@example.com' },
    { customers: service(calls) },
  );
  assert.deepEqual(calls, ['create:Alice']);
});

test('customer update maps active and archived states to typed service methods', async () => {
  const calls: string[] = [];
  await dispatchConnectCustomerCapability(
    authorized('customer.update', 'update'), { capability: 'customer.update', customerId: 9, status: 'archived' }, { customers: service(calls) },
  );
  await dispatchConnectCustomerCapability(
    authorized('customer.update', 'update'), { capability: 'customer.update', customerId: 9, status: 'active' }, { customers: service(calls) },
  );
  assert.deepEqual(calls, ['archive:9', 'restore:9']);
});

test('capability mismatch fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectCustomerCapability(
      authorized('customer.read', 'read'),
      { capability: 'customer.create', name: 'blocked' },
      { customers: service(calls) },
    ),
    (error: unknown) => error instanceof ConnectCustomerAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('operation mismatch fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectCustomerCapability(
      authorized('customer.read', 'create'),
      { capability: 'customer.read' },
      { customers: service(calls) },
    ),
    (error: unknown) => error instanceof ConnectCustomerAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('invalid customer id fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectCustomerCapability(
      authorized('customer.read', 'read'),
      { capability: 'customer.read', customerId: 0 },
      { customers: service(calls) },
    ),
    /Invalid customer identifier/,
  );
  assert.deepEqual(calls, []);
});
