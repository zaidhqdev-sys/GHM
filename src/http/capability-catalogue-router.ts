import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import type { CapabilityService } from '../resources/capability/contracts';
import { isRegisteredOperation } from '../resources/registry';

export const registerCapabilityCatalogueRoutes = (
  app: Express,
  service: CapabilityService,
  authMiddleware: RequestHandler = requireAuth,
): void => {
  app.get('/api/v1/capabilities', authMiddleware, async (req: Request, res: Response) => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('business_capability', 'read') ||
        !canAccessResource(context, 'business_capability')) {
      res.status(403).json({ error: 'forbidden' }); return;
    }
    try {
      const capabilities = await service.listSelectableCapabilities(context);
      res.status(200).json({ capabilities: capabilities.map(item => ({
        id: item.id, parent_id: item.parentId, name: item.name, slug: item.slug,
        description: item.description, sort_order: item.sortOrder,
        lifecycle_status: item.lifecycleStatus, taxonomy_version: item.taxonomyVersion,
        is_selectable: item.isSelectable,
      })) });
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  });
};
