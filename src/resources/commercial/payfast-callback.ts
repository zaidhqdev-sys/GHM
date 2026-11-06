import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { PAYFAST_ITN_VALIDATION_URLS, verifyPayfastItn } from './payfast';

type Environment = 'sandbox' | 'live';

export const resolvePayfastEnvironment = (
  nodeEnvironment: string | undefined,
  configuredEnvironment: string | undefined,
): Environment => {
  const configured = configuredEnvironment?.trim();
  if (nodeEnvironment === 'production' && !configured) {
    throw new Error('PAYFAST_ENVIRONMENT must be explicitly set to sandbox or live in production');
  }
  const environment = configured || 'sandbox';
  if (environment !== 'sandbox' && environment !== 'live') {
    throw new Error('PAYFAST_ENVIRONMENT must be sandbox or live');
  }
  return environment;
};
export class PayfastItnPermanentError extends Error {
  constructor(readonly reason: string) {
    super(`Payfast ITN rejected: ${reason.replace(/_/g, ' ')}`);
    this.name = 'PayfastItnPermanentError';
  }
}

const PERMANENT_VERIFICATION_MESSAGES = new Set([
  'Payfast ITN signature missing',
  'Payfast ITN source IP invalid',
  'Payfast ITN merchant mismatch',
  'Payfast ITN signature invalid',
  'Payfast ITN amount mismatch',
  'Payfast ITN payment status missing',
]);

export const classifyPayfastVerificationError = (error: unknown): PayfastItnPermanentError | null => {
  if (!(error instanceof Error) || !PERMANENT_VERIFICATION_MESSAGES.has(error.message)) return null;
  return new PayfastItnPermanentError(
    error.message.replace(/^Payfast ITN /, '').replace(/[^a-zA-Z0-9 ]/g, '').trim().replaceAll(' ', '_').toLowerCase(),
  );
};

export type PayfastItnFailureDisposition =
  | { readonly retry: false; readonly reason: string }
  | { readonly retry: true; readonly reason: 'transient_failure' };

export const classifyPayfastItnFailure = (error: unknown): PayfastItnFailureDisposition => {
  if (error instanceof PayfastItnPermanentError) {
    return { retry: false, reason: error.reason };
  }
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    if ([400, 413, 415].includes(status)) return { retry: false, reason: 'malformed_request' };
  }
  return { retry: true, reason: 'transient_failure' };
};

export const payfastItnHttpStatus = (error: unknown): 200 | 500 =>
  classifyPayfastItnFailure(error).retry ? 500 : 200;

const amountMinor = (value: unknown): number => Number(value);
export const encodePayfastValidationFields = (fields: Readonly<Record<string, string>>): string =>
  Object.entries(fields).filter(([key, value]) => key !== 'signature' && value !== '').map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, '+')}`).join('&');

const PAYFAST_ITN_FIELDS = new Set([
  'm_payment_id', 'pf_payment_id', 'payment_status', 'item_name', 'item_description',
  'amount_gross', 'amount_fee', 'amount_net', 'name_first', 'name_last',
  'email_address', 'cell_number', 'merchant_id', 'signature', 'token', 'billing_date', 'payment_date',
]);
const isPayfastItnField = (key: string): boolean =>
  PAYFAST_ITN_FIELDS.has(key) || /^custom_(?:int|str)[1-5]$/.test(key);

export const parsePayfastItnFields = (value: unknown): Record<string, string> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 64) return null;
  if (entries.some(([key, item]) => !isPayfastItnField(key) || typeof item !== 'string' || item.length > 2048)) return null;
  const parsed = Object.fromEntries(entries as Array<[string, string]>);
  if (['m_payment_id', 'pf_payment_id', 'payment_status', 'item_name', 'amount_gross', 'merchant_id', 'signature'].some((key) => !parsed[key])) return null;
  return parsed;
};

export interface PayfastCallbackConfig {
  readonly merchantId: string;
  readonly passphrase: string | null;
  readonly environment: Environment;
}

export class PayfastCallbackBoundary {
  constructor(
    private readonly database: Pick<Pool, 'query'>,
    private readonly settings: PayfastCallbackConfig,
    private readonly validate: (fields: Readonly<Record<string, string>>, environment: Environment) => Promise<void> = async (fields, environment) => {
      const response = await fetch(PAYFAST_ITN_VALIDATION_URLS[environment], {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: encodePayfastValidationFields(fields),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Payfast server confirmation unavailable (HTTP ${response.status})`);
      if ((await response.text()).trim() !== 'VALID') throw new PayfastItnPermanentError('server_confirmation_invalid');
    },
  ) {}

  async handleItn(fields: Readonly<Record<string, string>>, sourceIp: string): Promise<void> {
    if (!this.settings.merchantId) throw new Error('Payfast merchant ID is not configured');
    const rawId = fields.m_payment_id?.trim() ?? '';
    const paymentAttemptId = Number(rawId);
    if (!Number.isSafeInteger(paymentAttemptId) || paymentAttemptId <= 0 || String(paymentAttemptId) !== rawId) {
      throw new PayfastItnPermanentError('payment_identifier_invalid');
    }
    const lookup = await this.database.query(
      'SELECT * FROM ghm.commercial_get_payfast_attempt($1)',
      [paymentAttemptId],
    );
    if (lookup.rowCount !== 1) throw new PayfastItnPermanentError('payment_attempt_not_found');
    const attempt = lookup.rows[0];
    if (attempt.provider_code !== 'payfast') throw new PayfastItnPermanentError('provider_mismatch');
    if (attempt.currency_code !== 'ZAR') throw new PayfastItnPermanentError('currency_mismatch');
    let verified: ReturnType<typeof verifyPayfastItn>;
    try {
      verified = verifyPayfastItn({
      fields,
      sourceIp,
      expectedMerchantId: this.settings.merchantId,
      expectedAmountMinorUnits: amountMinor(attempt.amount_minor_units),
      passphrase: this.settings.passphrase,
      });
    } catch (error) {
      const permanentError = classifyPayfastVerificationError(error);
      if (permanentError) throw permanentError;
      throw error;
    }
    const providerPaymentId = verified.providerPaymentId;
    if (!providerPaymentId || !/^\d{1,20}$/.test(providerPaymentId)) throw new PayfastItnPermanentError('provider_payment_identifier_invalid');
    const status = verified.transactionStatus.trim().toUpperCase();
    if (!['COMPLETE', 'CANCELLED'].includes(status)) throw new PayfastItnPermanentError('payment_status_invalid');
    if (verified.merchantPaymentId !== String(paymentAttemptId)) throw new PayfastItnPermanentError('merchant_payment_identifier_mismatch');
    await this.validate(fields, this.settings.environment);
    const payloadHash = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)))), 'utf8').digest('hex');
    const transactionStatus = status === 'COMPLETE' ? 'succeeded' : 'failed';
    try {
      await this.database.query(
      `SELECT * FROM ghm.commercial_apply_payfast_payment_result(
        $1,$2,$3,$4,$5,$6,$7,$8,$9
      )`,
      [
        paymentAttemptId,
        providerPaymentId,
        'itn',
        payloadHash,
        'payment',
        transactionStatus,
        providerPaymentId,
        verified.occurredAt ?? new Date(),
        JSON.stringify({
          merchant_payment_id: verified.merchantPaymentId,
          provider_payment_id: providerPaymentId,
          payment_status: verified.transactionStatus,
          source_ip: sourceIp,
        }),
      ],
      );
    } catch (error) {
      if (error instanceof Error && /not payable|invalid commercial payment result input|provider does not match attempt|payload hash conflict/i.test(error.message)) {
        throw new PayfastItnPermanentError('settlement_rejected');
      }
      throw error;
    }
  }
}