import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRecoveryWebhookDelivery,
  createRecoveryWebhookDeliveryFromEnv,
} from './recovery-webhook-delivery';

const token = 'x'.repeat(40);

test('delivery is disabled until both server-side environment values are present', () => {
  assert.equal(createRecoveryWebhookDeliveryFromEnv({}), null);
  assert.throws(
    () => createRecoveryWebhookDeliveryFromEnv({ GHM_RECOVERY_DELIVERY_WEBHOOK_URL: 'https://delivery.example.test/hook' }),
    /configured together/,
  );
});

test('delivery requires HTTPS and a strong bearer token', () => {
  assert.throws(
    () => createRecoveryWebhookDelivery({ url: 'http://delivery.example.test/hook', bearerToken: token }),
    /HTTPS/,
  );
  assert.throws(
    () => createRecoveryWebhookDelivery({ url: 'https://delivery.example.test/hook', bearerToken: 'short' }),
    /not strong enough/,
  );
  assert.throws(
    () => createRecoveryWebhookDelivery({ url: 'https://user:pass@delivery.example.test/hook', bearerToken: token }),
    /URL credentials or fragments/,
  );
});

test('delivery sends the one-time credential only to the configured HTTPS boundary', async () => {
  let request: { url: string; init: { headers: Record<string, string>; body: string; method: string; redirect: string } } | undefined;
  const delivery = createRecoveryWebhookDelivery(
    { url: 'https://delivery.example.test/hook', bearerToken: token },
    async (url, init) => {
      request = { url, init };
      return { ok: true, status: 202 };
    },
  );
  const expiresAt = new Date('2026-10-20T12:00:00.000Z');
  await delivery.deliver({ accountId: 42, email: 'owner@example.test', recoveryToken: 'opaque-one-time-token', expiresAt });
  assert.equal(request?.url, 'https://delivery.example.test/hook');
  assert.equal(request?.init.method, 'POST');
  assert.equal(request?.init.redirect, 'error');
  assert.equal(request?.init.headers.authorization, `Bearer ${token}`);
  assert.equal(request?.init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(request!.init.body), {
    event: 'quoteflow_migration_password_reset',
    email: 'owner@example.test',
    recoveryToken: 'opaque-one-time-token',
    expiresAt: expiresAt.toISOString(),
  });
});

test('delivery fails closed when the webhook rejects the request', async () => {
  const delivery = createRecoveryWebhookDelivery(
    { url: 'https://delivery.example.test/hook', bearerToken: token },
    async () => ({ ok: false, status: 503 }),
  );
  await assert.rejects(
    delivery.deliver({ accountId: 1, email: 'owner@example.test', recoveryToken: 'secret-token', expiresAt: new Date() }),
    /rejected the request/,
  );
});
