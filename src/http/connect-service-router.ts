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
import { parseProductConsumerRequest, ProductConsumerRequestError, type ProductConsumerRequest } from './product-consumer-contract';
import type { SavedBusinessService } from '../resources/saved-business/contracts';
import type { CustomerService, CustomerStatus } from '../resources/customer/contracts';
import { dispatchConnectCustomerCapability, type ConnectCustomerDispatchInput } from '../integrations/connect/customer-adapter';

export interface ConnectServiceHttpDependencies {
  readonly assertionService?: ConnectServiceAssertionService;
  readonly replayStore?: ConnectServiceAssertionReplayStore;
  readonly lifecycle?: ConnectIntegrationLifecycleRepository;
  readonly identity?: ConnectIdentityAdapter;
  readonly accounts?: AccountAuthStateStore;
  readonly savedBusinesses: SavedBusinessService;
  readonly customers: CustomerService;
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
const parseRequest = (body: unknown): ProductConsumerRequest & { externalIdentity: { provider: 'supabase'; subject: string } } => {
  let parsed: ProductConsumerRequest;
  try { parsed = parseProductConsumerRequest(body); }
  catch (error) { if (error instanceof ProductConsumerRequestError) throw new ConnectServiceHttpError('Invalid request', 400); throw error; }
  if (parsed.externalIdentity.provider !== 'supabase') throw new ConnectServiceHttpError('Invalid request', 400);
  return parsed as ProductConsumerRequest & { externalIdentity: { provider: 'supabase'; subject: string } };
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
const parseCustomerInput = (operation: ProductConsumerRequest['operation']['operation'], input: unknown): ConnectCustomerDispatchInput => {
  const objectInput = input === undefined ? {} : input;
  if (!objectInput || typeof objectInput !== 'object' || Array.isArray(objectInput)) throw new ConnectServiceHttpError('Invalid request', 400);
  const candidate = objectInput as Record<string, unknown>;
  const rejectUnknown = (allowed: string[]) => {
    if (Object.keys(candidate).some(key => !allowed.includes(key))) throw new ConnectServiceHttpError('Invalid request', 400);
  };
  if (operation === 'read') {
    rejectUnknown(['customerId', 'status']);
    if (candidate.customerId !== undefined && (!Number.isSafeInteger(candidate.customerId) || (candidate.customerId as number) <= 0)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.status !== undefined && candidate.status !== 'active' && candidate.status !== 'archived') throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'customer.read', ...(candidate.customerId !== undefined ? { customerId: candidate.customerId as number } : {}), ...(candidate.status !== undefined ? { status: candidate.status as CustomerStatus } : {}) };
  }
  if (operation === 'create') {
    rejectUnknown(['name', 'phone', 'email']);
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.phone !== undefined && candidate.phone !== null && typeof candidate.phone !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.email !== undefined && candidate.email !== null && typeof candidate.email !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'customer.create', name: candidate.name, ...(candidate.phone !== undefined ? { phone: candidate.phone as string | null } : {}), ...(candidate.email !== undefined ? { email: candidate.email as string | null } : {}) };
  }
  if (operation === 'update') {
    rejectUnknown(['customerId', 'status']);
    if (!Number.isSafeInteger(candidate.customerId) || (candidate.customerId as number) <= 0) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.status !== 'active' && candidate.status !== 'archived') throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'customer.update', customerId: candidate.customerId as number, status: candidate.status as CustomerStatus };
  }
  throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
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
      let result: unknown;
      if (authorized.resource === 'saved_business') {
        if (authorized.capability !== 'saved_business.read') throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
        result = await dispatchConnectResourceCapability(authorized, parseSavedBusinessReadInput(parsed.input), { savedBusinesses: dependencies.savedBusinesses });
      } else if (authorized.resource === 'customer') {
        result = await dispatchConnectCustomerCapability(authorized, parseCustomerInput(authorized.operation, parsed.input), { customers: dependencies.customers });
      } else {
        throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
      }
      res.status(200).json({ result });
    } catch (error) { sendError(error, res); }
  });
};
