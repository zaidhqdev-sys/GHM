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
import { BusinessHoursService } from '../resources/business-hours/contracts';
import { PostgresProjectRepository } from '../resources/project/repository';
import { ProjectServiceImpl } from '../resources/project/service';
import { CreateProjectInput, ProjectService, UpdateProjectInput } from '../resources/project/contracts';
import { isRegisteredOperation, ResourceOperation } from '../resources/registry';
import { config } from '../config';
import { HttpSupplierClassificationGatewayClient, SupplierClassificationGatewayError, type SupplierClassificationGatewayClient } from './supplier-classification-gateway-client';
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
import { PostgresOnboardingProgressRepository } from '../resources/onboarding/repository';
import { DefaultOnboardingProgressService } from '../resources/onboarding/service';
import type { OnboardingProgressService } from '../resources/onboarding/contracts';
import { registerOnboardingRoutes } from './onboarding-router';
import { PostgresRelationshipsOutcomesRepository } from '../resources/relationships-outcomes/repository';
import { DefaultRelationshipsOutcomesService } from '../resources/relationships-outcomes/service';
import type { RelationshipsOutcomesService } from '../resources/relationships-outcomes/contracts';
import { registerRelationshipsOutcomesRoutes } from './relationships-outcomes-router';
import { registerBusinessCapabilityRoutes } from './business-capability-router';
import { PgCapabilityRepository } from '../resources/capability/repository';
import { CapabilityServiceImpl } from '../resources/capability/service';
import type { CapabilityService } from '../resources/capability/contracts';
import { registerCapabilityCatalogueRoutes } from './capability-catalogue-router';
import { HttpCapabilityGovernanceGatewayClient } from './capability-governance-gateway-client';
import { PostgresBusinessCapabilityEvidenceRepository } from '../resources/business-capability-evidence/repository';
import { BusinessCapabilityEvidenceServiceImpl } from '../resources/business-capability-evidence/service';
import type { BusinessCapabilityEvidenceService } from '../resources/business-capability-evidence/contracts';
import { registerBusinessCapabilityEvidenceRoutes } from './business-capability-evidence-router';
import { PostgresBusinessRegistrationIdentityRepository } from '../resources/business-registration-identity/repository';
import { BusinessRegistrationIdentityServiceImpl } from '../resources/business-registration-identity/service';
import type { BusinessRegistrationIdentityService } from '../resources/business-registration-identity/contracts';
import { registerBusinessRegistrationIdentityRoutes } from './business-registration-identity-router';
import { PostgresDirectoryReviewRepository } from '../resources/directory-review/repository';
import { DirectoryReviewServiceImpl } from '../resources/directory-review/service';
import type { DirectoryReviewService } from '../resources/directory-review/contracts';
import { registerDirectoryReviewRoutes } from './directory-review-router';
import { registerTrustScoreRoutes } from './trust-score-router';
import { registerSupportRequestRoutes } from './support-request-router';
import { registerReviewRoutes } from './review-router';
import type { GhmAuthService } from '../auth/ghm-auth-service';
import type { PasswordRecoveryService } from '../auth/password-recovery';
import type { PasswordResetService } from '../auth/password-reset';
import type { QuoteFlowMigrationResetRecoveryService } from '../migrations/quoteflow-migration-reset-recovery';
import type { QuoteFlowMigrationResetCompletionService } from '../migrations/quoteflow-migration-reset-completion';
import { createPasswordResetService } from '../auth/password-reset';
import { PostgresAuthPersistence, type AuthPersistence } from '../auth/foundation/persistence';
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
import { registerConnectServiceRoutes, type ConnectServiceHttpDependencies } from './connect-service-router';
import { registerCommercialInternalRoutes } from './commercial-internal-router';
import { DefaultCommercialService } from '../resources/commercial/service';
import { PostgresCommercialRepository } from '../resources/commercial/repository';
import type { CommercialService } from '../resources/commercial/contracts';
import { registerCommercialRoutes } from './commercial-router';
import { registerStorageRoutes } from './storage-router';
import { createStorageProvider } from '../storage/factory';


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
  readonly onboardingService?: OnboardingProgressService;
  readonly relationshipsOutcomesService?: RelationshipsOutcomesService;
  readonly businessCapabilityService?: BusinessCapabilityService;
  readonly capabilityService?: CapabilityService;
  readonly businessCapabilityEvidenceService?: BusinessCapabilityEvidenceService;
  readonly businessRegistrationIdentityService?: BusinessRegistrationIdentityService;
  readonly directoryReviewService?: DirectoryReviewService;
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
  readonly directoryService?: DirectoryService;
  readonly commercialService?: CommercialService;
  readonly authService?: GhmAuthService;
  readonly authPersistence?: AuthPersistence;
  readonly passwordRecoveryService?: PasswordRecoveryService;
  readonly passwordResetService?: PasswordResetService;
  readonly quoteFlowMigrationResetRecoveryService?: QuoteFlowMigrationResetRecoveryService;
  readonly quoteFlowMigrationResetCompletionService?: QuoteFlowMigrationResetCompletionService;
  readonly resourceAuthMiddleware?: import('express').RequestHandler;
  readonly supplierClassificationGatewayClient?: SupplierClassificationGatewayClient;
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

const parseCreateBusinessInput = (body: unknown): { name: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.name !== 'string' || !input.name.trim()) return null;
  return { name: input.name };
};

const parseUpdateBusinessInput = (body: unknown): UpdateBusinessProfileInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['name', 'slug', 'description', 'phone', 'email', 'province', 'city', 'physicalAddress', 'latitude', 'longitude', 'whatsapp', 'website', 'avatarLetter', 'avatarColor', 'yearsInBusiness']);
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) return null;
  if (Object.hasOwn(input, 'name') && (typeof input.name !== 'string' || !input.name.trim())) return null;
  if (Object.hasOwn(input, 'slug') && (typeof input.slug !== 'string' || !input.slug.trim())) return null;
  if (Object.hasOwn(input, 'description') && input.description !== null && typeof input.description !== 'string') return null;
  if (Object.hasOwn(input, 'phone') && input.phone !== null && typeof input.phone !== 'string') return null;
  if (Object.hasOwn(input, 'email') && input.email !== null && typeof input.email !== 'string') return null;
  for (const key of ['province', 'city', 'physicalAddress', 'whatsapp', 'website']) {
    if (Object.hasOwn(input, key) && input[key] !== null && typeof input[key] !== 'string') return null;
  }
  for (const key of ['latitude', 'longitude']) {
    if (Object.hasOwn(input, key) && input[key] !== null && (typeof input[key] !== 'number' || !Number.isFinite(input[key]))) return null;
  }
  if (Object.hasOwn(input, 'avatarLetter') && input.avatarLetter !== null && (typeof input.avatarLetter !== 'string' || input.avatarLetter.trim().length > 3)) return null;
  if (Object.hasOwn(input, 'avatarColor') && input.avatarColor !== null && (typeof input.avatarColor !== 'string' || input.avatarColor.trim().length > 32)) return null;
  if (Object.hasOwn(input, 'yearsInBusiness') && (typeof input.yearsInBusiness !== 'number' || !Number.isInteger(input.yearsInBusiness) || input.yearsInBusiness < 0 || input.yearsInBusiness > 100)) return null;
  if (Object.hasOwn(input, 'latitude') !== Object.hasOwn(input, 'longitude')) return null;
  return {
    ...(Object.hasOwn(input, 'name') ? { name: input.name as string } : {}),
    ...(Object.hasOwn(input, 'slug') ? { slug: input.slug as string } : {}),
    ...(Object.hasOwn(input, 'description') ? { description: input.description as string | null } : {}),
    ...(Object.hasOwn(input, 'phone') ? { phone: input.phone as string | null } : {}),
    ...(Object.hasOwn(input, 'email') ? { email: input.email as string | null } : {}),
    ...(Object.hasOwn(input, 'province') ? { province: input.province as string | null } : {}),
    ...(Object.hasOwn(input, 'city') ? { city: input.city as string | null } : {}),
    ...(Object.hasOwn(input, 'physicalAddress') ? { physicalAddress: input.physicalAddress as string | null } : {}),
    ...(Object.hasOwn(input, 'latitude') ? { latitude: input.latitude as number | null } : {}),
    ...(Object.hasOwn(input, 'longitude') ? { longitude: input.longitude as number | null } : {}),
    ...(Object.hasOwn(input, 'whatsapp') ? { whatsapp: input.whatsapp as string | null } : {}),
    ...(Object.hasOwn(input, 'website') ? { website: input.website as string | null } : {}),
    ...(Object.hasOwn(input, 'avatarLetter') ? { avatarLetter: input.avatarLetter as string | null } : {}),
    ...(Object.hasOwn(input, 'avatarColor') ? { avatarColor: input.avatarColor as string | null } : {}),
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
  const supplierClassificationGatewayClient = dependencies.supplierClassificationGatewayClient ?? (config.actorGatewayUrl ? new HttpSupplierClassificationGatewayClient(config.actorGatewayUrl) : undefined);
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
  const onboardingService = dependencies.onboardingService ?? new DefaultOnboardingProgressService(new PostgresOnboardingProgressRepository());
  const relationshipsOutcomesService = dependencies.relationshipsOutcomesService ?? new DefaultRelationshipsOutcomesService(new PostgresRelationshipsOutcomesRepository());
  const businessCapabilityService =
    dependencies.businessCapabilityService ??
    new BusinessCapabilityServiceImpl(new PostgresBusinessCapabilityRepository());
  const capabilityService = dependencies.capabilityService ?? new CapabilityServiceImpl(new PgCapabilityRepository());
  const capabilityGovernanceGatewayClient = config.actorGatewayUrl ? new HttpCapabilityGovernanceGatewayClient(config.actorGatewayUrl) : undefined;
  const businessCapabilityEvidenceService =
    dependencies.businessCapabilityEvidenceService ??
    new BusinessCapabilityEvidenceServiceImpl(new PostgresBusinessCapabilityEvidenceRepository());
  const businessRegistrationIdentityService = dependencies.businessRegistrationIdentityService ?? new BusinessRegistrationIdentityServiceImpl(new PostgresBusinessRegistrationIdentityRepository());
  const directoryReviewService = dependencies.directoryReviewService ?? new DirectoryReviewServiceImpl(new PostgresDirectoryReviewRepository());
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
  const commercialService = dependencies.commercialService ?? new DefaultCommercialService(new PostgresCommercialRepository());
  const businessOfferingService = dependencies.businessOfferingService ?? new BusinessOfferingServiceImpl(new PostgresBusinessOfferingRepository());
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

  if (config.storage) {
    registerStorageRoutes(app, createStorageProvider(config.storage), resourceAuthMiddleware, config.storage.uploadGrantTtlSeconds, config.storage.downloadGrantMaxTtlSeconds);
  }

  app.get('/', (_req: Request, res: Response) => {
    res.json({ service: 'GHM Core Engine', version: '2.0.0' });
  });

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
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

  app.get('/api/v1/public/business-categories', requireRegisteredPublicAccess('business_category', 'readPublic'), async (_req: Request, res: Response) => {
    try {
      const categories = await businessCategoryService.listPublicBusinessCategories();
      res.status(200).json({ categories });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get('/api/v1/businesses/:businessId/categories', resourceAuthMiddleware, requireRegisteredAccess('business_category_assignment', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const rawId = routeParam(req.params.businessId);
      const businessId = rawId === null ? null : positiveIntegerId(rawId);
      if (businessId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const assignments = await businessCategoryService.listBusinessCategoryAssignments(context, businessId);
      res.status(200).json({ assignments });
    } catch (error) { handleError(error, res); }
  });

  app.post('/api/v1/businesses/:businessId/categories', resourceAuthMiddleware, requireRegisteredAccess('business_category_assignment', 'create'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const rawId = routeParam(req.params.businessId);
      const businessId = rawId === null ? null : positiveIntegerId(rawId);
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : null;
      if (businessId === null || !body || Object.keys(body).length !== 1 || typeof body.categoryId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.categoryId)) {
        res.status(400).json({ error: 'invalid_request' }); return;
      }
      const assignment = await businessCategoryService.assignBusinessCategory(context, { businessId, categoryId: body.categoryId });
      res.status(201).json({ assignment });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Business management permission required')) {
        res.status(403).json({ error: 'forbidden' }); return;
      }
      if (error instanceof Error && /Category|category|positive integer/.test(error.message)) {
        res.status(400).json({ error: 'invalid_request' }); return;
      }
      handleError(error, res);
    }
  });

  app.patch('/api/v1/businesses/:businessId/categories/:categoryId/primary', resourceAuthMiddleware, requireRegisteredAccess('business_category_assignment', 'update'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const rawId = routeParam(req.params.businessId);
      const businessId = rawId === null ? null : positiveIntegerId(rawId);
      const categoryId = routeParam(req.params.categoryId);
      if (businessId === null || categoryId === null ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(categoryId)) {
        res.status(400).json({ error: 'invalid_request' }); return;
      }
      const assignment = await businessCategoryService.setPrimaryBusinessCategory(context, { businessId, categoryId });
      res.status(200).json({ assignment });
    } catch (error) {
      if (error instanceof Error && /Category|category|positive integer|Business management permission/.test(error.message)) {
        res.status(400).json({ error: 'invalid_request' }); return;
      }
      handleError(error, res);
    }
  });

  app.get('/api/v1/public/businesses', requireRegisteredPublicAccess('directory', 'read'), async (req: Request, res: Response) => {
    try {
      const allowed = new Set(['q', 'category', 'province', 'city', 'latitude', 'longitude', 'radiusKm', 'sort', 'page', 'pageSize']);
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
      const parseCoordinate = (key: string): number | undefined => {
        const value = readStringQuery(key);
        if (value === undefined) return undefined;
        if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      };
      const latitude = parseCoordinate('latitude');
      const longitude = parseCoordinate('longitude');
      const radiusKm = parseCoordinate('radiusKm');
      const pageValue = parsePositiveQueryInteger('page');
      const pageSizeValue = parsePositiveQueryInteger('pageSize');

      if (
        (req.query.q !== undefined && q === undefined) ||
        (req.query.category !== undefined && category === undefined) ||
        (req.query.province !== undefined && province === undefined) ||
        (req.query.city !== undefined && city === undefined) ||
        (req.query.sort !== undefined && sort === undefined) ||
        (req.query.latitude !== undefined && latitude === undefined) ||
        (req.query.longitude !== undefined && longitude === undefined) ||
        (req.query.radiusKm !== undefined && radiusKm === undefined) ||
        (req.query.page !== undefined && pageValue === undefined) ||
        (req.query.pageSize !== undefined && pageSizeValue === undefined)
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
        province,
        city,
        latitude,
        longitude,
        radiusKm,
        sort: sort as 'rating' | 'reviews' | 'newest' | 'distance' | undefined,
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
          error.message === 'province must be a string' || error.message === 'city must be a string' ||
          error.message === 'latitude must be a valid coordinate' || error.message === 'longitude must be a valid coordinate' ||
          error.message === 'radiusKm must be between 0 and 500' || error.message === 'sort must be rating, reviews, newest, or distance' ||
          error.message === 'latitude and longitude must be supplied together' || error.message === 'radiusKm requires latitude and longitude' || error.message === 'distance sort requires latitude and longitude' ||
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

  app.get('/api/v1/public/businesses/:businessId/hours', requireRegisteredPublicAccess('business_hours', 'readPublic'), async (req: Request, res: Response) => {
    try {
      const value = routeParam(req.params.businessId);
      const businessId = value === null ? null : positiveIntegerId(value);
      if (businessId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const hours = await businessHoursService.listPublicBusinessHours(businessId);
      res.status(200).json({ hours });
    } catch (error) {
      if (error instanceof Error && error.message === 'Public Business not found') { res.status(404).json({ error: 'not_found' }); return; }
      handleError(error, res);
    }
  });

  app.get('/api/v1/public/businesses/:businessId/capabilities', requireRegisteredPublicAccess('business_capability', 'readPublic'), async (req: Request, res: Response) => {
    try {
      const value = routeParam(req.params.businessId);
      const businessId = value === null ? null : positiveIntegerId(value);
      if (businessId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const capabilities = await businessCapabilityService.listPublicBusinessCapabilities(businessId);
      res.status(200).json({ capabilities });
    } catch (error) {
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

  app.get('/api/v1/businesses/memberships', resourceAuthMiddleware, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const memberships = await service.listManagedBusinesses(context);
      res.status(200).json({ memberships });
    } catch (error) {
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
      const memberships = await service.listManagedBusinesses(context);
      const selected = memberships.find(value => value.business.id === businessId);
      if (!selected) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({
        business: selected.business,
        membership: selected.membership,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.put(
    '/api/v1/businesses/:businessId/hours',
    resourceAuthMiddleware,
    requireRegisteredAccess('business_hours', 'replace'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const businessIdValue = routeParam(req.params.businessId);
        const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? req.body as Record<string, unknown>
          : null;
        if (businessId === null || !body || Object.keys(body).length !== 1 || !Array.isArray(body.hours)) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const hours = body.hours.map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
          const row = entry as Record<string, unknown>;
          if (Object.keys(row).some(key => !['dayOfWeek','isClosed','openTime','closeTime'].includes(key))) return null;
          if (!Number.isInteger(row.dayOfWeek) || typeof row.isClosed !== 'boolean') return null;
          if (row.openTime !== undefined && row.openTime !== null && typeof row.openTime !== 'string') return null;
          if (row.closeTime !== undefined && row.closeTime !== null && typeof row.closeTime !== 'string') return null;
          return {
            dayOfWeek: row.dayOfWeek as number,
            isClosed: row.isClosed as boolean,
            openTime: (row.openTime as string | null | undefined) ?? null,
            closeTime: (row.closeTime as string | null | undefined) ?? null,
          };
        });
        if (hours.some(entry => entry === null)) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const validHours = hours.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
        const updated = await businessHoursService.replaceBusinessHours(context, { businessId, hours: validHours });
        res.status(200).json({ hours: updated });
      } catch (error) {
        if (error instanceof Error && (
          error.message.includes('Business Hours') ||
          error.message.includes('day') ||
          error.message.includes('times') ||
          error.message.includes('Duplicate') ||
          error.message.includes('close after opening') ||
          error.message.includes('maximum of seven')
        )) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        handleError(error, res);
      }
    },
  );

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
      if (input.isSupplier !== undefined) {
        if (Object.keys(input).length !== 1) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        if (!supplierClassificationGatewayClient) {
          res.status(503).json({ error: 'service_unavailable' });
          return;
        }
        const authorization = req.header('authorization');
        if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        await supplierClassificationGatewayClient.update(authorization.slice(7).trim(), businessId, input.isSupplier);
        const business = await service.getManagedBusiness(context, businessId);
        if (!business) {
          res.status(404).json({ error: 'not_found' });
          return;
        }
        res.status(200).json({ business });
        return;
      }
      const business = await service.updateBusiness(context, businessId, input);
      res.status(200).json({ business });
    } catch (error) {
      if (error instanceof SupplierClassificationGatewayError) {
        if (error.status === 401 || error.status === 403) { res.status(403).json({ error: 'forbidden' }); return; }
        if (error.status === 400) { res.status(400).json({ error: 'invalid_request' }); return; }
        if (error.status === 404) { res.status(404).json({ error: 'not_found' }); return; }
        if (error.status === 409) { res.status(409).json({ error: 'conflict' }); return; }
        res.status(503).json({ error: 'service_unavailable' });
        return;
      }
      handleError(error, res);
    }
  });

  app.get('/api/v1/projects', resourceAuthMiddleware, requireRegisteredAccess('project', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      if (context.role !== 'customer') {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      const rawLimit = req.query.limit;
      const rawOffset = req.query.offset;
      if ((rawLimit !== undefined && typeof rawLimit !== 'string') || (rawOffset !== undefined && typeof rawOffset !== 'string')) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const limit = rawLimit === undefined ? 50 : Number(rawLimit);
      const offset = rawOffset === undefined ? 0 : Number(rawOffset);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const page = await projectService.listOwnedProjects(context, limit, offset);
      res.status(200).json(page);
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
  registerOnboardingRoutes(app, onboardingService, resourceAuthMiddleware);
  registerRelationshipsOutcomesRoutes(app, relationshipsOutcomesService, resourceAuthMiddleware);
  registerBusinessCapabilityRoutes(app, businessCapabilityService, resourceAuthMiddleware);
  registerCapabilityCatalogueRoutes(app, capabilityService, resourceAuthMiddleware, capabilityGovernanceGatewayClient);
  registerBusinessCapabilityEvidenceRoutes(app, businessCapabilityEvidenceService, resourceAuthMiddleware);
  registerBusinessRegistrationIdentityRoutes(app, businessRegistrationIdentityService, resourceAuthMiddleware);
  registerDirectoryReviewRoutes(app, directoryReviewService, resourceAuthMiddleware);
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
  registerCommercialRoutes(app, commercialService, resourceAuthMiddleware);
  const authPersistence = dependencies.authPersistence ?? new PostgresAuthPersistence();
  const passwordResetService =
    dependencies.passwordResetService
    ?? createPasswordResetService(authPersistence);
  registerAuthRoutes(app, {
    authService: dependencies.authService,
    authPersistence,
    passwordRecoveryService: dependencies.passwordRecoveryService,
    passwordResetService,
    quoteFlowMigrationResetRecoveryService: dependencies.quoteFlowMigrationResetRecoveryService,
    quoteFlowMigrationResetCompletionService: dependencies.quoteFlowMigrationResetCompletionService,
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

  app.get('/api/v1/public/projects', requireRegisteredPublicAccess('project', 'readPublic'), async (req: Request, res: Response) => {
    try {
      const keys = ['category', 'province', 'urgency', 'search', 'limit', 'offset'] as const;
      const values: Record<string, string> = {};
      for (const key of keys) {
        const value = req.query[key];
        if (value !== undefined && typeof value !== 'string') {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        if (typeof value === 'string') values[key] = value;
      }
      const limit = values.limit === undefined ? 50 : Number(values.limit);
      const offset = values.offset === undefined ? 0 : Number(values.offset);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const page = await publicProjectService.listPublicProjects({
        category: values.category,
        province: values.province,
        urgency: values.urgency as 'standard' | 'urgent' | 'emergency' | undefined,
        search: values.search,
        limit,
        offset,
      });
      res.status(200).json(page);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid Project ')) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      handleError(error, res);
    }
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
