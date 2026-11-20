import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYSIS_PROJECTION_BUDGET_BYTES, parseCreateAnalysis } from './analysis-contract';

/**
 * Real-path size check for the 12 KiB projection versus the SQL ceiling in
 * ghm.tender_analysis_result_problem (octet_length(p_result::text) > 20000).
 *
 * The Gateway measures COMPACT JSON (JSON.stringify). PostgreSQL renders jsonb with ': ' and ', '
 * separators, so the stored text is longer. This test builds the densest payloads the real
 * validator accepts and measures them with an INDEPENDENT jsonb-style serializer. It is a
 * computation, NOT a PostgreSQL run: the first execution against a disposable database must
 * still confirm it (docs/TENDER_AI_PHASE1_DESIGN.md section 10).
 */
const SQL_CEILING_BYTES = 20_000;
const bytes = (s: string): number => Buffer.byteLength(s, 'utf8');
const jsonbText = (v: unknown): string =>
  v === null || typeof v !== 'object' ? JSON.stringify(v)
    : Array.isArray(v) ? `[${v.map(jsonbText).join(', ')}]`
      : `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${JSON.stringify(k)}: ${jsonbText(x)}`).join(', ')}}`;

const chunks = Array.from({ length: 16 }, (_, i) => ({ index: i + 1, start: i * 100, end: i * 100 + 100, outcome: 'processed' }));
const result = (requirements: number, quote: string) => ({
  projectionVersion: 2, source: 'ai_extracted', summary: 's',
  requirements: Array.from({ length: requirements }, (_, i) => ({
    id: `req-${i + 1}`, category: 'risk', text: 't', quote, start: 0, end: quote.length,
  })),
  importantDates: Array.from({ length: 10 }, () => ({ label: 'l', isoDate: '2026-01-01', quote, start: 0, end: quote.length })),
  missingInformation: Array.from({ length: 8 }, () => 'm'),
  coverage: { status: 'complete', charsTotal: 1600, charsProcessed: 1600, chunksTotal: 16, chunksProcessed: 16, chunks },
  truncatedForStorage: false, summaryTruncated: false, omitted: { requirements: 0, importantDates: 0, missingInformation: 0 },
});
const body = (r: unknown) => ({ model: 'm', promptVersion: 'p', documentSha256: 'a'.repeat(64), documentHashVersion: 1, result: r });

test('the densest payload the validator accepts stays well under the SQL jsonb text ceiling', () => {
  let densest = { compact: 0, stored: 0, requirements: -1 };
  for (let n = 0; n <= 200; n++) {
    const r = result(n, 'xxxxxxxxxx');
    const compact = bytes(JSON.stringify(r));
    if (compact > ANALYSIS_PROJECTION_BUDGET_BYTES) break;
    assert.equal(parseCreateAnalysis(body(r)).ok, true, `${n} requirements must be accepted`);
    densest = { compact, stored: bytes(jsonbText(r)), requirements: n };
  }
  assert.ok(densest.requirements >= 100, 'the search must reach a payload near the 12 KiB limit');
  assert.ok(densest.compact > ANALYSIS_PROJECTION_BUDGET_BYTES - 200, 'it must be near the limit');
  assert.ok(densest.stored > densest.compact, 'jsonb text is longer than compact JSON');
  assert.ok(densest.stored / densest.compact < 1.2, 'separator inflation stays under 20% for this schema');
  assert.ok(densest.stored < SQL_CEILING_BYTES - 4_000, `stored ${densest.stored} must leave >= 4 KB of headroom`);
});

test('a payload over 12 KiB is refused before the database, so the SQL ceiling is never the only limit', () => {
  const r = result(200, 'x'.repeat(10));
  assert.ok(bytes(JSON.stringify(r)) > ANALYSIS_PROJECTION_BUDGET_BYTES);
  assert.deepEqual(parseCreateAnalysis(body(r)), { ok: false, reason: 'too_large' });
});

test('the SQL ceiling in the migration matches the value this test assumes', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const sql = readFileSync(join(__dirname, '..', '..', 'database', 'migrations', '20261119100000_create_tender_analysis_and_extend_audit.sql'), 'utf8');
  assert.match(sql, /octet_length\(p_result::text\) > 20000/);
});
