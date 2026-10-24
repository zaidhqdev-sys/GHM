import type { Express, Request, Response, RequestHandler } from "express";
import type { AuthContext } from "../auth/authorization.js";
import { requireAuth } from "../auth/http.js";
import type { StorageProvider } from "../storage/provider.js";
import { createStorageService } from "../storage/service.js";
import { createPostgresStorageMetadataStore } from "../storage/repository.js";
import { createPostgresStorageAuthorization } from "../storage/authorization-adapter.js";

const positiveInteger = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return null;
  return value;
};

const objectIdParam = (value: unknown): string | null =>
  typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : null;

const handleStorageError = (error: unknown, res: Response): void => {
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

export const registerStorageRoutes = (
  app: Express,
  provider: StorageProvider,
  authMiddleware: RequestHandler = requireAuth,
): void => {
  const serviceFor = (context: AuthContext) => createStorageService({
    provider,
    metadata: createPostgresStorageMetadataStore(context),
    authorization: createPostgresStorageAuthorization(context),
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
      const metadata = await createPostgresStorageMetadataStore(context).getById(objectId);
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
      const record = await createPostgresStorageMetadataStore(context).getById(objectId);
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
      const record = await createPostgresStorageMetadataStore(context).getById(objectId);
      if (!record) { res.status(404).json({ error: "not_found" }); return; }
      await serviceFor(context).deleteObject({
        caller: { userId: String(context.userId), businessId: record.businessId },
        objectId,
      });
      res.status(204).send();
    } catch (error) { handleStorageError(error, res); }
  });
};
