import { Prisma, Role, SubscriptionStatus, type SubscriptionPlan, type Tenant } from '@prisma/client';
import { prisma } from '../utils/database';
import { AppError, NotFoundError } from '../utils/errors';
import authService from './authService';

interface CreateTenantInput {
  name: string;
  slug: string;
  plan: SubscriptionPlan;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
}

export async function createTenant({
  name, slug, plan, adminEmail, adminName, adminPassword,
}: CreateTenantInput): Promise<Tenant> {
  const passwordHash = await authService.hashPassword(adminPassword);
  try {
    return await prisma.tenant.create({
      data: {
        name,
        slug,
        plan,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        users: {
          create: {
            email: adminEmail,
            passwordHash,
            name: adminName,
            role: Role.TENANT_ADMIN,
            isActive: true,
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error.meta?.target;
      if (Array.isArray(target) && target.includes('slug')) {
        throw new AppError('Slug already exists', 409, 'UNIQUE_CONSTRAINT_VIOLATION');
      }
      if (Array.isArray(target) && target.includes('email')) {
        throw new AppError('Email already used', 409, 'UNIQUE_CONSTRAINT_VIOLATION');
      }
    }
    throw error;
  }
}

export async function deleteTenantPermanently(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const tenants = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Tenant" WHERE "id" = ${id} FOR UPDATE
    `;
    if (tenants.length === 0) throw new NotFoundError('Tenant introuvable');

    const where = { tenantId: id };
    await tx.user.deleteMany({ where: { ...where, role: { not: Role.SUPER_ADMIN } } });
    const superAdmin = await tx.user.findFirst({ where: { ...where, role: Role.SUPER_ADMIN } });
    if (superAdmin) {
      throw new AppError('Ce tenant héberge un compte super administrateur.', 409, 'PROTECTED_TENANT');
    }

    await tx.alert.deleteMany({ where });
    await tx.automation.deleteMany({ where });
    await tx.gateway.deleteMany({ where });
    await tx.deviceState.deleteMany({ where });
    await tx.device.deleteMany({ where });
    await tx.zone.deleteMany({ where });
    await tx.building.deleteMany({ where });
    await tx.apiKey.deleteMany({ where });
    await tx.apiLog.deleteMany({ where });
    await tx.subscriptionHistory.deleteMany({ where });

    // La télémétrie est installée séparément et stocke les identifiants au format UUID.
    if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      const [telemetry] = await tx.$queryRaw<{ installed: boolean }[]>`
        SELECT to_regclass('public.sensor_readings') IS NOT NULL AS installed
      `;
      if (telemetry.installed) {
        await tx.$executeRaw`DELETE FROM public.sensor_readings WHERE tenant_id = ${id}::uuid`;
      }
    }

    await tx.tenant.delete({ where: { id } });
  }, { timeout: 60_000 });
}
