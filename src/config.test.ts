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

test('partial storage provider configuration fails closed', () => {
  const result = loadConfig({ ...baseEnv, STORAGE_PROVIDER: 's3' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Missing required storage environment variable: STORAGE_REGION/);
});

test('partial storage TTL configuration fails closed', () => {
  const result = loadConfig({ ...baseEnv, STORAGE_DOWNLOAD_GRANT_MAX_TTL_SECONDS: '120' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Missing required storage environment variable: STORAGE_REGION/);
});
