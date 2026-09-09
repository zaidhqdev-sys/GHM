import assert from 'node:assert/strict';
import test from 'node:test';
import { isRegisteredOperation, resourceRegistry } from './registry';

test('resource registry contains only explicit governed resources', () => {
  assert.deepEqual(
    resourceRegistry.map((definition) => definition.resource),
    ['profile', 'business', 'project', 'quote', 'notification', 'support_request'],
  );
});

test('registered operations are accepted', () => {
  assert.equal(isRegisteredOperation('profile', 'read'), true);
  assert.equal(isRegisteredOperation('business', 'create'), true);
  assert.equal(isRegisteredOperation('notification', 'update'), true);
});

test('unregistered operations are rejected', () => {
  assert.equal(isRegisteredOperation('profile', 'create'), false);
  assert.equal(isRegisteredOperation('notification', 'create'), false);
  assert.equal(isRegisteredOperation('support_request', 'delete'), false);
});
