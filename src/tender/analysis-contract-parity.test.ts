import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseCreateAnalysis, parseSavedSummary } from './analysis-contract';

/**
 * Parity with the ZAID Tender AI version-2 contract, using the ACTUAL committed fixtures
 * generated there (valid bodies from `projectForStorage`; every outcome computed by the real
 * `validateCreateAnalysis` / `parseSavedSummary`). Procedure: docs/TENDER_AI_CONTRACT_PARITY.md.
 * Never edit the fixture here: regenerate in Tender AI, copy, update the pin.
 */
const PINNED = {
  sha256: 'c9a87404506c234ddca067eeeb21217892eeb9e397a188f2e1b4beb7c38ea91f',
  tenderAiRepository: 'zaidhqdev-sys/zaid-tenderai',
  tenderAiCommit: '8d7d62177f9d2fa27b458aa6e4fd8c80fd509ebf',
};
const file = join(__dirname, '..', '..', 'src', 'tender', 'fixtures', 'summary-v2.json');
const raw = readFileSync(file);
type Outcome = { ok: true } | { ok: false; reason: string };
interface Case { name: string; input: unknown; tenderAi: Outcome }
const fixtures = JSON.parse(raw.toString('utf8')) as { create: Case[]; read: Case[] };
const asOutcome = (r: { ok: boolean; reason?: string }): Outcome => (r.ok ? { ok: true } : { ok: false, reason: r.reason as string });
const group = (cases: Case[], prefix: string): Case[] => cases.filter(c => c.name.startsWith(prefix));

test('fixture copy is byte-identical to the pinned Tender AI output', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), PINNED.sha256);
});

test('fixtures cover every required category with both accepted and refused outcomes', () => {
  const need = ['valid complete', 'valid incomplete', 'valid truncated', 'coverage:', 'unsupported:', 'oversized:', 'evidence:', 'truncation:', 'envelope:'];
  for (const prefix of need) assert.ok(group(fixtures.create, prefix).length >= 2, prefix);
  assert.ok(group(fixtures.create, 'valid ').every(c => c.tenderAi.ok));
  assert.ok(group(fixtures.create, 'coverage:').every(c => !c.tenderAi.ok));
  assert.ok(group(fixtures.create, 'unsupported:').every(c => !c.tenderAi.ok && c.tenderAi.reason === 'unsupported'));
  assert.ok(group(fixtures.create, 'oversized:').some(c => !c.tenderAi.ok && c.tenderAi.reason === 'too_large'));
  assert.ok(fixtures.create.length >= 80 && fixtures.read.length >= 80);
});

test('write validator gives the same outcome and refusal reason as Tender AI on every create fixture', () => {
  for (const c of fixtures.create) {
    assert.deepEqual(asOutcome(parseCreateAnalysis(structuredClone(c.input))), c.tenderAi, `create: ${c.name}`);
  }
});

test('read validator gives the same outcome and refusal reason as Tender AI on every read fixture', () => {
  for (const c of fixtures.read) {
    assert.deepEqual(asOutcome(parseSavedSummary(structuredClone(c.input))), c.tenderAi, `read: ${c.name}`);
  }
});

test('an accepted body is returned exactly as received apart from documented trimming (never repaired)', () => {
  for (const c of group(fixtures.create, 'valid ')) {
    const input = structuredClone(c.input) as { result: unknown; model: string; promptVersion: string };
    const out = parseCreateAnalysis(structuredClone(c.input));
    assert.ok(out.ok, c.name);
    if (!out.ok) continue;
    assert.equal(out.value.model, input.model.trim());
    assert.equal(out.value.promptVersion, input.promptVersion.trim());
    if (c.name !== 'valid complete, every eligibility check kind') assert.deepEqual(out.value.result, input.result, c.name);
  }
});

test('complete and incomplete status, coverage and truncation survive a round trip unchanged', () => {
  for (const c of group(fixtures.create, 'valid ')) {
    const input = c.input as { result: { coverage: unknown; truncatedForStorage: boolean; omitted: unknown } };
    const out = parseCreateAnalysis(structuredClone(c.input));
    assert.ok(out.ok);
    if (!out.ok) continue;
    assert.deepEqual(out.value.result.coverage, input.result.coverage);
    assert.equal(out.value.result.truncatedForStorage, input.result.truncatedForStorage);
    assert.deepEqual(out.value.result.omitted, input.result.omitted);
  }
  const incomplete = group(fixtures.create, 'valid incomplete')[0];
  assert.ok(incomplete);
  const out = parseCreateAnalysis(structuredClone(incomplete.input));
  assert.ok(out.ok && out.value.result.coverage.status === 'incomplete');
});
