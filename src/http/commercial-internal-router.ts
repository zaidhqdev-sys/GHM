import type { Express, Request, Response } from 'express';
import { PostgresAccountAuthStateStore } from '../auth/ghm-bearer';
import { loadEs256Keys } from '../auth/foundation/es256-keys';
import { pool } from '../db/pool';
import { PostgresConnectIntegrationLifecycleRepository } from '../integrations/connect/integration-lifecycle';
import { createConnectServiceAssertionService } from '../integrations/connect/service-assertion';
import { PostgresConnectServiceAssertionReplayStore, requireFreshConnectServiceAssertion } from '../integrations/connect/service-assertion-replay';
import { requireActiveConnectIntegration } from '../integrations/connect/integration-lifecycle';
import { PostgresCommercialProviderBoundary } from '../resources/commercial/provider-boundary';
import type { ApplyCommercialPaymentResultInput } from '../resources/commercial/contracts';
import type { CommercialProviderBoundary } from '../resources/commercial/contracts';

class CommercialInternalHttpError extends Error {
  constructor(message: string, readonly status = 401) { super(message); this.name = 'CommercialInternalHttpError'; }
}

const readBearer = (req: Request): string => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) throw new CommercialInternalHttpError('Authentication required');
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw new CommercialInternalHttpError('Authentication required');
  return token;
};

const parseInput = (body: unknown): ApplyCommercialPaymentResultInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const positive = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
  const opaque = (v: unknown): v is string => typeof v === 'string' && /^[!-~]{1,200}$/.test(v);
  const hash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
  const status = b.transactionStatus;
  const kind = b.transactionKind;
  if (!positive(b.paymentAttemptId) || !opaque(b.providerCode) || !opaque(b.externalProviderEventId)
    || !opaque(b.providerEventType) || !hash(b.providerPayloadHash)
    || !['payment','refund','reversal','chargeback'].includes(kind as string)
    || !['pending','succeeded','failed'].includes(status as string)
    || typeof b.occurredAt !== 'string' || Number.isNaN(Date.parse(b.occurredAt as string))) return null;
  if (b.providerTransactionReference !== undefined && b.providerTransactionReference !== null && !opaque(b.providerTransactionReference)) return null;
  if (b.metadata !== undefined && (!b.metadata || typeof b.metadata !== 'object' || Array.isArray(b.metadata))) return null;
  return {
    paymentAttemptId: b.paymentAttemptId as number,
    providerCode: b.providerCode as string,
    externalProviderEventId: b.externalProviderEventId as string,
    providerEventType: b.providerEventType as string,
    providerPayloadHash: b.providerPayloadHash as string,
    transactionKind: kind as ApplyCommercialPaymentResultInput['transactionKind'],
    transactionStatus: status as ApplyCommercialPaymentResultInput['transactionStatus'],
    providerTransactionReference: b.providerTransactionReference as string | null | undefined,
    occurredAt: new Date(b.occurredAt as string),
    metadata: b.metadata as Record<string, unknown> | undefined,
  };
};

export const registerCommercialInternalRoutes = (
  app: Express,
  providerBoundary: CommercialProviderBoundary = new PostgresCommercialProviderBoundary(),
): void => {
  const assertionService = createConnectServiceAssertionService(loadEs256Keys());
  const replayStore = new PostgresConnectServiceAssertionReplayStore(pool);
  const lifecycle = new PostgresConnectIntegrationLifecycleRepository(pool);
  app.post('/api/v1/internal/commercial/payment-result', async (req: Request, res: Response) => {
    try {
      if (req.header('origin')) throw new CommercialInternalHttpError('Browser-originated requests are not permitted');
      const token = readBearer(req);
      const verified = assertionService.verify(token);
      await requireFreshConnectServiceAssertion(replayStore, verified.requestId, verified.integrationId, new Date(verified.claims.exp * 1000));
      await requireActiveConnectIntegration(lifecycle, verified.integrationId);
      const input = parseInput(req.body);
      if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
      const transaction = await providerBoundary.applyCommercialPaymentResult(input);
      res.status(200).json({ transaction });
    } catch (error) {
      if (error instanceof CommercialInternalHttpError) { res.status(error.status).json({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }); return; }
      if (error instanceof Error && /not found|invalid commercial payment result input|payload hash conflict|has no subscription/i.test(error.message)) {
        res.status(409).json({ error: 'commercial_conflict' });
        return;
      }
      console.error(JSON.stringify({ event: 'commercial_internal_payment_result_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
      res.status(500).json({ error: 'internal_error' });
    }
  });
};
