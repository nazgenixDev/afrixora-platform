import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import authenticate from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import prisma from "../utils/database";
import bcrypt from "bcryptjs";

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────

const createUserSchema = z.object({
  body: z.object({
    email: z.string().email("Email invalide"),
    name: z.string().min(1, "Nom requis"),
    role: z.enum(["SUPER_ADMIN", "TENANT_ADMIN", "BUILDING_ADMIN", "OPERATOR", "VIEWER"]),
    password: z.string().min(6, "6 caractères minimum"),
  }),
});

const changeRoleSchema = z.object({
  body: z.object({
    role: z.enum(["SUPER_ADMIN", "TENANT_ADMIN", "BUILDING_ADMIN", "OPERATOR", "VIEWER"]),
  }),
});

const resetPasswordSchema = z.object({
  body: z.object({
    newPassword: z.string().min(6, "6 caractères minimum"),
  }),
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Mot de passe actuel requis"),
    newPassword: z.string().min(6, "6 caractères minimum"),
  }),
});

// ─── Routes ───────────────────────────────────────────────────

// Récupérer son propre profil (tout utilisateur connecté)
router.get(
  "/me",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          tenantId: true,
          isActive: true,
          createdAt: true,
        },
      });
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      return res.json(user);
    } catch (err) {
      return next(err);
    }
  }
);

// Lister les utilisateurs du tenant (admin) — avec pagination
router.get(
  "/",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: { tenantId: req.user!.tenantId },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.user.count({ where: { tenantId: req.user!.tenantId } }),
      ]);

      return res.json({
        data: users,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// Créer un nouvel utilisateur (admin)
router.post(
  "/",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  validate(createUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, name, role, password } = req.body;
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { tenantId: req.user!.tenantId, email, name, role, passwordHash },
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      });
      return res.status(201).json(user);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "P2002") {
        return res.status(409).json({ error: "Cet email existe déjà" });
      }
      return next(err);
    }
  }
);

// Basculer actif/inactif (admin)
router.patch(
  "/:id/toggle",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: { isActive: !user.isActive },
      });
      return res.json({ id: updated.id, isActive: updated.isActive });
    } catch (err) { return next(err); }
  }
);

// PATCH /users/:id/role - change user role (admin only)
router.patch('/:id/role', authenticate, authorize(['SUPER_ADMIN', 'TENANT_ADMIN']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const validRoles = ['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR', 'VIEWER'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    // 🔐 IMPORTANT : restreindre au même tenant
    const targetUser = await prisma.user.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found in this tenant' });
    }

    const updated = await prisma.user.update({
      where: { id, tenantId: req.user!.tenantId },
      data: { role },
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Réinitialiser le mot de passe d'un utilisateur (admin)
router.patch(
  "/:id/reset-password",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  validate(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { newPassword } = req.body;
      const user = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      const newHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash, jwtVersion: user.jwtVersion + 1 } });
      return res.json({ message: "Mot de passe réinitialisé." });
    } catch (err) { return next(err); }
  }
);

// Supprimer un utilisateur (admin)
router.delete(
  "/:id",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      if (user.id === req.user!.userId) return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte" });
      await prisma.user.delete({ where: { id: user.id } });
      return res.json({ message: "Utilisateur supprimé." });
    } catch (err) { return next(err); }
  }
);

// Modifier son propre profil (nom, email)
const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Nom requis").optional(),
    email: z.string().email("Email invalide").optional(),
  }),
});

router.patch(
  "/me",
  authenticate,
  validate(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email } = req.body;
      const data: Record<string, string> = {};
      if (name !== undefined) data.name = name;
      if (email !== undefined) data.email = email;

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "Aucune donnée à modifier" });
      }

      // Vérifier unicité email si modifié
      if (email) {
        const existing = await prisma.user.findFirst({
          where: { email, id: { not: req.user!.userId } },
        });
        if (existing) {
          return res.status(409).json({ error: "Cet email est déjà utilisé" });
        }
      }

      const updated = await prisma.user.update({
        where: { id: req.user!.userId },
        data,
        select: { id: true, email: true, name: true, role: true, tenantId: true },
      });

      return res.json({ user: updated });
    } catch (err) {
      return next(err);
    }
  }
);

// Changer son propre mot de passe
router.patch(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) return res.status(400).json({ error: "Mot de passe actuel incorrect" });
      const newHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash, jwtVersion: user.jwtVersion + 1 } });
      return res.json({ message: "Mot de passe modifié. Veuillez vous reconnecter." });
    } catch (err) { return next(err); }
  }
);

export default router;
