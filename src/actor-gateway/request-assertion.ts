import { createHmac, randomUUID } from 'node:crypto';

export interface ActorGatewayAssertion {
  issuedAt: number;
  nonce: string;
  context: string;
  signature: string;
}

export const createActorGatewayAssertion = (
  key: Buffer,
  accountId: number,
  operation: string,
  context: Record<string, unknown>,
): ActorGatewayAssertion => {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    throw new Error('Actor account ID must be a positive safe integer');
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const contextJson = JSON.stringify(context);
  if (typeof contextJson !== 'string') throw new Error('Actor assertion context is not serializable');
  const contextHex = Buffer.from(contextJson, 'utf8').toString('hex');
  const payload = `ghm-actor-gateway:v2|${accountId}|${operation}|${issuedAt}|${nonce}|${contextHex}`;
  const signature = createHmac('sha256', key).update(payload, 'utf8').digest('hex');
  return { issuedAt, nonce, context: contextJson, signature };
};
