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
import type { QuoteService, QuoteStatus } from '../resources/quote/contracts';
import { dispatchConnectQuoteCapability, type ConnectQuoteDispatchInput } from '../integrations/connect/quote-adapter';
import { dispatchConnectEnquiryCapability, type ConnectEnquiryDispatchInput } from '../integrations/connect/enquiry-adapter';
import { dispatchConnectProjectCapability, type ConnectProjectDispatchInput } from '../integrations/connect/project-adapter';
import type { EnquiryService, EnquiryStatus, EnquiryUrgency } from '../resources/enquiry/contracts';
import type { ProjectService, ProjectUrgency } from '../resources/project/contracts';

export interface ConnectServiceHttpDependencies {
  readonly assertionService?: ConnectServiceAssertionService;
  readonly replayStore?: ConnectServiceAssertionReplayStore;
  readonly lifecycle?: ConnectIntegrationLifecycleRepository;
  readonly identity?: ConnectIdentityAdapter;
  readonly accounts?: AccountAuthStateStore;
  readonly savedBusinesses: SavedBusinessService;
  readonly customers: CustomerService;
  readonly quotes: QuoteService;
  readonly enquiries: EnquiryService;
  readonly projects: ProjectService;
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

const parseQuoteInput = (operation: ProductConsumerRequest['operation']['operation'], input: unknown): ConnectQuoteDispatchInput => {
  const objectInput = input === undefined ? {} : input;
  if (!objectInput || typeof objectInput !== 'object' || Array.isArray(objectInput)) throw new ConnectServiceHttpError('Invalid request', 400);
  const candidate = objectInput as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (operation === 'read') {
    if (keys.some(key => key !== 'quoteId')) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.quoteId !== undefined && (!Number.isSafeInteger(candidate.quoteId) || (candidate.quoteId as number) <= 0)) throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'quote.read', ...(candidate.quoteId !== undefined ? { quoteId: candidate.quoteId as number } : {}) };
  }
  if (operation === 'create') {
    if (keys.some(key => !['customerId', 'lineItems', 'followUpDate'].includes(key))) throw new ConnectServiceHttpError('Invalid request', 400);
    if (!Number.isSafeInteger(candidate.customerId) || (candidate.customerId as number) <= 0 || !Array.isArray(candidate.lineItems) || candidate.lineItems.length === 0 || typeof candidate.followUpDate !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'quote.create', customerId: candidate.customerId as number, lineItems: candidate.lineItems as ConnectQuoteDispatchInput & never, followUpDate: candidate.followUpDate };
  }
  if (operation === 'update') {
    if (keys.some(key => !['quoteId', 'status', 'notes'].includes(key))) throw new ConnectServiceHttpError('Invalid request', 400);
    if (!Number.isSafeInteger(candidate.quoteId) || (candidate.quoteId as number) <= 0) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.status !== undefined && !['active', 'won', 'lost'].includes(candidate.status as string)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.notes !== undefined && typeof candidate.notes !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.status === undefined && candidate.notes === undefined) throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'quote.update', quoteId: candidate.quoteId as number, ...(candidate.status !== undefined ? { status: candidate.status as QuoteStatus } : {}), ...(candidate.notes !== undefined ? { notes: candidate.notes as string } : {}) };
  }
  throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
};

const parseEnquiryInput = (operation: ProductConsumerRequest['operation']['operation'], input: unknown): ConnectEnquiryDispatchInput => {
  const objectInput = input === undefined ? {} : input;
  if (!objectInput || typeof objectInput !== 'object' || Array.isArray(objectInput)) throw new ConnectServiceHttpError('Invalid request', 400);
  const candidate = objectInput as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
  if (operation === 'read') {
    if (keys.some(key => !['enquiryId', 'businessId'].includes(key)) || (candidate.enquiryId !== undefined && !positive(candidate.enquiryId)) || (candidate.businessId !== undefined && !positive(candidate.businessId))) {
      throw new ConnectServiceHttpError('Invalid request', 400);
    }
    if (candidate.enquiryId === undefined && candidate.businessId === undefined) throw new ConnectServiceHttpError('Invalid request', 400);
    return {
      capability: 'enquiry.read',
      ...(candidate.enquiryId !== undefined ? { enquiryId: candidate.enquiryId as number } : {}),
      ...(candidate.businessId !== undefined ? { businessId: candidate.businessId as number } : {}),
    };
  }
  if (operation === 'create') {
    const allowed = ['businessId', 'customerName', 'customerPhone', 'customerEmail', 'project', 'description', 'city', 'budgetMin', 'budgetMax', 'urgency', 'source'];
    if (keys.some(key => !allowed.includes(key)) || !positive(candidate.businessId) || typeof candidate.customerName !== 'string' || typeof candidate.project !== 'string' || typeof candidate.description !== 'string') {
      throw new ConnectServiceHttpError('Invalid request', 400);
    }
    if (candidate.customerPhone !== undefined && candidate.customerPhone !== null && typeof candidate.customerPhone !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.customerEmail !== undefined && candidate.customerEmail !== null && typeof candidate.customerEmail !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.city !== undefined && candidate.city !== null && typeof candidate.city !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.budgetMin !== undefined && candidate.budgetMin !== null && typeof candidate.budgetMin !== 'number') throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.budgetMax !== undefined && candidate.budgetMax !== null && typeof candidate.budgetMax !== 'number') throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.urgency !== undefined && !['standard', 'urgent', 'emergency'].includes(candidate.urgency as string)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.source !== undefined && candidate.source !== 'marketplace') throw new ConnectServiceHttpError('Invalid request', 400);
    return {
      capability: 'enquiry.create',
      input: {
        businessId: candidate.businessId as number,
        customerName: candidate.customerName as string,
        ...(candidate.customerPhone !== undefined ? { customerPhone: candidate.customerPhone as string | null } : {}),
        ...(candidate.customerEmail !== undefined ? { customerEmail: candidate.customerEmail as string | null } : {}),
        project: candidate.project as string,
        description: candidate.description as string,
        ...(candidate.city !== undefined ? { city: candidate.city as string | null } : {}),
        ...(candidate.budgetMin !== undefined ? { budgetMin: candidate.budgetMin as number | null } : {}),
        ...(candidate.budgetMax !== undefined ? { budgetMax: candidate.budgetMax as number | null } : {}),
        ...(candidate.urgency !== undefined ? { urgency: candidate.urgency as EnquiryUrgency } : {}),
        ...(candidate.source !== undefined ? { source: 'marketplace' as const } : {}),
      },
    };
  }
  if (operation === 'update') {
    if (keys.some(key => !['enquiryId', 'status'].includes(key)) || !positive(candidate.enquiryId) || !['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'archived'].includes(candidate.status as string)) {
      throw new ConnectServiceHttpError('Invalid request', 400);
    }
    return { capability: 'enquiry.update', enquiryId: candidate.enquiryId as number, status: candidate.status as EnquiryStatus };
  }
  throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
};

const parseProjectInput = (operation: ProductConsumerRequest['operation']['operation'], input: unknown): ConnectProjectDispatchInput => {
  const objectInput = input === undefined ? {} : input;
  if (!objectInput || typeof objectInput !== 'object' || Array.isArray(objectInput)) throw new ConnectServiceHttpError('Invalid request', 400);
  const candidate = objectInput as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
  const fields = ['title','description','category','province','city','budgetMin','budgetMax','urgency'];
  const validateFields = (source: Record<string, unknown>) => {
    if (Object.keys(source).some(key => !fields.includes(key))) throw new ConnectServiceHttpError('Invalid request', 400);
    for (const field of ['title','description','category','province','city']) if (source[field] !== undefined && typeof source[field] !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    if (source.budgetMin !== undefined && source.budgetMin !== null && (typeof source.budgetMin !== 'number' || !Number.isFinite(source.budgetMin))) throw new ConnectServiceHttpError('Invalid request', 400);
    if (source.budgetMax !== undefined && source.budgetMax !== null && (typeof source.budgetMax !== 'number' || !Number.isFinite(source.budgetMax))) throw new ConnectServiceHttpError('Invalid request', 400);
    if (source.urgency !== undefined && !['standard','urgent','emergency'].includes(source.urgency as string)) throw new ConnectServiceHttpError('Invalid request', 400);
  };
  if (operation === 'read') {
    if (keys.length !== 1 || keys[0] !== 'projectId' || !positive(candidate.projectId)) throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'project.read', projectId: candidate.projectId as number };
  }
  if (operation === 'create') {
    validateFields(candidate);
    if (typeof candidate.title !== 'string' || typeof candidate.description !== 'string' || typeof candidate.category !== 'string' || typeof candidate.province !== 'string' || typeof candidate.city !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'project.create', input: { title: candidate.title, description: candidate.description, category: candidate.category, province: candidate.province, city: candidate.city, ...(candidate.budgetMin !== undefined ? { budgetMin: candidate.budgetMin as number | null } : {}), ...(candidate.budgetMax !== undefined ? { budgetMax: candidate.budgetMax as number | null } : {}), ...(candidate.urgency !== undefined ? { urgency: candidate.urgency as ProjectUrgency } : {}) } };
  }
  if (operation === 'update') {
    if (!positive(candidate.projectId)) throw new ConnectServiceHttpError('Invalid request', 400);
    const update = { ...candidate };
    delete update.projectId;
    if (Object.keys(update).length === 0) throw new ConnectServiceHttpError('Invalid request', 400);
    validateFields(update);
    return { capability: 'project.update', projectId: candidate.projectId as number, input: update as never };
  }
  throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
};

const sendError = (error: unknown, res: Response): void => {
  if (error instanceof ConnectServiceHttpError) { res.status(error.status).json({ error: error.status === 401 ? 'unauthorized' : error.status === 403 ? 'forbidden' : 'invalid_request' }); return; }
  if (error instanceof Error && (error.name === 'ConnectServiceAssertionError' || error.name === 'ConnectServiceAssertionReplayError' || error.name === 'ConnectIntegrationLifecycleError' || error.name === 'ConnectTrustedRequestContextError' || error.name === 'ConnectGovernedOperationResolutionError' || error.name === 'ConnectAuthorizationBindingError')) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (error instanceof Error && (error.name === 'ConnectResourceCapabilityDispatchError' || error.name === 'ConnectCustomerAdapterError' || error.name === 'ConnectQuoteAdapterError' || error.name === 'ConnectEnquiryAdapterError' || error.name === 'ConnectProjectAdapterError')) { res.status(403).json({ error: 'forbidden' }); return; }
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
      } else if (authorized.resource === 'quote') {
        result = await dispatchConnectQuoteCapability(authorized, parseQuoteInput(authorized.operation, parsed.input), { quotes: dependencies.quotes });
      } else if (authorized.resource === 'enquiry') {
        result = await dispatchConnectEnquiryCapability(authorized, parseEnquiryInput(authorized.operation, parsed.input), { enquiries: dependencies.enquiries });
      } else if (authorized.resource === 'project') {
        result = await dispatchConnectProjectCapability(authorized, parseProjectInput(authorized.operation, parsed.input), { projects: dependencies.projects });
      } else {
        throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
      }
      res.status(200).json({ result });
    } catch (error) { sendError(error, res); }
  });
};
