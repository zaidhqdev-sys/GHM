/**
 * ES256 access JWT signing service.
 * Verification is delegated to a public-key-only verifier so gateway processes
 * can validate tokens without loading private signing material.
 */

import jwt from 'jsonwebtoken';
import { loadEs256Keys, verificationKeyMap, type LoadedEs256Keys } from './es256-keys';
import type { AccessJwtClaims, AccessJwtVerifyResult } from './types';
import {
  AccessJwtError,
  ACCESS_JWT_ISS,
  ACCESS_JWT_TTL_SECONDS,
  createAccessJwtVerifier,
} from './access-jwt-verifier';

export {
  AccessJwtError,
  ACCESS_JWT_AUD,
  ACCESS_JWT_CLOCK_SKEW_SECONDS,
  ACCESS_JWT_ISS,
  ACCESS_JWT_TTL_SECONDS,
} from './access-jwt-verifier';

export interface AccessJwtService {
  sign(accountId: number, nowSeconds?: number): string;
  verify(token: string): AccessJwtVerifyResult;
}

export const createAccessJwtService = (keys: LoadedEs256Keys = loadEs256Keys()): AccessJwtService => {
  const verifier = createAccessJwtVerifier(verificationKeyMap(keys));

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
      });
    },

    verify(token: string): AccessJwtVerifyResult {
      return verifier.verify(token);
    },
  };
};
