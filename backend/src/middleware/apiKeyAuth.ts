import { Request, Response, NextFunction } from "express";
import prisma from "../utils/database";
import logger from "../utils/logger";
import { hashApiKey } from "../services/apiKeyService";
import { consumeApiKeyQuota } from "../services/apiKeyUsage";

// Vérifier l'authentification par clé API (x-api-key header)
export const apiKeyAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (typeof apiKey !== "string" || !apiKey) {
      return res.status(401).json({ error: "API key required" });
    }

    const key = await prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(apiKey) },
      select: { id: true, name: true, tenantId: true, isActive: true, scope: true, requests: true, limit: true },
    });
    if (!key || !key.isActive) {
      return res.status(401).json({ error: "Invalid or inactive API key" });
    }

    const method = req.method.toUpperCase();
    if (key.scope === "read" && !["GET", "HEAD"].includes(method)) {
      return res.status(403).json({ error: "Read-only API key" });
    }
    if (key.scope === "gateway") {
      return res.status(403).json({
        error: "Aucune route HTTP ne prend en charge les clés de portée gateway.",
        code: "API_KEY_GATEWAY_UNAVAILABLE",
      });
    }

    try {
      if (!(await consumeApiKeyQuota(key))) {
        return res.status(429).json({ error: "Quota de la clé API atteint.", code: "API_KEY_QUOTA_EXCEEDED" });
      }
    } catch (error) {
      logger.error("Vérification du quota de la clé API impossible", { error });
      return res.status(503).json({ error: "Vérification du quota indisponible.", code: "API_KEY_QUOTA_UNAVAILABLE" });
    }

    // Attribuer un rôle en fonction du scope de la clé
    const roleMapping: Record<string, "VIEWER" | "OPERATOR" | "TENANT_ADMIN"> = {
      read: "VIEWER",
      write: "OPERATOR",
      full: "TENANT_ADMIN",
    };
    const role = roleMapping[key.scope] || "VIEWER";

    req.user = {
      userId: `api-key-${key.id}`,
      tenantId: key.tenantId,
      role,
    };

    logger.info(`API Key request: ${method} ${req.path} by key ${key.name} (scope: ${key.scope}, role: ${role})`);
    return next();
  } catch (err) {
    logger.error("API key authentication error", { error: err });
    return res.status(500).json({ error: "Internal server error" });
  }
};
