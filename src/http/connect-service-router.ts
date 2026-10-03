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
import { dispatchConnectOpportunityCapability, type ConnectOpportunityDispatchInput } from '../integrations/connect/opportunity-adapter';
import { dispatchConnectOpportunityParticipantCapability, type ConnectOpportunityParticipantDispatchInput } from '../integrations/connect/opportunity-participant-adapter';
import { dispatchConnectProjectQuoteCapability, type ConnectProjectQuoteDispatchInput } from '../integrations/connect/project-quote-adapter';
import type { EnquiryService, EnquiryStatus, EnquiryUrgency } from '../resources/enquiry/contracts';
import type { ProjectService, ProjectUrgency, UpdateProjectInput } from '../resources/project/contracts';
import type { OpportunityService, OpportunityLifecycleStatus, OpportunityVisibility, CreateOpportunityInput, UpdateOpportunityInput } from '../resources/opportunity/contracts';
import type { OpportunityParticipantService, ParticipationRole, ParticipationStatus, CreateOpportunityParticipantInput, UpdateOpportunityParticipantInput } from '../resources/opportunity-participant/contracts';
import type { ProjectQuoteService, CreateProjectQuoteInput, UpdateProjectQuoteInput } from '../resources/project-quote/contracts';

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
  readonly opportunities: OpportunityService;
  readonly opportunityParticipants: OpportunityParticipantService;
  readonly projectQuotes: ProjectQuoteService;
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
const parseOpportunityInput = (operation: ProductConsumerRequest['operation']['operation'], input: unknown): ConnectOpportunityDispatchInput => {
  const objectInput = input === undefined ? {} : input;
  if (!objectInput || typeof objectInput !== 'object' || Array.isArray(objectInput)) throw new ConnectServiceHttpError('Invalid request', 400);
  const candidate = objectInput as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
  if (operation === 'read') {
    if (keys.length !== 1 || !positive(candidate.opportunityId)) throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'opportunity.read', opportunityId: candidate.opportunityId as number };
  }
  if (operation === 'create') {
    const allowed = ['opportunityTypeId','ownerBusinessId','countryId','currencyId','title','description','visibility','budgetMin','budgetMax','opensAt','closesAt'];
    if (keys.some(key => !allowed.includes(key)) || !positive(candidate.opportunityTypeId) || typeof candidate.title !== 'string' || !candidate.title.trim() || typeof candidate.description !== 'string' || !candidate.description.trim()) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.ownerBusinessId !== undefined && candidate.ownerBusinessId !== null && !positive(candidate.ownerBusinessId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.countryId !== undefined && candidate.countryId !== null && !positive(candidate.countryId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.currencyId !== undefined && candidate.currencyId !== null && !positive(candidate.currencyId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.visibility !== undefined && !['private','participants','authenticated','public'].includes(candidate.visibility as string)) throw new ConnectServiceHttpError('Invalid request', 400);
    for (const key of ['budgetMin','budgetMax']) if (candidate[key] !== undefined && candidate[key] !== null && (typeof candidate[key] !== 'number' || !Number.isFinite(candidate[key] as number) || (candidate[key] as number) < 0)) throw new ConnectServiceHttpError('Invalid request', 400);
    for (const key of ['opensAt','closesAt']) if (candidate[key] !== undefined && candidate[key] !== null && (typeof candidate[key] !== 'string' || Number.isNaN(Date.parse(candidate[key] as string)))) throw new ConnectServiceHttpError('Invalid request', 400);
    const input: CreateOpportunityInput = {
      opportunityTypeId: candidate.opportunityTypeId as number,
      ...(candidate.ownerBusinessId !== undefined ? { ownerBusinessId: candidate.ownerBusinessId as number | null } : {}),
      ...(candidate.countryId !== undefined ? { countryId: candidate.countryId as number | null } : {}),
      ...(candidate.currencyId !== undefined ? { currencyId: candidate.currencyId as number | null } : {}),
      title: candidate.title as string, description: candidate.description as string,
      ...(candidate.visibility !== undefined ? { visibility: candidate.visibility as OpportunityVisibility } : {}),
      ...(candidate.budgetMin !== undefined ? { budgetMin: candidate.budgetMin as number | null } : {}),
      ...(candidate.budgetMax !== undefined ? { budgetMax: candidate.budgetMax as number | null } : {}),
      ...(candidate.opensAt !== undefined ? { opensAt: candidate.opensAt === null ? null : new Date(candidate.opensAt as string) } : {}),
      ...(candidate.closesAt !== undefined ? { closesAt: candidate.closesAt === null ? null : new Date(candidate.closesAt as string) } : {}),
    };
    return { capability: 'opportunity.create', input };
  }
  if (operation === 'update') {
    if (!positive(candidate.opportunityId)) throw new ConnectServiceHttpError('Invalid request', 400);
    const allowed = ['opportunityId','opportunityTypeId','ownerBusinessId','countryId','currencyId','title','description','visibility','budgetMin','budgetMax','opensAt','closesAt'];
    if (keys.some(key => !allowed.includes(key)) || keys.length < 2) throw new ConnectServiceHttpError('Invalid request', 400);
    const input: UpdateOpportunityInput = {};
    if (candidate.opportunityTypeId !== undefined && !positive(candidate.opportunityTypeId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.ownerBusinessId !== undefined && candidate.ownerBusinessId !== null && !positive(candidate.ownerBusinessId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.countryId !== undefined && candidate.countryId !== null && !positive(candidate.countryId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.currencyId !== undefined && candidate.currencyId !== null && !positive(candidate.currencyId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.title !== undefined && (typeof candidate.title !== 'string' || !candidate.title.trim())) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.description !== undefined && (typeof candidate.description !== 'string' || !candidate.description.trim())) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.visibility !== undefined && !['private','participants','authenticated','public'].includes(candidate.visibility as string)) throw new ConnectServiceHttpError('Invalid request', 400);
    for (const key of ['budgetMin','budgetMax']) if (candidate[key] !== undefined && candidate[key] !== null && (typeof candidate[key] !== 'number' || !Number.isFinite(candidate[key] as number) || (candidate[key] as number) < 0)) throw new ConnectServiceHttpError('Invalid request', 400);
    for (const key of ['opensAt','closesAt']) if (candidate[key] !== undefined && candidate[key] !== null && (typeof candidate[key] !== 'string' || Number.isNaN(Date.parse(candidate[key] as string)))) throw new ConnectServiceHttpError('Invalid request', 400);
    Object.assign(input, {
      ...(candidate.opportunityTypeId !== undefined ? { opportunityTypeId: candidate.opportunityTypeId as number } : {}),
      ...(candidate.ownerBusinessId !== undefined ? { ownerBusinessId: candidate.ownerBusinessId as number | null } : {}),
      ...(candidate.countryId !== undefined ? { countryId: candidate.countryId as number | null } : {}),
      ...(candidate.currencyId !== undefined ? { currencyId: candidate.currencyId as number | null } : {}),
      ...(candidate.title !== undefined ? { title: candidate.title as string } : {}),
      ...(candidate.description !== undefined ? { description: candidate.description as string } : {}),
      ...(candidate.visibility !== undefined ? { visibility: candidate.visibility as OpportunityVisibility } : {}),
      ...(candidate.budgetMin !== undefined ? { budgetMin: candidate.budgetMin as number | null } : {}),
      ...(candidate.budgetMax !== undefined ? { budgetMax: candidate.budgetMax as number | null } : {}),
      ...(candidate.opensAt !== undefined ? { opensAt: candidate.opensAt === null ? null : new Date(candidate.opensAt as string) } : {}),
      ...(candidate.closesAt !== undefined ? { closesAt: candidate.closesAt === null ? null : new Date(candidate.closesAt as string) } : {}),
    });
    return { capability: 'opportunity.update', opportunityId: candidate.opportunityId as number, input };
  }
  if (operation === 'transition') {
    if (keys.length !== 2 || !positive(candidate.opportunityId) || !['draft','open','responding','evaluating','awarded','in_progress','completed','cancelled','archived'].includes(candidate.nextStatus as string)) throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'opportunity.transition', opportunityId: candidate.opportunityId as number, nextStatus: candidate.nextStatus as OpportunityLifecycleStatus };
  }
  throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
};

const parseProjectQuoteInput = (operation: ProductConsumerRequest['operation']['operation'], input: unknown): ConnectProjectQuoteDispatchInput => {
  const objectInput = input === undefined ? {} : input;
  if (!objectInput || typeof objectInput !== 'object' || Array.isArray(objectInput)) throw new ConnectServiceHttpError('Invalid request', 400);
  const candidate = objectInput as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

  if (operation === 'readReceived') {
    if (keys.length !== 1 || !positive(candidate.projectId)) throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'project_quote.readReceived', projectId: candidate.projectId as number };
  }
  if (operation === 'readOwn') {
    if (keys.length !== 1 || !positive(candidate.businessId)) throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: 'project_quote.readOwn', businessId: candidate.businessId as number };
  }
  if (operation === 'create') {
    const allowed = ['projectId','businessId','amount','labourMin','labourMax','materialsMin','materialsMax','totalMin','totalMax','durationDays','description'];
    if (keys.some(key => !allowed.includes(key)) || !positive(candidate.projectId) || !positive(candidate.businessId) || typeof candidate.amount !== 'number' || !Number.isFinite(candidate.amount)) throw new ConnectServiceHttpError('Invalid request', 400);
    for (const key of ['labourMin','labourMax','materialsMin','materialsMax','totalMin','totalMax']) {
      if (candidate[key] !== undefined && candidate[key] !== null && (typeof candidate[key] !== 'number' || !Number.isFinite(candidate[key] as number))) throw new ConnectServiceHttpError('Invalid request', 400);
    }
    if (candidate.durationDays !== undefined && candidate.durationDays !== null && (!Number.isSafeInteger(candidate.durationDays) || (candidate.durationDays as number) < 1)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.description !== undefined && candidate.description !== null && typeof candidate.description !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    return {
      capability: 'project_quote.create',
      input: {
        projectId: candidate.projectId as number,
        businessId: candidate.businessId as number,
        amount: candidate.amount as number,
        ...(candidate.labourMin !== undefined ? { labourMin: candidate.labourMin as number | null } : {}),
        ...(candidate.labourMax !== undefined ? { labourMax: candidate.labourMax as number | null } : {}),
        ...(candidate.materialsMin !== undefined ? { materialsMin: candidate.materialsMin as number | null } : {}),
        ...(candidate.materialsMax !== undefined ? { materialsMax: candidate.materialsMax as number | null } : {}),
        ...(candidate.totalMin !== undefined ? { totalMin: candidate.totalMin as number | null } : {}),
        ...(candidate.totalMax !== undefined ? { totalMax: candidate.totalMax as number | null } : {}),
        ...(candidate.durationDays !== undefined ? { durationDays: candidate.durationDays as number | null } : {}),
        ...(candidate.description !== undefined ? { description: candidate.description as string | null } : {}),
      } satisfies CreateProjectQuoteInput,
    };
  }
  if (operation === 'update') {
    if (!positive(candidate.quoteId)) throw new ConnectServiceHttpError('Invalid request', 400);
    const allowed = ['quoteId','amount','labourMin','labourMax','materialsMin','materialsMax','totalMin','totalMax','durationDays','description'];
    if (keys.length < 2 || keys.some(key => !allowed.includes(key))) throw new ConnectServiceHttpError('Invalid request', 400);
    for (const key of ['amount','labourMin','labourMax','materialsMin','materialsMax','totalMin','totalMax']) {
      if (candidate[key] !== undefined && candidate[key] !== null && (typeof candidate[key] !== 'number' || !Number.isFinite(candidate[key] as number))) throw new ConnectServiceHttpError('Invalid request', 400);
    }
    if (candidate.durationDays !== undefined && candidate.durationDays !== null && !Number.isSafeInteger(candidate.durationDays)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.description !== undefined && candidate.description !== null && typeof candidate.description !== 'string') throw new ConnectServiceHttpError('Invalid request', 400);
    const update: UpdateProjectQuoteInput = {};
    Object.assign(update, {
      ...(candidate.amount !== undefined ? { amount: candidate.amount as number } : {}),
      ...(candidate.labourMin !== undefined ? { labourMin: candidate.labourMin as number | null } : {}),
      ...(candidate.labourMax !== undefined ? { labourMax: candidate.labourMax as number | null } : {}),
      ...(candidate.materialsMin !== undefined ? { materialsMin: candidate.materialsMin as number | null } : {}),
      ...(candidate.materialsMax !== undefined ? { materialsMax: candidate.materialsMax as number | null } : {}),
      ...(candidate.totalMin !== undefined ? { totalMin: candidate.totalMin as number | null } : {}),
      ...(candidate.totalMax !== undefined ? { totalMax: candidate.totalMax as number | null } : {}),
      ...(candidate.durationDays !== undefined ? { durationDays: candidate.durationDays as number | null } : {}),
      ...(candidate.description !== undefined ? { description: candidate.description as string | null } : {}),
    });
    return { capability: 'project_quote.update', quoteId: candidate.quoteId as number, input: update };
  }
  if (operation === 'accept' || operation === 'reject') {
    if (keys.length !== 1 || !positive(candidate.quoteId)) throw new ConnectServiceHttpError('Invalid request', 400);
    return { capability: `project_quote.${operation}`, quoteId: candidate.quoteId as number };
  }
  throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
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
    return { capability: 'project.update', projectId: candidate.projectId as number, input: update as UpdateProjectInput };
  }
  throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
};

const parseOpportunityParticipantInput = (operation: ProductConsumerRequest['operation']['operation'], input: unknown): ConnectOpportunityParticipantDispatchInput => {
  const objectInput = input === undefined ? {} : input;
  if (!objectInput || typeof objectInput !== 'object' || Array.isArray(objectInput)) throw new ConnectServiceHttpError('Invalid request', 400);
  const candidate = objectInput as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
  const roles: readonly ParticipationRole[] = ['creator','owner','recipient','responder','evaluator','fulfiller'];
  const statuses: readonly ParticipationStatus[] = ['invited','active','declined','withdrawn','removed','completed'];
  if (operation === 'read') {
    if (keys.length !== 1 || (candidate.participantId === undefined && candidate.opportunityId === undefined) || (candidate.participantId !== undefined && candidate.opportunityId !== undefined)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.participantId !== undefined && !positive(candidate.participantId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.opportunityId !== undefined && !positive(candidate.opportunityId)) throw new ConnectServiceHttpError('Invalid request', 400);
    return candidate.participantId !== undefined
      ? { capability: 'opportunity_participant.read', participantId: candidate.participantId as number }
      : { capability: 'opportunity_participant.read', opportunityId: candidate.opportunityId as number };
  }
  if (operation === 'create') {
    const allowed = ['opportunityId','accountId','businessId','participationRole','participationStatus'];
    if (keys.some(key => !allowed.includes(key)) || !positive(candidate.opportunityId) || typeof candidate.participationRole !== 'string' || !roles.includes(candidate.participationRole as ParticipationRole)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.accountId !== undefined && candidate.accountId !== null && !positive(candidate.accountId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.businessId !== undefined && candidate.businessId !== null && !positive(candidate.businessId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.participationStatus !== undefined && (typeof candidate.participationStatus !== 'string' || !statuses.includes(candidate.participationStatus as ParticipationStatus))) throw new ConnectServiceHttpError('Invalid request', 400);
    const input: CreateOpportunityParticipantInput = {
      opportunityId: candidate.opportunityId as number,
      ...(candidate.accountId !== undefined ? { accountId: candidate.accountId as number | null } : {}),
      ...(candidate.businessId !== undefined ? { businessId: candidate.businessId as number | null } : {}),
      participationRole: candidate.participationRole as ParticipationRole,
      ...(candidate.participationStatus !== undefined ? { participationStatus: candidate.participationStatus as ParticipationStatus } : {}),
    };
    return { capability: 'opportunity_participant.create', input };
  }
  if (operation === 'update') {
    const allowed = ['participantId','participationRole','participationStatus'];
    if (keys.length < 2 || keys.some(key => !allowed.includes(key)) || !positive(candidate.participantId)) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.participationRole !== undefined && (typeof candidate.participationRole !== 'string' || !roles.includes(candidate.participationRole as ParticipationRole))) throw new ConnectServiceHttpError('Invalid request', 400);
    if (candidate.participationStatus !== undefined && (typeof candidate.participationStatus !== 'string' || !statuses.includes(candidate.participationStatus as ParticipationStatus))) throw new ConnectServiceHttpError('Invalid request', 400);
    const update: UpdateOpportunityParticipantInput = {
      ...(candidate.participationRole !== undefined ? { participationRole: candidate.participationRole as ParticipationRole } : {}),
      ...(candidate.participationStatus !== undefined ? { participationStatus: candidate.participationStatus as ParticipationStatus } : {}),
    };
    return { capability: 'opportunity_participant.update', participantId: candidate.participantId as number, input: update };
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
      } else if (authorized.resource === 'opportunity') {
        result = await dispatchConnectOpportunityCapability(authorized, parseOpportunityInput(authorized.operation, parsed.input), { opportunities: dependencies.opportunities });
      } else if (authorized.resource === 'opportunity_participant') {
        result = await dispatchConnectOpportunityParticipantCapability(authorized, parseOpportunityParticipantInput(authorized.operation, parsed.input), { opportunityParticipants: dependencies.opportunityParticipants });
      } else if (authorized.resource === 'project_quote') {
        result = await dispatchConnectProjectQuoteCapability(authorized, parseProjectQuoteInput(authorized.operation, parsed.input), { projectQuotes: dependencies.projectQuotes });
      } else {
        throw new ConnectServiceHttpError('Unsupported Connect service operation', 403);
      }
      res.status(200).json({ result });
    } catch (error) { sendError(error, res); }
  });
};
