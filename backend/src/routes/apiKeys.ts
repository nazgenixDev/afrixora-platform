import { Router, Request, Response, NextFunction } from "express";
import authenticate from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { apiKeyScopes, apiKeyService } from "../services/apiKeyService";
import { requireApi } from "../middleware/features";
import { validate } from "../middleware/validate";
import { z } from "zod";

const createApiKeySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(60),
    scope: z.enum(apiKeyScopes),
  }).strict(),
});

const router = Router();

// GET /api/v1/api-keys
router.get(
  "/",
  authenticate,
  requireApi,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const keys = await apiKeyService.findAll(req.user!.tenantId);
      return res.json(keys);
    } catch (err) {
      next(err); return;
    }
  }
);

// POST /api/v1/api-keys
router.post(
  "/",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  validate(createApiKeySchema),
  requireApi,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body: z.infer<typeof createApiKeySchema>["body"] = res.locals.validatedBody;
      const key = await apiKeyService.create(req.user!.tenantId, body);
      return res.status(201).json(key);
    } catch (err) {
      next(err); return;
    }
  }
);

// PATCH /api/v1/api-keys/:id/toggle
router.patch(
  "/:id/toggle",
  authenticate,
  requireApi,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await apiKeyService.toggleStatus(
        req.params.id,
        req.user!.tenantId
      );
      return res.json(result);
    } catch (err) {
      next(err); return;
    }
  }
);

export default router;
