import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  assertOwnership,
  assertRole,
  canAccessResource,
  isRegisteredOperation,
  type AuthContext,
} from './authorization';

const contexts: Record<'admin' | 'customer' | 'business', AuthContext> = {
  admin: { userId: 1, role: 'admin' },
  customer: { userId: 2, role: 'customer' },
  business: { userId: 3, role: 'business' },
};

test('all declared resources are accessible by the current construction primitive', () => {
  for (const role of Object.keys(contexts) as Array<keyof typeof contexts>) {
    assert.equal(canAccessResource(contexts[role], 'profile'), true);
  }
});

test('Commercial is a coarse authorized resource for every authenticated GHM role', () => {
  assert.equal(canAccessResource(contexts.admin, 'commercial'), true);
  assert.equal(canAccessResource(contexts.customer, 'commercial'), true);
  assert.equal(canAccessResource(contexts.business, 'commercial'), true);
});

test('Commercial domain operations remain outside the generic HTTP resource vocabulary', () => {
  assert.equal(
    isRegisteredOperation('commercial', 'read'),
    false,
  );
  assert.equal(
    isRegisteredOperation('commercial', 'create'),
    false,
  );
  assert.equal(
    isRegisteredOperation('commercial', 'update'),
    false,
  );
});
test('unregistered resource operations are denied by the registry', () => {
  assert.equal(isRegisteredOperation('profile', 'read'), true);
  assert.equal(isRegisteredOperation('profile', 'delete'), false);
  assert.equal(isRegisteredOperation('notification', 'create'), true);
});

test('ownership rejects a non-owner', () => {
  assert.throws(() => assertOwnership(contexts.customer, contexts.business.userId), /Resource ownership required/);
});

test('ownership permits the owner', () => {
  assert.doesNotThrow(() => assertOwnership(contexts.customer, contexts.customer.userId));
});

test('admin ownership bypass is explicit', () => {
  assert.doesNotThrow(() => assertOwnership(contexts.admin, contexts.business.userId));
});

test('role assertions reject disallowed roles', () => {
  assert.throws(() => assertRole(contexts.business, 'admin'), /Insufficient role/);
  assert.doesNotThrow(() => assertRole(contexts.business, 'business', 'admin'));
});
