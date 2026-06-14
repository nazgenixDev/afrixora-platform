import { Router } from 'express';
import { prisma } from '../utils/database';
import { SubscriptionPlan, SubscriptionStatus, Role } from '@prisma/client';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getPlanLimits } from '../utils/plans';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { Resend } from 'resend';

const planSchema = z.object({
  body: z.object({
    plan: z.enum(['BASIC', 'PRO', 'BUSINESS', 'ENTERPRISE'], {
      errorMap: () => ({ message: 'Plan must be one of: BASIC, PRO, BUSINESS, ENTERPRISE' }),
    }),
  }),
});

const upgradeRequestSchema = z.object({
  body: z.object({
    requestedPlan: z.enum(['BASIC', 'PRO', 'BUSINESS', 'ENTERPRISE'], {
      errorMap: () => ({ message: 'Plan must be one of: BASIC, PRO, BUSINESS, ENTERPRISE' }),
    }),
  }),
});

const router = Router();

// GET /tenants - list all tenants (super admin only)
router.get('/', authenticate, authorize(['SUPER_ADMIN']), async (req, res, next) => {
  try {
    const tenants = await prisma.tenant.findMany();
    res.json(tenants);
  } catch (error) {
    next(error);
  }
});

// POST /tenants - create a new tenant with admin user (super admin only)
router.post('/', authenticate, authorize(['SUPER_ADMIN']), async (req, res, next) => {
  try {
    const { name, slug, plan: frontendPlan = 'CORE', adminEmail, adminName, adminPassword } = req.body;
    if (!name || !slug || !adminEmail || !adminName || !adminPassword) {
      return res.status(400).json({ error: 'Missing required fields: name, slug, adminEmail, adminName, adminPassword' });
    }

    const planMap: Record<string, SubscriptionPlan> = {
      'CORE': SubscriptionPlan.BASIC,
      'COMFORT': SubscriptionPlan.PRO,
      'ENTERPRISE': SubscriptionPlan.ENTERPRISE,
    };
    const dbPlan = planMap[frontendPlan] || SubscriptionPlan.BASIC;

    const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) return res.status(409).json({ error: 'Slug already exists' });
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) return res.status(409).json({ error: 'Email already used' });

    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          slug,
          plan: dbPlan,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        },
      });
      const user = await tx.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          name: adminName,
          role: 'TENANT_ADMIN',
          tenantId: tenant.id,
          isActive: true,
        },
      });
      return { tenant, user };
    });

    res.status(201).json(result.tenant);
  } catch (error) {
    next(error);
  }
});

// GET /tenants/current/subscription - current authenticated user's tenant subscription
router.get('/current/subscription', authenticate, async (req, res, next) => {
  try {
    const tenantId = (req as any).user.tenantId;
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

    const limits = getPlanLimits(tenant.plan);

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
    const tenantId = (req as any).user.tenantId;
    const { requestedPlan } = req.body as { requestedPlan: 'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE' };
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
    if (!superAdmin) return res.status(500).json({ error: 'No super admin found' });

    logger.info(`Upgrade request: ${tenant.name} (${tenantId}) to ${requestedPlan}`);

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from: 'AFRIXORA <onboarding@resend.dev>',
        to: superAdmin.email,
        subject: `Demande de changement de plan - ${tenant.name}`,
        html: `<h2>Demande de changement de plan</h2>
               <p>Le client <strong>${tenant.name}</strong> souhaite passer au plan <strong>${requestedPlan}</strong>.</p>
               <p>Connectez-vous à la plateforme pour approuver ce changement.</p>`,
      });
      logger.info(`Email sent to ${superAdmin.email}`);
    } else {
      logger.warn('RESEND_API_KEY not set, email not sent');
    }

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
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const user = (req as any).user;
    if (user.role === 'TENANT_ADMIN' && user.tenantId !== id) return res.status(403).json({ error: 'Forbidden' });

    const [deviceCount, automationCount] = await Promise.all([
      prisma.device.count({ where: { tenantId: id } }),
      prisma.automation.count({ where: { tenantId: id } }),
    ]);

    const history = await prisma.subscriptionHistory.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const limits = getPlanLimits(tenant.plan);

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
    const { plan } = req.body as { plan: 'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE' };
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const updatedTenant = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({ where: { id }, data: { plan } });
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

// DELETE /tenants/:id - delete a tenant (super admin only)
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    await prisma.$transaction([
      prisma.user.deleteMany({ where: { tenantId: id } }),
      prisma.apiKey.deleteMany({ where: { tenantId: id } }),
      prisma.subscriptionHistory.deleteMany({ where: { tenantId: id } }),
      prisma.building.deleteMany({ where: { tenantId: id } }),
      prisma.tenant.delete({ where: { id } }),
    ]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
