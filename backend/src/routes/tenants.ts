import { Router, Request, Response, NextFunction } from "express";
import authenticate from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import prisma from "../utils/database";
import bcrypt from "bcryptjs";

const router = Router();

// GET /api/v1/tenants
router.get("/", authenticate, authorize(["SUPER_ADMIN"]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, plan: true, isActive: true, createdAt: true, _count: { select: { buildings: true, users: true } } },
      orderBy: { createdAt: "desc" },
    });
    return res.json(tenants);
  } catch (err) { return next(err); }
});

// POST /api/v1/tenants
router.post("/", authenticate, authorize(["SUPER_ADMIN"]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, plan, adminEmail, adminName, adminPassword } = req.body;
    if (!name || !slug || !adminEmail || !adminName || !adminPassword) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }
    const tenant = await prisma.tenant.create({ data: { name, slug, plan: plan || "CORE" } });
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({ data: { tenantId: tenant.id, email: adminEmail, name: adminName, role: "TENANT_ADMIN", passwordHash } });
    return res.status(201).json(tenant);
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "Ce slug existe déjà" });
    return next(err);
  }
});

// PATCH /api/v1/tenants/:id
router.patch("/:id", authenticate, authorize(["SUPER_ADMIN"]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, plan, isActive } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (plan !== undefined) data.plan = plan;
    if (isActive !== undefined) data.isActive = isActive;
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data });
    return res.json(tenant);
  } catch (err) { return next(err); }
});

// DELETE /api/v1/tenants/:id — suppression définitive
router.delete("/:id", authenticate, authorize(["SUPER_ADMIN"]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Supprimer d'abord les utilisateurs liés
    await prisma.user.deleteMany({ where: { tenantId: req.params.id } });
    // Puis les bâtiments (qui supprimeront les zones et devices en cascade)
    await prisma.building.deleteMany({ where: { tenantId: req.params.id } });
    // Enfin le tenant
    await prisma.tenant.delete({ where: { id: req.params.id } });
    return res.json({ message: "Tenant supprimé avec succès" });
  } catch (err) { return next(err); }
});

export default router;
