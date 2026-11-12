import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/migrations/20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql',
), 'utf8');

const legacySignatures = [
  'ghm.assert_actor_gateway(bigint)',
];

test('the unused unsigned Actor Gateway identity helper loses application and PUBLIC execution', () => {
  for (const signature of legacySignatures) {
    assert.ok(migration.includes(`REVOKE ALL ON FUNCTION ${signature}`), `missing revocation for ${signature}`);
  }
  assert.equal((migration.match(/FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway/g) ?? []).length, legacySignatures.length);
});
