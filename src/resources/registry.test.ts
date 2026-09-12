import assert from 'node:assert/strict';
import test from 'node:test';
import { isRegisteredOperation, resourceRegistry } from './registry';

test('resource registry contains only explicit governed resources', () => {
  assert.deepEqual(
    resourceRegistry.map((definition) => definition.resource),
    ['profile', 'business', 'project', 'quote', 'notification', 'support_request', 'enquiry', 'review'],
  );
});

test('registered operations are accepted', () => {
  assert.equal(isRegisteredOperation('profile', 'read'), true);
  assert.equal(isRegisteredOperation('business', 'create'), true);
  assert.equal(isRegisteredOperation('notification', 'update'), true);
  assert.equal(isRegisteredOperation('enquiry', 'read'), true);
  assert.equal(isRegisteredOperation('enquiry', 'create'), true);
  assert.equal(isRegisteredOperation('enquiry', 'update'), true);
  assert.equal(isRegisteredOperation('review', 'create'), true);
  assert.equal(isRegisteredOperation('review', 'readOwn'), true);
  assert.equal(isRegisteredOperation('review', 'readPublic'), true);
  assert.equal(isRegisteredOperation('review', 'readPending'), true);
  assert.equal(isRegisteredOperation('review', 'approve'), true);
  assert.equal(isRegisteredOperation('review', 'reject'), true);
});

test('unregistered operations are rejected', () => {
  assert.equal(isRegisteredOperation('profile', 'create'), false);
  assert.equal(isRegisteredOperation('notification', 'create'), false);
  assert.equal(isRegisteredOperation('support_request', 'delete'), false);
  assert.equal(isRegisteredOperation('enquiry', 'delete'), false);
  assert.equal(isRegisteredOperation('review', 'update'), false);
  assert.equal(isRegisteredOperation('review', 'delete'), false);
});
