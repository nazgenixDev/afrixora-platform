import { Request, Response, NextFunction } from "express";
import prisma from "../utils/database";
import logger from "../utils/logger";
import { hashApiKey } from "../services/apiKeyService";
import { consumeApiKeyQuota } from "../services/apiKeyUsage";
import { getSubscriptionLimits } from "../utils/plans";

const scopeRole = {
  read: "VIEWER",
  write: "OPERATOR",
  full: "TENANT_ADMIN",
} as const;

// Vérifier l'authentification par clé API (x-api-key header)
export const apiKeyAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (typeof apiKey !== "string" || !apiKey) {
      return res.status(401).json({ error: "API key required" });
    }

    const key = await prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(apiKey) },
      select: {
        id: true, tenantId: true, isActive: true, scope: true, requests: true, limit: true,
        tenant: { select: { isActive: true, plan: true, subscriptionStatus: true, subscriptionEndsAt: true } },
      },
    });
    if (!key || !key.isActive || !key.tenant.isActive) {
      return res.status(401).json({ error: "Invalid or inactive API key" });
    }
    if (!getSubscriptionLimits(key.tenant).hasApi) {
      return res.status(403).json({ error: "L’abonnement ne permet pas l’accès API.", code: "API_PLAN_REQUIRED" });
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
    if (!Object.prototype.hasOwnProperty.call(scopeRole, key.scope)) {
      return res.status(403).json({ error: "Portée de clé API inconnue." });
    }

    try {
      if (!(await consumeApiKeyQuota(key))) {
        return res.status(429).json({ error: "Quota de la clé API atteint.", code: "API_KEY_QUOTA_EXCEEDED" });
      }
    } catch {
      logger.error("api_key_quota_unavailable", { tenantId: key.tenantId, keyId: key.id });
      return res.status(503).json({ error: "Vérification du quota indisponible.", code: "API_KEY_QUOTA_UNAVAILABLE" });
    }

    req.user = {
      userId: `api-key-${key.id}`,
      tenantId: key.tenantId,
      role: scopeRole[key.scope as keyof typeof scopeRole],
    };

    return next();
  } catch {
    logger.error("api_key_authentication_unavailable");
    return res.status(500).json({ error: "Internal server error" });
  }
};
