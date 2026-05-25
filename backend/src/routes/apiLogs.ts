import { Router, Request, Response, NextFunction } from "express";
import authenticate from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import prisma from "../utils/database";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const logs = await prisma.apiLog.findMany({
        where: { tenantId: req.user!.tenantId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          method: true,
          endpoint: true,
          statusCode: true,
          durationMs: true,
          ip: true,
          createdAt: true,
        },
      });
      return res.json(logs);
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
