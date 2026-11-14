import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const worker = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const wrangler = JSON.parse(
  fs.readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, ''),
);

test('Worker uses the Cloudflare Node HTTP request adapter', () => {
  assert.match(worker, /handleAsNodeRequest\(INTERNAL_HTTP_PORT, request\)/);
  assert.match(worker, /createServer\(app\)/);
});

test('Worker requires a Hyperdrive binding and isolated gateway capability secret', () => {
  assert.match(worker, /workerEnv\.HYPERDRIVE\?\.connectionString/);
  assert.match(worker, /GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET/);
  assert.equal(wrangler.hyperdrive[0].binding, 'HYPERDRIVE');
  assert.equal(wrangler.ratelimits[0].name, 'ACTOR_GATEWAY_RATE_LIMITER');
  assert.equal(wrangler.ratelimits[0].simple.limit, 120);
  assert.equal(wrangler.ratelimits[0].simple.period, 60);
  assert.equal(wrangler.alias['body-parser'], 'ghm-worker-body-parser-stub');
  assert.match(worker, /jsonBodyParser: workerJsonBodyParser/);
  assert.match(worker, /MAX_JSON_BODY_BYTES = 16 \* 1024/);
  assert.match(worker, /edgeRateLimiter\.limit\(\{ key: `actor:\$\{accountId\}` \}\)/);
});

test('Worker only loads public ES256 verification material', () => {
  assert.match(worker, /GHM_JWT_ES256_PUBLIC_KEY_PEM/);
  assert.doesNotMatch(worker, /GHM_JWT_ES256_PRIVATE_KEY_PEM/);
  assert.doesNotMatch(worker, /GHM_AUTH_TOKEN_PEPPER/);
  assert.doesNotMatch(worker, /GHM_AUTH_ISSUER_DATABASE_URL/);
});

test('Worker verifies database identity and ACL before opening HTTP listener', () => {
  const identity = worker.indexOf('assertActorGatewayDatabaseIdentity(identity.rows[0])');
  const privileges = worker.indexOf('assertActorGatewayDatabasePrivileges(privileges)');
  const listen = worker.indexOf('actorGatewayServer.listen(INTERNAL_HTTP_PORT)');
  assert.ok(identity >= 0);
  assert.ok(privileges > identity);
  assert.ok(listen > privileges);
});

test('Worker fails closed on startup failure and disables public worker routes by default', () => {
  assert.match(worker, /status: 503/);
  assert.equal(wrangler.workers_dev, false);
  assert.equal(wrangler.preview_urls, false);
  assert.equal(wrangler.observability.enabled, false);
});

test('Worker does not configure or create a paid Cloudflare product', () => {
  assert.equal(wrangler.containers, undefined);
  assert.equal(wrangler.durable_objects, undefined);
  assert.equal(wrangler.queues, undefined);
  assert.equal(wrangler.placement, undefined);
});

test('Worker rejects oversized JSON immediately and drains without buffering', () => {
  const dataHandler = worker.match(/request\.on\('data',[\s\S]*?\n  \}\);/)?.[0] ?? '';
  assert.match(dataHandler, /totalBytes > MAX_JSON_BODY_BYTES/);
  assert.match(dataHandler, /completed = true/);
  assert.match(dataHandler, /response\.status\(413\)\.json\(\{ error: 'payload_too_large' \}\)/);
  assert.match(dataHandler, /request\.resume\(\)/);
  assert.ok(
    dataHandler.indexOf('response.status(413)') < dataHandler.indexOf('request.resume()'),
    '413 must be sent as soon as the threshold is crossed',
  );
  assert.match(dataHandler, /chunks\.length = 0/);
});

test('Worker clears failed initialization so transient startup errors can be retried', () => {
  assert.match(
    worker,
    /initialization = \(async \(\) => \{[\s\S]*?\}\)\(\)\.catch\(\(error: unknown\) => \{[\s\S]*?initialization = undefined;[\s\S]*?throw error;/,
  );
});
