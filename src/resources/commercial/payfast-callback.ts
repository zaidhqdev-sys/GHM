import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { PAYFAST_ITN_VALIDATION_URLS, verifyPayfastItn } from './payfast';

type Environment = 'sandbox' | 'live';
const amountMinor = (value: unknown): number => Number(value);
export const encodePayfastValidationFields = (fields: Readonly<Record<string, string>>): string =>
  Object.entries(fields).filter(([key, value]) => key !== 'signature' && value !== '').map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, '+')}`).join('&');

const PAYFAST_ITN_FIELDS = new Set([
  'm_payment_id', 'pf_payment_id', 'payment_status', 'item_name', 'item_description',
  'amount_gross', 'amount_fee', 'amount_net', 'name_first', 'name_last',
  'email_address', 'cell_number', 'merchant_id', 'signature', 'token', 'billing_date',
]);
const isPayfastItnField = (key: string): boolean =>
  PAYFAST_ITN_FIELDS.has(key) || /^custom_(?:int|str)[1-5]$/.test(key);

export const parsePayfastItnFields = (value: unknown): Record<string, string> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 64) return null;
  if (entries.some(([key, item]) => !isPayfastItnField(key) || typeof item !== 'string' || item.length > 2048)) return null;
  return Object.fromEntries(entries as Array<[string, string]>);
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
      if (!response.ok || (await response.text()).trim() !== 'VALID') throw new Error('Payfast server confirmation invalid');
    },
  ) {}

  async handleItn(fields: Readonly<Record<string, string>>, sourceIp: string): Promise<void> {
    if (!this.settings.merchantId) throw new Error('Payfast merchant ID is not configured');
    const rawId = fields.m_payment_id?.trim() ?? '';
    const paymentAttemptId = Number(rawId);
    if (!Number.isSafeInteger(paymentAttemptId) || paymentAttemptId <= 0 || String(paymentAttemptId) !== rawId) {
      throw new Error('Payfast ITN payment identifier invalid');
    }
    const lookup = await this.database.query(
      'SELECT * FROM ghm.commercial_get_payfast_attempt($1)',
      [paymentAttemptId],
    );
    if (lookup.rowCount !== 1) throw new Error('Commercial payment attempt not found');
    const attempt = lookup.rows[0];
    if (attempt.provider_code !== 'payfast') throw new Error('Payfast payment attempt provider mismatch');
    if (attempt.currency_code !== 'ZAR') throw new Error('Payfast settlement requires ZAR');
    const verified = verifyPayfastItn({
      fields,
      sourceIp,
      expectedMerchantId: this.settings.merchantId,
      expectedAmountMinorUnits: amountMinor(attempt.amount_minor_units),
      passphrase: this.settings.passphrase,
    });
    const providerPaymentId = verified.providerPaymentId;
    if (!providerPaymentId || !/^[!-~]{1,200}$/.test(providerPaymentId)) throw new Error('Payfast ITN provider payment identifier missing or invalid');
    const status = verified.transactionStatus.trim().toUpperCase();
    if (!['COMPLETE', 'CANCELLED'].includes(status)) throw new Error('Payfast ITN payment status invalid');
    if (verified.merchantPaymentId !== String(paymentAttemptId)) throw new Error('Payfast ITN merchant payment identifier mismatch');
    await this.validate(fields, this.settings.environment);
    const payloadHash = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)))), 'utf8').digest('hex');
    const transactionStatus = status === 'COMPLETE' ? 'succeeded' : 'failed';
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
  }
}
