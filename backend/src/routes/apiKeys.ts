import { Router, Request, Response, NextFunction } from "express";
import authenticate from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { apiKeyService } from "../services/apiKeyService";
import { requireApi } from "../middleware/features";

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
  requireApi,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = await apiKeyService.create(req.user!.tenantId, req.body);
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