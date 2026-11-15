import { createHmac, randomUUID } from 'node:crypto';

export type StorageProviderWorkflowOperation =
  | 'storage.provider.mark_available'
  | 'storage.provider.mark_deleted';

export interface StorageProviderWorkflowAttestation {
  issuedAt: number;
  nonce: string;
  context: string;
  signature: string;
}

export const createStorageProviderWorkflowAttestation = (
  encodedSecret: string,
  operation: StorageProviderWorkflowOperation,
  context: Record<string, unknown>,
): StorageProviderWorkflowAttestation => {
  const key = Buffer.from(encodedSecret, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedSecret) {
    throw new Error('GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET must be canonical base64 for exactly 32 bytes');
  }
  const contextJson = JSON.stringify(context);
  if (typeof contextJson !== 'string' || Buffer.byteLength(contextJson, 'utf8') > 32768) {
    throw new Error('Storage provider attestation context is invalid or too large');
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const contextHex = Buffer.from(contextJson, 'utf8').toString('hex');
  const payload = `ghm-storage-provider:v1|${operation}|${issuedAt}|${nonce}|${contextHex}`;
  return {
    issuedAt,
    nonce,
    context: contextJson,
    signature: createHmac('sha256', key).update(payload, 'utf8').digest('hex'),
  };
};
