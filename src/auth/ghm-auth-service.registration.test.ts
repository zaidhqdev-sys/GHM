import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';

test('GHM registration creates a canonical account and immediately issues a GHM session', async () => {
  const { loadEs256Keys } = await import('./foundation/es256-keys');
  const { createAccessJwtService } = await import('./foundation/access-jwt');
  const { createGhmAuthService } = await import('./ghm-auth-service');
  const { defaultPasswordHasher } = await import('./foundation/password');

  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const keys = loadEs256Keys({
    GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    GHM_JWT_ES256_KID: 'test-registration',
  });
  const passwordHash = (await defaultPasswordHasher.hash('CorrectHorse1')).passwordHash;
  let createdInput: unknown = null;

  const persistence = {
    createAccount: async (fullName: string | null, role: 'customer' | 'business', email: string, password: string) => {
      createdInput = { fullName, role, email, password };
      return { accountId: 73, loginEmail: email };
    },
    createSessionWithRefresh: async () => ({
      session: {
        id: 81,
        accountId: 73,
        sessionStatus: 'active' as const,
        createdAt: new Date(),
        lastSeenAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        revokeReason: null,
      },
      refreshCredentialId: 91,
      refreshTokenWire: 'refresh-registration',
    }),
  } as any;

  const service = createGhmAuthService(persistence, createAccessJwtService(keys));
  const tokens = await service.register!({
    fullName: 'QuoteFlow User',
    role: 'business',
    email: 'User@Example.com',
    password: 'CorrectHorse1',
  });

  assert.deepEqual(createdInput, {
    fullName: 'QuoteFlow User',
    role: 'business',
    email: 'User@example.com',
    password: 'CorrectHorse1',
  });
  assert.equal(tokens.accountId, 73);
  assert.equal(tokens.sessionId, 81);
  assert.equal(tokens.refreshToken, 'refresh-registration');
});

test('GHM registration rejects password policy violations before persistence', async () => {
  const { createGhmAuthService } = await import('./ghm-auth-service');
  let called = false;
  const service = createGhmAuthService({
    createAccount: async () => {
      called = true;
      return { accountId: 1, loginEmail: 'x@example.com' };
    },
  } as any);

  await assert.rejects(
    () => service.register!({ email: 'x@example.com', password: 'weak' }),
    (error: any) => error.code === 'PASSWORD_POLICY_VIOLATION' && error.httpStatus === 400,
  );
  assert.equal(called, false);
});
