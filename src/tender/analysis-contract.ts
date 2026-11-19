/**
 * Saved-analysis (version 2 projection) validation for the Actor Gateway. This is a
 * hand-written port of the ZAID Tender AI contract (`StoredProjectionSchema`,
 * `CreateAnalysisSchema`, `validateCreateAnalysis`, `parseSavedSummary` in
 * zaidhqdev-sys/zaid-tenderai `src/domain/tender/persistence-contract.ts`). GHM has no
 * schema library. Parity is a TESTED requirement against committed, generated fixtures:
 * see docs/TENDER_AI_CONTRACT_PARITY.md.
 *
 * Rules that must never be weakened:
 *  - strict keys at every level; nothing is defaulted, stripped, converted or repaired;
 *  - contradictory coverage is REFUSED, never corrected;
 *  - `unsupported` has no stored representation and gets its own refusal;
 *  - the same validator guards writes (before the database) and reads (before the caller).
 * Pure: no I/O.
 */
export const PROJECTION_VERSION = 2;
export const MAX_COVERAGE_CHUNKS = 16;
export const MAX_COVERAGE_CHARS = 120_000;
export const MAX_COVERAGE_CHUNK_CHARS = 12_000;
export const MAX_SUMMARY_CHARS = 1000;
export const ANALYSIS_PROJECTION_BUDGET_BYTES = 12 * 1024;
export const GATEWAY_BODY_LIMIT_BYTES = 16 * 1024;
export const MAX_ANALYSES_PER_BUSINESS = 100;
export const MAX_ANALYSIS_LIST_LIMIT = 50;

export const CHUNK_OUTCOMES = ['processed', 'ai_unavailable', 'output_invalid', 'budget_exceeded', 'not_attempted'] as const;
export type ChunkOutcome = (typeof CHUNK_OUTCOMES)[number];
export const REQUIREMENT_CATEGORIES = ['mandatory', 'eligibility', 'submission', 'compulsory_document', 'disqualifier', 'risk'] as const;
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export type Refusal = 'invalid' | 'too_large' | 'unsupported';
export type Parse<T> = { ok: true; value: T } | { ok: false; reason: Refusal };
const invalid = { ok: false, reason: 'invalid' } as const;

export interface StoredChunk { index: number; start: number; end: number; outcome: ChunkOutcome }
export interface StoredCoverage {
  status: 'complete' | 'incomplete';
  charsTotal: number; charsProcessed: number; chunksTotal: number; chunksProcessed: number;
  chunks: StoredChunk[];
}
export type EligibilityCheck =
  | { kind: 'province'; allowed: string[] }
  | { kind: 'min_years_in_business'; years: number }
  | { kind: 'insurance_verified' }
  | { kind: 'business_verified' };
export interface StoredRequirement {
  id: string; category: RequirementCategory; text: string; quote: string; start: number; end: number; check?: EligibilityCheck;
}
export interface StoredDate { label: string; isoDate: string; quote: string; start: number; end: number }
export interface StoredProjection {
  projectionVersion: 2; source: 'ai_extracted'; summary: string;
  requirements: StoredRequirement[]; importantDates: StoredDate[]; missingInformation: string[];
  coverage: StoredCoverage; truncatedForStorage: boolean; summaryTruncated: boolean;
  omitted: { requirements: number; importantDates: number; missingInformation: number };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
/** Strict object: exactly the allowed keys, every required key present. */
const strict = (v: unknown, required: readonly string[], optional: readonly string[] = []): Obj | null => {
  if (!isObj(v)) return null;
  const keys = Object.keys(v);
  if (!keys.every(k => required.includes(k) || optional.includes(k))) return null;
  if (!required.every(k => keys.includes(k))) return null;
  return v;
};
const int = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
/** Raw string with a length range in UTF-16 code units (as Zod counts). */
const str = (v: unknown, min: number, max: number): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= max;
const trimmed = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
};

const HIDDEN_OR_CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁠-⁩﻿]/;

const unionLength = (ranges: readonly { start: number; end: number }[]): number => {
  let total = 0;
  let reached = 0;
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const from = Math.max(r.start, reached);
    if (r.end > from) total += r.end - from;
    reached = Math.max(reached, r.end);
  }
  return total;
};

/** First contradiction in a coverage block, or null. Never "repairs" anything. */
export const coverageProblem = (c: StoredCoverage): string | null => {
  if (c.chunksTotal < 1 || c.chunksTotal > MAX_COVERAGE_CHUNKS) return 'chunk_count_out_of_range';
  if (c.chunks.length !== c.chunksTotal) return 'chunk_list_does_not_match_total';
  if (c.charsTotal < 1 || c.charsTotal > MAX_COVERAGE_CHARS) return 'chars_out_of_range';
  let previous: StoredChunk | undefined;
  for (const [i, chunk] of c.chunks.entries()) {
    if (chunk.index !== i + 1) return 'chunk_index_out_of_order';
    if (chunk.start < 0 || chunk.end <= chunk.start) return 'chunk_range_invalid';
    if (chunk.end - chunk.start > MAX_COVERAGE_CHUNK_CHARS) return 'chunk_too_large';
    if (chunk.end > c.charsTotal) return 'chunk_beyond_document';
    if (previous === undefined) {
      if (chunk.start !== 0) return 'document_start_not_covered';
    } else {
      if (chunk.start > previous.end) return 'gap_between_chunks';
      if (chunk.start <= previous.start || chunk.end <= previous.end) return 'chunks_not_advancing';
    }
    previous = chunk;
  }
  if (previous?.end !== c.charsTotal) return 'document_end_not_covered';
  const done = c.chunks.filter(k => k.outcome === 'processed');
  if (c.chunksProcessed !== done.length) return 'processed_count_mismatch';
  if (c.charsProcessed !== unionLength(done)) return 'processed_chars_mismatch';
  if (c.status === 'complete' && done.length !== c.chunksTotal) return 'complete_but_unprocessed_parts';
  if (c.status === 'incomplete') {
    if (done.length === c.chunksTotal) return 'incomplete_but_all_processed';
    if (done.length === 0) return 'incomplete_with_nothing_processed';
  }
  return null;
};

const insideProcessed = (c: StoredCoverage, start: number, end: number): boolean =>
  c.chunks.some(k => k.outcome === 'processed' && k.start <= start && end <= k.end);

export const evidenceProblem = (c: StoredCoverage, quote: string, start: number, end: number): string | null => {
  if (end <= start || end > c.charsTotal) return 'evidence_range_invalid';
  if (quote.length > end - start) return 'quote_longer_than_its_range';
  if (quote.trim().length === 0 || HIDDEN_OR_CONTROL.test(quote)) return 'quote_not_plain_text';
  if (!insideProcessed(c, start, end)) return 'evidence_outside_processed_text';
  return null;
};

const calendarDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
};

const parseCoverage = (v: unknown): StoredCoverage | null => {
  const o = strict(v, ['status', 'charsTotal', 'charsProcessed', 'chunksTotal', 'chunksProcessed', 'chunks']);
  if (!o) return null;
  if (o.status !== 'complete' && o.status !== 'incomplete') return null;
  if (!int(o.charsTotal, 1, MAX_COVERAGE_CHARS) || !int(o.charsProcessed, 0, MAX_COVERAGE_CHARS)) return null;
  if (!int(o.chunksTotal, 1, MAX_COVERAGE_CHUNKS) || !int(o.chunksProcessed, 0, MAX_COVERAGE_CHUNKS)) return null;
  if (!Array.isArray(o.chunks) || o.chunks.length < 1 || o.chunks.length > MAX_COVERAGE_CHUNKS) return null;
  const chunks: StoredChunk[] = [];
  for (const raw of o.chunks) {
    const k = strict(raw, ['index', 'start', 'end', 'outcome']);
    if (!k || !int(k.index, 1, MAX_COVERAGE_CHUNKS) || !int(k.start, 0, MAX_COVERAGE_CHARS) || !int(k.end, 0, MAX_COVERAGE_CHARS)) return null;
    if (typeof k.outcome !== 'string' || !(CHUNK_OUTCOMES as readonly string[]).includes(k.outcome)) return null;
    chunks.push({ index: k.index, start: k.start, end: k.end, outcome: k.outcome as ChunkOutcome });
  }
  const coverage: StoredCoverage = {
    status: o.status, charsTotal: o.charsTotal, charsProcessed: o.charsProcessed,
    chunksTotal: o.chunksTotal, chunksProcessed: o.chunksProcessed, chunks,
  };
  return coverageProblem(coverage) === null ? coverage : null;
};

const parseCheck = (v: unknown): EligibilityCheck | null => {
  if (!isObj(v) || typeof v.kind !== 'string') return null;
  switch (v.kind) {
    case 'province': {
      const o = strict(v, ['kind', 'allowed']);
      if (!o || !Array.isArray(o.allowed) || o.allowed.length < 1 || o.allowed.length > 20) return null;
      const allowed: string[] = [];
      for (const a of o.allowed) {
        const t = trimmed(a, 1, 60);
        if (t === null) return null;
        allowed.push(t);
      }
      return { kind: 'province', allowed };
    }
    case 'min_years_in_business': {
      const o = strict(v, ['kind', 'years']);
      return o && int(o.years, 0, 200) ? { kind: 'min_years_in_business', years: o.years } : null;
    }
    case 'insurance_verified':
      return strict(v, ['kind']) ? { kind: 'insurance_verified' } : null;
    case 'business_verified':
      return strict(v, ['kind']) ? { kind: 'business_verified' } : null;
    default:
      return null;
  }
};

export const parseProjection = (v: unknown): StoredProjection | null => {
  const o = strict(v, ['projectionVersion', 'source', 'summary', 'requirements', 'importantDates', 'missingInformation', 'coverage', 'truncatedForStorage', 'summaryTruncated', 'omitted']);
  if (!o || o.projectionVersion !== PROJECTION_VERSION || o.source !== 'ai_extracted') return null;
  if (!str(o.summary, 1, MAX_SUMMARY_CHARS)) return null;
  if (typeof o.truncatedForStorage !== 'boolean' || typeof o.summaryTruncated !== 'boolean') return null;
  const coverage = parseCoverage(o.coverage);
  if (!coverage) return null;

  if (!Array.isArray(o.requirements) || o.requirements.length > 200) return null;
  const requirements: StoredRequirement[] = [];
  for (const raw of o.requirements) {
    const r = strict(raw, ['id', 'category', 'text', 'quote', 'start', 'end'], ['check']);
    if (!r) return null;
    if (typeof r.id !== 'string' || !/^req-\d{1,3}$/.test(r.id)) return null;
    if (typeof r.category !== 'string' || !(REQUIREMENT_CATEGORIES as readonly string[]).includes(r.category)) return null;
    if (!str(r.text, 1, 1000) || !str(r.quote, 10, 500)) return null;
    if (!int(r.start, 0, MAX_COVERAGE_CHARS) || !int(r.end, 0, MAX_COVERAGE_CHARS)) return null;
    const item: StoredRequirement = { id: r.id, category: r.category as RequirementCategory, text: r.text, quote: r.quote, start: r.start, end: r.end };
    if ('check' in r) {
      const check = parseCheck(r.check);
      if (!check) return null;
      item.check = check;
    }
    requirements.push(item);
  }
  if (!Array.isArray(o.importantDates) || o.importantDates.length > 10) return null;
  const importantDates: StoredDate[] = [];
  for (const raw of o.importantDates) {
    const d = strict(raw, ['label', 'isoDate', 'quote', 'start', 'end']);
    if (!d || !str(d.label, 1, 160) || !calendarDate(d.isoDate) || !str(d.quote, 10, 500)) return null;
    if (!int(d.start, 0, MAX_COVERAGE_CHARS) || !int(d.end, 0, MAX_COVERAGE_CHARS)) return null;
    importantDates.push({ label: d.label, isoDate: d.isoDate, quote: d.quote, start: d.start, end: d.end });
  }
  if (!Array.isArray(o.missingInformation) || o.missingInformation.length > 8) return null;
  const missingInformation: string[] = [];
  for (const m of o.missingInformation) {
    if (!str(m, 1, 300)) return null;
    missingInformation.push(m);
  }
  const om = strict(o.omitted, ['requirements', 'importantDates', 'missingInformation']);
  if (!om || !int(om.requirements, 0, 1000) || !int(om.importantDates, 0, 1000) || !int(om.missingInformation, 0, 1000)) return null;

  // Cross-field integrity (the Zod superRefine): evidence inside READ text, unique ids, truthful flag.
  for (const item of [...requirements, ...importantDates]) {
    if (evidenceProblem(coverage, item.quote, item.start, item.end) !== null) return null;
  }
  
  if (new Set(requirements.map(r => r.id)).size !== requirements.length) return null;
  const anyOmitted = om.requirements > 0 || om.importantDates > 0 || om.missingInformation > 0;
  if (o.truncatedForStorage !== (anyOmitted || o.summaryTruncated)) return null;

  return {
    projectionVersion: 2, source: 'ai_extracted', summary: o.summary, requirements, importantDates, missingInformation,
    coverage, truncatedForStorage: o.truncatedForStorage, summaryTruncated: o.summaryTruncated,
    omitted: { requirements: om.requirements, importantDates: om.importantDates, missingInformation: om.missingInformation },
  };
};

const bytes = (v: unknown): number => Buffer.byteLength(JSON.stringify(v), 'utf8');

const claimsUnsupported = (projection: unknown): boolean =>
  typeof projection === 'object' && projection !== null && 'coverage' in projection
  && typeof (projection as Obj).coverage === 'object' && (projection as Obj).coverage !== null
  && 'status' in ((projection as Obj).coverage as Obj) && ((projection as Obj).coverage as Obj).status === 'unsupported';

export interface CreateAnalysisInput {
  trackingId: number | null;
  model: string;
  promptVersion: string;
  documentSha256: string;
  documentHashVersion: 1;
  result: StoredProjection;
}

/**
 * WRITE side. Order matches the Tender AI contract: unsupported first, then the strict
 * schema, then the 16 KiB request limit, then the 12 KiB projection limit.
 */
export const parseCreateAnalysis = (body: unknown): Parse<CreateAnalysisInput> => {
  if (typeof body === 'object' && body !== null && 'result' in body && claimsUnsupported((body as Obj).result)) {
    return { ok: false, reason: 'unsupported' };
  }
  const o = strict(body, ['model', 'promptVersion', 'documentSha256', 'documentHashVersion', 'result'], ['trackingId']);
  if (!o) return invalid;
  let trackingId: number | null = null;
  if ('trackingId' in o) {
    if (typeof o.trackingId !== 'string' || !/^[1-9][0-9]{0,14}$/.test(o.trackingId)) return invalid;
    trackingId = Number(o.trackingId);
  }
  const model = trimmed(o.model, 1, 120);
  const promptVersion = trimmed(o.promptVersion, 1, 60);
  if (model === null || promptVersion === null) return invalid;
  if (typeof o.documentSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(o.documentSha256)) return invalid;
  if (o.documentHashVersion !== 1) return invalid;
  const result = parseProjection(o.result);
  if (!result) return invalid;
  if (bytes(body) > GATEWAY_BODY_LIMIT_BYTES) return { ok: false, reason: 'too_large' };
  if (bytes(result) > ANALYSIS_PROJECTION_BUDGET_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true, value: { trackingId, model, promptVersion, documentSha256: o.documentSha256, documentHashVersion: 1, result } };
};

/** READ side: accepted exactly as received or refused. Size is checked first. */
export const parseSavedSummary = (input: unknown): Parse<StoredProjection> => {
  if (!isObj(input) && !(typeof input === 'object' && input !== null && !Array.isArray(input))) return invalid;
  if (claimsUnsupported(input)) return { ok: false, reason: 'unsupported' };
  let size: number;
  try {
    size = bytes(input);
  } catch {
    return invalid;
  }
  if (size > ANALYSIS_PROJECTION_BUDGET_BYTES) return { ok: false, reason: 'too_large' };
  const parsed = parseProjection(input);
  return parsed ? { ok: true, value: parsed } : invalid;
};

// ---- Records returned by the database / Gateway ----------------------------------------

export interface AnalysisMetadata {
  id: number; businessId: number; trackingId: number | null; model: string; promptVersion: string;
  documentSha256: string; documentHashVersion: 1; projectionVersion: 2; source: 'ai_extracted';
  coverageStatus: 'complete' | 'incomplete'; chunksTotal: number; chunksProcessed: number;
  truncatedForStorage: boolean; createdBy: number; createdAt: string;
}
export interface AnalysisRecord extends AnalysisMetadata { result: StoredProjection }

const META_KEYS = ['id', 'businessId', 'trackingId', 'model', 'promptVersion', 'documentSha256', 'documentHashVersion', 'projectionVersion', 'source', 'coverageStatus', 'chunksTotal', 'chunksProcessed', 'truncatedForStorage', 'createdBy', 'createdAt'];
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

export const parseAnalysisMetadata = (v: unknown, withResult = false): Parse<AnalysisMetadata & { result?: StoredProjection }> => {
  const o = strict(v, withResult ? [...META_KEYS, 'result'] : META_KEYS);
  if (!o) return invalid;
  if (!posInt(o.id) || !posInt(o.businessId) || !posInt(o.createdBy)) return invalid;
  if (o.trackingId !== null && !posInt(o.trackingId)) return invalid;
  if (typeof o.model !== 'string' || typeof o.promptVersion !== 'string' || typeof o.createdAt !== 'string') return invalid;
  if (typeof o.documentSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(o.documentSha256)) return invalid;
  if (o.documentHashVersion !== 1 || o.projectionVersion !== 2 || o.source !== 'ai_extracted') return invalid;
  if (o.coverageStatus !== 'complete' && o.coverageStatus !== 'incomplete') return invalid;
  if (!int(o.chunksTotal, 1, MAX_COVERAGE_CHUNKS) || !int(o.chunksProcessed, 0, MAX_COVERAGE_CHUNKS)) return invalid;
  if (typeof o.truncatedForStorage !== 'boolean') return invalid;
  // The denormalised status columns must agree with each other (complete <=> all parts read).
  if ((o.coverageStatus === 'complete') !== (o.chunksProcessed === o.chunksTotal)) return invalid;
  const meta = o as unknown as AnalysisMetadata;
  if (!withResult) return { ok: true, value: meta };
  const saved = parseSavedSummary(o.result);
  if (!saved.ok) return { ok: false, reason: saved.reason };
  const r = saved.value;
  // The stored columns must equal what the payload says. A disagreement is a fault, not a "fix".
  if (r.coverage.status !== o.coverageStatus || r.coverage.chunksTotal !== o.chunksTotal
    || r.coverage.chunksProcessed !== o.chunksProcessed || r.truncatedForStorage !== o.truncatedForStorage) return invalid;
  return { ok: true, value: { ...meta, result: r } };
};

export const parseAnalysisRecord = (v: unknown): Parse<AnalysisRecord> => {
  const r = parseAnalysisMetadata(v, true);
  return r.ok ? { ok: true, value: r.value as AnalysisRecord } : r;
};

export const parseAnalysisList = (v: unknown): Parse<{ items: AnalysisMetadata[]; nextAfter: number | null }> => {
  const o = strict(v, ['items', 'nextAfter']);
  if (!o || !Array.isArray(o.items) || o.items.length > MAX_ANALYSIS_LIST_LIMIT) return invalid;
  if (o.nextAfter !== null && !posInt(o.nextAfter)) return invalid;
  const items: AnalysisMetadata[] = [];
  for (const raw of o.items) {
    const m = parseAnalysisMetadata(raw, false);
    if (!m.ok) return invalid;
    items.push(m.value);
  }
  return { ok: true, value: { items, nextAfter: o.nextAfter as number | null } };
};

export const parseAnalysisDelete = (v: unknown): Parse<{ id: number; businessId: number; deleted: true }> => {
  const o = strict(v, ['id', 'businessId', 'deleted']);
  if (!o || !posInt(o.id) || !posInt(o.businessId) || o.deleted !== true) return invalid;
  return { ok: true, value: { id: o.id, businessId: o.businessId, deleted: true } };
};

export interface AnalysisListQuery { limit: number; after: number | null }
export const parseAnalysisListQuery = (query: unknown): { ok: true; value: AnalysisListQuery } | { ok: false } => {
  if (typeof query !== 'object' || query === null) return { ok: false };
  const q = query as Record<string, unknown>;
  if (!Object.keys(q).every(k => k === 'limit' || k === 'after')) return { ok: false };
  let limit = 25;
  if (q.limit !== undefined) {
    if (typeof q.limit !== 'string' || !/^[1-9][0-9]?$/.test(q.limit)) return { ok: false };
    limit = Number(q.limit);
    if (limit > MAX_ANALYSIS_LIST_LIMIT) return { ok: false };
  }
  let after: number | null = null;
  if (q.after !== undefined) {
    if (typeof q.after !== 'string' || !/^[1-9][0-9]{0,14}$/.test(q.after)) return { ok: false };
    after = Number(q.after);
  }
  return { ok: true, value: { limit, after } };
};
