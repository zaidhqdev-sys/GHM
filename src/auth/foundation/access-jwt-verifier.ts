import jwt from 'jsonwebtoken';
import type { AccessJwtVerifyResult } from './types';

export const ACCESS_JWT_ISS = 'ghm-auth' as const;
export const ACCESS_JWT_AUD = 'ghm-api' as const;
export const ACCESS_JWT_TTL_SECONDS = 15 * 60;
export const ACCESS_JWT_CLOCK_SKEW_SECONDS = 60;

export class AccessJwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessJwtError';
  }
}

export interface AccessJwtVerifier {
  verify(token: string, nowSeconds?: number): AccessJwtVerifyResult;
}

const isDecimalAccountId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value));

/**
 * Public-key-only verifier for services that must validate GHM access tokens
 * without ever loading or possessing ES256 private signing material.
 */
export const createAccessJwtVerifier = (
  publicKeysByKid: ReadonlyMap<string, string>,
): AccessJwtVerifier => {
  if (publicKeysByKid.size === 0) {
    throw new AccessJwtError('At least one ES256 verification key is required');
  }

  return {
    verify(token: string, nowSeconds: number = Math.floor(Date.now() / 1000)): AccessJwtVerifyResult {
      if (typeof token !== 'string' || token.trim().length === 0) {
        throw new AccessJwtError('Access token is required');
      }
      if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
        throw new AccessJwtError('Verification time must be a non-negative integer');
      }

      const complete = jwt.decode(token, { complete: true });
      if (!complete || typeof complete === 'string') {
        throw new AccessJwtError('Access token verification failed');
      }
      if (complete.header.alg !== 'ES256') {
        throw new AccessJwtError('Access token algorithm must be ES256');
      }
      if (typeof complete.header.kid !== 'string' || complete.header.kid.length === 0) {
        throw new AccessJwtError('Access token kid is required');
      }

      const publicKeyPem = publicKeysByKid.get(complete.header.kid);
      if (!publicKeyPem) {
        throw new AccessJwtError('Access token kid is unknown or retired');
      }

      let decoded: jwt.JwtPayload;
      try {
        decoded = jwt.verify(token, publicKeyPem, {
          algorithms: ['ES256'],
          issuer: ACCESS_JWT_ISS,
          audience: ACCESS_JWT_AUD,
          clockTimestamp: nowSeconds,
          clockTolerance: ACCESS_JWT_CLOCK_SKEW_SECONDS,
        }) as jwt.JwtPayload;
      } catch {
        throw new AccessJwtError('Access token verification failed');
      }

      if (!isDecimalAccountId(decoded.sub)) {
        throw new AccessJwtError('Access token sub must be a decimal GHM account id');
      }

      const issuedAt = decoded.iat;
      const expiresAt = decoded.exp;
      if (!Number.isSafeInteger(expiresAt) || (expiresAt as number) <= 0) {
        throw new AccessJwtError('Access token expiry is invalid');
      }
      if ((expiresAt as number) > nowSeconds + ACCESS_JWT_TTL_SECONDS + ACCESS_JWT_CLOCK_SKEW_SECONDS) {
        throw new AccessJwtError('Access token lifetime is invalid');
      }
      if (
        !Number.isSafeInteger(issuedAt) ||
        (issuedAt as number) < 0 ||
        (expiresAt as number) <= (issuedAt as number) ||
        (expiresAt as number) - (issuedAt as number) > ACCESS_JWT_TTL_SECONDS ||
        (issuedAt as number) > nowSeconds + ACCESS_JWT_CLOCK_SKEW_SECONDS
      ) {
        throw new AccessJwtError('Access token lifetime is invalid');
      }

      return {
        accountId: Number(decoded.sub),
        kid: complete.header.kid,
        claims: {
          sub: decoded.sub,
          iss: ACCESS_JWT_ISS,
          aud: ACCESS_JWT_AUD,
          iat: issuedAt as number,
          exp: expiresAt as number,
        },
      };
    },
  };
};
