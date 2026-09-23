import { useEffect, useState } from 'react';
import {
  createBusinessClient,
  userFacingBusinessError,
  type BusinessIdentity,
} from '../api/business';
import { CONSTRUCTION_MANAGED_BUSINESS_ID } from '../config/construction-business';
import { useGhmSession } from '../auth/GhmSessionProvider';

const displayText = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value.trim() === '') return '—';
  return value;
};

const displayBoolean = (value: boolean): string => (value ? 'Yes' : 'No');

/** Presentational surface — used by the page and by focused render tests. */
export const BusinessProfileView = ({
  loading,
  error,
  business,
  businessId,
}: {
  readonly loading: boolean;
  readonly error: string | null;
  readonly business: BusinessIdentity | null;
  readonly businessId: number;
}) => (
  <section className="profile-page" data-testid="business-profile-page">
    <h2>Business Profile</h2>
    <p className="muted">
      Loaded from GET /api/v1/businesses/{businessId}/managed
    </p>
    {loading ? <p>Loading business profile…</p> : null}
    {error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : null}
    {business && !loading ? (
      <dl className="profile-grid">
        <div>
          <dt>Business name</dt>
          <dd>{displayText(business.name)}</dd>
        </div>
        <div>
          <dt>Slug</dt>
          <dd>{displayText(business.slug)}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{displayText(business.description)}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{displayText(business.phone)}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{displayText(business.email)}</dd>
        </div>
        <div>
          <dt>Insurance verified</dt>
          <dd>{displayBoolean(business.insuranceVerified)}</dd>
        </div>
        <div>
          <dt>Jobs completed</dt>
          <dd>{business.jobsCompleted}</dd>
        </div>
        <div>
          <dt>Verification status</dt>
          <dd>{displayText(business.verificationStatus)}</dd>
        </div>
        <div>
          <dt>Active status</dt>
          <dd>{displayBoolean(business.isActive)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{displayText(business.createdAt)}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{displayText(business.updatedAt)}</dd>
        </div>
      </dl>
    ) : null}
  </section>
);

export const BusinessProfilePage = () => {
  const { client } = useGhmSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);

  useEffect(() => {
    let cancelled = false;
    const businessClient = createBusinessClient((path, init) => client.apiFetch(path, init));

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await businessClient.getManagedBusiness(CONSTRUCTION_MANAGED_BUSINESS_ID);
        if (!cancelled) {
          setBusiness(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(userFacingBusinessError(err));
          setBusiness(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <BusinessProfileView
      loading={loading}
      error={error}
      business={business}
      businessId={CONSTRUCTION_MANAGED_BUSINESS_ID}
    />
  );
};
