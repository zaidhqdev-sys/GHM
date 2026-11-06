import type { Pool } from 'pg';
import { config } from '../../config';
import { generatePayfastSignature, PAYFAST_PAYMENT_URLS } from './payfast';


export interface PayfastCheckout {
  readonly actionUrl: string;
  readonly fields: Readonly<Record<string, string>>;
}

const amountMajor = (minor: number): string => (minor / 100).toFixed(2);
const requireAttemptId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('paymentAttemptId must be a positive integer');
  return value as number;
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

export class PayfastHttpBoundary {
  constructor(
    private readonly transactionPool: Pick<Pool, 'query'>,
  ) {}

  async createCheckout(paymentAttemptIdValue: unknown): Promise<PayfastCheckout> {
    const paymentAttemptId = requireAttemptId(paymentAttemptIdValue);
    const result = await this.transactionPool.query(
      `SELECT a.id, a.provider_code, a.amount_minor_units, a.attempt_status, c.code AS currency_code, b.name AS business_name
       FROM ghm.commercial_payment_attempt a
       JOIN ghm.currency c ON c.id = a.currency_id
       JOIN ghm.business b ON b.id = a.business_id
       WHERE a.id = $1 LIMIT 1`,
      [paymentAttemptId],
    );
    if (result.rowCount !== 1) throw new Error('Commercial payment attempt not found');
    const row = result.rows[0];
    if (row.provider_code !== 'payfast') throw new Error('Commercial payment attempt provider mismatch');
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

}
