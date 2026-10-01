import { generateKeyPairSync } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthContext } from '../auth/authorization';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const ISSUER = 'https://ghm.test';
const AUDIENCE = 'ghm-resource-api';
const KID = 'ghm-http-test-1';

export const tokenFor = (context: AuthContext): string =>
  jwt.sign(
    { sub: String(context.userId), role: context.role },
    privateKeyPem,
    { algorithm: 'ES256', keyid: KID, issuer: ISSUER, audience: AUDIENCE, expiresIn: 900 },
  );

export const httpTestAuth: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const token = header.slice('Bearer '.length).trim();
    const payload = jwt.verify(token, publicKeyPem, {
      algorithms: ['ES256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as jwt.JwtPayload & { role?: AuthContext['role'] };
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !payload.role) throw new Error('invalid test auth');
    req.authContext = { userId, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
};
