import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import express from 'express';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-qualification';
process.env.DATABASE_URL = 'postgres://qualification:test@localhost:5432/ghm';
process.env.INVITE_CODE = 'test-invite-code';
process.env.CORS_ORIGINS = 'http://localhost:3000';

type AuthTokenResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  sessionId: number;
  accountId: number;
};

type GhmAuthService = {
  login(email: string, password: string): Promise<AuthTokenResponse>;
  refresh(refreshToken: string): Promise<AuthTokenResponse>;
  logout(refreshToken: string): Promise<void>;
};

const sampleTokens = (overrides: Partial<AuthTokenResponse> = {}): AuthTokenResponse => ({
  accessToken: 'access.jwt',
  refreshToken: 'refresh-wire',
  tokenType: 'Bearer',
  expiresIn: 900,
  sessionId: 11,
  accountId: 42,
  ...overrides,
});

const loadApp = async () => {
  const { createApp } = await import('./app');
  const { GhmAuthServiceError, createGhmAuthService } = await import('../auth/ghm-auth-service');
  return { createApp, GhmAuthServiceError, createGhmAuthService };
};

const startApp = async (authService: GhmAuthService) => {
  const { createApp } = await loadApp();
  const server = http.createServer(createApp({
    businessIdentityService: {} as never,
    projectService: {} as never,
    publicProjectService: {} as never,
    enquiryService: {} as never,
    campaignService: {} as never,
    authService,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const makeKeys = async () => {
  const { loadEs256Keys } = await import('../auth/foundation/es256-keys');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return loadEs256Keys({
    GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    GHM_JWT_ES256_KID: 'ghm-es256-20260921-1',
  });
};

test('POST /api/v1/auth/login returns tokens for valid credentials', async () => {
  const authService: GhmAuthService = {
    login: async (email, password) => {
      assert.equal(email, 'User@Example.com');
      assert.equal(password, 'CorrectHorseBattery1');
      return sampleTokens();
    },
    refresh: async () => sampleTokens(),
    logout: async () => undefined,
  };
  const { server, baseUrl } = await startApp(authService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'User@Example.com', password: 'CorrectHorseBattery1' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), sampleTokens());
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/v1/auth/login maps credential failures to unauthorized without enumeration', async () => {
  const { GhmAuthServiceError } = await loadApp();
  const authService: GhmAuthService = {
    login: async () => {
      throw new GhmAuthServiceError('Authentication required', 'INVALID_CREDENTIALS', 401);
    },
    refresh: async () => sampleTokens(),
    logout: async () => undefined,
  };
  const { server, baseUrl } = await startApp(authService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong' }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized', code: 'INVALID_CREDENTIALS' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/v1/auth/login rejects invalid body', async () => {
  const { server, baseUrl } = await startApp({
    login: async () => sampleTokens(),
    refresh: async () => sampleTokens(),
    logout: async () => undefined,
  });
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 1 }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/v1/auth/refresh rotates and returns new tokens', async () => {
  const authService: GhmAuthService = {
    login: async () => sampleTokens(),
    refresh: async (token) => {
      assert.equal(token, 'old-refresh');
      return sampleTokens({ refreshToken: 'new-refresh', accessToken: 'new-access' });
    },
    logout: async () => undefined,
  };
  const { server, baseUrl } = await startApp(authService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'old-refresh' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as AuthTokenResponse;
    assert.equal(body.refreshToken, 'new-refresh');
    assert.equal(body.accessToken, 'new-access');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/v1/auth/refresh maps replay to unauthorized', async () => {
  const { GhmAuthServiceError } = await loadApp();
  const authService: GhmAuthService = {
    login: async () => sampleTokens(),
    refresh: async () => {
      throw new GhmAuthServiceError('Authentication required', 'REFRESH_CREDENTIAL_REUSED', 401);
    },
    logout: async () => undefined,
  };
  const { server, baseUrl } = await startApp(authService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'used' }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized', code: 'REFRESH_CREDENTIAL_REUSED' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/v1/auth/logout revokes and returns ok', async () => {
  let saw: string | null = null;
  const authService: GhmAuthService = {
    login: async () => sampleTokens(),
    refresh: async () => sampleTokens(),
    logout: async (token) => {
      saw = token;
    },
  };
  const { server, baseUrl } = await startApp(authService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'live-refresh' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(saw, 'live-refresh');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('requireGhmAuth missing/malformed → 401; valid → context; disabled → 401; authz remains 403', async () => {
  const keys = await makeKeys();
  const { createAccessJwtService } = await import('../auth/foundation/access-jwt');
  const { createRequireGhmAuth } = await import('../auth/ghm-http');
  const { createGhmBearerAuthenticatorWithKeys } = await import('../auth/ghm-bearer');
  const { toLegacyAuthContext } = await import('../auth/ghm-auth-context');
  const { canAccessResource } = await import('../auth/authorization');

  const jwtService = createAccessJwtService(keys);
  const store: import('../auth/ghm-bearer').AccountAuthStateStore = {
    async getAccountAuthState(accountId) {
      if (accountId === 5) return { accountId: 5, accountStatus: 'active', role: 'customer', isSystemAdmin: false };
      if (accountId === 6) return { accountId: 6, accountStatus: 'disabled', role: 'customer', isSystemAdmin: false };
      return null;
    },
  };
  const requireGhmAuth = createRequireGhmAuth(createGhmBearerAuthenticatorWithKeys(keys, store));
  const app = express();
  app.get('/probe', requireGhmAuth, (req, res) => {
    res.status(200).json({ accountId: req.ghmAuthContext?.accountId });
  });
  app.get('/forbid', requireGhmAuth, (req, res) => {
    const legacy = toLegacyAuthContext(req.ghmAuthContext!, 'customer');
    assert.equal(canAccessResource(legacy, 'profile'), true);
    res.status(403).json({ error: 'forbidden' });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const missing = await fetch(`${baseUrl}/probe`);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: 'unauthorized' });

    const malformed = await fetch(`${baseUrl}/probe`, {
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    assert.equal(malformed.status, 401);

    const valid = await fetch(`${baseUrl}/probe`, {
      headers: { authorization: `Bearer ${jwtService.sign(5)}` },
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { accountId: 5 });

    const disabled = await fetch(`${baseUrl}/probe`, {
      headers: { authorization: `Bearer ${jwtService.sign(6)}` },
    });
    assert.equal(disabled.status, 401);

    const forbidden = await fetch(`${baseUrl}/forbid`, {
      headers: { authorization: `Bearer ${jwtService.sign(5)}` },
    });
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('login issues ES256 access JWT with decimal sub and no role claim', async () => {
  const keys = await makeKeys();
  const { createAccessJwtService, ACCESS_JWT_ISS, ACCESS_JWT_AUD } = await import('../auth/foundation/access-jwt');
  const { defaultPasswordHasher } = await import('../auth/foundation/password');
  const { createGhmAuthService, GhmAuthServiceError } = await import('../auth/ghm-auth-service');
  type AuthPersistence = import('../auth/foundation/persistence').AuthPersistence;

  const jwtService = createAccessJwtService(keys);
  const passwordHash = (await defaultPasswordHasher.hash('CorrectHorseBattery1')).passwordHash;

  const persistence: AuthPersistence = {
    setPassword: async () => ({ passwordHash, argon2MemoryKib: 65536, argon2TimeCost: 3, argon2Parallelism: 1 }),
    lookupPasswordByEmail: async () => ({
      accountId: 42,
      loginEmail: 'user@example.com',
      loginEmailNormalized: 'user@example.com',
      passwordHash,
      credentialStatus: 'active',
      argon2MemoryKib: 65536,
      argon2TimeCost: 3,
      argon2Parallelism: 1,
      accountStatus: 'active',
    }),
    createSessionWithRefresh: async () => ({
      session: {
        id: 9,
        accountId: 42,
        sessionStatus: 'active',
        createdAt: new Date(),
        lastSeenAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
        revokeReason: null,
      },
      refreshCredentialId: 1,
      refreshTokenWire: 'refresh-wire-token',
    }),
    validateSession: async () => ({
      sessionId: 9,
      accountId: 42,
      sessionStatus: 'active',
      accountStatus: 'active',
      createdAt: new Date(),
      lastSeenAt: new Date(),
      absoluteExpiresAt: new Date(),
      isUsable: true,
      rejectReason: null,
    }),
    rotateRefresh: async () => {
      throw new Error('unused');
    },
    revokeSession: async () => true,
    revokeAllSessionsForAccount: async () => 0,
    changePassword: async () => ({
      password: { passwordHash, argon2MemoryKib: 65536, argon2TimeCost: 3, argon2Parallelism: 1 },
      revokedSessionCount: 0,
    }),
    disableAccount: async () => undefined,
    issueRecovery: async () => ({ recoveryTokenWire: 'x', credentialId: 1, expiresAt: new Date() }),
    redeemRecovery: async () => 1,
    lookupExternalIdentity: async () => null,
    bootstrapExternalIdentity: async () => ({
      id: 1,
      provider: 'p',
      subject: 's',
      accountId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      created: true,
    }),
    linkExternalIdentity: async () => ({
      outcome: 'created' as const,
      mapping: {
        id: 1,
        provider: 'supabase',
        subject: 's',
        accountId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }),
    linkBusinessExternalMapping: async () => ({
      outcome: 'created' as const,
      mapping: {
        id: 1,
        provider: 'supabase',
        externalBusinessId: 'ext',
        businessId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }),
    revokeSessionByRefreshToken: async () => ({ found: true, sessionId: 9, accountId: 42 }),
  };

  const service = createGhmAuthService(persistence, jwtService);
  const tokens = await service.login('user@example.com', 'CorrectHorseBattery1');
  const decoded = jwt.decode(tokens.accessToken, { complete: true });
  assert.ok(decoded && typeof decoded !== 'string');
  const payload = decoded.payload;
  assert.ok(typeof payload !== 'string');
  assert.equal(payload.sub, '42');
  assert.equal(payload.iss, ACCESS_JWT_ISS);
  assert.equal(payload.aud, ACCESS_JWT_AUD);
  assert.equal(Object.hasOwn(payload, 'role'), false);
  assert.equal(tokens.sessionId, 9);
  assert.equal(tokens.refreshToken, 'refresh-wire-token');

  await assert.rejects(
    () => service.login('user@example.com', 'wrong-password'),
    (error: unknown) => error instanceof GhmAuthServiceError && error.code === 'INVALID_CREDENTIALS',
  );

  const unknownService = createGhmAuthService({ ...persistence, lookupPasswordByEmail: async () => null }, jwtService);
  await assert.rejects(
    () => unknownService.login('missing@example.com', 'CorrectHorseBattery1'),
    (error: unknown) => error instanceof GhmAuthServiceError && error.code === 'INVALID_CREDENTIALS',
  );

  const disabledService = createGhmAuthService({
    ...persistence,
    lookupPasswordByEmail: async () => ({
      accountId: 42,
      loginEmail: 'user@example.com',
      loginEmailNormalized: 'user@example.com',
      passwordHash,
      credentialStatus: 'active',
      argon2MemoryKib: 65536,
      argon2TimeCost: 3,
      argon2Parallelism: 1,
      accountStatus: 'disabled',
    }),
  }, jwtService);
  await assert.rejects(
    () => disabledService.login('user@example.com', 'CorrectHorseBattery1'),
    (error: unknown) => error instanceof GhmAuthServiceError && error.code === 'INVALID_CREDENTIALS',
  );
});
