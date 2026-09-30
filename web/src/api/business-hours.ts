import { CONSTRUCTION_MANAGED_BUSINESS_ID } from '../config/construction-business';

/** Canonical Connect/GHM mapping: 0 = Sunday … 6 = Saturday. */
export const BUSINESS_HOURS_DAY_LABELS = Object.freeze([
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const);

/** Display order Monday → Sunday while retaining canonical dayOfWeek indexes. */
export const BUSINESS_HOURS_DISPLAY_ORDER = Object.freeze([1, 2, 3, 4, 5, 6, 0] as const);

export interface BusinessHoursRow {
  readonly id: number;
  readonly businessId: number;
  readonly dayOfWeek: number;
  readonly isClosed: boolean;
  readonly openTime: string | null;
  readonly closeTime: string | null;
  readonly createdBy: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class BusinessHoursApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'BusinessHoursApiError';
  }
}

export interface BusinessHoursClient {
  getBusinessHours(businessId?: number): Promise<readonly BusinessHoursRow[]>;
}

export interface WeeklyHoursDay {
  readonly dayOfWeek: number;
  readonly label: string;
  readonly status: 'open' | 'closed' | 'unset';
  readonly openTime: string | null;
  readonly closeTime: string | null;
}

const parseHoursRow = (value: unknown): BusinessHoursRow | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'number' ||
    typeof row.businessId !== 'number' ||
    typeof row.dayOfWeek !== 'number' ||
    !Number.isInteger(row.dayOfWeek) ||
    row.dayOfWeek < 0 ||
    row.dayOfWeek > 6 ||
    typeof row.isClosed !== 'boolean' ||
    typeof row.createdAt !== 'string' ||
    typeof row.updatedAt !== 'string'
  ) {
    return null;
  }
  if (row.openTime !== null && typeof row.openTime !== 'string') return null;
  if (row.closeTime !== null && typeof row.closeTime !== 'string') return null;
  if (row.createdBy !== null && typeof row.createdBy !== 'number') return null;
  return {
    id: row.id,
    businessId: row.businessId,
    dayOfWeek: row.dayOfWeek,
    isClosed: row.isClosed,
    openTime: row.openTime,
    closeTime: row.closeTime,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const readErrorCode = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // ignore
  }
  return 'request_failed';
};

export const userFacingBusinessHoursError = (error: unknown): string => {
  if (error instanceof BusinessHoursApiError) {
    if (error.httpStatus === 403) return 'You do not have permission to view these business hours.';
    if (error.httpStatus === 404) return 'Business hours were not found.';
    if (error.httpStatus === 401) return 'Your session is no longer valid. Please sign in again.';
    return 'Unable to load business hours from GHM.';
  }
  return 'Unable to load business hours from GHM.';
};

/** Build a full Mon→Sun week from API rows (missing days are unset). */
export const buildWeeklyHoursDisplay = (
  hours: readonly BusinessHoursRow[],
): readonly WeeklyHoursDay[] => {
  const byDay = new Map<number, BusinessHoursRow>();
  for (const row of hours) {
    byDay.set(row.dayOfWeek, row);
  }
  return BUSINESS_HOURS_DISPLAY_ORDER.map((dayOfWeek) => {
    const label = BUSINESS_HOURS_DAY_LABELS[dayOfWeek];
    const row = byDay.get(dayOfWeek);
    if (!row) {
      return { dayOfWeek, label, status: 'unset', openTime: null, closeTime: null };
    }
    if (row.isClosed) {
      return { dayOfWeek, label, status: 'closed', openTime: null, closeTime: null };
    }
    return {
      dayOfWeek,
      label,
      status: 'open',
      openTime: row.openTime,
      closeTime: row.closeTime,
    };
  });
};

export const formatHoursScheduleLine = (day: WeeklyHoursDay): string => {
  if (day.status === 'closed') return 'Closed';
  if (day.status === 'unset') return '—';
  const open = day.openTime ?? '—';
  const close = day.closeTime ?? '—';
  return `${open} – ${close}`;
};

export const createBusinessHoursClient = (
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
): BusinessHoursClient => ({
  async getBusinessHours(
    businessId: number = CONSTRUCTION_MANAGED_BUSINESS_ID,
  ): Promise<readonly BusinessHoursRow[]> {
    const response = await apiFetch(`/api/v1/businesses/${businessId}/hours`, {
      method: 'GET',
    });
    if (!response.ok) {
      const code = await readErrorCode(response);
      throw new BusinessHoursApiError(
        `Business hours request failed (${response.status}): ${code}`,
        response.status,
        code,
      );
    }
    const body = (await response.json()) as { hours?: unknown };
    if (!Array.isArray(body.hours)) {
      throw new BusinessHoursApiError(
        'Business hours response was invalid',
        response.status,
        'invalid_response',
      );
    }
    const parsed: BusinessHoursRow[] = [];
    for (const item of body.hours) {
      const row = parseHoursRow(item);
      if (!row) {
        throw new BusinessHoursApiError(
          'Business hours response was invalid',
          response.status,
          'invalid_response',
        );
      }
      parsed.push(row);
    }
    return parsed;
  },
});
