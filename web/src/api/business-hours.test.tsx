import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BUSINESS_HOURS_DAY_LABELS,
  BUSINESS_HOURS_DISPLAY_ORDER,
  BusinessHoursApiError,
  buildWeeklyHoursDisplay,
  createBusinessHoursClient,
  formatHoursScheduleLine,
  userFacingBusinessHoursError,
  type BusinessHoursRow,
} from './business-hours';
import { CONSTRUCTION_MANAGED_BUSINESS_ID } from '../config/construction-business';
import { BusinessHoursView } from '../pages/BusinessHoursPage';
import { REFRESH_TOKEN_STORAGE_KEY } from '../auth/session';

const sampleRow = (overrides: Partial<BusinessHoursRow> = {}): BusinessHoursRow => ({
  id: 1,
  businessId: 265,
  dayOfWeek: 1,
  isClosed: false,
  openTime: '08:00:00',
  closeTime: '17:00:00',
  createdBy: 468,
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:30:00.000Z',
  ...overrides,
});

describe('business hours API client', () => {
  it('calls the exact managed GET hours endpoint via apiFetch', async () => {
    const apiFetch = vi.fn(async () =>
      Response.json({ hours: [sampleRow()] }, { status: 200 }),
    );
    const client = createBusinessHoursClient(apiFetch);
    const hours = await client.getBusinessHours();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const call = apiFetch.mock.calls[0];
    expect(call).toBeDefined();
    const [path, init] = call!;
    expect(path).toBe(`/api/v1/businesses/${CONSTRUCTION_MANAGED_BUSINESS_ID}/hours`);
    expect((init as RequestInit | undefined)?.method).toBe('GET');
    expect(hours).toHaveLength(1);
    expect(hours[0]?.dayOfWeek).toBe(1);
    expect(hours[0]?.openTime).toBe('08:00:00');
  });

  it('parses a valid response shape and rejects invalid rows', async () => {
    const ok = createBusinessHoursClient(async () =>
      Response.json({ hours: [sampleRow({ dayOfWeek: 0, isClosed: true, openTime: null, closeTime: null })] }),
    );
    const closed = await ok.getBusinessHours(265);
    expect(closed[0]?.isClosed).toBe(true);

    const bad = createBusinessHoursClient(async () =>
      Response.json({ hours: [{ ...sampleRow(), dayOfWeek: 9 }] }),
    );
    await expect(bad.getBusinessHours(265)).rejects.toBeInstanceOf(BusinessHoursApiError);
  });

  it('does not introduce a second token store', () => {
    expect(REFRESH_TOKEN_STORAGE_KEY).toBe('ghm.refreshToken');
    expect(Object.keys(createBusinessHoursClient(async () => new Response())).sort()).toEqual([
      'getBusinessHours',
    ]);
  });
});

describe('weekly hours mapping', () => {
  it('uses canonical dayOfWeek 0–6 labels and Mon→Sun display order', () => {
    expect(BUSINESS_HOURS_DAY_LABELS[0]).toBe('Sunday');
    expect(BUSINESS_HOURS_DAY_LABELS[1]).toBe('Monday');
    expect(BUSINESS_HOURS_DAY_LABELS[6]).toBe('Saturday');
    expect([...BUSINESS_HOURS_DISPLAY_ORDER]).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('builds seven-day display including closed and unset days', () => {
    const week = buildWeeklyHoursDisplay([
      sampleRow({ dayOfWeek: 1, isClosed: false, openTime: '09:00', closeTime: '17:00' }),
      sampleRow({ id: 2, dayOfWeek: 0, isClosed: true, openTime: null, closeTime: null }),
    ]);
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.label)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(formatHoursScheduleLine(week[0]!)).toBe('09:00 – 17:00');
    expect(formatHoursScheduleLine(week[1]!)).toBe('—');
    expect(formatHoursScheduleLine(week[6]!)).toBe('Closed');
  });

  it('renders empty API hours as a full unset week', () => {
    const week = buildWeeklyHoursDisplay([]);
    expect(week).toHaveLength(7);
    expect(week.every((d) => d.status === 'unset')).toBe(true);
  });
});

describe('BusinessHoursView', () => {
  it('renders seven-day schedule without leaking tokens', () => {
    const days = buildWeeklyHoursDisplay([
      sampleRow({ dayOfWeek: 1 }),
      sampleRow({ id: 2, dayOfWeek: 6, isClosed: true, openTime: null, closeTime: null }),
    ]);
    const html = renderToStaticMarkup(
      <BusinessHoursView loading={false} error={null} days={days} businessId={265} />,
    );
    expect(html).toContain('Monday');
    expect(html).toContain('Sunday');
    expect(html).toContain('08:00:00 – 17:00:00');
    expect(html).toContain('Closed');
    expect(html).not.toContain('accessToken');
    expect(html).not.toContain('refreshToken');
  });

  it('renders user-facing error state', () => {
    const html = renderToStaticMarkup(
      <BusinessHoursView
        loading={false}
        error={userFacingBusinessHoursError(new BusinessHoursApiError('x', 403, 'forbidden'))}
        days={null}
        businessId={265}
      />,
    );
    expect(html).toContain('You do not have permission to view these business hours.');
    expect(html).toContain('role="alert"');
  });
});
