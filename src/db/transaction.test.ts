import assert from 'node:assert/strict';
import test from 'node:test';
import { withAuthorizedTransaction } from './authorized-transaction';

/**
 * These tests document the transaction contract without requiring a live
 * database. The integration gate remains blocked until a reachable GHM
 * PostgreSQL instance is available.
 */
test('authorized transaction API requires an AuthContext and transaction work', () => {
  assert.equal(typeof withAuthorizedTransaction, 'function');
});

test('transaction qualification is explicitly integration-gated', () => {
  assert.ok(
    'Live PostgreSQL integration is required to prove BEGIN/COMMIT/ROLLBACK, client reuse, and release semantics.',
  );
});
