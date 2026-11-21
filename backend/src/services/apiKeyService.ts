import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../utils/database";

// Les passerelles sont authentifiées par MQTT tant qu'aucune route HTTP ne leur est dédiée.
export const apiKeyScopes = ["read", "write", "full"] as const;

export const hashApiKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

const publicApiKeyFields = {
  id: true,
  name: true,
  keyPrefix: true,
  scope: true,
  isActive: true,
  requests: true,
  limit: true,
  lastUsed: true,
  createdAt: true,
} satisfies Prisma.ApiKeySelect;

export const apiKeyService = {
  async findAll(tenantId: string) {
    return prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: publicApiKeyFields,
    });
  },

  async create(tenantId: string, data: { name: string; scope: typeof apiKeyScopes[number] }) {
    const secret = crypto.randomBytes(16).toString("hex");
    const key = `afrx_live_${secret}`;
    const metadata = await prisma.apiKey.create({
      data: {
        tenantId,
        name: data.name,
        keyHash: hashApiKey(key),
        keyPrefix: secret.slice(0, 8),
        scope: data.scope,
      },
      select: publicApiKeyFields,
    });
    return { ...metadata, key };
  },

  async toggleStatus(id: string, tenantId: string) {
    const existing = await prisma.apiKey.findFirst({
      where: { id, tenantId },
      select: { isActive: true },
    });
    if (!existing) throw new Error("Clé API introuvable");
    return prisma.apiKey.update({
      where: { id, tenantId },
      data: { isActive: !existing.isActive },
      select: publicApiKeyFields,
    });
  },
};
