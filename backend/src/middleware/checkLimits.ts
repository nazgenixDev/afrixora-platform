import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { getPlanLimits } from '../utils/plans';

export const checkDeviceLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const limits = getPlanLimits(tenant.plan);
    if (limits.maxDevices === Infinity) return next();

    const deviceCount = await prisma.device.count({ where: { tenantId } });
    if (deviceCount >= limits.maxDevices) {
      return res.status(403).json({
        error: 'Limite d\'appareils atteinte',
        message: `Votre plan ${tenant.plan} permet un maximum de ${limits.maxDevices} appareils. Passez à un plan supérieur pour en ajouter davantage.`,
        limit: limits.maxDevices,
        current: deviceCount,
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const checkAutomationLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const limits = getPlanLimits(tenant.plan);
    if (limits.maxAutomations === Infinity) return next();

    const automationCount = await prisma.automation.count({ where: { tenantId } });
    if (automationCount >= limits.maxAutomations) {
      return res.status(403).json({
        error: 'Limite d\'automatisations atteinte',
        message: `Votre plan ${tenant.plan} permet un maximum de ${limits.maxAutomations} automatisations. Passez à un plan supérieur pour en ajouter davantage.`,
        limit: limits.maxAutomations,
        current: automationCount,
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};
