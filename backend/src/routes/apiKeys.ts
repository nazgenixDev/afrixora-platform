import { Router, Request, Response, NextFunction } from "express";
import authenticate from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { apiKeyService } from "../services/apiKeyService";

const router = Router();

// GET /api/v1/api-keys
router.get(
  "/",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const keys = await apiKeyService.findAll(req.user!.tenantId);
      return res.json(keys);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/api-keys
router.post(
  "/",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = await apiKeyService.create(req.user!.tenantId, req.body);
      return res.status(201).json(key);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/api-keys/:id/toggle
router.patch(
  "/:id/toggle",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await apiKeyService.toggleStatus(
        req.params.id,
        req.user!.tenantId
      );
      return res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;