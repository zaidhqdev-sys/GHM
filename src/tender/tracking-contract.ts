/**
 * Strict tender-tracking input validation for the Actor Gateway. Hand-written
 * (GHM has no schema library) and kept in parity with the ZAID Tender AI contract
 * (`src/domain/tender/*` in zaidhqdev-sys/zaid-tenderai) through committed
 * fixtures; see docs/TENDER_AI_CONTRACT_PARITY.md. Pure: no I/O.
 */
import { isStorableText } from './storable-text';

export const TRACKING_STAGES = ['saved', 'evaluating', 'preparing', 'submitted', 'archived'] as const;
export type TrackingStage = (typeof TRACKING_STAGES)[number];
export const EDITABLE_STAGES = ['saved', 'evaluating', 'preparing', 'submitted'] as const;
export const MAX_TRACKINGS_PER_BUSINESS = 500;
export const MAX_LIST_LIMIT = 50;

export type Result<T> = { ok: true; value: T } | { ok: false };
const bad = { ok: false } as const;
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const text = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= min && t.length <= max && isStorableText(t) ? t : null;
};

export const parseHttpsUrl = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t.length < 8 || t.length > 500 || !/^https:\/\//i.test(t) || /\s/.test(t) || !isStorableText(t)) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
  } catch {
    return null;
  }
  return t;
};

/** ISO-8601 instant with a zone offset; normalised to UTC `...Z` (3 fractional digits). */
export const parseIsoInstant = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 40) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v)) return null;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  if (year < 1970 || year > 2200) return null;
  return d.toISOString();
};

export const parsePathId = (v: unknown): number | null =>
  typeof v === 'string' && /^[1-9][0-9]{0,14}$/.test(v) ? Number(v) : null;

export interface CreateTrackingInput {
  title: string;
  referenceNumber: string | null;
  issuerName: string | null;
  sourceUrl: string | null;
  closingAt: string | null;
}

const hasOnly = (o: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(o).every(k => keys.includes(k));

export const parseCreateTracking = (body: unknown): Result<CreateTrackingInput> => {
  if (!isPlainObject(body)) return bad;
  if (!hasOnly(body, ['title', 'referenceNumber', 'issuerName', 'sourceUrl', 'closingAt'])) return bad;
  const title = text(body.title, 1, 300);
  if (title === null) return bad;
  const optional = <T>(key: string, parse: (v: unknown) => T | null): Result<T | null> => {
    if (!(key in body) || body[key] === undefined) return ok(null);
    const parsed = parse(body[key]);
    return parsed === null ? bad : ok(parsed);
  };
  const reference = optional('referenceNumber', v => text(v, 1, 120));
  const issuer = optional('issuerName', v => text(v, 1, 200));
  const url = optional('sourceUrl', parseHttpsUrl);
  const closing = optional('closingAt', parseIsoInstant);
  if (!reference.ok || !issuer.ok || !url.ok || !closing.ok) return bad;
  return ok({ title, referenceNumber: reference.value, issuerName: issuer.value, sourceUrl: url.value, closingAt: closing.value });
};

export type UpdatePatch = Partial<{
  title: string;
  referenceNumber: string | null;
  issuerName: string | null;
  sourceUrl: string | null;
  closingAt: string | null;
  stage: (typeof EDITABLE_STAGES)[number];
}>;

/**
 * Presence matters: an absent key is "leave alone", an explicit null clears the
 * clearable fields. `archived` is NOT settable here (separate archive operation).
 */
export const parseUpdateTracking = (body: unknown): Result<UpdatePatch> => {
  if (!isPlainObject(body)) return bad;
  const keys = Object.keys(body);
  if (keys.length === 0 || !hasOnly(body, ['title', 'referenceNumber', 'issuerName', 'sourceUrl', 'closingAt', 'stage'])) return bad;
  const patch: UpdatePatch = {};
  for (const key of keys) {
    const v = body[key];
    switch (key) {
      case 'title': {
        const t = text(v, 1, 300);
        if (t === null) return bad;
        patch.title = t;
        break;
      }
      case 'referenceNumber': {
        const t = v === null ? null : text(v, 1, 120);
        if (v !== null && t === null) return bad;
        patch.referenceNumber = t;
        break;
      }
      case 'issuerName': {
        const t = v === null ? null : text(v, 1, 200);
        if (v !== null && t === null) return bad;
        patch.issuerName = t;
        break;
      }
      case 'sourceUrl': {
        const t = v === null ? null : parseHttpsUrl(v);
        if (v !== null && t === null) return bad;
        patch.sourceUrl = t;
        break;
      }
      case 'closingAt': {
        const t = v === null ? null : parseIsoInstant(v);
        if (v !== null && t === null) return bad;
        patch.closingAt = t;
        break;
      }
      case 'stage': {
        if (typeof v !== 'string' || !(EDITABLE_STAGES as readonly string[]).includes(v)) return bad;
        patch.stage = v as (typeof EDITABLE_STAGES)[number];
        break;
      }
    }
  }
  return ok(patch);
};

export interface ListQuery { stage: TrackingStage | null; limit: number; after: number | null }

export const parseListQuery = (query: unknown): Result<ListQuery> => {
  if (!isPlainObject(query) && !(typeof query === 'object' && query !== null)) return bad;
  const q = query as Record<string, unknown>;
  if (!Object.keys(q).every(k => ['stage', 'limit', 'after'].includes(k))) return bad;
  let stage: TrackingStage | null = null;
  if (q.stage !== undefined) {
    if (typeof q.stage !== 'string' || !(TRACKING_STAGES as readonly string[]).includes(q.stage)) return bad;
    stage = q.stage as TrackingStage;
  }
  let limit = 25;
  if (q.limit !== undefined) {
    if (typeof q.limit !== 'string' || !/^[1-9][0-9]?$/.test(q.limit)) return bad;
    limit = Number(q.limit);
    if (limit > MAX_LIST_LIMIT) return bad;
  }
  let after: number | null = null;
  if (q.after !== undefined) {
    after = parsePathId(q.after);
    if (after === null) return bad;
  }
  return ok({ stage, limit, after });
};

/** Output validation: a record coming back from the database must have exactly this shape. */
export interface TrackingRecord {
  id: number; businessId: number; title: string; referenceNumber: string | null; issuerName: string | null;
  sourceUrl: string | null; sourceUrlVerified: false; closingAt: string | null; stage: TrackingStage;
  createdBy: number; updatedBy: number; createdAt: string; updatedAt: string; archivedAt: string | null;
}
const KEYS = ['id','businessId','title','referenceNumber','issuerName','sourceUrl','sourceUrlVerified','closingAt','stage','createdBy','updatedBy','createdAt','updatedAt','archivedAt'];
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const nullableString = (v: unknown): boolean => v === null || typeof v === 'string';

export const parseTrackingRecord = (v: unknown): Result<TrackingRecord> => {
  if (!isPlainObject(v)) return bad;
  const k = Object.keys(v);
  if (k.length !== KEYS.length || !KEYS.every(x => k.includes(x))) return bad;
  if (!posInt(v.id) || !posInt(v.businessId) || !posInt(v.createdBy) || !posInt(v.updatedBy)) return bad;
  if (typeof v.title !== 'string' || !nullableString(v.referenceNumber) || !nullableString(v.issuerName)
    || !nullableString(v.sourceUrl) || !nullableString(v.closingAt) || !nullableString(v.archivedAt)) return bad;
  if (v.sourceUrlVerified !== false) return bad;
  if (typeof v.stage !== 'string' || !(TRACKING_STAGES as readonly string[]).includes(v.stage)) return bad;
  if (typeof v.createdAt !== 'string' || typeof v.updatedAt !== 'string') return bad;
  if ((v.stage === 'archived') !== (v.archivedAt !== null)) return bad;
  return ok(v as unknown as TrackingRecord);
};

export const parseTrackingList = (v: unknown): Result<{ items: TrackingRecord[]; nextAfter: number | null }> => {
  if (!isPlainObject(v) || Object.keys(v).length !== 2 || !Array.isArray(v.items) || v.items.length > MAX_LIST_LIMIT) return bad;
  const items: TrackingRecord[] = [];
  for (const raw of v.items) {
    const r = parseTrackingRecord(raw);
    if (!r.ok) return bad;
    items.push(r.value);
  }
  if (v.nextAfter !== null && !posInt(v.nextAfter)) return bad;
  return ok({ items, nextAfter: v.nextAfter as number | null });
};

export const parseDeleteResult = (v: unknown): Result<{ id: number; businessId: number; deleted: true }> => {
  if (!isPlainObject(v) || Object.keys(v).length !== 3 || !posInt(v.id) || !posInt(v.businessId) || v.deleted !== true) return bad;
  return ok({ id: v.id, businessId: v.businessId, deleted: true });
};
