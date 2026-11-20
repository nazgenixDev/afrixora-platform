import { Router } from 'express';
import { prisma } from '../utils/database';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getSubscriptionLimits } from '../utils/plans';
import { createTenant, deleteTenantPermanently } from '../services/tenantService';
import logger from '../utils/logger';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { NotFoundError } from '../utils/errors';
import { sendUpgradeRequestEmail } from '../services/emailService';
import { newPasswordSchema } from '../utils/passwordPolicy';

const createTenantSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
    plan: z.nativeEnum(SubscriptionPlan),
    adminEmail: z.string().email(),
    adminName: z.string().trim().min(1),
    adminPassword: newPasswordSchema,
  }).strict(),
});

const planSchema = z.object({
  body: z.object({
    plan: z.enum(['BASIC', 'PRO', 'BUSINESS', 'ENTERPRISE'], {
      error: 'Plan invalide.',
    }),
  }),
});

const upgradeRequestSchema = z.object({
  body: z.object({
    requestedPlan: z.enum(['BASIC', 'PRO', 'BUSINESS', 'ENTERPRISE'], {
      error: 'Plan invalide.',
    }),
  }),
});

const tenantActivitySchema = z.object({
  body: z.object({ isActive: z.boolean() }).strict(),
});

const router = Router();

async function setTenantActivity(id: string, isActive: boolean) {
  await prisma.$transaction(async (tx) => {
    const changed = await tx.tenant.updateMany({ where: { id, isActive: !isActive }, data: { isActive } });
    if (changed.count === 0 && !await tx.tenant.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundError('Tenant introuvable');
    }
    if (!isActive && changed.count > 0) {
      await tx.user.updateMany({
        where: { tenantId: id, role: { not: 'SUPER_ADMIN' } },
        data: { jwtVersion: { increment: 1 } },
      });
      await tx.apiKey.updateMany({ where: { tenantId: id, isActive: true }, data: { isActive: false } });
    }
  });
}

// GET /tenants - list all tenants (super admin only)
router.get('/', authenticate, authorize(['SUPER_ADMIN']), async (req, res, next) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: { _count: { select: { buildings: true, users: true } } },
    });
    res.json(tenants);
  } catch (error) {
    next(error);
  }
});

// POST /tenants - create a new tenant with admin user (super admin only)
router.post('/', authenticate, authorize(['SUPER_ADMIN']), validate(createTenantSchema), async (req, res, next) => {
  try {
    const body: z.infer<typeof createTenantSchema>['body'] = res.locals.validatedBody;
    const tenant = await createTenant(body);
    res.status(201).json(tenant);
  } catch (error) {
    next(error);
  }
});

// GET /tenants/current/subscription - current authenticated user's tenant subscription
router.get('/current/subscription', authenticate, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const [deviceCount, automationCount] = await Promise.all([
      prisma.device.count({ where: { tenantId } }),
      prisma.automation.count({ where: { tenantId } }),
    ]);

    const history = await prisma.subscriptionHistory.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const limits = getSubscriptionLimits(tenant);

    res.json({
      plan: tenant.plan,
      status: tenant.subscriptionStatus,
      endsAt: tenant.subscriptionEndsAt,
      limits,
      usage: { devices: deviceCount, automations: automationCount },
      history,
    });
  } catch (error) {
    next(error);
  }
});

// POST /tenants/current/upgrade-request - request plan change (tenant admin)
router.post('/current/upgrade-request', authenticate, authorize(['TENANT_ADMIN']), validate(upgradeRequestSchema), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { requestedPlan }: z.infer<typeof upgradeRequestSchema>['body'] = res.locals.validatedBody;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const superAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { email: true },
    });
    if (!superAdmin) return res.status(500).json({ error: 'No super admin found' });

    await sendUpgradeRequestEmail({ tenantId, tenantName: tenant.name, requestedPlan, adminEmail: superAdmin.email });

    logger.info('subscription_upgrade_requested', { tenantId, requestedPlan });
    res.json({ message: 'Demande envoyée au super administrateur' });
  } catch (error) {
    next(error);
  }
});

// GET /tenants/:id - get a specific tenant (super admin only)
router.get('/:id', authenticate, authorize(['SUPER_ADMIN']), async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(tenant);
  } catch (error) {
    next(error);
  }
});

// GET /tenants/:id/subscription - subscription details for a tenant (super admin or tenant admin)
router.get('/:id/subscription', authenticate, authorize(['SUPER_ADMIN', 'TENANT_ADMIN']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const tenant = user.role === 'SUPER_ADMIN' || user.tenantId === id
      ? await prisma.tenant.findUnique({ where: { id } })
      : null;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const [deviceCount, automationCount] = await Promise.all([
      prisma.device.count({ where: { tenantId: id } }),
      prisma.automation.count({ where: { tenantId: id } }),
    ]);

    const history = await prisma.subscriptionHistory.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const limits = getSubscriptionLimits(tenant);

    res.json({
      plan: tenant.plan,
      status: tenant.subscriptionStatus,
      endsAt: tenant.subscriptionEndsAt,
      limits,
      usage: { devices: deviceCount, automations: automationCount },
      history,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /tenants/:id/plan - change tenant plan (super admin only)
router.patch('/:id/plan', authenticate, authorize(['SUPER_ADMIN']), validate(planSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { plan }: z.infer<typeof planSchema>['body'] = res.locals.validatedBody;
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const updatedTenant = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id },
        data: { plan, subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionEndsAt: null },
      });
      await tx.subscriptionHistory.create({
        data: {
          tenantId: id,
          plan: plan as SubscriptionPlan,
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date(),
          endDate: null,
        },
      });
      return updated;
    });

    logger.info(`Tenant plan updated: ${id} ${tenant.plan} -> ${plan}`);
    res.json(updatedTenant);
  } catch (error) {
    next(error);
  }
});

// PATCH /tenants/:id — modifier le statut du tenant (super administrateur)
router.patch('/:id', authenticate, authorize(['SUPER_ADMIN']), validate(tenantActivitySchema), async (req, res, next) => {
  try {
    const { isActive }: z.infer<typeof tenantActivitySchema>['body'] = res.locals.validatedBody;
    await setTenantActivity(req.params.id, isActive);
    res.json({ id: req.params.id, isActive });
  } catch (error) {
    next(error);
  }
});

// DELETE /tenants/:id — désactiver le tenant et conserver ses données
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN']), async (req, res, next) => {
  try {
    await setTenantActivity(req.params.id, false);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// DELETE /tenants/:id/permanent — supprimer définitivement le tenant
router.delete('/:id/permanent', authenticate, authorize(['SUPER_ADMIN']), async (req, res, next) => {
  try {
    await deleteTenantPermanently(req.params.id);
    logger.info('Tenant supprimé définitivement', { tenantId: req.params.id, userId: req.user!.userId });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
