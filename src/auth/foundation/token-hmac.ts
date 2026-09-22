/**
 * HMAC-SHA256 token protection.
 * token_hash = HMAC-SHA256(pepper, purpose_prefix || raw_token_bytes)
 * Pepper from GHM_AUTH_TOKEN_PEPPER — never logged or persisted.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TokenPurpose } from './types';

const PURPOSE_PREFIX: Record<TokenPurpose, Buffer> = {
  refresh: Buffer.from('refresh:', 'utf8'),
  recovery: Buffer.from('recovery:', 'utf8'),
};

export class TokenPepperConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenPepperConfigError';
  }
}

/** Load and validate pepper. Fails closed — no default. */
export const loadTokenPepper = (env: NodeJS.ProcessEnv = process.env): Buffer => {
  const value = env.GHM_AUTH_TOKEN_PEPPER?.trim();
  if (!value) {
    throw new TokenPepperConfigError('Missing required environment variable: GHM_AUTH_TOKEN_PEPPER');
  }
  const pepper = Buffer.from(value, 'utf8');
  if (pepper.length < 32) {
    throw new TokenPepperConfigError('GHM_AUTH_TOKEN_PEPPER must provide at least 32 bytes of entropy');
  }
  return pepper;
};

export const protectOpaqueToken = (
  pepper: Buffer,
  purpose: TokenPurpose,
  rawToken: Buffer,
): Buffer => {
  if (!Buffer.isBuffer(pepper) || pepper.length < 32) {
    throw new TokenPepperConfigError('Token pepper is invalid');
  }
  if (!Buffer.isBuffer(rawToken) || rawToken.length === 0) {
    throw new Error('Raw token must be a non-empty Buffer');
  }
  const message = Buffer.concat([PURPOSE_PREFIX[purpose], rawToken]);
  return createHmac('sha256', pepper).update(message).digest();
};

/** Constant-time compare of two protected representations. */
export const protectedTokensEqual = (a: Buffer, b: Buffer): boolean => {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
};
