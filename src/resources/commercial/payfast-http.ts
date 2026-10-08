import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { config } from '../../config';
import { generatePayfastSignature, PAYFAST_ITN_VALIDATION_URLS, PAYFAST_PAYMENT_URLS, verifyPayfastItn } from './payfast';
import type { ApplyCommercialPaymentResultInput, CommercialPaymentTransaction, CommercialProviderBoundary } from './contracts';

export interface PayfastCheckout {
  readonly actionUrl: string;
  readonly fields: Readonly<Record<string, string>>;
}

export type PayfastItnValidator = (
  fields: Readonly<Record<string, string>>,
  environment: 'sandbox' | 'live',
) => Promise<void>;

const amountMajor = (minor: number): string => (minor / 100).toFixed(2);
const requireAttemptId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('paymentAttemptId must be a positive integer');
  return value as number;
};
const payloadHash = (fields: Readonly<Record<string, string>>): string =>
  createHash('sha256').update(JSON.stringify(fields), 'utf8').digest('hex');

const encodeItnFields = (fields: Readonly<Record<string, string>>): string =>
  Object.entries(fields)
    .filter(([key, value]) => key !== 'signature' && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, '+')}`)
    .join('&');

export const validatePayfastItnWithProvider: PayfastItnValidator = async (fields, environment) => {
  const response = await fetch(PAYFAST_ITN_VALIDATION_URLS[environment], {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: encodeItnFields(fields),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Payfast ITN server confirmation HTTP ${response.status}`);
  const result = (await response.text()).trim();
  if (result !== 'VALID') throw new Error('Payfast ITN server confirmation invalid');
};

export const buildPayfastCheckout = (input: {
  merchantId: string; merchantKey: string; passphrase?: string | null; environment: 'sandbox' | 'live';
  paymentAttemptId: number; amountMinorUnits: number; itemName: string;
  returnUrl: string; cancelUrl: string; notifyUrl: string;
}): PayfastCheckout => {
  const fields: Record<string, string> = {
    merchant_id: input.merchantId, merchant_key: input.merchantKey,
    m_payment_id: String(input.paymentAttemptId), amount: amountMajor(input.amountMinorUnits),
    item_name: input.itemName, return_url: input.returnUrl, cancel_url: input.cancelUrl, notify_url: input.notifyUrl,
  };
  fields.signature = generatePayfastSignature(fields, input.passphrase);
  return { actionUrl: PAYFAST_PAYMENT_URLS[input.environment], fields };
};

const transactionStatus = (status: string): ApplyCommercialPaymentResultInput['transactionStatus'] => {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'COMPLETE') return 'succeeded';
  if (normalized === 'FAILED' || normalized === 'CANCELLED') return 'failed';
  return 'pending';
};

export class PayfastHttpBoundary {
  constructor(
    private readonly transactionPool: Pick<Pool, 'query'>,
    private readonly providerBoundary: CommercialProviderBoundary,
    private readonly validateItn: PayfastItnValidator = validatePayfastItnWithProvider,
  ) {}

  async createCheckout(paymentAttemptIdValue: unknown): Promise<PayfastCheckout> {
    const paymentAttemptId = requireAttemptId(paymentAttemptIdValue);
    const result = await this.transactionPool.query(
      `SELECT a.id, a.amount_minor_units, a.attempt_status, c.code AS currency_code, b.name AS business_name
       FROM ghm.commercial_payment_attempt a
       JOIN ghm.currency c ON c.id = a.currency_id
       JOIN ghm.business b ON b.id = a.business_id
       WHERE a.id = $1 LIMIT 1`,
      [paymentAttemptId],
    );
    if (result.rowCount !== 1) throw new Error('Commercial payment attempt not found');
    const row = result.rows[0];
    if (!['pending_checkout', 'pending_payment'].includes(row.attempt_status)) throw new Error('Commercial payment attempt is not payable');
    if (row.currency_code !== 'ZAR') throw new Error('Payfast checkout requires ZAR');
    if (!config.payfast.merchantId || !config.payfast.merchantKey) throw new Error('Payfast checkout credentials are not configured');
    return buildPayfastCheckout({
      merchantId: config.payfast.merchantId, merchantKey: config.payfast.merchantKey, passphrase: config.payfast.passphrase,
      environment: config.payfast.environment, paymentAttemptId, amountMinorUnits: Number(row.amount_minor_units),
      itemName: `ZAID Connect - ${String(row.business_name).trim().slice(0, 80)}`,
      returnUrl: config.payfast.returnUrl, cancelUrl: config.payfast.cancelUrl, notifyUrl: config.payfast.notifyUrl,
    });
  }

  async handleItn(fields: Readonly<Record<string, string>>, sourceIp: string): Promise<CommercialPaymentTransaction> {
    if (!config.payfast.merchantId) throw new Error('Payfast merchant ID is not configured');
    const rawId = fields.m_payment_id?.trim() ?? '';
    const paymentAttemptId = requireAttemptId(Number(rawId));
    if (String(paymentAttemptId) !== rawId) throw new Error('Payfast ITN payment identifier invalid');
    const attempt = await this.transactionPool.query(
      `SELECT id, amount_minor_units, attempt_status FROM ghm.commercial_payment_attempt WHERE id = $1 LIMIT 1`,
      [paymentAttemptId],
    );
    if (attempt.rowCount !== 1) throw new Error('Commercial payment attempt not found');
    if (!['pending_checkout', 'pending_payment'].includes(attempt.rows[0].attempt_status)) throw new Error('Commercial payment attempt is not payable');
    const verified = verifyPayfastItn({
      fields, sourceIp, expectedMerchantId: config.payfast.merchantId,
      expectedAmountMinorUnits: Number(attempt.rows[0].amount_minor_units), passphrase: config.payfast.passphrase,
    });
    const providerPaymentId = verified.providerPaymentId;
    if (!providerPaymentId || !/^[!-~]{1,200}$/.test(providerPaymentId)) throw new Error('Payfast ITN provider payment identifier missing or invalid');
    await this.validateItn(fields, config.payfast.environment);
    return this.providerBoundary.applyCommercialPaymentResult({
      paymentAttemptId, providerCode: 'payfast', externalProviderEventId: providerPaymentId,
      providerEventType: 'itn', providerPayloadHash: payloadHash(fields), transactionKind: 'payment',
      transactionStatus: transactionStatus(verified.transactionStatus),
      providerTransactionReference: providerPaymentId, occurredAt: verified.occurredAt ?? new Date(),
      metadata: { merchant_payment_id: verified.merchantPaymentId, provider_payment_id: providerPaymentId, payment_status: verified.transactionStatus, source_ip: sourceIp },
    });
  }
}
