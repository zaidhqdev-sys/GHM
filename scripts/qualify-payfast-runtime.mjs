import { spawnSync } from 'node:child_process';

const forbidden = ['live', 'production'].includes((process.env.PAYFAST_ENVIRONMENT ?? 'sandbox').trim().toLowerCase())
  || process.env.NODE_ENV === 'production'
  || Boolean(process.env.PAYFAST_LIVE_MERCHANT_ID)
  || process.env.GHM_PAYFAST_ALLOW_LIVE === 'true';

if (forbidden) {
  console.error(JSON.stringify({
    status: 'BLOCKED',
    reason: 'PayFast qualification is sandbox-only; live/production configuration is forbidden.',
  }, null, 2));
  process.exit(2);
}

const env = { ...process.env };
env.NODE_ENV = 'test';
env.PAYFAST_ENVIRONMENT = 'sandbox';
delete env.PAYFAST_LIVE_MERCHANT_ID;
delete env.GHM_PAYFAST_ALLOW_LIVE;

const testFiles = [
  'dist/resources/commercial/payfast.test.js',
  'dist/resources/commercial/payfast-http.test.js',
  'dist/http/payfast-http-router.test.js',
  'dist/config.test.js',
];

const result = spawnSync(process.execPath, [
  '--require', './scripts/test-env.cjs',
  '--test', ...testFiles,
], { env, encoding: 'utf8', stdio: 'inherit' });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(JSON.stringify({
  status: 'QUALIFIED_LOCAL_SANDBOX_BOUNDARY',
  providerNetworkCalls: 'stubbed in unit tests; no real PayFast endpoint is called by this script',
  productionDatabase: 'not accessed',
  liveCredentials: 'not read or required',
  testFiles,
}, null, 2));
