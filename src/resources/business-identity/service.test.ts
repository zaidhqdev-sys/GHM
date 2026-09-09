import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessIdentityServiceImpl } from './service';
import type {
  AccountIdentity,
  BusinessIdentity,
  BusinessIdentityRepository,
  BusinessMembership,
} from './contracts';
import type { AuthContext } from '../../auth/authorization';

const account = (id: number, role: 'admin' | 'customer' | 'business'): AccountIdentity => ({
  id,
  fullName: 'Test User',
  phone: null,
  avatarRef: null,
  role,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const business = (id: number, approved = true): BusinessIdentity => ({
  id,
  name: `Business ${id}`,
  slug: `business-${id}`,
  verificationStatus: approved ? 'approved' : 'pending',
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const membership = (
  businessId: number,
  accountId: number,
  role: 'owner' | 'administrator' | 'member',
  status: 'active' | 'inactive' | 'revoked' = 'active',
): BusinessMembership => ({
  id: businessId,
  businessId,
  accountId,
  role,
  status,
  createdBy: accountId,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

class FakeRepository implements BusinessIdentityRepository {
  accounts = new Map<number, AccountIdentity>();
  businesses = new Map<number, BusinessIdentity>();
  memberships: BusinessMembership[] = [];
  created: Array<{ business: BusinessIdentity; membership: BusinessMembership }> = [];

  async getAccount(context: AuthContext): Promise<AccountIdentity> {
    const value = this.accounts.get(context.userId);
    if (!value) throw new Error('Authenticated account not found');
    return value;
  }

  async updateAccount(_context: AuthContext, _input: never): Promise<AccountIdentity> {
    throw new Error('not used');
  }

  async getBusinessById(_context: AuthContext, businessId: number): Promise<BusinessIdentity | null> {
    return this.businesses.get(businessId) ?? null;
  }

  async getBusinessBySlug(_context: AuthContext, slug: string): Promise<BusinessIdentity | null> {
    return [...this.businesses.values()].find((value) => value.slug === slug) ?? null;
  }

  async getMembershipsForAccount(context: AuthContext): Promise<readonly BusinessMembership[]> {
    return this.memberships.filter((value) => value.accountId === context.userId);
  }

  async createBusiness(context: AuthContext, input: { name: string }, slug: string): Promise<BusinessIdentity> {
    const createdBusiness = business(this.businesses.size + 1, false);
    const created = { ...createdBusiness, name: input.name.trim(), slug };
    const owner = membership(created.id, context.userId, 'owner');
    this.businesses.set(created.id, created);
    this.memberships.push(owner);
    this.created.push({ business: created, membership: owner });
    return created;
  }

  async updateBusiness(_context: AuthContext, _businessId: number, _input: never): Promise<BusinessIdentity> {
    throw new Error('not used');
  }
}

const serviceFor = (context: AuthContext) => {
  const repository = new FakeRepository();
  repository.accounts.set(context.userId, account(context.userId, context.role));
  return { service: new BusinessIdentityServiceImpl(repository), repository };
};

test('public Business reads require approved and active Business', async () => {
  const context: AuthContext = { userId: 1, role: 'customer' };
  const { service, repository } = serviceFor(context);
  repository.businesses.set(1, business(1, true));
  repository.businesses.set(2, { ...business(2, true), isActive: false });
  repository.businesses.set(3, business(3, false));

  assert.ok(await service.getBusiness(context, 1));
  assert.equal(await service.getBusiness(context, 2), null);
  assert.equal(await service.getBusiness(context, 3), null);
});

test('managed Business read requires active owner or administrator membership', async () => {
  const context: AuthContext = { userId: 1, role: 'business' };
  const { service, repository } = serviceFor(context);
  repository.businesses.set(1, business(1));
  repository.memberships.push(membership(1, 1, 'member'));
  await assert.rejects(() => service.getManagedBusiness(context, 1), /Business management permission required/);

  repository.memberships = [membership(1, 1, 'administrator')];
  assert.deepEqual(await service.getManagedBusiness(context, 1), business(1));
});

test('business creation rejects an existing active membership', async () => {
  const context: AuthContext = { userId: 1, role: 'business' };
  const { service, repository } = serviceFor(context);
  repository.memberships.push(membership(1, 1, 'owner'));

  await assert.rejects(
    () => service.createBusiness(context, { name: 'Second Business' }),
    /no existing active business membership/,
  );
  assert.equal(repository.created.length, 0);
});

test('customer cannot create a Business', async () => {
  const context: AuthContext = { userId: 1, role: 'customer' };
  const { service, repository } = serviceFor(context);

  await assert.rejects(() => service.createBusiness(context, { name: 'Business' }), /business operator role/);
  assert.equal(repository.created.length, 0);
});

test('valid business operator creation establishes owner participation', async () => {
  const context: AuthContext = { userId: 1, role: 'business' };
  const { service, repository } = serviceFor(context);

  const result = await service.createBusiness(context, { name: '  My Business  ' });
  assert.equal(result.activeMembership?.role, 'owner');
  assert.equal(result.activeMembership?.status, 'active');
  assert.equal(result.activeBusiness?.name, 'My Business');
  assert.equal(repository.created.length, 1);
});

test('selected revoked or inactive membership fails closed', async () => {
  const context: AuthContext = { userId: 1, role: 'business' };
  const { service, repository } = serviceFor(context);
  repository.businesses.set(1, business(1));
  repository.memberships.push(membership(1, 1, 'owner', 'revoked'));

  await assert.rejects(
    () => service.resolveIdentity({ context, selectedBusinessId: 1 }),
    /Selected business context is not authorized/,
  );
});
