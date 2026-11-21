import { randomUUID } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import prisma from "../utils/database";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on("finish", async () => {
    try {
      // Ne logger que si un tenant est authentifié (req.user existe)
      const tenantId = req.user?.tenantId;
      if (!tenantId) return;

      const duration = Date.now() - start;

      // Le verrou partagé empêche une écriture tardive après la suppression du tenant.
      await prisma.$executeRaw`
        INSERT INTO "ApiLog" ("id", "tenantId", "method", "endpoint", "statusCode", "durationMs", "ip", "userId")
        SELECT ${randomUUID()}, "id", ${req.method}, ${req.originalUrl.split("?")[0]},
               ${res.statusCode}::int, ${duration}::int, ${req.ip ?? "unknown"}, ${req.user?.userId ?? null}
        FROM "Tenant" WHERE "id" = ${tenantId}
        FOR KEY SHARE
      `;
    } catch {
      // Silencieux pour ne pas perturber la réponse
    }
  });

  next();
};
