import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { getSubscriptionLimits } from '../utils/plans';

export const requireExport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const limits = getSubscriptionLimits(tenant);
    if (!limits.hasExport) {
      return res.status(403).json({ error: 'Votre plan ne permet pas l’export de données. Veuillez passer à un plan supérieur.' });
    }
    next();
  } catch (error) { next(error); }
};

export const requireApi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const limits = getSubscriptionLimits(tenant);
    if (!tenant.isActive || !limits.hasApi) {
      return res.status(403).json({ error: 'Votre plan ne donne pas accès à l’API. Veuillez passer à un plan supérieur.' });
    }
    next();
  } catch (error) { next(error); }
};
