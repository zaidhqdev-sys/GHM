import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BusinessApiError,
  createBusinessClient,
  userFacingBusinessError,
  type BusinessIdentity,
} from './business';
import { CONSTRUCTION_MANAGED_BUSINESS_ID } from '../config/construction-business';
import { BusinessProfileView } from '../pages/BusinessProfilePage';
import { REFRESH_TOKEN_STORAGE_KEY } from '../auth/session';

const sampleBusiness = (overrides: Partial<BusinessIdentity> = {}): BusinessIdentity => ({
  id: 265,
  name: 'Zaid Technologies',
  slug: 'zaid-technologies',
  description: 'Construction business',
  phone: '0111234567',
  email: 'ops@example.com',
  insuranceVerified: true,
  jobsCompleted: 12,
  verificationStatus: 'unverified',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

describe('business API client', () => {
  it('calls managed Business Profile through the provided apiFetch (existing auth client path)', async () => {
    const apiFetch = vi.fn(async () =>
      Response.json({ business: sampleBusiness() }, { status: 200 }),
    );
    const client = createBusinessClient(apiFetch);
    const business = await client.getManagedBusiness();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const call = apiFetch.mock.calls[0];
    expect(call).toBeDefined();
    const [path, init] = call!;
    expect(path).toBe(`/api/v1/businesses/${CONSTRUCTION_MANAGED_BUSINESS_ID}/managed`);
    expect((init as RequestInit | undefined)?.method).toBe('GET');
    expect(business.id).toBe(265);
    expect(business.name).toBe('Zaid Technologies');
  });

  it('does not introduce a second token store key for business API', () => {
    expect(REFRESH_TOKEN_STORAGE_KEY).toBe('ghm.refreshToken');
    expect(Object.keys(createBusinessClient(async () => new Response())).sort()).toEqual([
      'getManagedBusiness',
    ]);
  });

  it('maps 403/404 into clear user-facing errors', () => {
    expect(userFacingBusinessError(new BusinessApiError('x', 403, 'forbidden'))).toContain(
      'permission',
    );
    expect(userFacingBusinessError(new BusinessApiError('x', 404, 'not_found'))).toContain(
      'not found',
    );
  });
});

describe('BusinessProfileView', () => {
  it('renders a successful managed Business Profile response', () => {
    const html = renderToStaticMarkup(
      <BusinessProfileView
        loading={false}
        error={null}
        business={sampleBusiness()}
        businessId={265}
      />,
    );
    expect(html).toContain('Zaid Technologies');
    expect(html).toContain('zaid-technologies');
    expect(html).toContain('Construction business');
    expect(html).toContain('0111234567');
    expect(html).toContain('ops@example.com');
    expect(html).toContain('Yes');
    expect(html).toContain('12');
    expect(html).toContain('unverified');
    expect(html).not.toContain('accessToken');
    expect(html).not.toContain('refreshToken');
  });

  it('renders empty optional fields safely as placeholders', () => {
    const html = renderToStaticMarkup(
      <BusinessProfileView
        loading={false}
        error={null}
        business={sampleBusiness({
          description: null,
          phone: null,
          email: null,
        })}
        businessId={265}
      />,
    );
    expect(html).toContain('Description');
    expect(html).toContain('Phone');
    expect(html).toContain('Email');
    expect(html).toContain('—');
    expect(html).not.toContain('null');
  });

  it('renders the user-facing error state', () => {
    const html = renderToStaticMarkup(
      <BusinessProfileView
        loading={false}
        error="You do not have permission to manage this business."
        business={null}
        businessId={265}
      />,
    );
    expect(html).toContain('You do not have permission to manage this business.');
    expect(html).toContain('role="alert"');
  });
});
