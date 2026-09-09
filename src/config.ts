import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const parseOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const jwtSecret = required('JWT_SECRET');
if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret,
  inviteCode: required('INVITE_CODE'),
  corsOrigins: parseOrigins(required('CORS_ORIGINS')),
  trustProxy: process.env.TRUST_PROXY === 'true',
});

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

if (config.corsOrigins.length === 0) {
  throw new Error('CORS_ORIGINS must contain at least one origin');
}
