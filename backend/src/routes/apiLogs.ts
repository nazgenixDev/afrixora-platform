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
      const { method, statusCode, endpoint, page = "1", limit = "50" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { tenantId: req.user!.tenantId };
      if (method) where.method = (method as string).toUpperCase();
      if (statusCode) where.statusCode = parseInt(statusCode as string);
      if (endpoint) where.endpoint = { contains: endpoint as string, mode: "insensitive" };

      const [logs, total] = await Promise.all([
        prisma.apiLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
          select: {
            id: true, method: true, endpoint: true, statusCode: true,
            durationMs: true, ip: true, createdAt: true, userId: true,
          },
        }),
        prisma.apiLog.count({ where }),
      ]);

      return res.json({
        data: logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

// Stats pour le monitoring
router.get(
  "/stats",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenantId;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [totalToday, errors, avgLatency, topEndpoints] = await Promise.all([
        prisma.apiLog.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
        prisma.apiLog.count({ where: { tenantId, statusCode: { gte: 400 }, createdAt: { gte: todayStart } } }),
        prisma.apiLog.aggregate({ where: { tenantId, createdAt: { gte: todayStart } }, _avg: { durationMs: true } }),
        prisma.apiLog.groupBy({
          by: ["endpoint"],
          where: { tenantId, createdAt: { gte: todayStart } },
          _count: { endpoint: true },
          orderBy: { _count: { endpoint: "desc" } },
          take: 5,
        }),
      ]);

      return res.json({
        totalRequestsToday: totalToday,
        errorsToday: errors,
        avgLatencyMs: Math.round(avgLatency._avg.durationMs || 0),
        topEndpoints: topEndpoints.map(e => ({ endpoint: e.endpoint, count: e._count.endpoint })),
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
