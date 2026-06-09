import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import energyService from '../services/energyService';

const router = Router();

const readingsQuerySchema = z.object({
  deviceId: z.string(),
  from: z.string(),
  to: z.string(),
  metric: z.string()
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = readingsQuerySchema.parse(req.query);
    const readings = await energyService.getReadings(req.user!.tenantId, query.deviceId, query.from, query.to, query.metric);
    return res.json(readings);
  } catch (err) {
    next(err); return;
  }
});

export default router;