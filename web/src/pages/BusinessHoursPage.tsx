import { useEffect, useState } from 'react';
import {
  buildWeeklyHoursDisplay,
  createBusinessHoursClient,
  formatHoursScheduleLine,
  userFacingBusinessHoursError,
  type WeeklyHoursDay,
} from '../api/business-hours';
import { CONSTRUCTION_MANAGED_BUSINESS_ID } from '../config/construction-business';
import { useGhmSession } from '../auth/GhmSessionProvider';

export const BusinessHoursView = ({
  loading,
  error,
  days,
  businessId,
}: {
  readonly loading: boolean;
  readonly error: string | null;
  readonly days: readonly WeeklyHoursDay[] | null;
  readonly businessId: number;
}) => (
  <section className="profile-page" data-testid="business-hours-page">
    <h2>Business Hours</h2>
    <p className="muted">Loaded from GET /api/v1/businesses/{businessId}/hours</p>
    {loading ? <p>Loading business hours…</p> : null}
    {error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : null}
    {days && !loading && !error ? (
      <dl className="profile-grid hours-grid">
        {days.map((day) => (
          <div key={day.dayOfWeek}>
            <dt>{day.label}</dt>
            <dd>{formatHoursScheduleLine(day)}</dd>
          </div>
        ))}
      </dl>
    ) : null}
  </section>
);

export const BusinessHoursPage = () => {
  const { client } = useGhmSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<readonly WeeklyHoursDay[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hoursClient = createBusinessHoursClient((path, init) => client.apiFetch(path, init));

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const hours = await hoursClient.getBusinessHours(CONSTRUCTION_MANAGED_BUSINESS_ID);
        if (!cancelled) {
          setDays(buildWeeklyHoursDisplay(hours));
        }
      } catch (err) {
        if (!cancelled) {
          setError(userFacingBusinessHoursError(err));
          setDays(null);
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
    <BusinessHoursView
      loading={loading}
      error={error}
      days={days}
      businessId={CONSTRUCTION_MANAGED_BUSINESS_ID}
    />
  );
};
