import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { BusinessRegistrationIdentity, BusinessRegistrationIdentityRepository, UpdateBusinessRegistrationIdentityInput } from './contracts';
import { BusinessRegistrationIdentityServiceImpl } from './service';

const context: AuthContext = { userId: 42, role: 'business' };
const identity = (input: Partial<BusinessRegistrationIdentity> = {}): BusinessRegistrationIdentity => ({
  businessId: 55,
  registrationStatus: null,
  registrationNumber: null,
  legalName: null,
  updatedAt: null,
  ...input,
});

class FakeRepository implements BusinessRegistrationIdentityRepository {
  reads: number[] = [];
  writes: UpdateBusinessRegistrationIdentityInput[] = [];
  async getRegistrationIdentity(_context: AuthContext, businessId: number) {
    this.reads.push(businessId);
    return identity({ businessId });
  }
  async updateRegistrationIdentity(_context: AuthContext, input: UpdateBusinessRegistrationIdentityInput) {
    this.writes.push(input);
    return identity(input);
  }
}

test('registration identity read requires a positive safe integer Business ID', async () => {
  const repository = new FakeRepository();
  const service = new BusinessRegistrationIdentityServiceImpl(repository);
  await assert.rejects(() => service.getRegistrationIdentity(context, 0), /positive integer/i);
  await assert.rejects(() => service.getRegistrationIdentity(context, '55' as unknown as number), /positive integer/i);
  assert.deepEqual(repository.reads, []);
});

test('registered declaration trims and validates private registration fields', async () => {
  const repository = new FakeRepository();
  const service = new BusinessRegistrationIdentityServiceImpl(repository);
  const result = await service.updateRegistrationIdentity(context, {
    businessId: 55,
    registrationStatus: 'registered',
    registrationNumber: '  2020/123456/07  ',
    legalName: '  Example (Pty) Ltd  ',
  });
  assert.deepEqual(repository.writes, [{
    businessId: 55,
    registrationStatus: 'registered',
    registrationNumber: '2020/123456/07',
    legalName: 'Example (Pty) Ltd',
  }]);
  assert.equal(result.businessId, 55);
});

test('unregistered and undeclared states cannot retain registration details', async () => {
  const repository = new FakeRepository();
  const service = new BusinessRegistrationIdentityServiceImpl(repository);
  await service.updateRegistrationIdentity(context, {
    businessId: 55,
    registrationStatus: 'unregistered',
    registrationNumber: null,
    legalName: null,
  });
  await service.updateRegistrationIdentity(context, {
    businessId: 55,
    registrationStatus: null,
    registrationNumber: null,
    legalName: null,
  });
  assert.equal(repository.writes.length, 2);
  await assert.rejects(() => service.updateRegistrationIdentity(context, {
    businessId: 55,
    registrationStatus: 'unregistered',
    registrationNumber: '123',
    legalName: null,
  }), /must be empty/i);
  await assert.rejects(() => service.updateRegistrationIdentity(context, {
    businessId: 55,
    registrationStatus: null,
    registrationNumber: null,
    legalName: 'Example Pty Ltd',
  }), /must be empty/i);
  assert.equal(repository.writes.length, 2);
});

test('registered declaration rejects missing and overlong values', async () => {
  const repository = new FakeRepository();
  const service = new BusinessRegistrationIdentityServiceImpl(repository);
  await assert.rejects(() => service.updateRegistrationIdentity(context, {
    businessId: 55, registrationStatus: 'registered', registrationNumber: null, legalName: 'Example Pty Ltd',
  }), /Registration number must contain/i);
  await assert.rejects(() => service.updateRegistrationIdentity(context, {
    businessId: 55, registrationStatus: 'registered', registrationNumber: '1'.repeat(121), legalName: 'Example Pty Ltd',
  }), /Registration number must contain/i);
  await assert.rejects(() => service.updateRegistrationIdentity(context, {
    businessId: 55, registrationStatus: 'registered', registrationNumber: '123', legalName: 'x'.repeat(201),
  }), /Legal name must contain/i);
  assert.equal(repository.writes.length, 0);
});
