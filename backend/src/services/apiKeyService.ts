import crypto from "crypto";
import type { ApiKey } from "@prisma/client";
import prisma from "../utils/database";

export const apiKeyScopes = ["read", "write", "full", "gateway"] as const;

export const apiKeyService = {
  async findAll(tenantId: string) {
    return prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        key: true,
        scope: true,
        isActive: true,
        requests: true,
        limit: true,
        lastUsed: true,
        createdAt: true,
      },
    });
  },

  async create(tenantId: string, data: { name: string; scope: typeof apiKeyScopes[number] }): Promise<ApiKey> {
    // Préfixe `afrx_live_` pour les nouvelles clés.
    // Les anciennes clés `nxa_live_` restent valides : apiKeyAuth.ts les accepte
    // encore telles quelles (aucune migration ni invalidation dans ce lot).
    const key = `afrx_live_${crypto.randomBytes(16).toString("hex")}`;
    return prisma.apiKey.create({
      data: {
        tenantId,
        name: data.name,
        key,
        scope: data.scope,
      },
    });
  },

  async toggleStatus(id: string, tenantId: string) {
    const existing = await prisma.apiKey.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new Error("Clé API introuvable");
    return prisma.apiKey.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });
  },
};
