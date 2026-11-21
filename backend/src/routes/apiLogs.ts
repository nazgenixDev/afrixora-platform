import { Router, Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import authenticate from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { requireApi } from "../middleware/features";
import prisma from "../utils/database";

const router = Router();

const logQuerySchema = z.object({
  method: z.string().optional(),
  statusCode: z.union([
    z.string().regex(/^(?:[245]xx|[1-5][0-9]{2})$/),
    z.literal("__all__").transform(() => undefined),
  ]).optional(),
  endpoint: z.string().optional(),
  page: z.coerce.number().int().min(1).max(Math.floor(2_147_483_647 / 100)).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get(
  "/",
  authenticate,
  requireApi,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { method, statusCode, endpoint, page, limit } = logQuerySchema.parse(req.query);
      const skip = (page - 1) * limit;

      const where: Prisma.ApiLogWhereInput = { tenantId: req.user!.tenantId };
      if (method && method !== "__all__") where.method = method.toUpperCase();
      if (statusCode) {
        const lower = /^[245](?:xx|00)$/.test(statusCode) ? Number(statusCode[0]) * 100 : undefined;
        where.statusCode = lower === undefined ? Number(statusCode) : { gte: lower, lt: lower + 100 };
      }
      if (endpoint) where.endpoint = { contains: endpoint, mode: "insensitive" };

      const [logs, total] = await Promise.all([
        prisma.apiLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
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
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
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
  requireApi,
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
