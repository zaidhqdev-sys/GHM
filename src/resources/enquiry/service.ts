import type { AuthContext } from '../../auth/authorization';
import { assertRole } from '../../auth/authorization';
import type {
  CreateEnquiryInput,
  Enquiry,
  EnquiryRepository,
  EnquiryService,
  EnquiryStatus,
  UpdateEnquiryStatusInput,
} from './contracts';

const validateText = (value: unknown, field: string, min: number, max: number): string => {
  if (typeof value !== 'string') throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${field} must be between ${min} and ${max} characters`);
  }
  return normalized;
};

const validateOptionalText = (value: unknown, field: string, min: number, max: number): string | null => {
  if (value === undefined || value === null) return null;
  return validateText(value, field, min, max);
};

const validateBudget = (value: unknown, field: string): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be null or a non-negative number`);
  }
  return value;
};

const validateUrgency = (value: unknown): CreateEnquiryInput['urgency'] => {
  const urgency = value ?? 'standard';
  if (urgency !== 'standard' && urgency !== 'urgent' && urgency !== 'emergency') {
    throw new Error('Invalid Enquiry urgency');
  }
  return urgency;
};

const validateSource = (value: unknown): CreateEnquiryInput['source'] => {
  const source = value ?? 'marketplace';
  if (source !== 'marketplace') {
    throw new Error('Only marketplace Enquiries may be created');
  }
  return source;
};

const validateStatus = (value: unknown): EnquiryStatus => {
  if (value !== 'new' && value !== 'contacted' && value !== 'qualified' && value !== 'quoted' && value !== 'won' && value !== 'lost' && value !== 'archived') {
    throw new Error('Invalid Enquiry status');
  }
  return value;
};

const normalizeCreateInput = (input: CreateEnquiryInput): CreateEnquiryInput => {
  const businessId = input.businessId;
  if (!Number.isSafeInteger(businessId) || businessId <= 0) throw new Error('Invalid businessId');
  const customerName = validateText(input.customerName, 'customerName', 1, 200);
  const customerPhone = validateOptionalText(input.customerPhone, 'customerPhone', 7, 32);
  const customerEmail = validateOptionalText(input.customerEmail, 'customerEmail', 3, 320);
  const project = validateText(input.project, 'project', 1, 200);
  const description = validateText(input.description, 'description', 10, 5000);
  const city = validateOptionalText(input.city, 'city', 1, 120);
  const budgetMin = validateBudget(input.budgetMin, 'budgetMin');
  const budgetMax = validateBudget(input.budgetMax, 'budgetMax');
  if (budgetMin !== null && budgetMax !== null && budgetMax < budgetMin) {
    throw new Error('budgetMax must be greater than or equal to budgetMin');
  }
  return { businessId, customerName, customerPhone, customerEmail, project, description, city, budgetMin, budgetMax, urgency: validateUrgency(input.urgency), source: validateSource(input.source) };
};

const normalizeStatusInput = (input: UpdateEnquiryStatusInput): UpdateEnquiryStatusInput => ({ status: validateStatus(input.status) });

export class EnquiryServiceImpl implements EnquiryService {
  constructor(private readonly repository: EnquiryRepository) {}
  async createEnquiry(context: AuthContext, input: CreateEnquiryInput): Promise<Enquiry> {
    assertRole(context, 'customer');
    return this.repository.createEnquiry(context, normalizeCreateInput(input));
  }
  async getOwnEnquiry(context: AuthContext, enquiryId: number): Promise<Enquiry | null> {
    assertRole(context, 'customer');
    return this.repository.getOwnEnquiry(context, enquiryId);
  }
  async getReceivedEnquiry(context: AuthContext, enquiryId: number): Promise<Enquiry | null> {
    assertRole(context, 'business');
    return this.repository.getReceivedEnquiry(context, enquiryId);
  }
  async updateReceivedEnquiryStatus(context: AuthContext, enquiryId: number, input: UpdateEnquiryStatusInput): Promise<Enquiry> {
    assertRole(context, 'business');
    return this.repository.updateReceivedEnquiryStatus(context, enquiryId, normalizeStatusInput(input));
  }
}
