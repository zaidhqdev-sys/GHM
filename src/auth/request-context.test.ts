import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { Request } from 'express';
import { config } from '../config';
import { authenticateRequest } from './request-context';

const requestWithAuthorization = (authorization?: string): Request =>
  ({
    header: (name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
  }) as Request;

test('authentication rejects a missing bearer token', () => {
  assert.throws(
    () => authenticateRequest(requestWithAuthorization()),
    /Authentication required/,
  );
});

test('authentication rejects an invalid token', () => {
  assert.throws(
    () => authenticateRequest(requestWithAuthorization('Bearer not-a-jwt')),
  );
});

test('authentication rejects a token with an invalid role', () => {
  const token = jwt.sign({ userId: 7, role: 'root' }, config.jwtSecret, { expiresIn: '5m' });
  assert.throws(
    () => authenticateRequest(requestWithAuthorization(`Bearer ${token}`)),
    /Invalid authentication token/,
  );
});

test('authentication rejects a token with an invalid user id', () => {
  const token = jwt.sign({ userId: 0, role: 'customer' }, config.jwtSecret, { expiresIn: '5m' });
  assert.throws(
    () => authenticateRequest(requestWithAuthorization(`Bearer ${token}`)),
    /Invalid authentication token/,
  );
});

test('authentication returns the verified immutable context', () => {
  const token = jwt.sign({ userId: 7, role: 'customer' }, config.jwtSecret, { expiresIn: '5m' });
  const context = authenticateRequest(requestWithAuthorization(`Bearer ${token}`));

  assert.deepEqual(context, { userId: 7, role: 'customer' });
  assert.equal(Object.isFrozen(context), true);
});
