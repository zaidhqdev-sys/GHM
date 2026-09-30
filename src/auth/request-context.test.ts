import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-qualification';
process.env.DATABASE_URL = 'postgres://qualification:test@localhost:5432/ghm';
process.env.INVITE_CODE = 'test-invite-code';
process.env.CORS_ORIGINS = 'http://localhost:3000';

const requestWithAuthorization = (authorization?: string): Request =>
  ({
    header: (name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
  }) as Request;

const loadAuthentication = async () => {
  const [{ authenticateRequest }, { config }] = await Promise.all([
    import('./request-context'),
    import('../config'),
  ]);
  return { authenticateRequest, config };
};

test('authentication rejects a missing bearer token', async () => {
  const { authenticateRequest } = await loadAuthentication();
  assert.throws(
    () => authenticateRequest(requestWithAuthorization()),
    /Authentication required/,
  );
});

test('authentication rejects an invalid token', async () => {
  const { authenticateRequest } = await loadAuthentication();
  assert.throws(
    () => authenticateRequest(requestWithAuthorization('Bearer not-a-jwt')),
  );
});

test('authentication rejects a token with an invalid role', async () => {
  const { authenticateRequest, config } = await loadAuthentication();
  const token = jwt.sign({ userId: 7, role: 'root' }, config.jwtSecret, { expiresIn: '5m' });
  assert.throws(
    () => authenticateRequest(requestWithAuthorization(`Bearer ${token}`)),
    /Invalid authentication token/,
  );
});

test('authentication rejects a token with an invalid user id', async () => {
  const { authenticateRequest, config } = await loadAuthentication();
  const token = jwt.sign({ userId: 0, role: 'customer' }, config.jwtSecret, { expiresIn: '5m' });
  assert.throws(
    () => authenticateRequest(requestWithAuthorization(`Bearer ${token}`)),
    /Invalid authentication token/,
  );
});

test('authentication returns the verified immutable context', async () => {
  const { authenticateRequest, config } = await loadAuthentication();
  const token = jwt.sign({ userId: 7, role: 'customer' }, config.jwtSecret, { expiresIn: '5m' });
  const context = authenticateRequest(requestWithAuthorization(`Bearer ${token}`));

  assert.deepEqual(context, { userId: 7, role: 'customer' });
  assert.equal(Object.isFrozen(context), true);
});
