/**
 * ES256 access JWT signing and verification primitives.
 * Not connected to request-context / HS JWT_SECRET path.
 *
 * Claims: sub (decimal account id), iss=ghm-auth, aud=ghm-api, iat, exp, kid.
 * Authorization state is NOT authoritative from JWT.
 */

import jwt from 'jsonwebtoken';
import { loadEs256Keys, verificationKeyMap, type LoadedEs256Keys } from './es256-keys';
import type { AccessJwtClaims, AccessJwtVerifyResult } from './types';

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

const isDecimalAccountId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value));

export interface AccessJwtService {
  sign(accountId: number, nowSeconds?: number): string;
  verify(token: string): AccessJwtVerifyResult;
}

export const createAccessJwtService = (keys: LoadedEs256Keys = loadEs256Keys()): AccessJwtService => {
  const publicByKid = verificationKeyMap(keys);

  return {
    sign(accountId: number, nowSeconds: number = Math.floor(Date.now() / 1000)): string {
      if (!Number.isSafeInteger(accountId) || accountId <= 0) {
        throw new AccessJwtError('accountId must be a positive safe integer');
      }
      const iat = nowSeconds;
      const exp = iat + ACCESS_JWT_TTL_SECONDS;
      const payload: AccessJwtClaims = {
        sub: String(accountId),
        iss: ACCESS_JWT_ISS,
        aud: ACCESS_JWT_AUD,
        iat,
        exp,
      };
      return jwt.sign(payload, keys.active.privateKeyPem, {
        algorithm: 'ES256',
        keyid: keys.active.kid,
        noTimestamp: true,
      });
    },

    verify(token: string): AccessJwtVerifyResult {
      if (typeof token !== 'string' || token.trim().length === 0) {
        throw new AccessJwtError('Access token is required');
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

      const publicKeyPem = publicByKid.get(complete.header.kid);
      if (!publicKeyPem) {
        throw new AccessJwtError('Access token kid is unknown or retired');
      }

      let decoded: jwt.JwtPayload;
      try {
        decoded = jwt.verify(token, publicKeyPem, {
          algorithms: ['ES256'],
          issuer: ACCESS_JWT_ISS,
          audience: ACCESS_JWT_AUD,
          clockTolerance: ACCESS_JWT_CLOCK_SKEW_SECONDS,
        }) as jwt.JwtPayload;
      } catch {
        throw new AccessJwtError('Access token verification failed');
      }

      if (!isDecimalAccountId(decoded.sub)) {
        throw new AccessJwtError('Access token sub must be a decimal GHM account id');
      }

      const claims: AccessJwtClaims = {
        sub: decoded.sub,
        iss: ACCESS_JWT_ISS,
        aud: ACCESS_JWT_AUD,
        iat: Number(decoded.iat),
        exp: Number(decoded.exp),
      };

      return {
        accountId: Number(decoded.sub),
        kid: complete.header.kid,
        claims,
      };
    },
  };
};
