import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { generatePayfastSignature, PAYFAST_ITN_VALIDATION_URLS, verifyPayfastItn } from './payfast';

type Environment = 'sandbox' | 'live';
const amountMinor = (value: unknown): number => Number(value);
const encodeFields = (fields: Readonly<Record<string, string>>): string =>
  Object.entries(fields).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, '+')}`).join('&');

export const parsePayfastItnFields = (value: unknown): Record<string, string> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 64) return null;
  if (entries.some(([key, item]) => !/^[a-zA-Z0-9_]{1,64}$/.test(key) || typeof item !== 'string' || item.length > 2048)) return null;
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
        body: encodeFields(fields),
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
    if (!['pending_checkout', 'pending_payment'].includes(attempt.attempt_status)) throw new Error('Payfast payment attempt is not payable');
    const verified = verifyPayfastItn({
      fields,
      sourceIp,
      expectedMerchantId: this.settings.merchantId,
      expectedAmountMinorUnits: amountMinor(attempt.amount_minor_units),
      passphrase: this.settings.passphrase,
    });
    const providerPaymentId = verified.providerPaymentId;
    if (!providerPaymentId || !/^[!-~]{1,200}$/.test(providerPaymentId)) throw new Error('Payfast ITN provider payment identifier missing or invalid');
    await this.validate(fields, this.settings.environment);
    const payloadHash = createHash('sha256').update(JSON.stringify(fields), 'utf8').digest('hex');
    const status = verified.transactionStatus.trim().toUpperCase();
    if (!['COMPLETE', 'FAILED', 'CANCELLED', 'PENDING'].includes(status)) throw new Error('Payfast ITN payment status invalid');
    if (verified.merchantPaymentId !== String(paymentAttemptId)) throw new Error('Payfast ITN merchant payment identifier mismatch');
    const transactionStatus = status === 'COMPLETE' ? 'succeeded' : status === 'FAILED' || status === 'CANCELLED' ? 'failed' : 'pending';
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

export const callbackSignature = (fields: Record<string, string>, passphrase?: string | null): string =>
  generatePayfastSignature(fields, passphrase);
