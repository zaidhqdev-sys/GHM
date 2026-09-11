import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertOwnership,
  assertRole,
  AuthContext,
  canAccessResource,
} from './authorization';
import { isRegisteredOperation, resourceRegistry, ResourceOperation } from '../resources/registry';

const contexts: Record<'admin' | 'customer' | 'business', AuthContext> = {
  admin: { userId: 1, role: 'admin' },
  customer: { userId: 2, role: 'customer' },
  business: { userId: 3, role: 'business' },
};

test('all declared resources are accessible by the current construction primitive', () => {
  for (const resource of ['profile', 'business', 'project', 'quote', 'notification', 'support_request'] as const) {
    assert.equal(canAccessResource(contexts.customer, resource), true);
  }
});

test('unregistered resource operations are denied by the registry', () => {
  assert.equal(isRegisteredOperation('profile', 'read'), true);
  assert.equal(isRegisteredOperation('profile', 'delete'), false);
  assert.equal(isRegisteredOperation('notification', 'create'), false);
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

test('resource operations remain a fixed vocabulary', () => {
  const operations: ResourceOperation[] = ['read', 'readPublic', 'create', 'update', 'delete'];
  for (const definition of resourceRegistry) {
    for (const operation of definition.operations) {
      assert.equal(operations.includes(operation), true);
    }
  }
});
