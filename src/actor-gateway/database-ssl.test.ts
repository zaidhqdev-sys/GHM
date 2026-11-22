import assert from 'node:assert/strict';
import test from 'node:test';
import { actorGatewayDatabaseSslConfig } from './database-ssl';

test('production private-network database connections require TLS encryption', () => {
  assert.deepEqual(actorGatewayDatabaseSslConfig('internal', true), { rejectUnauthorized: false });
});

test('external database connections require TLS and certificate verification', () => {
  assert.deepEqual(actorGatewayDatabaseSslConfig('external', true), { rejectUnauthorized: true });
});

test('production refuses ambiguous or missing database transport mode', () => {
  assert.throws(() => actorGatewayDatabaseSslConfig(undefined, true), /DATABASE_SSL_MODE/);
  assert.throws(() => actorGatewayDatabaseSslConfig('true', true), /DATABASE_SSL_MODE/);
});

test('development defaults to no TLS unless an explicit mode is selected', () => {
  assert.equal(actorGatewayDatabaseSslConfig(undefined, false), false);
});

test('explicit development modes retain their production transport requirements', () => {
  assert.deepEqual(actorGatewayDatabaseSslConfig('internal', false), { rejectUnauthorized: false });
  assert.deepEqual(actorGatewayDatabaseSslConfig('external', false), { rejectUnauthorized: true });
});
