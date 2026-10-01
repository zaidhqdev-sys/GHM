import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization.js';
import type {
  BusinessOffering,
  BusinessOfferingRepository,
  BusinessOfferingService,
  CreateBusinessOfferingInput,
  ListBusinessOfferingsInput,
  UpdateBusinessOfferingInput,
} from './contracts.js';

const TYPES = new Set(['service', 'product', 'solution']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREATE_KEYS = new Set(['businessId', 'offeringType', 'name', 'slug', 'description', 'priceAmount', 'currencyCode', 'priceUnit', 'sortOrder']);
const UPDATE_KEYS = new Set(['offeringType', 'name', 'slug', 'description', 'priceAmount', 'currencyCode', 'priceUnit', 'isActive', 'sortOrder']);

const positiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const text = (value: unknown, field: string, min: number, max: number): string => {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const v = value.trim();
  if (v.length < min || v.length > max) throw new Error(`${field} must contain between ${min} and ${max} characters`);
  return v;
};

const assertKeys = (input: object, allowed: Set<string>): void => {
  const unsupported = Object.keys(input).filter(key => !allowed.has(key));
  if (unsupported.length > 0) throw new Error(`Unsupported offering mutation: ${unsupported.join(', ')}`);
};

const validateCommon = (input: CreateBusinessOfferingInput | UpdateBusinessOfferingInput): void => {
  if (!input || typeof input !== 'object') throw new Error('Business offering input is required');
  if (input.offeringType !== undefined && !TYPES.has(input.offeringType)) throw new Error('Invalid offering type');
  if (input.name !== undefined) text(input.name, 'Name', 1, 160);
  if (input.slug !== undefined) {
    const slug = text(input.slug, 'Slug', 1, 120);
    if (!SLUG_RE.test(slug) || slug !== slug.toLowerCase()) throw new Error('Slug must be lowercase alphanumeric words separated by hyphens');
  }
  if (input.description !== undefined && input.description !== null) text(input.description, 'Description', 1, 4000);
  if (input.priceAmount !== undefined && input.priceAmount !== null) {
    if (typeof input.priceAmount !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(input.priceAmount.trim())) throw new Error('Invalid price amount');
  }
  if (input.currencyCode !== undefined && (!/^[A-Z]{3}$/.test(input.currencyCode))) throw new Error('Invalid currency code');
  if (input.priceUnit !== undefined && input.priceUnit !== null) text(input.priceUnit, 'Price unit', 1, 80);
  if (input.sortOrder !== undefined && (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0)) throw new Error('Sort order must be a non-negative integer');
  if ('isActive' in input && input.isActive !== undefined && typeof input.isActive !== 'boolean') throw new Error('isActive must be boolean');
};

export class BusinessOfferingServiceImpl implements BusinessOfferingService {
  constructor(private readonly repository: BusinessOfferingRepository) {}

  listBusinessOfferings(context: AuthContext, input: ListBusinessOfferingsInput): Promise<BusinessOffering[]> {
    requireAuthenticatedContext(context);
    positiveId(input.businessId, 'businessId');
    if (input.activeOnly !== undefined && typeof input.activeOnly !== 'boolean') throw new Error('activeOnly must be boolean');
    return this.repository.listBusinessOfferings(context, input);
  }

  getBusinessOfferingBySlug(context: AuthContext, businessId: number, slug: string): Promise<BusinessOffering | null> {
    requireAuthenticatedContext(context);
    positiveId(businessId, 'businessId');
    text(slug, 'Slug', 1, 120);
    if (!SLUG_RE.test(slug) || slug !== slug.toLowerCase()) throw new Error('Invalid slug');
    return this.repository.getBusinessOfferingBySlug(context, businessId, slug);
  }

  createBusinessOffering(context: AuthContext, input: CreateBusinessOfferingInput): Promise<BusinessOffering> {
    requireAuthenticatedContext(context);
    if (!input || typeof input !== 'object') throw new Error('Business offering input is required');
    assertKeys(input, CREATE_KEYS);
    positiveId(input.businessId, 'businessId');
    validateCommon(input);
    const name = text(input.name, 'Name', 1, 160);
    const slug = text(input.slug, 'Slug', 1, 120);
    return this.repository.createBusinessOffering(context, {
      ...input,
      name,
      slug,
      currencyCode: input.currencyCode ?? 'ZAR',
    });
  }

  updateBusinessOffering(context: AuthContext, offeringId: string, input: UpdateBusinessOfferingInput): Promise<BusinessOffering> {
    requireAuthenticatedContext(context);
    if (typeof offeringId !== 'string' || !UUID_RE.test(offeringId)) throw new Error('Offering ID must be a valid UUID');
    if (!input || typeof input !== 'object') throw new Error('Business offering input is required');
    assertKeys(input, UPDATE_KEYS);
    if (Object.keys(input).length === 0) throw new Error('Offering update input is required');
    validateCommon(input);
    const normalized: UpdateBusinessOfferingInput = { ...input };
    if (input.name !== undefined) normalized.name = text(input.name, 'Name', 1, 160);
    if (input.slug !== undefined) normalized.slug = text(input.slug, 'Slug', 1, 120);
    if (input.description !== undefined && input.description !== null) normalized.description = text(input.description, 'Description', 1, 4000);
    if (input.priceUnit !== undefined && input.priceUnit !== null) normalized.priceUnit = text(input.priceUnit, 'Price unit', 1, 80);
    return this.repository.updateBusinessOffering(context, offeringId, normalized);
  }

  listPublicBusinessOfferings(businessId: number): Promise<BusinessOffering[]> {
    positiveId(businessId, 'businessId');
    return this.repository.listPublicBusinessOfferings(businessId);
  }
}
