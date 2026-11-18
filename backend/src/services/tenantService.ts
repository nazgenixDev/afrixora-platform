import { Prisma, Role, SubscriptionStatus, type SubscriptionPlan, type Tenant } from '@prisma/client';
import { prisma } from '../utils/database';
import { AppError } from '../utils/errors';
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
