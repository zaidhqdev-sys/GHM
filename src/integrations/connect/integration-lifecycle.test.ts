import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConnectIntegration } from './integration-lifecycle';
import {
  ConnectIntegrationLifecycleError,
  requireActiveConnectIntegration,
} from './integration-lifecycle';

const integration = (status: ConnectIntegration['status']): ConnectIntegration => ({
  id: 'connect-prod',
  displayName: 'ZAID Connect',
  status,
  createdAt: new Date('2026-10-02T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
  disabledAt: status === 'disabled' ? new Date('2026-10-02T00:01:00Z') : null,
  revokedAt: status === 'revoked' ? new Date('2026-10-02T00:02:00Z') : null,
});

test('active Connect integration is accepted', async () => {
  const repository = { get: async () => integration('active') };
  const result = await requireActiveConnectIntegration(repository, 'connect-prod');
  assert.equal(result.status, 'active');
});

test('unknown Connect integration fails closed', async () => {
  const repository = { get: async () => null };
  await assert.rejects(
    () => requireActiveConnectIntegration(repository, 'unknown'),
    (error: unknown) =>
      error instanceof ConnectIntegrationLifecycleError &&
      error.message === 'Connect integration is unknown',
  );
});

test('disabled Connect integration fails closed', async () => {
  const repository = { get: async () => integration('disabled') };
  await assert.rejects(
    () => requireActiveConnectIntegration(repository, 'connect-prod'),
    (error: unknown) =>
      error instanceof ConnectIntegrationLifecycleError &&
      error.message === 'Connect integration is not active',
  );
});

test('revoked Connect integration fails closed', async () => {
  const repository = { get: async () => integration('revoked') };
  await assert.rejects(
    () => requireActiveConnectIntegration(repository, 'connect-prod'),
    (error: unknown) =>
      error instanceof ConnectIntegrationLifecycleError &&
      error.message === 'Connect integration is not active',
  );
});

test('malformed Connect integration id is rejected before repository access', async () => {
  let calls = 0;
  const repository = {
    get: async () => {
      calls += 1;
      return integration('active');
    },
  };

  await assert.rejects(
    () => requireActiveConnectIntegration(repository, ''),
    ConnectIntegrationLifecycleError,
  );
  assert.equal(calls, 0);
});
