import { randomUUID } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import prisma from "../utils/database";
import logger from "../utils/logger";
import { routePath } from "../utils/requestRoute";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on("finish", async () => {
    const endpoint = routePath(req);
    const { method, ip, user } = req;
    const { statusCode } = res;
    if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
      logger.warn('security_http_request_denied', {
        method, endpoint, statusCode, ip, tenantId: user?.tenantId, userId: user?.userId,
      });
    }
    try {
      // Ne logger que si un tenant est authentifié (req.user existe)
      const tenantId = user?.tenantId;
      if (!tenantId) return;

      const duration = Date.now() - start;

      // Le verrou partagé empêche une écriture tardive après la suppression du tenant.
      await prisma.$executeRaw`
        INSERT INTO "ApiLog" ("id", "tenantId", "method", "endpoint", "statusCode", "durationMs", "ip", "userId")
        SELECT ${randomUUID()}, "id", ${method}, ${endpoint},
               ${statusCode}::int, ${duration}::int, ${ip ?? "unknown"}, ${user?.userId ?? null}
        FROM "Tenant" WHERE "id" = ${tenantId}
        FOR KEY SHARE
      `;
    } catch {
      logger.error('api_log_write_failed', { tenantId: user?.tenantId, endpoint });
    }
  });

  next();
};
