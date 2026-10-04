import assert from 'node:assert/strict';
import test from 'node:test';
import { createPasswordResetService } from './password-reset';

test('recovery reset delegates token, email and password to atomic persistence', async () => {
  let received: unknown[] | undefined;
  const service = createPasswordResetService({
    resetPasswordWithRecovery: async (...args) => {
      received = args;
      return {
        password: {
          passwordHash: 'argon2id-hash',
          argon2MemoryKib: 65536,
          argon2TimeCost: 3,
          argon2Parallelism: 1,
        },
        revokedSessionCount: 1,
      };
    },
  } as never);

  await service.reset('opaque-token', 'user@example.com', 'new-password');
  assert.deepEqual(received, ['opaque-token', 'user@example.com', 'new-password']);
});

test('recovery reset propagates invalid recovery credentials', async () => {
  const service = createPasswordResetService({
    resetPasswordWithRecovery: async () => {
      throw Object.assign(new Error('Recovery credential invalid'), {
        code: 'RECOVERY_CREDENTIAL_INVALID',
      });
    },
  } as never);

  await assert.rejects(
    () => service.reset('bad-token', 'user@example.com', 'new-password'),
    /Recovery credential invalid/,
  );
});
