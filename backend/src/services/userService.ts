import { Prisma, Role } from "@prisma/client";
import authService from "./authService";
import prisma from "../utils/database";
import { AppError, NotFoundError } from "../utils/errors";
import { canAssignRole, canManageUser } from "../utils/rbac";

interface Actor {
  userId: string;
  tenantId: string;
  role: string;
}

interface NewUser {
  email: string;
  name: string;
  role: Role;
  password: string;
}

const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUser }>;

function assertCanAssignRole(actor: Actor, role: Role): void {
  if (!canAssignRole(actor.role, role)) {
    throw new AppError("Vous ne pouvez pas attribuer ce rôle.", 403, "FORBIDDEN");
  }
}

async function getManagedUser(actor: Actor, id: string): Promise<{ role: Role; isActive: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id, tenantId: actor.tenantId },
    select: { role: true, isActive: true },
  });
  if (!user) throw new NotFoundError("Utilisateur introuvable");
  if (!canManageUser(actor.role, user.role)) {
    throw new AppError("Vous ne pouvez pas gérer cet utilisateur.", 403, "FORBIDDEN");
  }
  return user;
}

async function applyUserMutation<T>(
  actor: Actor,
  id: string,
  mutation: Prisma.PrismaPromise<T>,
): Promise<T> {
  try {
    return await mutation;
  } catch (error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2025") {
      throw error;
    }
    // En cas de mise à jour concurrente, revérifier les droits sur le rôle actuel.
    await getManagedUser(actor, id);
    throw new AppError("Cet utilisateur a été modifié entre-temps. Réessayez.", 409, "CONFLICT");
  }
}

export async function createUser(actor: Actor, input: NewUser): Promise<PublicUser> {
  assertCanAssignRole(actor, input.role);
  const passwordHash = await authService.hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash,
      },
      select: publicUser,
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Cet email existe déjà", 409, "UNIQUE_CONSTRAINT_VIOLATION");
    }
    throw error;
  }
}

export async function changeUserRole(actor: Actor, id: string, role: Role): Promise<PublicUser & { tenantId: string }> {
  assertCanAssignRole(actor, role);
  if (actor.userId === id) {
    throw new AppError("Vous ne pouvez pas modifier votre propre rôle.", 403, "FORBIDDEN");
  }
  const target = await getManagedUser(actor, id);
  return applyUserMutation(actor, id, prisma.user.update({
    where: { id, tenantId: actor.tenantId, role: target.role },
    data: { role, jwtVersion: { increment: 1 } },
    select: { ...publicUser, tenantId: true },
  }));
}

export async function toggleUserStatus(actor: Actor, id: string): Promise<{ id: string; isActive: boolean }> {
  const target = await getManagedUser(actor, id);
  return applyUserMutation(actor, id, prisma.user.update({
    where: { id, tenantId: actor.tenantId, role: target.role, isActive: target.isActive },
    data: {
      isActive: !target.isActive,
      jwtVersion: target.isActive ? { increment: 1 } : undefined,
    },
    select: { id: true, isActive: true },
  }));
}

export async function resetUserPassword(actor: Actor, id: string, password: string): Promise<void> {
  const target = await getManagedUser(actor, id);
  const passwordHash = await authService.hashPassword(password);
  await applyUserMutation(actor, id, prisma.user.update({
    where: { id, tenantId: actor.tenantId, role: target.role },
    data: { passwordHash, jwtVersion: { increment: 1 } },
  }));
}

export async function deleteUser(actor: Actor, id: string): Promise<void> {
  const target = await getManagedUser(actor, id);
  if (actor.userId === id) {
    throw new AppError("Vous ne pouvez pas supprimer votre propre compte", 400, "INVALID_REQUEST");
  }
  await applyUserMutation(actor, id, prisma.user.delete({
    where: { id, tenantId: actor.tenantId, role: target.role },
  }));
}
