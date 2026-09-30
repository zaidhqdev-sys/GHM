import { Request } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '../config';
import { AuthContext, GhmRole } from './authorization';

const isRole = (value: unknown): value is GhmRole =>
  value === 'admin' || value === 'customer' || value === 'business';

const isUserId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const authenticateRequest = (req: Request): AuthContext => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw new Error('Authentication required');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new Error('Authentication required');
  }

  const decoded = jwt.verify(token, config.jwtSecret);
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid authentication token');
  }

  const payload = decoded as JwtPayload;
  if (!isUserId(payload.userId) || !isRole(payload.role)) {
    throw new Error('Invalid authentication token');
  }

  return Object.freeze({ userId: payload.userId, role: payload.role });
};
