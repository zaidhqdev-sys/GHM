import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseCreateTracking, parsePathId, parseUpdateTracking } from './tracking-contract';

/**
 * Parity with the ZAID Tender AI contract. The fixture file is generated in
 * zaidhqdev-sys/zaid-tenderai by running its Zod schemas (never hand-written) and
 * copied here byte-for-byte. See docs/TENDER_AI_CONTRACT_PARITY.md for the exact
 * synchronization procedure. If the pinned hash does not match, the copy was edited
 * or is stale: regenerate in Tender AI and re-copy, do not edit here.
 */
const PINNED = {
  sha256: '55f34bc13a69a837a6963a6f310819a0e954a757749965619ebec617cf2e44e1',
  tenderAiRepository: 'zaidhqdev-sys/zaid-tenderai',
  tenderAiCommit: 'ac2c70ac411ec09c4a70c741ea619e833d5e547a',
};

// dist/tender -> src/tender/fixtures (fixtures are not compiled).
const file = join(__dirname, '..', '..', 'src', 'tender', 'fixtures', 'tracking-v1.json');
const raw = readFileSync(file);
const fixtures = JSON.parse(raw.toString('utf8')) as {
  create: Array<{ name: string; input: unknown; tenderAiValid: boolean }>;
  update: Array<{ name: string; input: unknown; tenderAiValid: boolean; ghmDiffers?: string }>;
  pathId: Array<{ name: string; input: unknown; tenderAiValid: boolean }>;
};

test('fixture copy is byte-identical to the pinned Tender AI output', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), PINNED.sha256);
});

test('fixtures contain both accepted and rejected cases for every group', () => {
  for (const group of [fixtures.create, fixtures.update, fixtures.pathId]) {
    assert.ok(group.some(c => c.tenderAiValid));
    assert.ok(group.some(c => !c.tenderAiValid));
  }
  assert.ok(fixtures.create.length >= 30 && fixtures.update.length >= 15);
});

test('create validator agrees with Tender AI on every create fixture', () => {
  for (const c of fixtures.create) {
    assert.equal(parseCreateTracking(structuredClone(c.input)).ok, c.tenderAiValid, `create: ${c.name}`);
  }
});

test('update validator agrees with Tender AI except the documented archived-stage difference', () => {
  let differences = 0;
  for (const c of fixtures.update) {
    const ghm = parseUpdateTracking(structuredClone(c.input)).ok;
    if (c.ghmDiffers) {
      differences += 1;
      assert.equal(c.tenderAiValid, true, c.name);
      assert.equal(ghm, false, `${c.name}: GHM must refuse (${c.ghmDiffers})`);
    } else {
      assert.equal(ghm, c.tenderAiValid, `update: ${c.name}`);
    }
  }
  assert.equal(differences, 1);
});

test('path id validator agrees with Tender AI on every path id fixture', () => {
  for (const c of fixtures.pathId) {
    assert.equal(parsePathId(c.input) !== null, c.tenderAiValid, `pathId: ${c.name}`);
  }
});
