import type { Express, Request, Response, RequestHandler } from 'express';
import type { Pool } from 'pg';
import { rateLimit } from 'express-rate-limit';

type LegalDocumentRow = {
  document_key: string;
  title: string;
  is_required: boolean;
  version_id: string | number;
  version_label: string;
  content_markdown: string;
  content_sha256: string;
  effective_at: Date | string;
  accepted_at: Date | string | null;
};

type LegalAcceptanceRow = {
  acceptance_id: string | number;
  account_id: string | number;
  document_version_id: string | number;
  document_sha256: string;
  accepted_at: Date | string;
  acceptance_channel: string;
};

const positiveId = (value: unknown): number | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value);
  if (!/^[1-9]\\d*$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const registerQuoteFlowLegalRoutes = (
  app: Express,
  pool: Pick<Pool, 'query'>,
  requireAuth: RequestHandler,
): void => {
  const acceptRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'rate_limited' }),
  });

  app.get('/api/v1/quoteflow/legal/documents/current', requireAuth, async (req: Request, res: Response) => {
    try {
      const accountId = req.authContext?.userId;
      if (!Number.isSafeInteger(accountId) || (accountId ?? 0) <= 0) {
        res.status(401).json({ error: 'authentication_required' });
        return;
      }
      const result = await pool.query<LegalDocumentRow>(
        'SELECT * FROM ghm.quoteflow_legal_current_documents($1)',
        [accountId],
      );
      if (result.rows.length === 0) {
        // An empty catalogue must never be interpreted by a client as acceptance.
        res.status(503).json({ error: 'legal_documents_unavailable' });
        return;
      }
      res.status(200).json({
        documents: result.rows.map(row => ({
          documentKey: row.document_key,
          title: row.title,
          required: row.is_required,
          versionId: Number(row.version_id),
          version: row.version_label,
          content: row.content_markdown,
          sha256: row.content_sha256,
          effectiveAt: row.effective_at,
          acceptedAt: row.accepted_at,
          accepted: row.accepted_at !== null,
        })),
      });
    } catch {
      res.status(503).json({ error: 'legal_documents_unavailable' });
    }
  });

  app.post('/api/v1/quoteflow/legal/acceptances', requireAuth, acceptRateLimit, async (req: Request, res: Response) => {
    try {
      const accountId = req.authContext?.userId;
      if (!Number.isSafeInteger(accountId) || (accountId ?? 0) <= 0) {
        res.status(401).json({ error: 'authentication_required' });
        return;
      }
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const allowed = new Set(['versionId', 'accepted', 'channel']);
      if (Object.keys(body).some(key => !allowed.has(key))
        || body.accepted !== true
        || positiveId(body.versionId) === null
        || (body.channel !== undefined && body.channel !== 'quoteflow_android' && body.channel !== 'quoteflow_web')) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const result = await pool.query<LegalAcceptanceRow>(
        'SELECT * FROM ghm.quoteflow_legal_accept($1, $2, $3)',
        [accountId, positiveId(body.versionId), body.channel ?? 'quoteflow_android'],
      );
      const row = result.rows[0];
      if (!row) {
        res.status(503).json({ error: 'legal_acceptance_unavailable' });
        return;
      }
      res.status(201).json({
        acceptance: {
          id: Number(row.acceptance_id),
          accountId: Number(row.account_id),
          versionId: Number(row.document_version_id),
          sha256: row.document_sha256,
          acceptedAt: row.accepted_at,
          channel: row.acceptance_channel,
        },
      });
    } catch {
      // Do not disclose whether an account or document version exists.
      res.status(409).json({ error: 'legal_version_not_current' });
    }
  });
};
