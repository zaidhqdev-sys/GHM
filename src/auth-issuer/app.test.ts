import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthIssuerApp } from './app';
import type { GhmAuthService } from '../auth/ghm-auth-service';
import type { AuthPersistence } from '../auth/foundation/persistence';
import type { PasswordResetService } from '../auth/password-reset';

const authService: GhmAuthService = {
  register: async () => ({
    accessToken: 'access',
    refreshToken: 'refresh',
    tokenType: 'Bearer',
    expiresIn: 900,
    sessionId: 1,
    accountId: 2,
  }),
  login: async () => ({
    accessToken: 'access',
    refreshToken: 'refresh',
    tokenType: 'Bearer',
    expiresIn: 900,
    sessionId: 1,
    accountId: 2,
  }),
  refresh: async () => ({
    accessToken: 'access',
    refreshToken: 'refresh',
    tokenType: 'Bearer',
    expiresIn: 900,
    sessionId: 1,
    accountId: 2,
  }),
  logout: async () => undefined,
};

const persistence = {} as AuthPersistence;
const passwordResetService: PasswordResetService = { reset: async () => undefined };

test('auth issuer exposes health and the existing native auth route contract', async () => {
  const app = createAuthIssuerApp({ authService, authPersistence: persistence, passwordResetService });
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.com', password: 'password' }),
    });
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), {
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenType: 'Bearer',
      expiresIn: 900,
      sessionId: 1,
      accountId: 2,
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('auth issuer preserves unavailable optional recovery routes by default', async () => {
  const app = createAuthIssuerApp({ authService, authPersistence: persistence, passwordResetService });
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/password-recovery/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.com' }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'service_unavailable' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});


test('auth issuer allows only exact HTTPS or localhost CORS origins', () => {
  const previous = process.env.GHM_AUTH_ISSUER_CORS_ORIGINS;
  try {
    process.env.GHM_AUTH_ISSUER_CORS_ORIGINS = 'https://connect.example, http://localhost:3000, https://connect.example';
    assert.doesNotThrow(() => createAuthIssuerApp({ authService, authPersistence: persistence, passwordResetService }));

    for (const invalid of ['*', 'null', 'http://untrusted.example', 'https://connect.example/path', 'https://user:pass@connect.example']) {
      process.env.GHM_AUTH_ISSUER_CORS_ORIGINS = invalid;
      assert.throws(
        () => createAuthIssuerApp({ authService, authPersistence: persistence, passwordResetService }),
        /must contain exact HTTPS origins/,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.GHM_AUTH_ISSUER_CORS_ORIGINS;
    else process.env.GHM_AUTH_ISSUER_CORS_ORIGINS = previous;
  }
});


test('auth issuer requires explicit production proxy trust and rejects ambiguous hop counts', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousHops = process.env.GHM_AUTH_ISSUER_TRUST_PROXY_HOPS;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.GHM_AUTH_ISSUER_TRUST_PROXY_HOPS;
    assert.throws(
      () => createAuthIssuerApp({ authService, authPersistence: persistence, passwordResetService }),
      /must be explicitly set in production/,
    );

    for (const invalid of ['true', '-1', '1.5', '01', '11']) {
      process.env.GHM_AUTH_ISSUER_TRUST_PROXY_HOPS = invalid;
      assert.throws(
        () => createAuthIssuerApp({ authService, authPersistence: persistence, passwordResetService }),
        /must be an integer from 0 to 10/,
      );
    }

    process.env.GHM_AUTH_ISSUER_TRUST_PROXY_HOPS = '0';
    assert.equal(
      createAuthIssuerApp({ authService, authPersistence: persistence, passwordResetService }).get('trust proxy'),
      0,
    );
    process.env.GHM_AUTH_ISSUER_TRUST_PROXY_HOPS = '2';
    assert.equal(
      createAuthIssuerApp({ authService, authPersistence: persistence, passwordResetService }).get('trust proxy'),
      2,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousHops === undefined) delete process.env.GHM_AUTH_ISSUER_TRUST_PROXY_HOPS;
    else process.env.GHM_AUTH_ISSUER_TRUST_PROXY_HOPS = previousHops;
  }
});
