import jwt from 'jsonwebtoken';
import { loadEs256Keys, verificationKeyMap, type LoadedEs256Keys } from '../../auth/foundation/es256-keys';

export const CONNECT_SERVICE_ASSERTION_ISS = 'ghm-service-auth' as const;
export const CONNECT_SERVICE_ASSERTION_AUD = 'ghm-connect-service' as const;
export const CONNECT_SERVICE_ASSERTION_TTL_SECONDS = 5 * 60;
export const CONNECT_SERVICE_ASSERTION_CLOCK_SKEW_SECONDS = 60;

export class ConnectServiceAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectServiceAssertionError';
  }
}

export interface ConnectServiceAssertionClaims {
  sub: string;
  iss: typeof CONNECT_SERVICE_ASSERTION_ISS;
  aud: typeof CONNECT_SERVICE_ASSERTION_AUD;
  iat: number;
  exp: number;
  jti: string;
}

export interface VerifiedConnectServiceAssertion {
  integrationId: string;
  requestId: string;
  claims: ConnectServiceAssertionClaims;
}

export interface ConnectServiceAssertionService {
  sign(input: { integrationId: string; requestId: string }, nowSeconds?: number): string;
  verify(token: string, nowSeconds?: number): VerifiedConnectServiceAssertion;
}

function assertOpaque(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[!-~]{1,128}$/.test(value)) {
    throw new ConnectServiceAssertionError(`${label} must be printable ASCII ≤ 128 characters`);
  }
}

function assertIssuedAt(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value)) {
    throw new ConnectServiceAssertionError('Service assertion iat must be an integer');
  }
}

function assertExpiry(value: unknown, iat: number): asserts value is number {
  if (!Number.isSafeInteger(value)) {
    throw new ConnectServiceAssertionError('Service assertion exp must be an integer');
  }
  const exp = value as number;
  if (exp <= iat || exp - iat > CONNECT_SERVICE_ASSERTION_TTL_SECONDS) {
    throw new ConnectServiceAssertionError('Service assertion lifetime is invalid');
  }
}

export const createConnectServiceAssertionService = (
  keys: LoadedEs256Keys = loadEs256Keys(),
): ConnectServiceAssertionService => {
  const publicByKid = verificationKeyMap(keys);

  return {
    sign({ integrationId, requestId }, nowSeconds = Math.floor(Date.now() / 1000)): string {
      assertOpaque(integrationId, 'integrationId');
      assertOpaque(requestId, 'requestId');
      if (!Number.isSafeInteger(nowSeconds)) {
        throw new ConnectServiceAssertionError('nowSeconds must be an integer');
      }

      const payload: ConnectServiceAssertionClaims = {
        sub: integrationId,
        iss: CONNECT_SERVICE_ASSERTION_ISS,
        aud: CONNECT_SERVICE_ASSERTION_AUD,
        iat: nowSeconds,
        exp: nowSeconds + CONNECT_SERVICE_ASSERTION_TTL_SECONDS,
        jti: requestId,
      };

      return jwt.sign(payload, keys.active.privateKeyPem, {
        algorithm: 'ES256',
        keyid: keys.active.kid,
      });
    },

    verify(token, nowSeconds = Math.floor(Date.now() / 1000)): VerifiedConnectServiceAssertion {
      if (typeof token !== 'string' || token.trim().length === 0) {
        throw new ConnectServiceAssertionError('Service assertion is required');
      }
      if (!Number.isSafeInteger(nowSeconds)) {
        throw new ConnectServiceAssertionError('nowSeconds must be an integer');
      }

      const complete = jwt.decode(token, { complete: true });
      if (!complete || typeof complete === 'string') {
        throw new ConnectServiceAssertionError('Service assertion verification failed');
      }
      if (complete.header.alg !== 'ES256') {
        throw new ConnectServiceAssertionError('Service assertion algorithm must be ES256');
      }
      if (typeof complete.header.kid !== 'string' || complete.header.kid.length === 0) {
        throw new ConnectServiceAssertionError('Service assertion kid is required');
      }

      const publicKeyPem = publicByKid.get(complete.header.kid);
      if (!publicKeyPem) {
        throw new ConnectServiceAssertionError('Service assertion kid is unknown or retired');
      }

      try {
        jwt.verify(token, publicKeyPem, {
          algorithms: ['ES256'],
          issuer: CONNECT_SERVICE_ASSERTION_ISS,
          audience: CONNECT_SERVICE_ASSERTION_AUD,
          clockTolerance: CONNECT_SERVICE_ASSERTION_CLOCK_SKEW_SECONDS,
          clockTimestamp: nowSeconds,
        });
      } catch {
        throw new ConnectServiceAssertionError('Service assertion verification failed');
      }

      if (!complete.payload || typeof complete.payload !== 'object' || Array.isArray(complete.payload)) {
        throw new ConnectServiceAssertionError('Service assertion payload is invalid');
      }
      const decoded = complete.payload as jwt.JwtPayload;

      assertOpaque(decoded.sub, 'Service assertion sub');
      assertOpaque(decoded.jti, 'Service assertion jti');
      assertIssuedAt(decoded.iat);
      const verifiedIat = decoded.iat;
      assertExpiry(decoded.exp, verifiedIat);
      const verifiedExp = decoded.exp;

      if (verifiedIat > nowSeconds + CONNECT_SERVICE_ASSERTION_CLOCK_SKEW_SECONDS) {
        throw new ConnectServiceAssertionError('Service assertion iat is in the future');
      }

      return {
        integrationId: decoded.sub,
        requestId: decoded.jti,
        claims: {
          sub: decoded.sub,
          iss: CONNECT_SERVICE_ASSERTION_ISS,
          aud: CONNECT_SERVICE_ASSERTION_AUD,
          iat: verifiedIat,
          exp: verifiedExp,
          jti: decoded.jti,
        },
      };
    },
  };
};
