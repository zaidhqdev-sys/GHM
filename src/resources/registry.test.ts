import assert from 'node:assert/strict';
import test from 'node:test';
import { isRegisteredOperation, resourceRegistry } from './registry';

test('resource registry contains only explicit governed resources', () => {
  assert.deepEqual(resourceRegistry.map((definition) => definition.resource), ['profile', 'business', 'project', 'customer', 'quote', 'notification', 'support_request', 'enquiry', 'review', 'opportunity', 'opportunity_participant', 'saved_business']);
});

test('registered operations are accepted', () => {
  assert.equal(isRegisteredOperation('profile', 'read'), true);
  assert.equal(isRegisteredOperation('business', 'create'), true);
  assert.equal(isRegisteredOperation('customer', 'read'), true);
  assert.equal(isRegisteredOperation('customer', 'create'), true);
  assert.equal(isRegisteredOperation('customer', 'update'), true);
  assert.equal(isRegisteredOperation('quote', 'read'), true);
  assert.equal(isRegisteredOperation('quote', 'create'), true);
  assert.equal(isRegisteredOperation('quote', 'update'), true);
  assert.equal(isRegisteredOperation('notification', 'read'), true);
  assert.equal(isRegisteredOperation('notification', 'create'), true);
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
  assert.equal(isRegisteredOperation('opportunity', 'read'), true);
  assert.equal(isRegisteredOperation('opportunity', 'create'), true);
  assert.equal(isRegisteredOperation('opportunity', 'update'), true);
  assert.equal(isRegisteredOperation('opportunity', 'transition'), true);
  assert.equal(isRegisteredOperation('opportunity_participant', 'read'), true);
  assert.equal(isRegisteredOperation('opportunity_participant', 'create'), true);
  assert.equal(isRegisteredOperation('opportunity_participant', 'update'), true);
  assert.equal(isRegisteredOperation('saved_business', 'read'), true);
  assert.equal(isRegisteredOperation('saved_business', 'create'), true);
  assert.equal(isRegisteredOperation('saved_business', 'delete'), true);
});

test('unregistered operations are rejected', () => {
  assert.equal(isRegisteredOperation('profile', 'create'), false);
  assert.equal(isRegisteredOperation('customer', 'delete'), false);
  assert.equal(isRegisteredOperation('quote', 'delete'), false);
  assert.equal(isRegisteredOperation('support_request', 'delete'), false);
  assert.equal(isRegisteredOperation('enquiry', 'delete'), false);
  assert.equal(isRegisteredOperation('review', 'update'), false);
  assert.equal(isRegisteredOperation('review', 'delete'), false);
  assert.equal(isRegisteredOperation('opportunity', 'delete'), false);
  assert.equal(isRegisteredOperation('opportunity_participant', 'delete'), false);
  assert.equal(isRegisteredOperation('saved_business', 'update'), false);
});
