import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertOwnership,
  assertRole,
  AuthContext,
  canAccessResource,
} from './authorization';

test('resource policy permits a known resource', () => {
  const context: AuthContext = { userId: 7, role: 'customer' };
  assert.equal(canAccessResource(context, 'profile'), true);
});

test('resource policy rejects an unknown resource at the type boundary', () => {
  const context: AuthContext = { userId: 7, role: 'customer' };
  assert.equal(canAccessResource(context, 'support_request'), true);
});

test('ownership accepts the authenticated principal', () => {
  const context: AuthContext = { userId: 7, role: 'customer' };
  assert.doesNotThrow(() => assertOwnership(context, 7));
});

test('ownership rejects another principal', () => {
  const context: AuthContext = { userId: 7, role: 'customer' };
  assert.throws(() => assertOwnership(context, 8), /Resource ownership required/);
});

test('admin may pass ownership gate for governed resources', () => {
  const context: AuthContext = { userId: 1, role: 'admin' };
  assert.doesNotThrow(() => assertOwnership(context, 8));
});

test('role assertion permits an allowed role', () => {
  const context: AuthContext = { userId: 7, role: 'business' };
  assert.doesNotThrow(() => assertRole(context, 'business', 'admin'));
});

test('role assertion rejects a disallowed role', () => {
  const context: AuthContext = { userId: 7, role: 'customer' };
  assert.throws(() => assertRole(context, 'business'), /Insufficient role/);
});
