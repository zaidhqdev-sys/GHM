import type { Express, Request, Response } from 'express';
import { loadEs256Keys } from '../auth/foundation/es256-keys';
import { PostgresAccountAuthStateStore, type AccountAuthStateStore } from '../auth/ghm-bearer';
import { pool } from '../db/pool';
import { PostgresConnectIntegrationLifecycleRepository, requireActiveConnectIntegration } from '../integrations/connect/integration-lifecycle';
import { createConnectServiceAssertionService } from '../integrations/connect/service-assertion';
import { ConnectIdentityAdapterImpl } from '../integrations/connect/identity-adapter';
import { PostgresAuthPersistence } from '../auth/foundation/persistence';
import { PostgresConnectServiceAssertionReplayStore, requireFreshConnectServiceAssertion } from '../integrations/connect/service-assertion-replay';
import { PostgresCommercialProviderBoundary } from '../resources/commercial/provider-boundary';
import { DefaultCommercialService } from '../resources/commercial/service';
import { PostgresCommercialRepository } from '../resources/commercial/repository';
import type { ApplyCommercialPaymentResultInput } from '../resources/commercial/contracts';
import type { CommercialProviderBoundary } from '../resources/commercial/contracts';
import { PayfastHttpBoundary } from '../resources/commercial/payfast-http';

export const resolveCommercialPaymentActor = async (
  accountId: number,
  accounts: AccountAuthStateStore,
): Promise<{ userId: number; role: 'admin' | 'customer' | 'business' } | null> => {
  const state = await accounts.getAccountAuthState(accountId);
  if (!state || state.accountStatus !== 'active') return null;
  return { userId: state.accountId, role: state.role };
};

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
    || kind !== 'payment'
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

const parsePrepareInput = (body: unknown): { businessId: number; externalIdentity: { provider: 'supabase'; subject: string }; countryId: number | null; idempotencyKey: string; expiresAt: Date | null } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const positive = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
  const uuid = (v: unknown): v is string =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim());
  const opaque = (v: unknown): v is string =>
    typeof v === 'string' &&
    v.trim().length >= 8 &&
    v.trim().length <= 200 &&
    /^[!-~]+$/.test(v.trim());

  if (
    !positive(b.businessId) ||
    !b.externalIdentity ||
    typeof b.externalIdentity !== 'object' ||
    Array.isArray(b.externalIdentity) ||
    (b.externalIdentity as Record<string, unknown>).provider !== 'supabase' ||
    !uuid((b.externalIdentity as Record<string, unknown>).subject) ||
    (b.countryId !== undefined && b.countryId !== null && !positive(b.countryId)) ||
    !opaque(b.idempotencyKey)
  ) return null;

  let expiresAt: Date | null = null;
  if (b.expiresAt !== undefined && b.expiresAt !== null) {
    if (typeof b.expiresAt !== 'string') return null;
    const parsed = new Date(b.expiresAt);
    if (Number.isNaN(parsed.getTime())) return null;
    expiresAt = parsed;
  }

  const identity = b.externalIdentity as Record<string, unknown>;
  return {
    businessId: b.businessId,
    externalIdentity: {
      provider: 'supabase',
      subject: (identity.subject as string).trim().toLowerCase(),
    },
    countryId: b.countryId === null || b.countryId === undefined ? null : b.countryId,
    idempotencyKey: b.idempotencyKey.trim(),
    expiresAt,
  };
};

export type PayfastHttpRouteBoundary = {
  createCheckout: PayfastHttpBoundary['createCheckout'];
  handleItn: (
    fields: Readonly<Record<string, string>>,
    sourceIp: string,
  ) => Promise<unknown>;
};

export const registerCommercialInternalRoutes = (
  app: Express,
  providerBoundary: CommercialProviderBoundary = new PostgresCommercialProviderBoundary(),
  payfastHttpBoundary?: PayfastHttpRouteBoundary,
): void => {
  const replayStore = new PostgresConnectServiceAssertionReplayStore(pool);
  const lifecycle = new PostgresConnectIntegrationLifecycleRepository(pool);
  app.post('/api/v1/internal/commercial/payment-prepare', async (req: Request, res: Response) => {
    try {
      if (req.header('origin')) throw new CommercialInternalHttpError('Browser-originated requests are not permitted');
      const token = readBearer(req);
      const assertionService = createConnectServiceAssertionService(loadEs256Keys());
      const verified = assertionService.verify(token);
      await requireFreshConnectServiceAssertion(replayStore, verified.requestId, verified.integrationId, new Date(verified.claims.exp * 1000));
      await requireActiveConnectIntegration(lifecycle, verified.integrationId);
      const input = parsePrepareInput(req.body);
      if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
      const identityAdapter = new ConnectIdentityAdapterImpl(new PostgresAuthPersistence(pool));
      const identity = await identityAdapter.resolve(input.externalIdentity.subject, { allowBootstrap: false });
      if (identity.outcome !== 'resolved') {
        res.status(409).json({ error: 'commercial_conflict' });
        return;
      }

      const actor = await resolveCommercialPaymentActor(identity.mapping.accountId, new PostgresAccountAuthStateStore(pool));
      if (!actor) {
        res.status(409).json({ error: 'commercial_conflict' });
        return;
      }

      const service = new DefaultCommercialService(new PostgresCommercialRepository());
      const paymentAttempt = await service.prepareCommercialPayment(
        actor,
        {
          businessId: input.businessId,
          countryId: input.countryId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: input.expiresAt,
        },
      );
      res.status(200).json({ paymentAttempt });
    } catch (error) {
      if (error instanceof CommercialInternalHttpError) { res.status(error.status).json({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }); return; }
      if (error instanceof Error && /permission required|not found|idempotency conflict|eligible commercial|subscription required/i.test(error.message)) { res.status(409).json({ error: 'commercial_conflict' }); return; }
      console.error(JSON.stringify({ event: 'commercial_internal_payment_prepare_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
      res.status(500).json({ error: 'internal_error' });
    }
  });

  const payfastBoundary = payfastHttpBoundary ?? new PayfastHttpBoundary(pool, providerBoundary);

  app.get('/api/v1/internal/commercial/payfast/checkout/:paymentAttemptId', async (req: Request, res: Response) => {
    try {
      if (req.header('origin')) throw new CommercialInternalHttpError('Browser-originated requests are not permitted');
      const token = readBearer(req);
      const assertionService = createConnectServiceAssertionService(loadEs256Keys());
      const verified = assertionService.verify(token);
      await requireFreshConnectServiceAssertion(replayStore, verified.requestId, verified.integrationId, new Date(verified.claims.exp * 1000));
      await requireActiveConnectIntegration(lifecycle, verified.integrationId);
      const checkout = await payfastBoundary.createCheckout(req.params.paymentAttemptId);
      res.status(200).json({ checkout });
    } catch (error) {
      if (error instanceof CommercialInternalHttpError) { res.status(error.status).json({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }); return; }
      if (error instanceof Error && /not found|not payable|requires ZAR|not configured/i.test(error.message)) { res.status(409).json({ error: 'commercial_conflict' }); return; }
      console.error(JSON.stringify({ event: 'payfast_checkout_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/v1/commercial/payfast/itn', require('express').urlencoded({ extended: false, limit: '64kb' }), async (req: Request, res: Response) => {
    try {
      const sourceIp = req.ip ?? req.socket.remoteAddress ?? '';
      const fields = Object.fromEntries(Object.entries(req.body ?? {}).map(([key, value]) => [key, Array.isArray(value) ? String(value[0]) : String(value ?? '')]));
      await payfastBoundary.handleItn(fields, sourceIp);
      res.status(200).send('OK');
    } catch (error) {
      if (error instanceof Error && /Payfast|not found|not payable/i.test(error.message)) { res.status(400).send('INVALID'); return; }
      console.error(JSON.stringify({ event: 'payfast_itn_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
      res.status(500).send('ERROR');
    }
  });

  app.post('/api/v1/internal/commercial/payment-result', async (req: Request, res: Response) => {
    try {
      if (req.header('origin')) throw new CommercialInternalHttpError('Browser-originated requests are not permitted');
      const token = readBearer(req);
      const assertionService = createConnectServiceAssertionService(loadEs256Keys());
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
