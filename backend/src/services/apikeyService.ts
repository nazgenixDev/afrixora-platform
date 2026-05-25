import crypto from "crypto";
import prisma from "../utils/database";

export const apiKeyService = {
  /**
   * Lister toutes les clés API du tenant
   */
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

  /**
   * Générer une nouvelle clé API
   */
  async create(tenantId: string, data: { name: string; scope?: string }) {
    const key = `nxa_live_${crypto.randomBytes(16).toString("hex")}`;
    return prisma.apiKey.create({
      data: {
        tenantId,
        name: data.name,
        key,
        scope: data.scope || "full",
      },
    });
  },

  /**
   * Révoquer une clé API
   */
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