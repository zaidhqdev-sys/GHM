import jwt from 'jsonwebtoken';
import { verificationKeyMap, type LoadedEs256Keys } from '../../auth/foundation/es256-keys';

export const QUOTEFLOW_ATTESTATION_ISSUER = 'quoteflow' as const;
export const QUOTEFLOW_ATTESTATION_AUDIENCE = 'ghm-identity-link' as const;
export const QUOTEFLOW_ATTESTATION_CEREMONY = 'identity-link' as const;
export const QUOTEFLOW_ATTESTATION_VERSION = 1 as const;
export const QUOTEFLOW_ATTESTATION_CLOCK_SKEW_SECONDS = 60;

export interface QuoteFlowIdentityLinkAttestationClaims {
  sub: string;
  iss: typeof QUOTEFLOW_ATTESTATION_ISSUER;
  aud: typeof QUOTEFLOW_ATTESTATION_AUDIENCE;
  ceremony: typeof QUOTEFLOW_ATTESTATION_CEREMONY;
  version: typeof QUOTEFLOW_ATTESTATION_VERSION;
  iat: number;
  exp: number;
}

export interface VerifiedQuoteFlowIdentityLinkAttestation {
  kid: string;
  claims: QuoteFlowIdentityLinkAttestationClaims;
}

export class QuoteFlowAttestationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteFlowAttestationError';
  }
}

const isDecimalSubject = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value));

const isSafeUnixSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export interface QuoteFlowIdentityLinkAttestationVerifier {
  verify(token: string): VerifiedQuoteFlowIdentityLinkAttestation;
}

export const createQuoteFlowIdentityLinkAttestationVerifier = (
  keys: LoadedEs256Keys,
): QuoteFlowIdentityLinkAttestationVerifier => {
  const publicByKid = verificationKeyMap(keys);

  return {
    verify(token: string): VerifiedQuoteFlowIdentityLinkAttestation {
      if (typeof token !== 'string' || token.trim().length === 0) {
        throw new QuoteFlowAttestationError('QuoteFlow attestation is required');
      }

      const complete = jwt.decode(token, { complete: true });
      if (!complete || typeof complete === 'string') {
        throw new QuoteFlowAttestationError('QuoteFlow attestation verification failed');
      }
      if (complete.header.alg !== 'ES256') {
        throw new QuoteFlowAttestationError('QuoteFlow attestation algorithm must be ES256');
      }
      if (typeof complete.header.kid !== 'string' || complete.header.kid.length === 0) {
        throw new QuoteFlowAttestationError('QuoteFlow attestation kid is required');
      }

      const publicKeyPem = publicByKid.get(complete.header.kid);
      if (!publicKeyPem) {
        throw new QuoteFlowAttestationError('QuoteFlow attestation kid is unknown or retired');
      }

      let decoded: jwt.JwtPayload;
      try {
        decoded = jwt.verify(token, publicKeyPem, {
          algorithms: ['ES256'],
          issuer: QUOTEFLOW_ATTESTATION_ISSUER,
          audience: QUOTEFLOW_ATTESTATION_AUDIENCE,
          clockTolerance: QUOTEFLOW_ATTESTATION_CLOCK_SKEW_SECONDS,
        }) as jwt.JwtPayload;
      } catch {
        throw new QuoteFlowAttestationError('QuoteFlow attestation verification failed');
      }

      if (!isDecimalSubject(decoded.sub)) {
        throw new QuoteFlowAttestationError('QuoteFlow attestation sub must be a decimal QuoteFlow identity id');
      }
      if (decoded.ceremony !== QUOTEFLOW_ATTESTATION_CEREMONY) {
        throw new QuoteFlowAttestationError('QuoteFlow attestation ceremony is invalid');
      }
      if (decoded.version !== QUOTEFLOW_ATTESTATION_VERSION) {
        throw new QuoteFlowAttestationError('QuoteFlow attestation version is invalid');
      }
      if (!isSafeUnixSeconds(decoded.iat) || !isSafeUnixSeconds(decoded.exp) || decoded.exp <= decoded.iat) {
        throw new QuoteFlowAttestationError('QuoteFlow attestation timestamps are invalid');
      }

      return {
        kid: complete.header.kid,
        claims: {
          sub: decoded.sub,
          iss: QUOTEFLOW_ATTESTATION_ISSUER,
          aud: QUOTEFLOW_ATTESTATION_AUDIENCE,
          ceremony: QUOTEFLOW_ATTESTATION_CEREMONY,
          version: QUOTEFLOW_ATTESTATION_VERSION,
          iat: decoded.iat,
          exp: decoded.exp,
        },
      };
    },
  };
};
