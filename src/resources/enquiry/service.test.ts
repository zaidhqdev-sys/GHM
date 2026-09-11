import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { Enquiry, EnquiryRepository } from './contracts';
import { EnquiryServiceImpl } from './service';

const customerContext: AuthContext = { userId: 1, role: 'customer' };
const businessContext: AuthContext = { userId: 2, role: 'business' };
const adminContext: AuthContext = { userId: 3, role: 'admin' };
const enquiry = (): Enquiry => ({
  id: 1, businessId: 2, customerId: 1, customerName: 'Customer', customerPhone: null, customerEmail: null,
  project: 'Kitchen renovation', description: 'Need a kitchen renovation quote', city: 'Durban',
  budgetMin: 10000, budgetMax: 20000, urgency: 'standard', source: 'marketplace', status: 'new',
  createdAt: new Date(0), updatedAt: new Date(0),
});

class FakeRepository implements EnquiryRepository {
  lastCreate: any = null;
  async createEnquiry(_context: AuthContext, input: any) { this.lastCreate = input; return enquiry(); }
  async getOwnEnquiry() { return enquiry(); }
  async getReceivedEnquiry() { return enquiry(); }
  async updateReceivedEnquiryStatus(_context: AuthContext, _id: number, input: any) { assert.equal(input.status, 'contacted'); return { ...enquiry(), status: input.status }; }
}

test('Enquiry creation normalizes snapshots and defaults', async () => {
  const repository = new FakeRepository();
  const service = new EnquiryServiceImpl(repository);
  await service.createEnquiry(customerContext, {
    businessId: 2, customerName: '  Customer  ', customerPhone: ' 0712345678 ', customerEmail: ' customer@example.com ',
    project: '  Kitchen renovation ', description: ' Need a kitchen renovation quote ', city: ' Durban ', budgetMin: 10000, budgetMax: 20000,
  });
  assert.equal(repository.lastCreate.customerName, 'Customer');
  assert.equal(repository.lastCreate.customerPhone, '0712345678');
  assert.equal(repository.lastCreate.customerEmail, 'customer@example.com');
  assert.equal(repository.lastCreate.project, 'Kitchen renovation');
  assert.equal(repository.lastCreate.description, 'Need a kitchen renovation quote');
  assert.equal(repository.lastCreate.city, 'Durban');
  assert.equal(repository.lastCreate.urgency, 'standard');
  assert.equal(repository.lastCreate.source, 'marketplace');
});

test('Enquiry creation rejects non-marketplace source', async () => {
  const service = new EnquiryServiceImpl(new FakeRepository());
  await assert.rejects(() => service.createEnquiry(customerContext, { businessId: 2, customerName: 'Customer', project: 'Project', description: 'A valid enquiry description', source: 'directory' }), /Only marketplace Enquiries may be created/);
});

test('Enquiry creation rejects invalid budgets', async () => {
  const service = new EnquiryServiceImpl(new FakeRepository());
  await assert.rejects(() => service.createEnquiry(customerContext, { businessId: 2, customerName: 'Customer', project: 'Project', description: 'A valid enquiry description', budgetMin: 200, budgetMax: 100 }), /budgetMax must be greater than or equal to budgetMin/);
});

test('Enquiry customer operations reject business and admin roles', async () => {
  const service = new EnquiryServiceImpl(new FakeRepository());
  await assert.rejects(() => service.createEnquiry(businessContext, { businessId: 2, customerName: 'Customer', project: 'Project', description: 'A valid enquiry description' }), /Insufficient role/);
  await assert.rejects(() => service.getOwnEnquiry(businessContext, 1), /Insufficient role/);
  await assert.rejects(() => service.createEnquiry(adminContext, { businessId: 2, customerName: 'Customer', project: 'Project', description: 'A valid enquiry description' }), /Insufficient role/);
  await assert.rejects(() => service.getOwnEnquiry(adminContext, 1), /Insufficient role/);
});

test('Enquiry recipient operations reject customer and admin roles', async () => {
  const service = new EnquiryServiceImpl(new FakeRepository());
  await assert.rejects(() => service.getReceivedEnquiry(customerContext, 1), /Insufficient role/);
  await assert.rejects(() => service.updateReceivedEnquiryStatus(customerContext, 1, { status: 'contacted' }), /Insufficient role/);
  await assert.rejects(() => service.getReceivedEnquiry(adminContext, 1), /Insufficient role/);
  await assert.rejects(() => service.updateReceivedEnquiryStatus(adminContext, 1, { status: 'contacted' }), /Insufficient role/);
});

test('Enquiry status mutation accepts only governed lifecycle values', async () => {
  const service = new EnquiryServiceImpl(new FakeRepository());
  const result = await service.updateReceivedEnquiryStatus(businessContext, 1, { status: 'contacted' });
  assert.equal(result.status, 'contacted');
  await assert.rejects(() => service.updateReceivedEnquiryStatus(businessContext, 1, { status: 'invalid' as never }), /Invalid Enquiry status/);
});
