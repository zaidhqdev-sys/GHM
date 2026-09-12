import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessIdentityServiceImpl } from './service';
import type { AccountIdentity, BusinessIdentity, BusinessIdentityRepository, BusinessMembership, UpdateBusinessProfileInput, UpdateProfileInput } from './contracts';
import type { AuthContext } from '../../auth/authorization';

const account = (id: number, role: 'admin' | 'customer' | 'business'): AccountIdentity => ({ id, fullName: 'Test User', phone: null, avatarRef: null, role, createdAt: new Date(0), updatedAt: new Date(0) });
const business = (id: number, approved = true): BusinessIdentity => ({ id, name: `Business ${id}`, slug: `business-${id}`, verificationStatus: approved ? 'approved' : 'unverified', isActive: true, createdAt: new Date(0), updatedAt: new Date(0) });
const membership = (businessId: number, accountId: number, role: 'owner' | 'administrator' | 'member', status: 'active' | 'inactive' | 'revoked' = 'active'): BusinessMembership => ({ id: businessId, businessId, accountId, role, status, createdBy: accountId, createdAt: new Date(0), updatedAt: new Date(0) });

class FakeRepository implements BusinessIdentityRepository {
  accounts = new Map<number, AccountIdentity>();
  businesses = new Map<number, BusinessIdentity>();
  memberships: BusinessMembership[] = [];
  created: Array<{ business: BusinessIdentity; membership: BusinessMembership }> = [];
  async getAccount(context: AuthContext) { const value = this.accounts.get(context.userId); if (!value) throw new Error('Authenticated account not found'); return value; }
  async updateAccount(_context: AuthContext, _input: UpdateProfileInput): Promise<AccountIdentity> { throw new Error('not used'); }
  async getBusinessById(_context: AuthContext, id: number) { return this.businesses.get(id) ?? null; }
  async getBusinessBySlug(_context: AuthContext, slug: string) { return [...this.businesses.values()].find(v => v.slug === slug) ?? null; }
  async getMembershipsForAccount(context: AuthContext) { return this.memberships.filter(v => v.accountId === context.userId); }
  async createBusiness(context: AuthContext, input: { name: string }, slug: string) { const created = { ...business(this.businesses.size + 1, false), name: input.name.trim(), slug }; const owner = membership(created.id, context.userId, 'owner'); this.businesses.set(created.id, created); this.memberships.push(owner); this.created.push({ business: created, membership: owner }); return created; }
  async updateBusiness(_context: AuthContext, _businessId: number, _input: UpdateBusinessProfileInput): Promise<BusinessIdentity> { throw new Error('not used'); }
}
const serviceFor = (context: AuthContext) => { const repository = new FakeRepository(); repository.accounts.set(context.userId, account(context.userId, context.role)); return { service: new BusinessIdentityServiceImpl(repository), repository }; };

test('public Business reads require approved and active Business', async () => {
  const context: AuthContext = { userId: 1, role: 'customer' }; const { service, repository } = serviceFor(context);
  repository.businesses.set(1, business(1, true)); repository.businesses.set(2, { ...business(2, true), isActive: false }); repository.businesses.set(3, business(3, false));
  assert.ok(await service.getPublicBusiness(context, 1)); assert.equal(await service.getPublicBusiness(context, 2), null); assert.equal(await service.getPublicBusiness(context, 3), null);
});

test('public Business slug reads require approval', async () => {
  const context: AuthContext = { userId: 1, role: 'customer' }; const { service, repository } = serviceFor(context);
  repository.businesses.set(1, business(1, true)); repository.businesses.set(2, business(2, false));
  assert.ok(await service.getPublicBusinessBySlug(context, 'business-1')); assert.equal(await service.getPublicBusinessBySlug(context, 'business-2'), null);
});

test('identity resolution auto-selects the only active membership', async () => {
  const context: AuthContext = { userId: 1, role: 'business' }; const { service, repository } = serviceFor(context);
  repository.businesses.set(1, business(1)); repository.memberships.push(membership(1, 1, 'owner'));
  const result = await service.resolveIdentity({ context });
  assert.equal(result.activeBusiness?.id, 1); assert.equal(result.activeMembership?.businessId, 1);
});

test('identity resolution requires explicit selection for multiple active memberships', async () => {
  const context: AuthContext = { userId: 1, role: 'business' }; const { service, repository } = serviceFor(context);
  repository.businesses.set(1, business(1)); repository.businesses.set(2, business(2)); repository.memberships.push(membership(1, 1, 'owner'), membership(2, 1, 'administrator'));
  await assert.rejects(() => service.resolveIdentity({ context }), /business-selection-required/);
  const result = await service.resolveIdentity({ context, selectedBusinessId: 2 });
  assert.equal(result.activeBusiness?.id, 2); assert.equal(result.activeMembership?.role, 'administrator');
});

test('managed Business read requires active owner or administrator membership', async () => {
  const context: AuthContext = { userId: 1, role: 'business' }; const { service, repository } = serviceFor(context); repository.businesses.set(1, business(1)); repository.memberships.push(membership(1, 1, 'member'));
  await assert.rejects(() => service.getManagedBusiness(context, 1), /Business management permission required/);
  repository.memberships = [membership(1, 1, 'administrator')]; assert.deepEqual(await service.getManagedBusiness(context, 1), business(1));
});

test('business creation allows a second Business and preserves existing membership', async () => {
  const context: AuthContext = { userId: 1, role: 'business' };
  const { service, repository } = serviceFor(context);

  repository.businesses.set(1, business(1));
  repository.memberships.push(membership(1, 1, 'owner'));

  const result = await service.createBusiness(context, { name: 'Second Business' });

  assert.equal(repository.created.length, 1);
  assert.equal(repository.created[0].business.name, 'Second Business');
  assert.equal(repository.created[0].membership.role, 'owner');

  const memberships = await repository.getMembershipsForAccount(context);
  assert.equal(memberships.length, 2);
  assert.deepEqual(memberships.map((value) => value.businessId), [1, 2]);
  assert.equal(memberships[0].role, 'owner');
  assert.equal(memberships[1].role, 'owner');

  assert.equal(result.activeBusiness?.id, 2);
  assert.equal(result.activeMembership?.businessId, 2);
});

test('customer cannot create a Business', async () => {
  const context: AuthContext = { userId: 1, role: 'customer' }; const { service, repository } = serviceFor(context);
  await assert.rejects(() => service.createBusiness(context, { name: 'Business' }), /business operator role/); assert.equal(repository.created.length, 0);
});

test('valid business operator creation establishes owner participation', async () => {
  const context: AuthContext = { userId: 1, role: 'business' }; const { service, repository } = serviceFor(context); const result = await service.createBusiness(context, { name: '  My Business  ' });
  assert.equal(result.activeMembership?.role, 'owner'); assert.equal(result.activeMembership?.status, 'active'); assert.equal(result.activeBusiness?.name, 'My Business'); assert.equal(repository.created.length, 1);
});

test('selected revoked or inactive membership fails closed', async () => {
  const context: AuthContext = { userId: 1, role: 'business' }; const { service, repository } = serviceFor(context); repository.businesses.set(1, business(1)); repository.memberships.push(membership(1, 1, 'owner', 'revoked'));
  await assert.rejects(() => service.resolveIdentity({ context, selectedBusinessId: 1 }), /Selected business context is not authorized/);
});
