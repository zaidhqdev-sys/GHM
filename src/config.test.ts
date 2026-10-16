import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const loadConfig = (overrides: Record<string, string | undefined>) => {
  const env = { ...process.env, ...overrides };
  env.DATABASE_SSL = overrides.DATABASE_SSL ?? '';
  return spawnSync(
    process.execPath,
    ['-e', "const { config } = require('./dist/config.js'); console.log(JSON.stringify(config));"],
    { cwd: process.cwd(), env, encoding: 'utf8' },
  );
};

const baseEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://example.invalid/ghm',
  INVITE_CODE: 'test-invite-code',
  CORS_ORIGINS: 'http://localhost:3000',
};

test('production configuration fails closed when database TLS is not enabled', () => {
  const result = loadConfig({ ...baseEnv, NODE_ENV: 'production' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /DATABASE_SSL must be true in production/);
});

test('production configuration accepts explicitly enabled database TLS', () => {
  const result = loadConfig({ ...baseEnv, NODE_ENV: 'production', DATABASE_SSL: 'true' });
  assert.equal(result.status, 0, result.stderr);
  const loaded = JSON.parse(result.stdout.trim());
  assert.equal(loaded.isProduction, true);
  assert.equal(loaded.databaseSsl, true);
});

test('non-production configuration preserves explicit database TLS setting', () => {
  const result = loadConfig({ ...baseEnv, NODE_ENV: 'test', DATABASE_SSL: 'false' });
  assert.equal(result.status, 0, result.stderr);
  const loaded = JSON.parse(result.stdout.trim());
  assert.equal(loaded.isProduction, false);
  assert.equal(loaded.databaseSsl, false);
});

test('legacy TRUST_PROXY=true is normalized to one trusted proxy hop, not boolean trust', () => {
  const result = loadConfig({ ...baseEnv, TRUST_PROXY: 'true' });
  assert.equal(result.status, 0, result.stderr);
  const loaded = JSON.parse(result.stdout.trim());
  assert.equal(loaded.trustProxy, 1);
});

test('TRUST_PROXY accepts an explicit bounded hop count and disables trust at zero', () => {
  const one = loadConfig({ ...baseEnv, TRUST_PROXY: '2' });
  assert.equal(one.status, 0, one.stderr);
  assert.equal(JSON.parse(one.stdout.trim()).trustProxy, 2);

  const zero = loadConfig({ ...baseEnv, TRUST_PROXY: '0' });
  assert.equal(zero.status, 0, zero.stderr);
  assert.equal(JSON.parse(zero.stdout.trim()).trustProxy, false);
});

test('TRUST_PROXY rejects invalid values and excessive hop counts', () => {
  for (const value of ['yes', '-1', '1.5', '6']) {
    const result = loadConfig({ ...baseEnv, TRUST_PROXY: value });
    assert.notEqual(result.status, 0, `expected TRUST_PROXY=${value} to fail`);
    assert.match(result.stderr + result.stdout, /TRUST_PROXY/);
  }
});
