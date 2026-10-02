import type { Express, Request, Response } from 'express';
import { PostgresAccountAuthStateStore, type AccountAuthStateStore } from '../auth/ghm-bearer';
import { PostgresAuthPersistence } from '../auth/foundation/persistence';
import { loadEs256Keys } from '../auth/foundation/es256-keys';
import { pool } from '../db/pool';
import { PostgresConnectIntegrationLifecycleRepository, type ConnectIntegrationLifecycleRepository } from '../integrations/connect/integration-lifecycle';
import { createConnectServiceAssertionService, type ConnectServiceAssertionService } from '../integrations/connect/service-assertion';
import { PostgresConnectServiceAssertionReplayStore, type ConnectServiceAssertionReplayStore, requireFreshConnectServiceAssertion } from '../integrations/connect/service-assertion-replay';
import { bindConnectAuthorization } from '../integrations/connect/authorization-binding';
import { resolveConnectGovernedOperation } from '../integrations/connect/governed-operation-resolution';
import { establishConnectTrustedRequestContext } from '../integrations/connect/trusted-request-context';
import { ConnectIdentityAdapterImpl, type ConnectIdentityAdapter } from '../integrations/connect/identity-adapter';
import { dispatchConnectResourceCapability } from '../integrations/connect/resource-capability-dispatch';
import type { Resource } from '../auth/authorization';
import type { ResourceOperation } from '../resources/registry';
import type { SavedBusinessService } from '../resources/saved-business/contracts';

export interface ConnectServiceHttpDependencies {
  readonly assertionService?: ConnectServiceAssertionService;
  readonly replayStore?: ConnectServiceAssertionReplayStore;
  readonly lifecycle?: ConnectIntegrationLifecycleRepository;
  readonly identity?: ConnectIdentityAdapter;
  readonly accounts?: AccountAuthStateStore;
  readonly savedBusinesses: SavedBusinessService;
}
export class ConnectServiceHttpError extends Error {
  constructor(message: string, readonly status = 401) { super(message); this.name = 'ConnectServiceHttpError'; }
}
const readBearer = (req: Request): string => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) throw new ConnectServiceHttpError('Authentication required');
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw new ConnectServiceHttpError('Authentication required');
  return token;
};
const parseRequest = (body: unknown): {
  operation: { resource: Resource; operation: ResourceOperation };
  externalIdentity: { provider: 'supabase'; subject: string };
  input: unknown;
} => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ConnectServiceHttpError('Invalid request', 400);
  const candidate = body as Record<string, unknown>;
  const operation = candidate.operation;
  const identity = candidate.externalIdentity;
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new ConnectServiceHttpError('Invalid request', 400);
  const op = operation as Record<string, unknown>;
  if (typeof op.resource !== 'string' || typeof op.operation !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) throw new ConnectServiceHttpError('Invalid request', 400);
  const ext = identity as Record<string, unknown>;
  if (ext.provider !== 'supabase' || typeof ext.subject !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
  return { operation: { resource: op.resource as Resource, operation: op.operation as ResourceOperation }, externalIdentity: { provider: 'supabase', subject: ext.subject }, input: candidate.input };
};
const parseSavedBusinessReadInput = (input: unknown): { capability: 'saved_business.read'; savedBusinessId?: number } => {
  if (input === undefined) return { capability: 'saved_business.read' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ConnectServiceHttpError('Invalid request', 400);
  const candidate = input as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => key !== 'savedBusinessId')) throw new ConnectServiceHttpError('Invalid request', 400);
  if (candidate.savedBusinessId === undefined) return { capability: 'saved_business.read' };
  if (!Number.isSafeInteger(candidate.savedBusinessId) || (candidate.savedBusinessId as number) <= 0) throw new ConnectServiceHttpError('Invalid request', 400);
  return { capability: 'saved_business.read', savedBusinessId: candidate.savedBusinessId as number };
};
const sendError = (error: unknown, res: Response): void => {
  if (error instanceof ConnectServiceHttpError) { res.status(error.status).json({ error: error.status === 401 ? 'unauthorized' : error.status === 403 ? 'forbidden' : 'invalid_request' }); return; }
  if (error instanceof Error && (error.name === 'ConnectServiceAssertionError' || error.name === 'ConnectServiceAssertionReplayError' || error.name === 'ConnectIntegrationLifecycleError' || error.name === 'ConnectTrustedRequestContextError' || error.name === 'ConnectGovernedOperationResolutionError' || error.name === 'ConnectAuthorizationBindingError')) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (error instanceof Error && error.name === 'ConnectResourceCapabilityDispatchError') { res.status(403).json({ error: 'forbidden' }); return; }
  console.error(JSON.stringify({ event: 'connect_service_request_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  res.status(500).json({ error: 'internal_error' });
};
const defaults = {
  assertionService: () => createConnectServiceAssertionService(loadEs256Keys()),
  replayStore: () => new PostgresConnectServiceAssertionReplayStore(pool),
  lifecycle: () => new PostgresConnectIntegrationLifecycleRepository(pool),
  identity: () => new ConnectIdentityAdapterImpl(new PostgresAuthPersistence()),
  accounts: () => new PostgresAccountAuthStateStore(pool),
};
export const registerConnectServiceRoutes = (app: Express, dependencies: ConnectServiceHttpDependencies): void => {
  app.post('/api/v1/connect/service', async (req: Request, res: Response) => {
    try {
      if (req.header('origin')) throw new ConnectServiceHttpError('Browser-originated requests are not permitted');
      const parsed = parseRequest(req.body);
      const verified = (dependencies.assertionService ?? defaults.assertionService()).verify(readBearer(req));
      await requireFreshConnectServiceAssertion(dependencies.replayStore ?? defaults.replayStore(), verified.requestId, verified.integrationId, new Date(verified.claims.exp * 1000));
      const trusted = await establishConnectTrustedRequestContext(verified, parsed, dependencies.lifecycle ?? defaults.lifecycle());
      const governed = resolveConnectGovernedOperation(trusted);
      const authorized = await bindConnectAuthorization(trusted, governed, { identity: dependencies.identity ?? defaults.identity(), accounts: dependencies.accounts ?? defaults.accounts() });
      if (authorized.capability !== 'saved_business.read') throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
      const result = await dispatchConnectResourceCapability(authorized, parseSavedBusinessReadInput(parsed.input), { savedBusinesses: dependencies.savedBusinesses });
      res.status(200).json({ result });
    } catch (error) { sendError(error, res); }
  });
};
