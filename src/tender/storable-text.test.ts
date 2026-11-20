import test from 'node:test';
import assert from 'node:assert/strict';
import { isStorableText } from './storable-text';
import { parseCreateAnalysis, parseSavedSummary } from './analysis-contract';
import { parseCreateTracking, parseUpdateTracking, parseHttpsUrl } from './tracking-contract';
import { fixtureBody } from './analysis-test-fixtures';

const BAD = [
  ['NUL', 'a\u0000b'],
  ['lone high surrogate', 'a\ud800b'],
  ['lone low surrogate', 'a\udc00b'],
  ['high surrogate at end', 'ab\ud83d'],
] as const;

test('isStorableText: refuses NUL and unpaired surrogates, accepts valid text including astral pairs', () => {
  for (const [, s] of BAD) assert.equal(isStorableText(s), false);
  for (const s of ['plain', 'Pretoria – Tshwane', '\u{1F600} pair', 'ünï', '\n\t']) assert.equal(isStorableText(s), true);
});

const analysisWith = (mutate: (r: Record<string, unknown>) => void) => {
  const b = fixtureBody('valid complete, three chunks');
  mutate(b.result as Record<string, unknown>);
  return b;
};

for (const [label, bad] of BAD) {
  test(`analysis write refuses ${label} in every free-text field (PostgreSQL could not store it)`, () => {
    const cases: Array<[string, (b: Record<string, unknown>) => void]> = [
      ['summary', b => { (b.result as Record<string, unknown>).summary = bad; }],
      ['model', b => { b.model = bad; }],
      ['promptVersion', b => { b.promptVersion = bad; }],
      ['requirement text', b => { ((b.result as { requirements: Record<string, unknown>[] }).requirements[0]).text = bad; }],
      ['missing information', b => { (b.result as Record<string, unknown>).missingInformation = [bad]; }],
    ];
    for (const [field, mutate] of cases) {
      const body = fixtureBody('valid complete, three chunks');
      mutate(body);
      const parsed = parseCreateAnalysis(body);
      assert.deepEqual(parsed, { ok: false, reason: 'invalid' }, `${label} in ${field}`);
    }
  });
}

test('analysis: the unmodified fixture is still accepted (the new rule is not over-broad)', () => {
  assert.equal(parseCreateAnalysis(fixtureBody('valid complete, three chunks')).ok, true);
  const body = analysisWith(r => { r.summary = 'Valid emoji \u{1F600} summary'; });
  assert.equal(parseCreateAnalysis(body).ok, true);
});

test('analysis read: a stored summary carrying NUL or a lone surrogate is refused, not repaired', () => {
  const created = parseCreateAnalysis(fixtureBody('valid complete, three chunks'));
  if (!created.ok) throw new Error('fixture must be valid');
  const base: Record<string, unknown> = { ...created.value.result };
  for (const [, bad] of BAD) {
    const stored: Record<string, unknown> = { ...base, summary: bad };
    assert.deepEqual(parseSavedSummary(stored), { ok: false, reason: 'invalid' });
  }
});

test('tracking: NUL and unpaired surrogates are refused in title, reference, issuer and source URL', () => {
  for (const [label, bad] of BAD) {
    for (const field of ['title', 'referenceNumber', 'issuerName'] as const) {
      const body = { title: 'Valid title', [field]: field === 'title' ? `T${bad}` : bad };
      assert.equal(parseCreateTracking(body).ok, false, `${label} in ${field}`);
    }
    assert.equal(parseHttpsUrl(`https://example.org/${bad}`), null, `${label} in URL`);
    assert.equal(parseCreateTracking({ title: 'Valid title', sourceUrl: `https://example.org/${bad}` }).ok, false);
    assert.equal(parseUpdateTracking({ title: `T${bad}` }).ok, false);
  }
  assert.equal(parseCreateTracking({ title: 'Valid title \u{1F600}' }).ok, true);
});
