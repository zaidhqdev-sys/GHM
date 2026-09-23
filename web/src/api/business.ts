import { CONSTRUCTION_MANAGED_BUSINESS_ID } from '../config/construction-business';

export interface BusinessIdentity {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly insuranceVerified: boolean;
  readonly jobsCompleted: number;
  readonly verificationStatus: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class BusinessApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'BusinessApiError';
  }
}

export interface BusinessClient {
  getManagedBusiness(businessId?: number): Promise<BusinessIdentity>;
}

const parseBusiness = (value: unknown): BusinessIdentity | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'number' ||
    typeof row.name !== 'string' ||
    typeof row.slug !== 'string' ||
    typeof row.insuranceVerified !== 'boolean' ||
    typeof row.jobsCompleted !== 'number' ||
    typeof row.verificationStatus !== 'string' ||
    typeof row.isActive !== 'boolean' ||
    typeof row.createdAt !== 'string' ||
    typeof row.updatedAt !== 'string'
  ) {
    return null;
  }
  if (row.description !== null && typeof row.description !== 'string') return null;
  if (row.phone !== null && typeof row.phone !== 'string') return null;
  if (row.email !== null && typeof row.email !== 'string') return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    phone: row.phone,
    email: row.email,
    insuranceVerified: row.insuranceVerified,
    jobsCompleted: row.jobsCompleted,
    verificationStatus: row.verificationStatus,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const readErrorCode = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // ignore non-JSON
  }
  return 'request_failed';
};

export const userFacingBusinessError = (error: unknown): string => {
  if (error instanceof BusinessApiError) {
    if (error.httpStatus === 403) return 'You do not have permission to manage this business.';
    if (error.httpStatus === 404) return 'Managed business profile was not found.';
    if (error.httpStatus === 401) return 'Your session is no longer valid. Please sign in again.';
    return 'Unable to load business profile from GHM.';
  }
  return 'Unable to load business profile from GHM.';
};

export const createBusinessClient = (
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
): BusinessClient => ({
  async getManagedBusiness(
    businessId: number = CONSTRUCTION_MANAGED_BUSINESS_ID,
  ): Promise<BusinessIdentity> {
    const response = await apiFetch(`/api/v1/businesses/${businessId}/managed`, {
      method: 'GET',
    });
    if (!response.ok) {
      const code = await readErrorCode(response);
      throw new BusinessApiError(
        `Managed business request failed (${response.status}): ${code}`,
        response.status,
        code,
      );
    }
    const body = (await response.json()) as { business?: unknown };
    const business = parseBusiness(body.business);
    if (!business) {
      throw new BusinessApiError('Managed business response was invalid', response.status, 'invalid_response');
    }
    return business;
  },
});
