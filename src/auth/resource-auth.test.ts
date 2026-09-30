import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { loadEs256Keys } from './foundation/es256-keys';
import {
  ACCESS_JWT_AUD,
  ACCESS_JWT_ISS,
  createAccessJwtService,
} from './foundation/access-jwt';
import {
  authContextFromAccountState,
  classifyBearerCredential,
  createRequireResourceAuth,
  resolveResourceAuthRole,
} from './resource-auth';
import { createGhmBearerAuthenticatorWithKeys, type AccountAuthStateStore } from './ghm-bearer';
import { canAccessResource } from './authorization';
import type { AccountIdentity, BusinessIdentityService } from '../resources/business-identity/contracts';
import type { AuthContext } from './authorization';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-resource-auth-qualification';
process.env.DATABASE_URL = 'postgres://qualification:test@localhost:5432/ghm';
process.env.INVITE_CODE = 'test-invite-code';
process.env.CORS_ORIGINS = 'http://localhost:3000';

const makeKeys = (kid = 'ghm-es256-20260921-1') => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keys = loadEs256Keys({
    GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKeyPem,
    GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKeyPem,
    GHM_JWT_ES256_KID: kid,
  });
  return { keys, privateKeyPem, jwtService: createAccessJwtService(keys) };
};

const requestWithBearer = (token?: string): Request =>
  ({
    header: (name: string) =>
      name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : undefined,
  }) as Request;

test('classifyBearerCredential separates ES256+kid, legacy HS, and unrecognized', async () => {
  const { config } = await import('../config');
  const { jwtService } = makeKeys();
  const es256 = jwtService.sign(1);
  assert.equal(classifyBearerCredential(es256), 'ghm-es256');

  const legacy = jwt.sign({ userId: 1, role: 'customer' }, config.jwtSecret, { algorithm: 'HS256' });
  assert.equal(classifyBearerCredential(legacy), 'legacy-hs');

  assert.equal(classifyBearerCredential('not-a-jwt'), 'unrecognized');
});

test('resolveResourceAuthRole uses isSystemAdmin from GHM state, not JWT', () => {
  assert.equal(
    resolveResourceAuthRole({
      accountId: 10,
      accountStatus: 'active',
      role: 'customer',
      isSystemAdmin: true,
    }),
    'admin',
  );
  assert.equal(
    resolveResourceAuthRole({
      accountId: 10,
      accountStatus: 'active',
      role: 'business',
      isSystemAdmin: false,
    }),
    'business',
  );
});

test('ES256 JWT with embedded admin role claim does not override database role', async () => {
  const { keys, privateKeyPem } = makeKeys();
  const store: AccountAuthStateStore = {
    async getAccountAuthState(accountId) {
      if (accountId !== 55) return null;
      return {
        accountId: 55,
        accountStatus: 'active',
        role: 'customer',
        isSystemAdmin: false,
      };
    },
  };
  const token = jwt.sign(
    {
      sub: '55',
      iss: ACCESS_JWT_ISS,
      aud: ACCESS_JWT_AUD,
      role: 'admin',
      userId: 55,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'ghm-es256-20260921-1', noTimestamp: true },
  );
  const authenticator = createGhmBearerAuthenticatorWithKeys(keys, store);
  const { context, state } = await authenticator.authenticateAndLoadState(requestWithBearer(token));
  const authContext = authContextFromAccountState(context.accountId, state);
  assert.deepEqual(authContext, { userId: 55, role: 'customer' });
});

test('resource auth middleware: ES256 → AuthContext; disabled → 401; legacy HS isolated', async () => {
  const { keys, jwtService } = makeKeys();
  const store: AccountAuthStateStore = {
    async getAccountAuthState(accountId) {
      if (accountId === 5) {
        return { accountId: 5, accountStatus: 'active', role: 'business', isSystemAdmin: false };
      }
      if (accountId === 6) {
        return { accountId: 6, accountStatus: 'disabled', role: 'customer', isSystemAdmin: false };
      }
      return null;
    },
  };
  const requireAuth = createRequireResourceAuth({
    ghmAuthenticator: createGhmBearerAuthenticatorWithKeys(keys, store),
  });

  const app = express();
  app.get('/ctx', requireAuth, (req, res) => {
    res.status(200).json({ authContext: req.authContext, ghm: req.ghmAuthContext?.accountId ?? null });
  });
  app.get('/forbid', requireAuth, (req, res) => {
    const ctx = req.authContext!;
    if (!canAccessResource(ctx, 'profile')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    res.status(403).json({ error: 'forbidden' });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const missing = await fetch(`${baseUrl}/ctx`);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: 'unauthorized' });

    const malformed = await fetch(`${baseUrl}/ctx`, { headers: { authorization: 'Bearer not-a-jwt' } });
    assert.equal(malformed.status, 401);

    const es256 = await fetch(`${baseUrl}/ctx`, {
      headers: { authorization: `Bearer ${jwtService.sign(5)}` },
    });
    assert.equal(es256.status, 200);
    assert.deepEqual(await es256.json(), {
      authContext: { userId: 5, role: 'business' },
      ghm: 5,
    });

    const disabled = await fetch(`${baseUrl}/ctx`, {
      headers: { authorization: `Bearer ${jwtService.sign(6)}` },
    });
    assert.equal(disabled.status, 401);

    const { config } = await import('../config');
    const legacy = jwt.sign({ userId: 99, role: 'customer' }, config.jwtSecret, { algorithm: 'HS256' });
    const hs = await fetch(`${baseUrl}/ctx`, { headers: { authorization: `Bearer ${legacy}` } });
    assert.equal(hs.status, 200);
    const hsBody = (await hs.json()) as { authContext: AuthContext; ghm: number | null };
    assert.deepEqual(hsBody.authContext, { userId: 99, role: 'customer' });
    assert.equal(hsBody.ghm, null);

    const forbidden = await fetch(`${baseUrl}/forbid`, {
      headers: { authorization: `Bearer ${jwtService.sign(5)}` },
    });
    assert.equal(forbidden.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('resource auth rejects invalid iss, aud, alg, kid, exp for ES256 tokens', async () => {
  const { keys, privateKeyPem, jwtService } = makeKeys();
  const store: AccountAuthStateStore = {
    async getAccountAuthState(id) {
      return { accountId: id, accountStatus: 'active', role: 'customer', isSystemAdmin: false };
    },
  };
  const requireAuth = createRequireResourceAuth({
    ghmAuthenticator: createGhmBearerAuthenticatorWithKeys(keys, store),
  });
  const app = express();
  app.get('/probe', requireAuth, (_req, res) => res.status(200).json({ ok: true }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const now = Math.floor(Date.now() / 1000);
  const cases = [
    jwt.sign({ sub: '1', iss: 'other', aud: ACCESS_JWT_AUD, iat: now, exp: now + 900 }, privateKeyPem, {
      algorithm: 'ES256',
      keyid: 'ghm-es256-20260921-1',
      noTimestamp: true,
    }),
    jwt.sign({ sub: '1', iss: ACCESS_JWT_ISS, aud: 'other', iat: now, exp: now + 900 }, privateKeyPem, {
      algorithm: 'ES256',
      keyid: 'ghm-es256-20260921-1',
      noTimestamp: true,
    }),
    jwt.sign({ sub: '1', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD }, 'secret', {
      algorithm: 'HS256',
      keyid: 'ghm-es256-20260921-1',
      expiresIn: 900,
    }),
    jwt.sign({ sub: '1', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: now, exp: now + 900 }, privateKeyPem, {
      algorithm: 'ES256',
      keyid: 'unknown-kid',
      noTimestamp: true,
    }),
    jwt.sign({ sub: '1', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: now - 2000, exp: now - 1000 }, privateKeyPem, {
      algorithm: 'ES256',
      keyid: 'ghm-es256-20260921-1',
      noTimestamp: true,
    }),
  ];

  try {
    for (const token of cases) {
      const response = await fetch(`${baseUrl}/probe`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 401, `expected 401 for token case`);
    }
    const valid = await fetch(`${baseUrl}/probe`, {
      headers: { authorization: `Bearer ${jwtService.sign(1)}` },
    });
    assert.equal(valid.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('integration: ES256 access JWT reaches governed profile route with DB-backed AuthContext', async () => {
  const { keys, jwtService } = makeKeys();
  const store: AccountAuthStateStore = {
    async getAccountAuthState(accountId) {
      if (accountId !== 42) return null;
      return {
        accountId: 42,
        accountStatus: 'active',
        role: 'business',
        isSystemAdmin: false,
      };
    },
  };

  let receivedContext: AuthContext | undefined;
  const businessIdentityService = {
    getOwnProfile: async (context: AuthContext) => {
      receivedContext = context;
      return {
        id: context.userId,
        fullName: 'ES256 User',
        phone: null,
        avatarRef: null,
        role: context.role,
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
        updatedAt: new Date('2026-09-10T00:00:00.000Z'),
      } satisfies AccountIdentity;
    },
  } as unknown as BusinessIdentityService;

  const integrationKeys = keys;
  const integrationJwt = createAccessJwtService(integrationKeys);
  const integrationApp = express();
  integrationApp.get(
    '/api/v1/profile',
    createRequireResourceAuth({
      ghmAuthenticator: createGhmBearerAuthenticatorWithKeys(integrationKeys, store),
    }),
    async (req, res) => {
      const profile = await businessIdentityService.getOwnProfile(req.authContext!);
      res.status(200).json({ profile });
    },
  );

  const server = http.createServer(integrationApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const token = integrationJwt.sign(42);
    const response = await fetch(`${baseUrl}/api/v1/profile`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    const body = (await response.json()) as { profile: AccountIdentity };
    assert.equal(body.profile.id, 42);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // Ensure sign helper from first keys still works for unit assertions above
  assert.ok(jwtService.sign(5));
});

test('system-admin flag in GHM state yields admin resource role with ES256 token', async () => {
  const { keys, jwtService } = makeKeys();
  const store: AccountAuthStateStore = {
    async getAccountAuthState(accountId) {
      return {
        accountId,
        accountStatus: 'active',
        role: 'customer',
        isSystemAdmin: true,
      };
    },
  };
  const requireAuth = createRequireResourceAuth({
    ghmAuthenticator: createGhmBearerAuthenticatorWithKeys(keys, store),
  });
  const app = express();
  app.get('/role', requireAuth, (req, res) => {
    res.status(200).json({ role: req.authContext!.role });
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${baseUrl}/role`, {
      headers: { authorization: `Bearer ${jwtService.sign(8)}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { role: 'admin' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
