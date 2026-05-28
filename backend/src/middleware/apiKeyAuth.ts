import { Request, Response, NextFunction } from "express";
import prisma from "../utils/database";
import logger from "../utils/logger";

// Vérifier l'authentification par clé API (x-api-key header)
export const apiKeyAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers["x-api-key"] as string;
    if (!apiKey) {
      return res.status(401).json({ error: "API key required" });
    }

    const key = await prisma.apiKey.findUnique({ where: { key: apiKey } });
    if (!key || !key.isActive) {
      return res.status(401).json({ error: "Invalid or inactive API key" });
    }

    const method = req.method.toUpperCase();
    if (key.scope === "read" && !["GET", "HEAD"].includes(method)) {
      return res.status(403).json({ error: "Read-only API key" });
    }
    if (key.scope === "gateway" && !req.path.includes("/gateway")) {
      return res.status(403).json({ error: "Gateway-only API key" });
    }

    // Incrémenter le compteur d'utilisation
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { requests: { increment: 1 }, lastUsed: new Date() },
    });

    // Attribuer un rôle en fonction du scope de la clé
    const roleMapping: Record<string, string> = {
      read: "VIEWER",
      write: "OPERATOR",
      full: "TENANT_ADMIN",
      gateway: "OPERATOR",
    };
    const role = roleMapping[key.scope] || "VIEWER";

    (req as any).user = {
      userId: `api-key-${key.id}`,
      tenantId: key.tenantId,
      role: role,
    };

    logger.info(`API Key request: ${method} ${req.path} by key ${key.name} (scope: ${key.scope}, role: ${role})`);
    return next();
  } catch (err) {
    logger.error("API key authentication error", { error: err });
    return res.status(500).json({ error: "Internal server error" });
  }
};
