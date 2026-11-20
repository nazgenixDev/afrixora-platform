import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import energyService from '../services/energyService';
import { prisma } from '../utils/database';
import { NotFoundError } from '../utils/errors';
import { dateRangeFields, limitSchema, pageSchema, validDateRange } from '../utils/querySchemas';

const router = Router();

const readingsQuerySchema = z.object({
  deviceId: z.guid(),
  ...dateRangeFields,
  metric: z.string().trim().min(1).max(80).refine((value) => !value.includes(String.fromCharCode(0))),
  page: pageSchema,
  limit: limitSchema.default(100),
}).refine(validDateRange, { path: ['to'], message: 'La période doit couvrir au plus 93 jours.' });

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceId, from, to, metric, page, limit } = readingsQuerySchema.parse(req.query);
    const { tenantId } = req.user!;
    const device = await prisma.device.findUnique({
      where: { id: deviceId, tenantId, building: { tenantId, isActive: true } },
      select: { id: true },
    });
    if (!device) throw new NotFoundError('Appareil introuvable');
    const readings = await energyService.getReadings(tenantId, deviceId, from.toISOString(), to.toISOString(), metric, { page, limit });
    return res.json(readings);
  } catch (err) {
    next(err); return;
  }
});

export default router;
