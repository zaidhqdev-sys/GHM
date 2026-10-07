import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';
const databaseSsl = process.env.DATABASE_SSL === 'true';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const parseOrigins = (value: string): string[] => {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.some((origin) => origin === '*')) {
    throw new Error('CORS_ORIGINS must not contain wildcard origin');
  }
  for (const origin of origins) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error('CORS_ORIGINS must contain valid absolute origins'); }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== origin) {
      throw new Error('CORS_ORIGINS must contain origin-only HTTP(S) URLs');
    }
  }
  return origins;
};

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl,
  inviteCode: required('INVITE_CODE'),
  corsOrigins: parseOrigins(required('CORS_ORIGINS')),
  trustProxy: process.env.TRUST_PROXY === 'true',
  payfast: Object.freeze({
    environment: (process.env.PAYFAST_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'live',
    merchantId: process.env.PAYFAST_MERCHANT_ID?.trim() ?? '',
    merchantKey: process.env.PAYFAST_MERCHANT_KEY?.trim() ?? '',
    passphrase: process.env.PAYFAST_PASSPHRASE?.trim() || null,
    returnUrl: process.env.PAYFAST_RETURN_URL?.trim() ?? '',
    cancelUrl: process.env.PAYFAST_CANCEL_URL?.trim() ?? '',
    notifyUrl: process.env.PAYFAST_NOTIFY_URL?.trim() ?? '',
  }),
});

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

if (config.corsOrigins.length === 0) {
  throw new Error('CORS_ORIGINS must contain at least one origin');
}

if (!['sandbox', 'live'].includes(config.payfast.environment)) {
  throw new Error('PAYFAST_ENVIRONMENT must be sandbox or live');
}

if (config.payfast.environment === 'live' && config.isProduction && (!config.payfast.merchantId || !config.payfast.merchantKey || !config.payfast.returnUrl || !config.payfast.cancelUrl || !config.payfast.notifyUrl)) {
  throw new Error('Production live Payfast configuration requires merchant credentials and callback URLs');
}

if (config.isProduction && !config.databaseSsl) {
  throw new Error('DATABASE_SSL must be true in production');
}
