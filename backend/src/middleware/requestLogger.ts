import { Request, Response, NextFunction } from "express";
import prisma from "../utils/database";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on("finish", async () => {
    try {
      // Ne logger que si un tenant est authentifié (req.user existe)
      const tenantId = (req as any).user?.tenantId;
      if (!tenantId) return;

      const duration = Date.now() - start;

      await prisma.apiLog.create({
        data: {
          tenantId,
          method: req.method,
          endpoint: req.originalUrl.split("?")[0], // sans les query params
          statusCode: res.statusCode,
          durationMs: duration,
          ip: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown",
          userId: (req as any).user?.userId || null,
        },
      });
    } catch {
      // Silencieux pour ne pas perturber la réponse
    }
  });

  next();
};