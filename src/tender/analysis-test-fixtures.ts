import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCreateAnalysis, type CreateAnalysisInput } from './analysis-contract';

/** Test helper: valid bodies taken from the committed, Tender AI-generated fixtures. */
interface Case { name: string; input: unknown; tenderAi: { ok: boolean; reason?: string } }
const fixtures = JSON.parse(readFileSync(join(__dirname, '..', '..', 'src', 'tender', 'fixtures', 'summary-v2.json'), 'utf8')) as { create: Case[] };

export const fixtureBody = (name: string): Record<string, unknown> => {
  const found = fixtures.create.find(c => c.name === name);
  if (!found) throw new Error(`fixture not found: ${name}`);
  return structuredClone(found.input) as Record<string, unknown>;
};
export const validInput = (name = 'valid complete, three chunks'): CreateAnalysisInput => {
  const parsed = parseCreateAnalysis(fixtureBody(name));
  if (!parsed.ok) throw new Error(`fixture ${name} is not valid`);
  return parsed.value;
};
/** A record as the database would return it for an input. */
export const recordFor = (input: CreateAnalysisInput, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 11, businessId: 3, trackingId: input.trackingId, model: input.model, promptVersion: input.promptVersion,
  documentSha256: input.documentSha256, documentHashVersion: 1, projectionVersion: 2, source: 'ai_extracted',
  coverageStatus: input.result.coverage.status, chunksTotal: input.result.coverage.chunksTotal,
  chunksProcessed: input.result.coverage.chunksProcessed, truncatedForStorage: input.result.truncatedForStorage,
  createdBy: 42, createdAt: '2026-11-19T00:00:00Z', result: input.result, ...over,
});
export const metadataOf = (record: Record<string, unknown>): Record<string, unknown> => {
  const { result: _result, ...meta } = record;
  return meta;
};
