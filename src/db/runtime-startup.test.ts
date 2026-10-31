import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startRuntimeServer } from './runtime-startup';

const validIdentity = {
  session_user: 'ghm_runtime',
  current_user: 'ghm_runtime',
  current_database: 'ghm_db',
};

test('starts listening after runtime identity verification succeeds', async () => {
  let listenCalled = false;

  await startRuntimeServer(
    async () => ({ rows: [validIdentity] }),
    () => {
      listenCalled = true;
    },
  );

  assert.equal(listenCalled, true);
});

test('does not listen when runtime identity verification fails', async () => {
  let listenCalled = false;

  await assert.rejects(
    () => startRuntimeServer(
      async () => ({
        rows: [{
          ...validIdentity,
          session_user: 'ghm_app_user',
        }],
      }),
      () => {
        listenCalled = true;
      },
    ),
    /Runtime database identity verification failed/,
  );

  assert.equal(listenCalled, false);
});

test('does not listen when the database query fails', async () => {
  let listenCalled = false;

  await assert.rejects(
    () => startRuntimeServer(
      async () => {
        throw new Error('connection failed');
      },
      () => {
        listenCalled = true;
      },
    ),
    /connection failed/,
  );

  assert.equal(listenCalled, false);
});