import assert from 'node:assert/strict';
import test from 'node:test';
import { requireFreshConnectServiceAssertion, type ConnectServiceAssertionReplayStore } from './service-assertion-replay';

test('replay guard accepts first request and rejects second', async () => {
  const seen = new Set<string>();
  const store: ConnectServiceAssertionReplayStore = { consume: async (id) => !seen.has(id) && (seen.add(id), true) };
  const expiry = new Date(Date.now() + 60000);
  await requireFreshConnectServiceAssertion(store, 'request-1', 'connect-test', expiry);
  await assert.rejects(() => requireFreshConnectServiceAssertion(store, 'request-1', 'connect-test', expiry), /replay detected/);
});

test('replay guard fails closed when storage reports no consumption', async () => {
  const store: ConnectServiceAssertionReplayStore = { consume: async () => false };
  await assert.rejects(() => requireFreshConnectServiceAssertion(store, 'request-2', 'connect-test', new Date(Date.now() + 60000)), /replay detected/);
});

test('replay store validates before persistence', async () => {
  let called = false;
  const store: ConnectServiceAssertionReplayStore = { consume: async () => { called = true; return true; } };
  await assert.rejects(() => store.consume('bad\\nvalue', 'connect-test', new Date(Date.now() + 60000)));
  await assert.rejects(() => store.consume('request-3', 'connect-test', new Date(Date.now() - 1)));
  assert.equal(called, false);
});
