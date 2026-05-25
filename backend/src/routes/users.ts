import { Router, Request, Response, NextFunction } from "express";
import authenticate from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import prisma from "../utils/database";
import bcrypt from "bcryptjs";

const router = Router();

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

// Lister les utilisateurs du tenant (admin)
router.get(
  "/",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await prisma.user.findMany({
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
      });
      return res.json(users);
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, name, role, password } = req.body;
      if (!email || !name || !role || !password) {
        return res.status(400).json({ error: "Tous les champs sont requis" });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { tenantId: req.user!.tenantId, email, name, role, passwordHash },
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      });
      return res.status(201).json(user);
    } catch (err: any) {
      if (err.code === "P2002") return res.status(409).json({ error: "Cet email existe déjà" });
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

// Changer le rôle (admin)
router.patch(
  "/:id/role",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.body;
      const updated = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
      return res.json({ id: updated.id, role: updated.role });
    } catch (err) { return next(err); }
  }
);

// Réinitialiser le mot de passe d'un utilisateur (admin)
router.patch(
  "/:id/reset-password",
  authenticate,
  authorize(["SUPER_ADMIN", "TENANT_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "6 caractères minimum" });
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

// Changer son propre mot de passe
router.patch(
  "/change-password",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ error: "Les deux mots de passe sont requis" });
      if (newPassword.length < 6) return res.status(400).json({ error: "6 caractères minimum" });
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
