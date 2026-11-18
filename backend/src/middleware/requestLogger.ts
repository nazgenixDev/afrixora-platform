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

      await prisma.apiLog.create({
        data: {
          tenantId,
          method: req.method,
          endpoint: req.originalUrl.split("?")[0], // sans les query params
          statusCode: res.statusCode,
          durationMs: duration,
          ip: req.ip ?? "unknown",
          userId: req.user?.userId ?? null,
        },
      });
    } catch {
      // Silencieux pour ne pas perturber la réponse
    }
  });

  next();
};
