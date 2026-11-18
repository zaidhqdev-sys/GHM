import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TenderRequestContext {
  /** Authoritative, generated here. */
  requestId: string;
  /** Opaque caller correlation id; UNTRUSTED metadata, kept only if a UUID. */
  clientCorrelationId: string | null;
}

export const createTenderRequestContext = (req: Request, res: Response): TenderRequestContext => {
  const incoming = req.header('x-request-id');
  const ctx = {
    requestId: randomUUID(),
    clientCorrelationId: incoming && UUID.test(incoming) ? incoming.toLowerCase() : null,
  };
  res.setHeader('x-request-id', ctx.requestId);
  return ctx;
};

export interface TenderLogFields {
  requestId: string;
  clientCorrelationId: string | null;
  actorAccountId: number | null;
  businessId: number | null;
  operation: string;
  resourceId: number | null;
  outcome: 'success' | 'forbidden' | 'invalid' | 'not_found' | 'conflict' | 'failed' | 'unavailable';
}

/** Bounded, allow-listed structured logger for tender operations only. */
export class TenderOperationLogger {
  private windowStart = 0;
  private emitted = 0;
  private suppressed = 0;
  constructor(
    private readonly sink: (line: string) => void = line => console.log(line),
    private readonly now: () => number = Date.now,
    private readonly maxPerWindow = 100,
    private readonly windowMs = 60_000,
  ) {}

  log(fields: TenderLogFields): void {
    const t = this.now();
    if (t - this.windowStart >= this.windowMs) {
      if (this.suppressed > 0) {
        this.sink(JSON.stringify({ event: 'tender_operation_log_suppressed', suppressed: this.suppressed }));
      }
      this.windowStart = t;
      this.emitted = 0;
      this.suppressed = 0;
    }
    if (this.emitted >= this.maxPerWindow) {
      this.suppressed += 1;
      return;
    }
    this.emitted += 1;
    this.sink(JSON.stringify({
      event: 'tender_operation',
      requestId: fields.requestId,
      clientCorrelationId: fields.clientCorrelationId,
      actorAccountId: fields.actorAccountId,
      businessId: fields.businessId,
      operation: fields.operation,
      resourceId: fields.resourceId,
      outcome: fields.outcome,
    }));
  }
}
