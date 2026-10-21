import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { PostgresBusinessIdentityRepository } from '../resources/business-identity/repository';
import { BusinessIdentityServiceImpl } from '../resources/business-identity/service';
import { BusinessIdentityService, UpdateBusinessProfileInput } from '../resources/business-identity/contracts';
import { PostgresPublicBusinessRepository } from '../resources/business-identity/public-repository';
import { PublicBusinessServiceImpl } from '../resources/business-identity/public-service';
import type { PublicBusinessService } from '../resources/business-identity/public-contracts';
import { PostgresBusinessHoursRepository } from '../resources/business-hours/repository';
import { BusinessHoursServiceImpl } from '../resources/business-hours/service';
import { BusinessHoursEntryInput, BusinessHoursService } from '../resources/business-hours/contracts';
import { PostgresProjectRepository } from '../resources/project/repository';
import { ProjectServiceImpl } from '../resources/project/service';
import { CreateProjectInput, ProjectService, UpdateProjectInput } from '../resources/project/contracts';
import { isRegisteredOperation, ResourceOperation } from '../resources/registry';
import { config } from '../config';
import { PostgresPublicProjectRepository } from '../resources/project/public-repository';
import { PublicProjectServiceImpl } from '../resources/project/public-service';
import { PublicProjectService } from '../resources/project/public-contracts';
import { PostgresEnquiryRepository } from '../resources/enquiry/repository';
import { EnquiryServiceImpl } from '../resources/enquiry/service';
import { EnquiryService } from '../resources/enquiry/contracts';
import { PostgresCampaignRepository } from '../resources/campaign/repository';
import { CampaignServiceImpl } from '../resources/campaign/service';
import { CampaignService } from '../resources/campaign/contracts';
import { PostgresOpportunityRepository } from '../resources/opportunity/repository';
import { OpportunityServiceImpl } from '../resources/opportunity/service';
import { OpportunityService } from '../resources/opportunity/contracts';
import { PostgresSavedBusinessRepository } from '../resources/saved-business/repository';
import { SavedBusinessServiceImpl } from '../resources/saved-business/service';
import { SavedBusinessService } from '../resources/saved-business/contracts';
import { PostgresBusinessCapabilityRepository } from '../resources/business-capability/repository';
import { BusinessCapabilityServiceImpl } from '../resources/business-capability/service';
import { BusinessCapabilityService } from '../resources/business-capability/contracts';
import { PostgresTrustScoreRepository } from '../resources/trust-score/repository';
import { TrustScoreServiceImpl } from '../resources/trust-score/service';
import { TrustScoreService } from '../resources/trust-score/contracts';
import { PostgresSupportRequestRepository } from '../resources/support-request/repository';
import { SupportRequestServiceImpl } from '../resources/support-request/service';
import { SupportRequestService } from '../resources/support-request/contracts';
import { PostgresReviewRepository } from '../resources/review/repository';
import { ReviewServiceImpl } from '../resources/review/service';
import { ReviewService } from '../resources/review/contracts';
import { registerEnquiryRoutes } from './enquiry-router';
import { registerCampaignRoutes } from './campaign-router';
import { registerOpportunityRoutes } from './opportunity-router';
import { registerAuthRoutes, type AuthRouterDependencies } from './auth-router';
import { registerSavedBusinessRoutes } from './saved-business-router';
import { registerBusinessCapabilityRoutes } from './business-capability-router';
import { registerTrustScoreRoutes } from './trust-score-router';
import { registerSupportRequestRoutes } from './support-request-router';
import { registerReviewRoutes } from './review-router';
import type { GhmAuthService } from '../auth/ghm-auth-service';
import type { PasswordRecoveryService } from '../auth/password-recovery';
import type { PasswordResetService } from '../auth/password-reset';
import type { QuoteFlowMigrationResetRecoveryService } from '../migrations/quoteflow-migration-reset-recovery';
import type { QuoteFlowMigrationResetCompletionService } from '../migrations/quoteflow-migration-reset-completion';
import { createQuoteFlowMigrationResetRecoveryService } from '../migrations/quoteflow-migration-reset-recovery';
import { createQuoteFlowMigrationResetCompletionService } from '../migrations/quoteflow-migration-reset-completion';
import { createRecoveryWebhookDeliveryFromEnv } from '../auth/recovery-webhook-delivery';
import { createPasswordResetService } from '../auth/password-reset';
import { PostgresAuthPersistence } from '../auth/foundation/persistence';
import { PostgresProjectQuoteRepository } from '../resources/project-quote/repository';
import { ProjectQuoteServiceImpl } from '../resources/project-quote/service';
import type { ProjectQuoteService } from '../resources/project-quote/contracts';
import { registerProjectQuoteRoutes } from './project-quote-router';
import { PgOpportunityRequirementsRepository } from '../resources/opportunity-requirements/repository';
import { OpportunityRequirementsServiceImpl } from '../resources/opportunity-requirements/service';
import type { OpportunityRequirementsService } from '../resources/opportunity-requirements/contracts';
import { registerOpportunityRequirementsRoutes } from './opportunity-requirements-router';
import { PostgresOpportunityParticipantRepository } from '../resources/opportunity-participant/repository';
import { OpportunityParticipantServiceImpl } from '../resources/opportunity-participant/service';
import type { OpportunityParticipantService } from '../resources/opportunity-participant/contracts';
import { registerOpportunityParticipantRoutes } from './opportunity-participant-router';
import { PostgresCustomerRepository } from '../resources/customer/repository';
import { CustomerServiceImpl } from '../resources/customer/service';
import type { CustomerService } from '../resources/customer/contracts';
import { registerCustomerRoutes } from './customer-router';
import { PostgresQuoteRepository } from '../resources/quote/repository';
import { DefaultQuoteService } from '../resources/quote/service';
import { QuoteService } from '../resources/quote/contracts';
import { registerQuoteRoutes } from './quote-router';
import { PostgresNotificationRepository } from '../resources/notification/repository';
import { NotificationServiceImpl } from '../resources/notification/service';
import { NotificationService } from '../resources/notification/contracts';
import { registerNotificationRoutes } from './notification-router';
import { PostgresBusinessCategoryRepository } from '../resources/business-category/repository';
import { PostgresDirectoryRepository } from '../resources/directory/repository';
import { DirectoryServiceImpl } from '../resources/directory/service';
import type { DirectoryService } from '../resources/directory/contracts';
import { BusinessCategoryServiceImpl } from '../resources/business-category/service';
import type { BusinessCategoryService } from '../resources/business-category/contracts';
import { registerBusinessCategoryRoutes } from './business-category-router';
import { PostgresBusinessOfferingRepository } from '../resources/business-offering/repository';
import { BusinessOfferingServiceImpl } from '../resources/business-offering/service';
import type { BusinessOfferingService } from '../resources/business-offering/contracts';
import { registerBusinessOfferingRoutes } from './business-offering-router';
import { PostgresBusinessEngagementRepository } from '../resources/business-engagement/repository';
import { BusinessEngagementServiceImpl } from '../resources/business-engagement/service';
import type { BusinessEngagementService } from '../resources/business-engagement/contracts';
import { registerBusinessEngagementRoutes } from './business-engagement-router';
import { PostgresBusinessRegistrationIdentityRepository } from '../resources/business-registration-identity/repository';
import { BusinessRegistrationIdentityServiceImpl } from '../resources/business-registration-identity/service';
import type { BusinessRegistrationIdentityService } from '../resources/business-registration-identity/contracts';
import { registerBusinessRegistrationIdentityRoutes } from './business-registration-identity-router';
import { registerConnectServiceRoutes, type ConnectServiceHttpDependencies } from './connect-service-router';
import { registerCommercialInternalRoutes } from './commercial-internal-router';


export interface AppDependencies {
  readonly businessIdentityService?: BusinessIdentityService;
  readonly publicBusinessService?: PublicBusinessService;
  readonly businessHoursService?: BusinessHoursService;
  readonly projectService?: ProjectService;
  readonly publicProjectService?: PublicProjectService;
  readonly enquiryService?: EnquiryService;
  readonly campaignService?: CampaignService;
  readonly opportunityService?: OpportunityService;
  readonly savedBusinessService?: SavedBusinessService;
  readonly businessCapabilityService?: BusinessCapabilityService;
  readonly trustScoreService?: TrustScoreService;
  readonly supportRequestService?: SupportRequestService;
  readonly reviewService?: ReviewService;
  readonly projectQuoteService?: ProjectQuoteService;
  readonly opportunityRequirementsService?: OpportunityRequirementsService;
  readonly opportunityParticipantService?: OpportunityParticipantService;
  readonly customerService?: CustomerService;
  readonly quoteService?: QuoteService;
  readonly notificationService?: NotificationService;
  readonly businessCategoryService?: BusinessCategoryService;
  readonly businessOfferingService?: BusinessOfferingService;
  readonly businessEngagementService?: BusinessEngagementService;
  readonly businessRegistrationIdentityService?: BusinessRegistrationIdentityService;
  readonly directoryService?: DirectoryService;
  readonly authService?: GhmAuthService;
  readonly passwordRecoveryService?: PasswordRecoveryService;
  readonly passwordResetService?: PasswordResetService;
  readonly quoteFlowMigrationResetRecoveryService?: QuoteFlowMigrationResetRecoveryService;
  readonly quoteFlowMigrationResetCompletionService?: QuoteFlowMigrationResetCompletionService;
  readonly resourceAuthMiddleware?: import('express').RequestHandler;
  readonly connectService?: Omit<ConnectServiceHttpDependencies, 'savedBusinesses'>;
}

const requireRegisteredAccess = (resource: Parameters<typeof canAccessResource>[1], operation: ResourceOperation) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation(resource, operation) || !canAccessResource(context, resource)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const requireRegisteredPublicAccess = (
  resource: Parameters<typeof canAccessResource>[1],
  operation: ResourceOperation,
) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    if (!isRegisteredOperation(resource, operation)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const routeParam = (value: string | string[]): string | null => typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseOwnProfileUpdateInput = (body: unknown): import('../resources/business-identity/contracts').UpdateProfileInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['fullName', 'phone', 'avatarRef', 'connectRole', 'businessOperatorIntent']);
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some(key => !allowed.has(key))) return null;
  const result: Record<string, unknown> = {};
  for (const key of ['fullName', 'phone', 'avatarRef'] as const) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    if (value !== null && typeof value !== 'string') return null;
    if (key === 'fullName' && typeof value === 'string' && value.length > 200) return null;
    if (key === 'phone' && typeof value === 'string' && value.length > 32) return null;
    if (key === 'avatarRef' && typeof value === 'string' && value.length > 1024) return null;
    result[key] = value;
  }
  if (Object.hasOwn(input, 'connectRole')) {
    const value = input.connectRole;
    if (value !== null && value !== 'customer' && value !== 'contractor' && value !== 'supplier') return null;
    result.connectRole = value;
  }
  if (Object.hasOwn(input, 'businessOperatorIntent')) {
    if (typeof input.businessOperatorIntent !== 'boolean') return null;
    result.businessOperatorIntent = input.businessOperatorIntent;
  }
  return result as import('../resources/business-identity/contracts').UpdateProfileInput;
};

const parseCreateBusinessInput = (body: unknown): { name: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.name !== 'string' || !input.name.trim()) return null;
  return { name: input.name };
};

const parseUpdateBusinessInput = (body: unknown): UpdateBusinessProfileInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['name', 'slug', 'description', 'phone', 'email', 'category', 'province', 'city', 'physicalAddress', 'whatsapp', 'website', 'isSupplier', 'yearsInBusiness']);
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) return null;
  if (Object.hasOwn(input, 'name') && (typeof input.name !== 'string' || !input.name.trim())) return null;
  if (Object.hasOwn(input, 'slug') && (typeof input.slug !== 'string' || !input.slug.trim())) return null;
  if (Object.hasOwn(input, 'description') && input.description !== null && typeof input.description !== 'string') return null;
  if (Object.hasOwn(input, 'phone') && input.phone !== null && typeof input.phone !== 'string') return null;
  if (Object.hasOwn(input, 'email') && input.email !== null && typeof input.email !== 'string') return null;
  for (const key of ['category', 'province', 'city', 'physicalAddress', 'whatsapp', 'website']) {
    if (Object.hasOwn(input, key) && input[key] !== null && typeof input[key] !== 'string') return null;
  }
  if (typeof input.category === 'string' && (input.category.length > 100 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.category))) return null;
  if (typeof input.province === 'string' && (input.province.trim().length < 1 || input.province.trim().length > 100)) return null;
  if (typeof input.city === 'string' && (input.city.trim().length < 1 || input.city.trim().length > 120)) return null;
  if (typeof input.physicalAddress === 'string' && (input.physicalAddress.trim().length < 1 || input.physicalAddress.trim().length > 500)) return null;
  if (typeof input.whatsapp === 'string' && (input.whatsapp.trim().length < 7 || input.whatsapp.trim().length > 32)) return null;
  if (typeof input.website === 'string') {
    if (input.website.trim().length < 1 || input.website.trim().length > 2048) return null;
    try { const url = new URL(input.website); if (url.protocol !== 'https:' && url.protocol !== 'http:') return null; } catch { return null; }
  }
  if (Object.hasOwn(input, 'isSupplier') && input.isSupplier !== null && typeof input.isSupplier !== 'boolean') return null;
  if (Object.hasOwn(input, 'yearsInBusiness') && (!Number.isInteger(input.yearsInBusiness) || Number(input.yearsInBusiness) < 0 || Number(input.yearsInBusiness) > 500)) return null;
  return {
    ...(Object.hasOwn(input, 'name') ? { name: input.name as string } : {}),
    ...(Object.hasOwn(input, 'slug') ? { slug: input.slug as string } : {}),
    ...(Object.hasOwn(input, 'description') ? { description: input.description as string | null } : {}),
    ...(Object.hasOwn(input, 'phone') ? { phone: input.phone as string | null } : {}),
    ...(Object.hasOwn(input, 'email') ? { email: input.email as string | null } : {}),
    ...(Object.hasOwn(input, 'category') ? { category: input.category as string | null } : {}),
    ...(Object.hasOwn(input, 'province') ? { province: input.province as string | null } : {}),
    ...(Object.hasOwn(input, 'city') ? { city: input.city as string | null } : {}),
    ...(Object.hasOwn(input, 'physicalAddress') ? { physicalAddress: input.physicalAddress as string | null } : {}),
    ...(Object.hasOwn(input, 'whatsapp') ? { whatsapp: input.whatsapp as string | null } : {}),
    ...(Object.hasOwn(input, 'website') ? { website: input.website as string | null } : {}),
    ...(Object.hasOwn(input, 'isSupplier') ? { isSupplier: input.isSupplier as boolean | null } : {}),
    ...(Object.hasOwn(input, 'yearsInBusiness') ? { yearsInBusiness: input.yearsInBusiness as number } : {}),
  };
};

const parseProjectCreateInput = (body: unknown): CreateProjectInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const input = body as Record<string, unknown>;
  const allowed = new Set([
    'title',
    'description',
    'category',
    'province',
    'city',
    'budgetMin',
    'budgetMax',
    'urgency',
  ]);

  if (Object.keys(input).some((key) => !allowed.has(key))) return null;

  const stringFields = ['title', 'description', 'category', 'province', 'city'];
  for (const field of stringFields) {
    if (typeof input[field] !== 'string') return null;
  }

  if (
    Object.hasOwn(input, 'budgetMin') &&
    input.budgetMin !== null &&
    typeof input.budgetMin !== 'number'
  ) return null;

  if (
    Object.hasOwn(input, 'budgetMax') &&
    input.budgetMax !== null &&
    typeof input.budgetMax !== 'number'
  ) return null;

  if (
    Object.hasOwn(input, 'urgency') &&
    input.urgency !== 'standard' &&
    input.urgency !== 'urgent' &&
    input.urgency !== 'emergency'
  ) return null;

  return {
    title: input.title as string,
    description: input.description as string,
    category: input.category as string,
    province: input.province as string,
    city: input.city as string,
    ...(Object.hasOwn(input, 'budgetMin')
      ? { budgetMin: input.budgetMin as number | null }
      : {}),
    ...(Object.hasOwn(input, 'budgetMax')
      ? { budgetMax: input.budgetMax as number | null }
      : {}),
    ...(Object.hasOwn(input, 'urgency')
      ? { urgency: input.urgency as CreateProjectInput['urgency'] }
      : {}),
  };
};

const parseProjectUpdateInput = (body: unknown): UpdateProjectInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const input = body as Record<string, unknown>;
  const allowed = new Set([
    'title',
    'description',
    'category',
    'province',
    'city',
    'budgetMin',
    'budgetMax',
    'urgency',
  ]);

  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) return null;

  const stringFields = ['title', 'description', 'category', 'province', 'city'];
  for (const field of stringFields) {
    if (Object.hasOwn(input, field) && typeof input[field] !== 'string') {
      return null;
    }
  }

  if (
    Object.hasOwn(input, 'budgetMin') &&
    input.budgetMin !== null &&
    typeof input.budgetMin !== 'number'
  ) return null;

  if (
    Object.hasOwn(input, 'budgetMax') &&
    input.budgetMax !== null &&
    typeof input.budgetMax !== 'number'
  ) return null;

  if (
    Object.hasOwn(input, 'urgency') &&
    input.urgency !== 'standard' &&
    input.urgency !== 'urgent' &&
    input.urgency !== 'emergency'
  ) return null;

  return input as UpdateProjectInput;
};

const parseBusinessHoursReplaceBody = (body: unknown): readonly BusinessHoursEntryInput[] | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'hours') || !Array.isArray(input.hours) || input.hours.length > 7) return null;

  const seen = new Set<number>();
  const timePattern = /^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/;
  const timeToSeconds = (value: string): number => {
    const [hours, minutes, seconds = 0] = value.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  };
  const entries: BusinessHoursEntryInput[] = [];
  for (const candidate of input.hours) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const entry = candidate as Record<string, unknown>;
    if (Object.keys(entry).some(key => !['dayOfWeek', 'isClosed', 'openTime', 'closeTime'].includes(key))) return null;
    if (!Number.isInteger(entry.dayOfWeek) || (entry.dayOfWeek as number) < 0 || (entry.dayOfWeek as number) > 6 || typeof entry.isClosed !== 'boolean') return null;
    const day = entry.dayOfWeek as number;
    if (seen.has(day)) return null;
    seen.add(day);
    if (entry.isClosed) {
      if (entry.openTime != null || entry.closeTime != null) return null;
      entries.push({ dayOfWeek: day, isClosed: true });
      continue;
    }
    if (typeof entry.openTime !== 'string' || typeof entry.closeTime !== 'string' ||
        !timePattern.test(entry.openTime) || !timePattern.test(entry.closeTime) ||
        timeToSeconds(entry.openTime) >= timeToSeconds(entry.closeTime)) return null;
    entries.push({ dayOfWeek: day, isClosed: false, openTime: entry.openTime, closeTime: entry.closeTime });
  }
  return entries;
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (
      error.message === 'Business creation requires a business operator role'
      || error.message === 'Business management permission required'
      || error.message === 'Business access required'
    ) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (error.message === 'Authenticated account not found' || error.message === 'Business not found' || error.message === 'Project not found or ownership required') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (error.message === 'Business creation requires no existing active business membership' || error.message === 'Only open Projects may be updated' || (error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'conflict' });
      return;
    }
  }
  console.error(JSON.stringify({ event: 'http_request_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  res.status(500).json({ error: 'internal_error' });
};

export const createApp = (dependencies: AppDependencies = {}): express.Express => {
  const app = express();
  const resourceAuthMiddleware = dependencies.resourceAuthMiddleware ?? requireAuth;
  const service = dependencies.businessIdentityService ?? new BusinessIdentityServiceImpl(new PostgresBusinessIdentityRepository());
  const publicBusinessService = dependencies.publicBusinessService ?? new PublicBusinessServiceImpl(new PostgresPublicBusinessRepository());
  const businessHoursService =
    dependencies.businessHoursService
    ?? new BusinessHoursServiceImpl(new PostgresBusinessHoursRepository());
  const projectService = dependencies.projectService ?? new ProjectServiceImpl(new PostgresProjectRepository());
  const publicProjectService =
    dependencies.publicProjectService ??
    new PublicProjectServiceImpl(new PostgresPublicProjectRepository());
  const enquiryService =
    dependencies.enquiryService ??
    new EnquiryServiceImpl(new PostgresEnquiryRepository());
  const campaignService =
    dependencies.campaignService ??
    new CampaignServiceImpl(new PostgresCampaignRepository());
  const opportunityService =
    dependencies.opportunityService ??
    new OpportunityServiceImpl(new PostgresOpportunityRepository());
  const savedBusinessService =
    dependencies.savedBusinessService ??
    new SavedBusinessServiceImpl(new PostgresSavedBusinessRepository());
  const businessCapabilityService =
    dependencies.businessCapabilityService ??
    new BusinessCapabilityServiceImpl(new PostgresBusinessCapabilityRepository());
  const trustScoreService =
    dependencies.trustScoreService ??
    new TrustScoreServiceImpl(new PostgresTrustScoreRepository());
  const supportRequestService =
    dependencies.supportRequestService ??
    new SupportRequestServiceImpl(new PostgresSupportRequestRepository());
  const reviewService =
    dependencies.reviewService ??
    new ReviewServiceImpl(new PostgresReviewRepository());
  const projectQuoteService =
    dependencies.projectQuoteService ??
    new ProjectQuoteServiceImpl(new PostgresProjectQuoteRepository());
  const opportunityRequirementsService =
    dependencies.opportunityRequirementsService ??
    new OpportunityRequirementsServiceImpl(new PgOpportunityRequirementsRepository());
  const opportunityParticipantService =
    dependencies.opportunityParticipantService ??
    new OpportunityParticipantServiceImpl(new PostgresOpportunityParticipantRepository());
  const customerService = dependencies.customerService ?? new CustomerServiceImpl(new PostgresCustomerRepository());
  const quoteService = dependencies.quoteService ?? new DefaultQuoteService(new PostgresQuoteRepository());
  const notificationService = dependencies.notificationService ?? new NotificationServiceImpl(new PostgresNotificationRepository());
  const businessCategoryService = dependencies.businessCategoryService ?? new BusinessCategoryServiceImpl(new PostgresBusinessCategoryRepository());
  const directoryService = dependencies.directoryService ?? new DirectoryServiceImpl(new PostgresDirectoryRepository());
  const businessOfferingService = dependencies.businessOfferingService ?? new BusinessOfferingServiceImpl(new PostgresBusinessOfferingRepository());
  const businessEngagementService = dependencies.businessEngagementService ?? new BusinessEngagementServiceImpl(new PostgresBusinessEngagementRepository());
  const businessRegistrationIdentityService = dependencies.businessRegistrationIdentityService
    ?? new BusinessRegistrationIdentityServiceImpl(new PostgresBusinessRegistrationIdentityRepository());
  app.disable('x-powered-by');
  app.disable('etag');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.set('trust proxy', config.trustProxy);
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req: Request, res: Response) => {
    res.json({ service: 'GHM Core Engine', version: '2.0.0' });
  });

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // Canonical identity context is derived only from the verified GHM auth context.
  // Business selection is not an authorization claim and must never reveal tenant existence.
  app.get('/api/v1/identity', resourceAuthMiddleware, requireRegisteredAccess('profile', 'read'), requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const allowed = new Set(['businessId']);
      if (Object.keys(req.query).some((key) => !allowed.has(key))) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const context = req.authContext as AuthContext;
      const rawBusinessId = req.query.businessId;
      let selectedBusinessId: number | undefined;
      if (rawBusinessId !== undefined) {
        if (typeof rawBusinessId !== 'string' || !/^[1-9][0-9]*$/.test(rawBusinessId)) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        selectedBusinessId = Number(rawBusinessId);
        if (!Number.isSafeInteger(selectedBusinessId) || selectedBusinessId <= 0) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
      }
      const identity = await service.getIdentityContext({ context, selectedBusinessId });
      res.status(200).json({
        account: identity.account,
        memberships: identity.memberships,
        activeMembership: identity.activeMembership,
        activeBusiness: identity.activeBusiness,
      });
    } catch (error) {
      if (error instanceof Error && /Selected business context is not authorized|Selected business not found|Selected business is inactive/.test(error.message)) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      handleError(error, res);
    }
  });

  app.get('/api/v1/profile', resourceAuthMiddleware, requireRegisteredAccess('profile', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const profile = await service.getOwnProfile(context);
      res.status(200).json({ profile });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.patch('/api/v1/profile', resourceAuthMiddleware, requireRegisteredAccess('profile', 'update'), async (req: Request, res: Response) => {
    try {
      const input = parseOwnProfileUpdateInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const context = req.authContext as AuthContext;
      const profile = await service.updateOwnProfile(context, input);
      res.status(200).json({ profile });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get('/api/v1/public/business-categories', requireRegisteredPublicAccess('directory', 'read'), async (_req: Request, res: Response) => {
    try {
      const categories = await directoryService.listPublicCategories();
      res.status(200).json({ categories });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get('/api/v1/public/businesses', requireRegisteredPublicAccess('directory', 'read'), async (req: Request, res: Response) => {
    try {
      const allowed = new Set(['q', 'category', 'province', 'city', 'sort', 'businessType', 'page', 'pageSize']);
      const keys = Object.keys(req.query);
      if (keys.some((key) => !allowed.has(key))) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const readStringQuery = (key: string): string | undefined => {
        const value = req.query[key];
        if (value === undefined) return undefined;
        return typeof value === 'string' ? value : undefined;
      };

      const parsePositiveQueryInteger = (key: string): number | undefined => {
        const value = readStringQuery(key);
        if (value === undefined) return undefined;
        if (!/^[1-9]\d*$/.test(value)) return undefined;
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
      };

      const q = readStringQuery('q');
      const category = readStringQuery('category');
      const province = readStringQuery('province');
      const city = readStringQuery('city');
      const sort = readStringQuery('sort');
      const businessType = readStringQuery('businessType');
      const pageValue = parsePositiveQueryInteger('page');
      const pageSizeValue = parsePositiveQueryInteger('pageSize');

      if (
        (req.query.q !== undefined && q === undefined) ||
        (req.query.category !== undefined && category === undefined) ||
        (req.query.province !== undefined && province === undefined) ||
        (req.query.city !== undefined && city === undefined) ||
        (req.query.sort !== undefined && sort === undefined) ||
        (req.query.businessType !== undefined && businessType === undefined) ||
        (req.query.page !== undefined && pageValue === undefined) ||
        (req.query.pageSize !== undefined && pageSizeValue === undefined)
      ) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      if (
        (province !== undefined && (province.trim().length === 0 || province.trim().length > 100)) ||
        (city !== undefined && (city.trim().length === 0 || city.trim().length > 100)) ||
        (sort !== undefined && !['rating', 'reviews', 'views', 'newest'].includes(sort)) ||
        (businessType !== undefined && businessType !== 'contractors' && businessType !== 'suppliers')
      ) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      if (pageSizeValue !== undefined && pageSizeValue > 50) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const result = await directoryService.search({
        q,
        category,
        province: province?.trim(),
        city: city?.trim(),
        sort: sort as 'rating' | 'reviews' | 'views' | 'newest' | undefined,
        businessType: businessType as 'contractors' | 'suppliers' | undefined,
        page: pageValue ?? 1,
        pageSize: pageSizeValue ?? 20,
      });
      res.status(200).json(result);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'invalid_query_parameter' ||
          error.message === 'q must be a string' ||
          error.message === 'category must be a string' ||
          error.message === 'category must not be blank' ||
          error.message === 'category must be a valid category id or slug' ||
          error.message === 'province must be a string' ||
          error.message === 'province must not be blank' ||
          error.message === 'province must be at most 100 characters' ||
          error.message === 'city must be a string' ||
          error.message === 'city must not be blank' ||
          error.message === 'city must be at most 100 characters' ||
          error.message === 'sort must be rating, reviews, views, or newest' ||
          error.message === 'businessType must be contractors or suppliers' ||
          error.message === 'page must be a positive integer' ||
          error.message === 'pageSize must be a positive integer' ||
          error.message === 'pageSize must be at most 50')
      ) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      handleError(error, res);
    }
  });

  app.get('/api/v1/public/businesses/slug/:slug', requireRegisteredPublicAccess('business', 'readPublic'), async (req: Request, res: Response) => {
    try {
      const slugValue = routeParam(req.params.slug);
      const slug = slugValue?.trim();
      if (!slug) { res.status(400).json({ error: 'invalid_request' }); return; }
      const business = await publicBusinessService.getPublicBusinessBySlug(slug);
      if (!business) { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ business });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid Business slug') { res.status(400).json({ error: 'invalid_request' }); return; }
      handleError(error, res);
    }
  });

  app.get('/api/v1/businesses/slug/:slug', resourceAuthMiddleware, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const slugValue = routeParam(req.params.slug);
      const slug = slugValue?.trim();
      if (!slug) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const business = await service.getPublicBusinessBySlug(context, slug);
      if (!business) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ business });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get('/api/v1/businesses/managed', resourceAuthMiddleware, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const identity = await service.resolveIdentity({ context });
      if (!identity.activeBusiness || !identity.activeMembership) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({
        business: identity.activeBusiness,
        membership: identity.activeMembership,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'business-selection-required') {
        res.status(409).json({ error: 'business_selection_required' });
        return;
      }
      handleError(error, res);
    }
  });

  app.get('/api/v1/businesses/:businessId/managed', resourceAuthMiddleware, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const businessIdValue = routeParam(req.params.businessId);
      const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
      if (businessId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const business = await service.getManagedBusiness(context, businessId);
      if (!business) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ business });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get(
    '/api/v1/businesses/:businessId/hours',
    resourceAuthMiddleware,
    requireRegisteredAccess('business_hours', 'read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const businessIdValue = routeParam(req.params.businessId);
        const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
        if (businessId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const hours = await businessHoursService.getBusinessHours(context, businessId);
        res.status(200).json({ hours });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.put(
    '/api/v1/businesses/:businessId/hours',
    resourceAuthMiddleware,
    requireRegisteredAccess('business_hours', 'replace'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const businessIdValue = routeParam(req.params.businessId);
        const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
        const hours = parseBusinessHoursReplaceBody(req.body);
        if (businessId === null || hours === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const updated = await businessHoursService.replaceBusinessHours(context, { businessId, hours });
        res.status(200).json({ hours: updated });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.get('/api/v1/public/businesses/:businessId', requireRegisteredPublicAccess('business', 'readPublic'), async (req: Request, res: Response) => {
    try {
      const businessIdValue = routeParam(req.params.businessId);
      const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
      if (businessId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const business = await publicBusinessService.getPublicBusiness(businessId);
      if (!business) { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ business });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid Business id') { res.status(400).json({ error: 'invalid_request' }); return; }
      handleError(error, res);
    }
  });

  app.get('/api/v1/businesses/:businessId', resourceAuthMiddleware, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const businessIdValue = routeParam(req.params.businessId);
      const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
      if (businessId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const business = await service.getPublicBusiness(context, businessId);
      if (!business) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ business });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.post('/api/v1/businesses', resourceAuthMiddleware, requireRegisteredAccess('business', 'create'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const input = parseCreateBusinessInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const identity = await service.createBusiness(context, input);
      res.status(201).json({ business: identity.activeBusiness, membership: identity.activeMembership });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.patch('/api/v1/businesses/:businessId', resourceAuthMiddleware, requireRegisteredAccess('business', 'update'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const businessIdValue = routeParam(req.params.businessId);
      const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
      const input = parseUpdateBusinessInput(req.body);
      if (businessId === null || !input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const business = await service.updateBusiness(context, businessId, input);
      res.status(200).json({ business });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.post('/api/v1/projects', resourceAuthMiddleware, requireRegisteredAccess('project', 'create'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const input = parseProjectCreateInput(req.body);

      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const project = await projectService.createProject(context, input);
      res.status(201).json({ project });
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes(' is required') ||
        error.message.includes(' must be between ') ||
        error.message.includes('must be null or a non-negative number') ||
        error.message === 'budgetMax must be greater than or equal to budgetMin' ||
        error.message === 'Invalid Project urgency'
      )) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      handleError(error, res);
    }
  });

  registerEnquiryRoutes(app, enquiryService, resourceAuthMiddleware);
  registerCampaignRoutes(app, campaignService, resourceAuthMiddleware);
  registerOpportunityRoutes(app, opportunityService, resourceAuthMiddleware);
  registerSavedBusinessRoutes(app, savedBusinessService, resourceAuthMiddleware);
  registerBusinessCapabilityRoutes(app, businessCapabilityService, resourceAuthMiddleware);
  registerTrustScoreRoutes(app, trustScoreService, resourceAuthMiddleware);
  registerSupportRequestRoutes(app, supportRequestService, resourceAuthMiddleware);
  registerReviewRoutes(app, reviewService, resourceAuthMiddleware);
  registerProjectQuoteRoutes(app, projectQuoteService, resourceAuthMiddleware);
  registerOpportunityRequirementsRoutes(app, opportunityRequirementsService, resourceAuthMiddleware);
  registerOpportunityParticipantRoutes(app, opportunityParticipantService, resourceAuthMiddleware);
  registerCustomerRoutes(app, customerService, resourceAuthMiddleware);
  registerQuoteRoutes(app, quoteService, resourceAuthMiddleware);
  registerNotificationRoutes(app, notificationService, resourceAuthMiddleware);
  registerBusinessCategoryRoutes(app, businessCategoryService, resourceAuthMiddleware);
  registerBusinessOfferingRoutes(app, businessOfferingService, resourceAuthMiddleware);
  registerBusinessEngagementRoutes(app, businessEngagementService, resourceAuthMiddleware);
  registerBusinessRegistrationIdentityRoutes(app, businessRegistrationIdentityService, resourceAuthMiddleware);
  const authPersistence = new PostgresAuthPersistence();
  const passwordResetService =
    dependencies.passwordResetService
    ?? createPasswordResetService(authPersistence);
  const recoveryDelivery = dependencies.quoteFlowMigrationResetRecoveryService
    ? null
    : createRecoveryWebhookDeliveryFromEnv();
  const quoteFlowMigrationResetRecoveryService =
    dependencies.quoteFlowMigrationResetRecoveryService
    ?? (recoveryDelivery
      ? createQuoteFlowMigrationResetRecoveryService(authPersistence, recoveryDelivery)
      : undefined);
  const quoteFlowMigrationResetCompletionService =
    dependencies.quoteFlowMigrationResetCompletionService
    ?? createQuoteFlowMigrationResetCompletionService(authPersistence);
  registerAuthRoutes(app, {
    authService: dependencies.authService,
    passwordRecoveryService: dependencies.passwordRecoveryService,
    passwordResetService,
    quoteFlowMigrationResetRecoveryService,
    quoteFlowMigrationResetCompletionService,
  } satisfies AuthRouterDependencies);
  registerCommercialInternalRoutes(app);
  registerConnectServiceRoutes(app, {
    ...dependencies.connectService,
    savedBusinesses: savedBusinessService,
    customers: customerService,
    quotes: quoteService,
    enquiries: enquiryService,
    projects: projectService,
    opportunities: opportunityService,
    opportunityParticipants: opportunityParticipantService,
    projectQuotes: projectQuoteService,
  });

  app.get('/api/v1/public/projects/:projectId', requireRegisteredPublicAccess('project', 'readPublic'), async (req: Request, res: Response) => {
    try {
      const projectIdValue = routeParam(req.params.projectId);
      const projectId =
        projectIdValue === null ? null : positiveIntegerId(projectIdValue);

      if (projectId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const project = await publicProjectService.getPublicProject(projectId);

      if (!project) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      res.status(200).json({ project });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid Project id') {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      handleError(error, res);
    }
  });

  app.get('/api/v1/projects/:projectId', resourceAuthMiddleware, requireRegisteredAccess('project', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const projectIdValue = routeParam(req.params.projectId);
      const projectId = projectIdValue === null ? null : positiveIntegerId(projectIdValue);

      if (projectId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const project = await projectService.getOwnedProject(context, projectId);

      if (!project) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      res.status(200).json({ project });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.patch('/api/v1/projects/:projectId', resourceAuthMiddleware, requireRegisteredAccess('project', 'update'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const projectIdValue = routeParam(req.params.projectId);
      const projectId = projectIdValue === null ? null : positiveIntegerId(projectIdValue);
      const input = parseProjectUpdateInput(req.body);

      if (projectId === null || !input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const project = await projectService.updateOwnedProject(context, projectId, input);
      res.status(200).json({ project });
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes(' is required') ||
        error.message.includes(' must be between ') ||
        error.message.includes('must be null or a non-negative number') ||
        error.message === 'budgetMax must be greater than or equal to budgetMin' ||
        error.message === 'Invalid Project urgency' ||
        error.message === 'Project update requires at least one field' ||
        error.message.startsWith('Unsupported Project update field:')
      )) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      handleError(error, res);
    }
  });

  return app;
};
