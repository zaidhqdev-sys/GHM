import type { Express, Request, Response, RequestHandler } from "express";
import type { AuthContext } from "../auth/authorization.js";
import { withTenantTransaction } from "../db/authorized-transaction.js";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/http.js";
import { BusinessLogoGatewayError, type BusinessLogoGatewayClient } from "./business-logo-gateway-client.js";
import type { StorageProvider } from "../storage/provider.js";
import { createStorageService } from "../storage/service.js";
import type { StorageMetadataStore, StorageService } from "../storage/service.js";
import { createPostgresStorageMetadataStore } from "../storage/repository.js";
import { createPostgresStorageAuthorization } from "../storage/authorization-adapter.js";

const positiveInteger = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return null;
  return value;
};

const objectIdParam = (value: unknown): string | null =>
  typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : null;

const handleStorageError = (error: unknown, res: Response): void => {
  if (error instanceof BusinessLogoGatewayError) {
    if (error.status === 401 || error.status === 403) { res.status(403).json({ error: 'forbidden' }); return; }
    if (error.status === 404) { res.status(404).json({ error: 'not_found' }); return; }
    if (error.status === 400) { res.status(400).json({ error: 'invalid_request' }); return; }
    res.status(503).json({ error: 'service_unavailable' });
    return;
  }
  const message = error instanceof Error ? error.message : "";
  if (/permission|required|denied|access/i.test(message)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (/not found|not available|does not exist/i.test(message)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (/unsupported|invalid|exceeds policy|mismatch/i.test(message)) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  console.error(JSON.stringify({
    event: "storage_request_failed",
    error: { name: error instanceof Error ? error.name : "UnknownError" },
  }));
  res.status(500).json({ error: "internal_error" });
};

export interface StorageRouteTestSeam {
  metadataStoreForContext?: (context: AuthContext) => StorageMetadataStore;
  serviceForContext?: (context: AuthContext) => StorageService;
  bindBusinessLogoForContext?: (context: AuthContext, businessId: number, objectId: number | null) => Promise<number | null>;
  publicLogoKeyForBusiness?: (businessId: number) => Promise<string | null>;
}

export const registerStorageRoutes = (
  app: Express,
  provider: StorageProvider,
  authMiddleware: RequestHandler = requireAuth,
  uploadGrantTtlSeconds = 900,
  downloadGrantMaxTtlSeconds = 3600,
  testSeam: StorageRouteTestSeam = {},
  businessLogoGatewayClient?: BusinessLogoGatewayClient,
  businessLogoGatewayRequired = false,
): void => {
  const metadataFor = (context: AuthContext): StorageMetadataStore =>
    testSeam.metadataStoreForContext?.(context) ?? createPostgresStorageMetadataStore(context);

  const bindLogo = async (context: AuthContext, businessId: number, objectId: number | null, accessToken: string): Promise<number | null> => {
    if (testSeam.bindBusinessLogoForContext) return testSeam.bindBusinessLogoForContext(context, businessId, objectId);
    if (businessLogoGatewayClient) return businessLogoGatewayClient.bind(accessToken, businessId, objectId);
    if (businessLogoGatewayRequired) throw new BusinessLogoGatewayError(503);
    return withTenantTransaction(context, businessId, async (client, _context, tenant) => {
      if (tenant.membershipRole !== "owner" && tenant.membershipRole !== "administrator") {
        throw new Error("Business management permission required");
      }
      const result = await client.query(
        "SELECT ghm.set_business_logo_object($1, $2, $3) AS previous_object_id",
        [context.userId, businessId, objectId],
      );
      return result.rows[0]?.previous_object_id == null ? null : Number(result.rows[0].previous_object_id);
    });
  };

  const publicLogoKey = async (businessId: number): Promise<string | null> => {
    if (testSeam.publicLogoKeyForBusiness) return testSeam.publicLogoKeyForBusiness(businessId);
    const result = await pool.query(
      "SELECT ghm.storage_get_public_business_logo($1) AS provider_key",
      [businessId],
    );
    return typeof result.rows[0]?.provider_key === "string" ? result.rows[0].provider_key : null;
  };

  const serviceFor = (context: AuthContext): StorageService =>
    testSeam.serviceForContext?.(context) ?? createStorageService({
      provider,
      metadata: metadataFor(context),
      authorization: createPostgresStorageAuthorization(context),
      uploadGrantTtlSeconds,
      downloadGrantMaxTtlSeconds,
    });


  app.put("/api/v1/businesses/:businessId/logo", authMiddleware, async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext | undefined;
      if (!context) { res.status(401).json({ error: "unauthorized" }); return; }
      const businessId = positiveInteger(Number(req.params.businessId));
      const objectId = positiveInteger(Number(req.body?.objectId));
      if (businessId === null || objectId === null || !/^[1-9]\d*$/.test(String(req.params.businessId)) || !/^[1-9]\d*$/.test(String(req.body?.objectId ?? ""))) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const record = await metadataFor(context).getById(String(objectId));
      if (!record || record.businessId !== String(businessId) || record.resourceType !== "business" || record.resourceId !== String(businessId) || record.objectClass !== "business_logo" || record.visibility !== "public" || record.status !== "available") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const authorization = req.header('authorization');
      if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()) { res.status(401).json({ error: 'unauthorized' }); return; }
      const previousObjectId = await bindLogo(context, businessId, objectId, authorization.slice(7).trim());
      let cleanupPending = false;
      if (previousObjectId !== null && previousObjectId !== objectId) {
        try {
          await serviceFor(context).deleteObject({ caller: { userId: String(context.userId), businessId: String(businessId) }, objectId: String(previousObjectId) });
        } catch {
          cleanupPending = true;
          console.error(JSON.stringify({ event: "business_logo_cleanup_pending", businessId, objectId: previousObjectId }));
        }
      }
      res.status(cleanupPending ? 202 : 200).json({ businessId, logoObjectId: objectId, cleanupPending, cleanupObjectId: cleanupPending ? previousObjectId : null });
    } catch (error) { handleStorageError(error, res); }
  });

  app.delete("/api/v1/businesses/:businessId/logo", authMiddleware, async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext | undefined;
      if (!context) { res.status(401).json({ error: "unauthorized" }); return; }
      const businessId = positiveInteger(Number(req.params.businessId));
      if (businessId === null || !/^[1-9]\d*$/.test(String(req.params.businessId))) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const authorization = req.header('authorization');
      if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()) { res.status(401).json({ error: 'unauthorized' }); return; }
      const previousObjectId = await bindLogo(context, businessId, null, authorization.slice(7).trim());
      let cleanupPending = false;
      if (previousObjectId !== null) {
        try {
          await serviceFor(context).deleteObject({ caller: { userId: String(context.userId), businessId: String(businessId) }, objectId: String(previousObjectId) });
        } catch {
          cleanupPending = true;
          console.error(JSON.stringify({ event: "business_logo_cleanup_pending", businessId, objectId: previousObjectId }));
        }
      }
      res.status(cleanupPending ? 202 : 200).json({ businessId, logoObjectId: null, cleanupPending, cleanupObjectId: cleanupPending ? previousObjectId : null });
    } catch (error) { handleStorageError(error, res); }
  });

  app.get("/api/v1/public/businesses/:businessId/logo", async (req: Request, res: Response) => {
    try {
      const rawBusinessId = req.params.businessId;
      const businessId = typeof rawBusinessId === "string" && /^[1-9]\d*$/.test(rawBusinessId) ? Number(rawBusinessId) : null;
      if (businessId === null || !Number.isSafeInteger(businessId)) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const key = await publicLogoKey(businessId);
      if (!key) { res.status(404).json({ error: "not_found" }); return; }
      const grant = await provider.createDownloadGrant({ key, expiresInSeconds: Math.min(300, downloadGrantMaxTtlSeconds) });
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, grant.url);
    } catch (error) { handleStorageError(error, res); }
  });

  app.post("/api/v1/storage/business-logos/upload", authMiddleware, async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext | undefined;
      if (!context) { res.status(401).json({ error: "unauthorized" }); return; }
      const businessId = positiveInteger(req.body?.businessId);
      const byteSize = positiveInteger(req.body?.byteSize);
      const contentType = req.body?.contentType;
      if (businessId === null || byteSize === null || typeof contentType !== "string") {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const result = await serviceFor(context).createUpload({
        caller: { userId: String(context.userId), businessId: String(businessId) },
        resource: { type: "business", id: String(businessId), businessId: String(businessId) },
        objectClass: "business_logo",
        contentType,
        byteSize,
      });
      res.status(201).json({
        objectId: result.objectId,
        uploadUrl: result.grant.url,
        expiresAt: result.grant.expiresAt.toISOString(),
        headers: result.grant.headers,
      });
    } catch (error) { handleStorageError(error, res); }
  });

  app.post("/api/v1/storage/objects/:objectId/complete", authMiddleware, async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext | undefined;
      const objectId = objectIdParam(req.params.objectId);
      if (!context) { res.status(401).json({ error: "unauthorized" }); return; }
      if (!objectId) { res.status(400).json({ error: "invalid_request" }); return; }
      const metadata = await metadataFor(context).getById(objectId);
      if (!metadata) { res.status(404).json({ error: "not_found" }); return; }
      const record = await serviceFor(context).completeUpload({
        caller: { userId: String(context.userId), businessId: metadata.businessId },
        objectId,
      });
      res.status(200).json({ object: record });
    } catch (error) { handleStorageError(error, res); }
  });

  app.get("/api/v1/storage/objects/:objectId/access", authMiddleware, async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext | undefined;
      const objectId = objectIdParam(req.params.objectId);
      const expiresInSeconds = req.query.expiresInSeconds === undefined ? 300 : Number(req.query.expiresInSeconds);
      if (!context) { res.status(401).json({ error: "unauthorized" }); return; }
      if (!objectId || !Number.isSafeInteger(expiresInSeconds)) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const record = await metadataFor(context).getById(objectId);
      if (!record) { res.status(404).json({ error: "not_found" }); return; }
      const grant = await serviceFor(context).getAccess({
        caller: { userId: String(context.userId), businessId: record.businessId },
        objectId,
        expiresInSeconds,
      });
      res.status(200).json({ url: grant.url, expiresAt: grant.expiresAt.toISOString() });
    } catch (error) { handleStorageError(error, res); }
  });

  app.delete("/api/v1/storage/objects/:objectId", authMiddleware, async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext | undefined;
      const objectId = objectIdParam(req.params.objectId);
      if (!context) { res.status(401).json({ error: "unauthorized" }); return; }
      if (!objectId) { res.status(400).json({ error: "invalid_request" }); return; }
      const record = await metadataFor(context).getById(objectId);
      if (!record) { res.status(404).json({ error: "not_found" }); return; }
      await serviceFor(context).deleteObject({
        caller: { userId: String(context.userId), businessId: record.businessId },
        objectId,
      });
      res.status(204).send();
    } catch (error) { handleStorageError(error, res); }
  });
};
