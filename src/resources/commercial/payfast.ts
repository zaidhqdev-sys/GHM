import { createHash, timingSafeEqual } from 'node:crypto';

export interface PayfastCheckoutFields {
  readonly [key: string]: string | number | null | undefined;
}

export interface PayfastItnVerificationInput {
  readonly fields: Readonly<Record<string, string>>;
  readonly sourceIp: string;
  readonly expectedMerchantId: string;
  readonly expectedAmountMinorUnits: number;
  readonly passphrase?: string | null;
}

export interface PayfastItnVerificationResult {
  readonly merchantPaymentId: string | null;
  readonly providerPaymentId: string | null;
  readonly transactionStatus: string;
  readonly amountMinorUnits: number;
  readonly occurredAt: Date | null;
}

const PAYFAST_IPV4_RANGES = Object.freeze([
  { network: 197, second: 97, third: 145, start: 144, end: 159 },
  { network: 41, second: 74, third: 179, start: 192, end: 223 },
  { network: 102, second: 216, third: 36, start: 0, end: 15 },
  { network: 102, second: 216, third: 36, start: 128, end: 143 },
]);

const PAYFAST_EXACT_IPV4 = new Set(['144.126.193.139']);

const isIpv4 = (value: string): boolean => {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
};

const isPayfastSourceIp = (sourceIp: string): boolean => {
  if (!isIpv4(sourceIp)) return false;
  if (PAYFAST_EXACT_IPV4.has(sourceIp)) return true;
  const parts = sourceIp.split('.').map(Number);
  return PAYFAST_IPV4_RANGES.some((range) =>
    parts[0] === range.network &&
    parts[1] === range.second &&
    parts[2] === range.third &&
    parts[3] >= range.start &&
    parts[3] <= range.end
  );
};

const encodePayfastValue = (value: string): string => encodeURIComponent(value.trim()).replace(/%20/g, '+');

export const generatePayfastSignature = (
  fields: PayfastCheckoutFields,
  passphrase?: string | null,
): string => {
  const pairs = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => `${key}=${encodePayfastValue(String(value))}`);

  if (passphrase !== undefined && passphrase !== null) {
    pairs.push(`passphrase=${encodePayfastValue(passphrase)}`);
  }

  return createHash('md5').update(pairs.join('&'), 'utf8').digest('hex');
};

const equalSignature = (actual: string, expected: string): boolean => {
  if (!/^[0-9a-f]{32}$/i.test(actual) || !/^[0-9a-f]{32}$/i.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual.toLowerCase(), 'utf8'), Buffer.from(expected.toLowerCase(), 'utf8'));
};

const parseAmountMinorUnits = (value: string): number | null => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const minor = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(minor) ? minor : null;
};

const parseOccurredAt = (value: string | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const verifyPayfastItn = (
  input: PayfastItnVerificationInput,
): PayfastItnVerificationResult => {
  const { fields } = input;
  const receivedSignature = fields.signature;
  if (!receivedSignature) throw new Error('Payfast ITN signature missing');
  if (!isPayfastSourceIp(input.sourceIp)) throw new Error('Payfast ITN source IP invalid');
  if (fields.merchant_id !== input.expectedMerchantId) throw new Error('Payfast ITN merchant mismatch');

  const signedFields = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'signature'));
  const expectedSignature = generatePayfastSignature(signedFields, input.passphrase);
  if (!equalSignature(receivedSignature, expectedSignature)) throw new Error('Payfast ITN signature invalid');

  const amountMinorUnits = parseAmountMinorUnits(fields.amount_gross ?? '');
  if (amountMinorUnits === null || amountMinorUnits !== input.expectedAmountMinorUnits) {
    throw new Error('Payfast ITN amount mismatch');
  }

  const transactionStatus = fields.payment_status?.trim();
  if (!transactionStatus) throw new Error('Payfast ITN payment status missing');

  return {
    merchantPaymentId: fields.m_payment_id?.trim() || null,
    providerPaymentId: fields.pf_payment_id?.trim() || null,
    transactionStatus,
    amountMinorUnits,
    occurredAt: parseOccurredAt(fields.payment_date),
  };
};

export const PAYFAST_PAYMENT_URLS = Object.freeze({
  sandbox: 'https://sandbox.payfast.co.za/eng/process',
  live: 'https://www.payfast.co.za/eng/process',
});

export const PAYFAST_ITN_VALIDATION_URLS = Object.freeze({
  sandbox: 'https://sandbox.payfast.co.za/eng/query/validate',
  live: 'https://www.payfast.co.za/eng/query/validate',
});
