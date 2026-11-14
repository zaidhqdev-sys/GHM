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
